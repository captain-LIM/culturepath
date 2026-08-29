'use strict';

const crypto = require('node:crypto');
const { getPlaceCacheConfig } = require('../config/placeCache');
const placeCacheRepository = require('../repositories/placeCacheRepository');
const tourApiService = require('./tourApiService');
const llmService = require('./llmService');
const {
  normalizeAreaBasedPlaceOptions,
  normalizeKeywordPlaceOptions,
} = tourApiService;
const { ExternalApiError } = require('../utils/externalApiError');

const CACHE_STATUS = Object.freeze({
  BYPASS: 'BYPASS',
  HIT: 'HIT',
  REFRESHED: 'REFRESHED',
  STALE: 'STALE',
});
const QUERY_FIELDS = Object.freeze([
  'baseYm',
  'contentId',
  'keyword',
  'lDongRegnCd',
  'lDongSignguCd',
  'contentTypeId',
  'lclsSystm1',
  'lclsSystm2',
  'lclsSystm3',
]);

function normalizeClockValue(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('캐시 clock은 유효한 시각을 반환해야 합니다.');
  }
  return timestamp;
}

function canonicalScalar(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function canonicalInteger(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : canonicalScalar(value);
}

function canonicalQuery(operation, options = {}) {
  const request = {
    arrange: (canonicalScalar(options.arrange) || 'A').toUpperCase(),
    numOfRows: canonicalInteger(options.numOfRows, 20),
    pageNo: canonicalInteger(options.pageNo, 1),
  };
  for (const field of QUERY_FIELDS) {
    const value = canonicalScalar(options[field]);
    if (value !== null) {
      request[field] = value;
    }
  }
  return Object.freeze({ operation, ...request });
}

function createQueryCacheKey(request) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex');
}

function canUseStale(error) {
  return (
    error instanceof ExternalApiError &&
    error.code !== 'VALIDATION_ERROR'
  );
}

// EngService2/JpnService2/ChsService2는 KorService2와 별개의 contentId 공간을
// 쓰기 때문에(같은 장소도 서로 다른 ID), 국문 contentId로 번역 서비스 상세를
// 직접 조회할 수 없다. 번역 서비스의 keyword 검색은 번역된 제목만 대상으로
// 하기 때문에 국문 제목으로는 거의 매칭되지 않는다(실측: EngService2에 국문
// 키워드로 검색하면 0건). 대신 국문 좌표 주변을 locationBasedList2로 조회한
// 뒤, 제목 토큰이 가장 많이 겹치는 후보를 같은 장소로 채택한다.
const SUPPORTED_TRANSLATION_LANGS = Object.freeze(new Set(['en', 'ja', 'zh']));
const TRANSLATION_MATCH_RADIUS_METERS = 500;
const MAX_TRANSLATION_MATCH_DISTANCE_METERS = 500;

// 번역 서비스 제목은 보통 "English Name (국문 이름)" 형태로 끝에 국문 이름을
// 괄호로 덧붙이지만, 서비스마다 괄호 없이 국문을 이어 붙이거나("Ojukheon강릉
// 오죽헌") 부속기관명 표기가 다르기도 하다("강릉 오죽헌" vs "강릉시 오죽헌").
// 그래서 국문 제목 전체 일치 대신 공백·구분기호로 나눈 토큰 단위로 얼마나
// 겹치는지를 점수화해서 가장 많이 겹치는 후보를 채택한다.
function extractTrailingParenthetical(title) {
  const match = /\(([^()]+)\)\s*$/.exec(String(title || '').trim());
  return match ? match[1] : null;
}

function extractTokens(value) {
  return String(value || '')
    .split(/[\s()·\-,./]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

// 부분 문자열 포함만으로 같은 토큰으로 인정하면, "북촌"처럼 짧고 흔한
// 동네 이름이 "북촌전통공예체험관"(공백 없는 복합 국문 제목) 같은 완전히
// 다른 장소 이름 안에이만 우연히 들어있어도 매칭돼 버린다 — 실제로
// "북촌전통공예체험관"이 인근의 무관한 "락고재 서울 북촌 한옥호텔"로 잘못
// 매칭되는 걸 확인했다. 짧은 토큰이 긴 토큰의 절반 이상을 차지할 때만
// 부분 일치로 인정해 이런 동네 이름 오매칭을 막는다.
function tokensMatch(a, b) {
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!longer.includes(shorter)) {
    return false;
  }
  return shorter.length >= Math.max(3, Math.ceil(longer.length / 2));
}

function countMatchingTokens(korTitle, candidateTitle) {
  const korTokens = extractTokens(korTitle);
  const candidateTokens = extractTokens(
    extractTrailingParenthetical(candidateTitle) || candidateTitle,
  );
  if (korTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }
  return korTokens.filter(token =>
    candidateTokens.some(candidateToken => tokensMatch(token, candidateToken)),
  ).length;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TRANSLATION_OVERLAY_FIELDS = Object.freeze([
  'title',
  'address',
  'overview',
  'regionName',
  'openTime',
  'restDate',
  'parking',
]);

// PlaceSummary(지역 목록 화면이 쓰는 요약 모델, models/placeSummary.js)는
// overview·openTime·restDate·regionName을 항상 null로 둔다 — 지역/키워드
// 목록 조회에는 애초에 이 상세 전용 필드들이 없기 때문이다. 상세 화면의
// korItem에는 이 필드들이 실제 값으로 채워져 있으므로, 캐시가 "얕은"
// 목록발(發) 번역인지 판단하는 기준으로 쓴다.
const DETAIL_ONLY_TRANSLATION_FIELDS = Object.freeze([
  'overview', 'openTime', 'restDate', 'parking', 'regionName',
]);

function applyTranslationOverlay(korItem, translatedItem) {
  if (!translatedItem) {
    return { ...korItem, hasTranslatedInfo: false };
  }

  const overlaid = { ...korItem, hasTranslatedInfo: true };
  for (const field of TRANSLATION_OVERLAY_FIELDS) {
    if (translatedItem[field]) {
      overlaid[field] = translatedItem[field];
    }
  }
  if (translatedItem.additionalInfo?.length) {
    overlaid.additionalInfo = translatedItem.additionalInfo;
  }
  return overlaid;
}

// TourAPI 국문·번역 서비스는 서로 별개의 데이터라 좌표+제목으로 매칭해야
// 하는데(findTranslatedContentId), 등록이 안 된 작은 장소는 애초에 매칭될
// 후보 자체가 없다. 이런 장소는 TourAPI에 없는 걸 찾을 수 없으므로, 이미
// 검증된 국문 필드를 LLM으로 그대로 번역해 채운다 — 상세 화면에 실제로
// 노출되는 TRANSLATION_OVERLAY_FIELDS 전부(parking·regionName 포함)를
// 다룬다. 새로운 사실을 지어내지 않고 순수 번역만 하므로 다른 AI 기능들과
// 같은 "검증된 데이터만 다룬다" 원칙 안에 있다.
// title에만 적용되는 별도 로마자 음역 규칙을 이전에 넣었다가 뺐다 —
// "title은 로마자로 음역하라"는 지시가 있으면, 일부 콘텐츠(특히 지명
// 어원을 설명하는 overview)에서 그 지시가 title을 넘어 응답 전체로
// 번져 overview까지 통째로 영어로 나오는 문제를 실측으로 확인했다
// (예: '동피랑마을'이 이 규칙이 있을 때는 반복 호출해도 계속
// overview가 영어로만 나왔는데, 규칙을 빼자 바로 정상화됐다). title
// 전용 규칙 없이 "모든 필드를 완전히 번역하라"는 일반 지시만으로도
// LLM은 title을 스스로 잘 처리한다(예: '강릉 선교장' → '江陵仙桥庄').
const PLACE_TRANSLATION_SYSTEM_PROMPT = `당신은 여행 정보 번역기입니다.
입력으로 주어진 한국어 관광지 정보(title, address, openTime, overview,
restDate, parking, regionName)를 요청된 언어로 자연스럽게 번역하세요. 이 값들은
모두 실제 등록된 관광지의 공식 정보이며 번역 목적으로만 쓰입니다. 상호명이
비속어처럼 들리거나 독특하더라도(예: 동물·음식 이름을 재치있게 쓴 카페
이름) 정상적인 실제 상호이니 다른 상호와 동일하게 번역하거나 음역하세요 —
민감하다고 판단해 응답을 비우거나 거부하지 마세요. 원문에 없는 사실을
추가하거나 지어내지 말고 번역만 하세요. 입력값이 원래 비어 있는 필드만 빈
문자열로 반환하고, 값이 있는 필드는 절대 빈 문자열로 반환하지 마세요.
title을 포함한 모든 필드를 목표 언어의 문자로 완전히 번역하세요 — 한글을
그대로 남기거나, 영어나 로마자로 대신 쓰지 마세요. 뜻이 통하는 고유명사는
의미로 번역하고, 음역이 자연스러운 이름은 목표 언어 문자(가능하면
한자·가나 등)로 음역하세요.`;

const PLACE_TRANSLATION_LANG_NAMES = Object.freeze({
  en: 'English',
  ja: '日本語 (Japanese)',
  zh: '简体中文 (Simplified Chinese)',
});

const PLACE_TRANSLATION_FIELDS = Object.freeze([
  'title', 'address', 'openTime', 'overview', 'restDate', 'parking', 'regionName',
]);

const PLACE_TRANSLATION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [...PLACE_TRANSLATION_FIELDS],
  properties: {
    title: { type: 'string' },
    address: { type: 'string' },
    openTime: { type: 'string' },
    overview: { type: 'string' },
    restDate: { type: 'string' },
    parking: { type: 'string' },
    regionName: { type: 'string' },
  },
});

function parseTranslationJson(content) {
  let text = String(content || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('장소 번역 결과가 JSON 객체가 아닙니다.');
  }
  return value;
}

const CJK_SCRIPT_PATTERN = /[぀-ヿ一-鿿]/g;
// 정상적으로 번역된 일본어/중국어 overview는 공백을 뺀 글자의 90%
// 이상이 CJK 문자다(실측: 93~95%). "문자가 하나라도 있는가"만 보면
// 안 된다 — 실측 사례로, 통째로 영어인 overview 안에 지명 어원 설명
// 등으로 한자 한두 개(예: '河回')만 우연히 섞여 있어도 통과해 버린다.
// 이 임계값은 그 최악의 사례(약 1.4%)와 정상 사례(90%+) 사이에 아주
// 넓은 여유를 두고 고른 것이다.
const CJK_RATIO_THRESHOLD = 0.3;

function cjkRatio(text) {
  const cleaned = String(text || '').replace(/\s+/g, '');
  if (!cleaned) {
    return 0;
  }
  const matches = cleaned.match(CJK_SCRIPT_PATTERN) || [];
  return matches.length / cleaned.length;
}

// OpenRouter는 temperature:0이어도 완전히 결정적이지 않아, 드물게 ja/zh
// 요청인데도 응답 전체가 영어로 나오는 경우가 있다(실측: '대학천
// 책방거리', '안동 하회마을'). overview처럼 원문에 값이 있는 문장형
// 필드의 번역 결과가 목표 언어(일본어/중국어) 문자로 채워져 있지 않으면
// 통째로 다른 언어(영어)로 답한 것으로 보고 재시도가 필요하다고
// 판단한다. address는 일부러 빼둔다 — 도로명 주소는 정상적인 번역에서도
// 로마자로만 표기되는 게 흔해서(실측: 테라로사 본점의 일본어 주소가
// '25, Hyeoncheon-gil, Gujeong-myeon, Gangneung-si') 이 검사에 넣으면
// 정상 번역까지 계속 재시도/미캐시 상태에 빠뜨린다.
function needsCjkRetranslation(lang, korItem, fields) {
  if (lang !== 'ja' && lang !== 'zh') {
    return false;
  }
  const source = korItem?.overview;
  const translated = fields.overview;
  return Boolean(source) && Boolean(translated) && cjkRatio(translated) < CJK_RATIO_THRESHOLD;
}

// 원문 필드가 한글을 포함하는데 번역 결과가 그 원문과 완전히 동일하면,
// 그 필드만 번역/음역하지 못하고 그대로 되돌려보낸 것으로 본다(실측:
// '소수책방'의 parking이 중국어 요청에서 title·overview는 번역됐는데
// parking만 '가능'으로 그대로 남은 사례). openTime처럼 원래 한글이 없는
// 필드는 번역해도 원문과 같을 수 있어(예: 숫자만 있는 시간) '원문에
// 한글이 있었는가'까지 함께 확인해 오탐을 막는다. getTranslatedDetail의
// 캐시 신선도 검사와 여기 재시도 판단이 같은 기준을 쓰도록 공유한다.
function hasUntranslatedKoreanField(korItem, fields) {
  return TRANSLATION_OVERLAY_FIELDS.some(field => {
    const source = korItem?.[field];
    const translated = fields?.[field];
    return Boolean(source) && translated === source && /[가-힣]/.test(source);
  });
}

// 괄호로 감싼 한글 원어병기(예: '北村韓屋村（북촌한옥마을）')는 이 앱이
// 이미 여러 곳에서 정상으로 취급하는 패턴이라 오탐을 막기 위해 지운다.
const PAREN_GROUP_PATTERN = /[（(][^）)]*[）)]/g;
const HANGUL_PATTERN = /[가-힣]/;

function stripParenGroups(text) {
  return String(text || '').replace(PAREN_GROUP_PATTERN, '');
}

// 괄호 밖에 한글이 남아 있으면 번역이 불완전한 것으로 본다. 실측 두
// 가지: (1) '江陵船桥庄강릉 선교장'처럼 번역문과 한글 원문을 괄호 없이
// 그냥 이어붙인 경우, (2) 아주 긴 overview 중간에 번역되지 않은 한글
// 문장 한 토막이 그대로 섞여 나온 경우(안동 하회마을 중국어). 위
// hasUntranslatedKoreanField는 "필드 전체가 원문과 동일"할 때만 잡아내
// 이 두 사례를 놓치므로 별도로 검사한다.
function hasUnwrappedKoreanText(lang, fields) {
  if (lang === 'ko') {
    return false;
  }
  return TRANSLATION_OVERLAY_FIELDS.some(field => {
    const translated = fields?.[field];
    return Boolean(translated) && HANGUL_PATTERN.test(stripParenGroups(translated));
  });
}

async function requestPlaceTranslation(korItem, lang, generator, reminder) {
  const overviewLength = String(korItem?.overview || '').length;
  const configuredMaxTokens = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS) || 1600;
  const maxTokens = Math.min(configuredMaxTokens, 400 + overviewLength * 2);
  const response = await generator.generate(
    PLACE_TRANSLATION_SYSTEM_PROMPT,
    [{
      role: 'user',
      content: JSON.stringify({
        targetLanguage: PLACE_TRANSLATION_LANG_NAMES[lang] || lang,
        ...(reminder ? { reminder } : {}),
        place: {
          title: korItem?.title || '',
          address: korItem?.address || '',
          openTime: korItem?.openTime || '',
          overview: korItem?.overview || '',
          restDate: korItem?.restDate || '',
          parking: korItem?.parking || '',
          regionName: korItem?.regionName || '',
        },
      }),
    }],
    {
      jsonSchema: { name: 'culturepath_place_translation', schema: PLACE_TRANSLATION_SCHEMA },
      maxTokens,
      temperature: 0,
    },
  );
  const parsed = parseTranslationJson(response.content);
  const fields = {};
  for (const field of PLACE_TRANSLATION_FIELDS) {
    const value = typeof parsed[field] === 'string' ? parsed[field].trim() : '';
    if (value) {
      fields[field] = value;
    }
  }
  return fields;
}

// 지금까지 실측한 번역 실패 유형 세 가지를 한 번에 판단한다: (1) 문장형
// 필드가 통째로 다른 언어(영어)로 나온 경우, (2) 특정 필드가 한글
// 원문과 완전히 동일하게 그대로 남은 경우(실측: '소수책방' parking이
// 중국어에서만 미번역), (3) 번역문에 괄호로 감싸지 않은 한글이 섞여
// 나온 경우(실측: '강릉 선교장' 중국어 title이 번역문+원문을 괄호 없이
// 이어붙임, '안동 하회마을' 중국어 overview 중간에 번역 안 된 한글
// 문장이 그대로 섞임).
// LLM이 방금 생성한 fields에 대해서만 쓴다 — needsCjkRetranslation은
// "번역문에 목표 언어 문자가 하나도 없으면 통째로 다른 언어로 답한
// 것"이라는 가정에 기대는데, TourAPI 자체 번역 서비스(getTranslatedDetail
// 이 이 함수와 별개로 우선 시도하는 경로)가 내려주는 주소는 도로명을
// 로마자로만 표기하는 경우가 흔해(예: '25, Hyeoncheon-gil, Gujeong-myeon,
// Gangneung-si') 정상인데도 걸릴 수 있다. 그래서 이 판단은 방금 생성한
// LLM 응답을 즉시 재시도할지 결정할 때만 쓰고, 캐시에 이미 저장된
// 값(‑ TourAPI 매칭 결과일 수도 있는 값)의 신선도 판단에는 쓰지 않는다.
function translationIsIncomplete(lang, korItem, fields) {
  return needsCjkRetranslation(lang, korItem, fields) ||
    hasUntranslatedKoreanField(korItem, fields) ||
    hasUnwrappedKoreanText(lang, fields);
}

// 캐시된 번역의 신선도 검사에도 translationIsIncomplete를 그대로 쓴다.
// needsCjkRetranslation이 이제 overview만 보도록 좁혀졌으므로(주소는
// 로마자 표기가 정상이라 예전엔 오탐 원인이었다) 여기 다시 포함해도
// 안전하다 — 이걸 빼면 예전에 통째로 영어로 캐시된 overview(실측:
// '군산근대역사박물관', '최참판댁', '하동 야생차박물관'의 중국어)가
// 한글이 하나도 없어 hasUntranslatedKoreanField·hasUnwrappedKoreanText
// 둘 다 못 잡고 영원히 "신선"한 캐시로 남는다.
function cachedTranslationLooksStale(lang, korItem, cachedFields) {
  return translationIsIncomplete(lang, korItem, cachedFields);
}

// item이 null이어도 두 가지 서로 다른 상황을 구분해야 한다: mock 모드처럼
// "지금 이 환경에서는 애초에 시도하지 않는다"는 안정적인 상태는 캐시해도
// 되지만, 실제로 LLM을 호출했는데 오류가 나거나(레이트리밋 등 일시적 문제)
// 모든 필드를 빈 값으로 반환한 경우(실측: '고양이똥'처럼 특이한 상호명에서
// 드물게 발생)는 캐시하면 TTL 동안 계속 원문만 나오게 된다 — 이런 건
// cacheable:false로 표시해 다음 조회에서 바로 다시 시도하게 한다.
async function translatePlaceFieldsWithLlm(korItem, lang, generator, logger) {
  if (!generator || generator.isMockMode(process.env)) {
    return { item: null, cacheable: true };
  }
  try {
    let fields = await requestPlaceTranslation(korItem, lang, generator);
    // OpenRouter는 temperature:0이어도 완전히 결정적이지 않아, 이 검사에
    // 걸리는 응답이 재시도에서도 다시 실패할 수 있다. 실측: 같은
    // 장소·같은 프롬프트로 언어만 바꿔 반복 호출했을 때 중국어는 3번
    // 다 성공하고 일본어는 3번 다 실패하는 식으로, 어느 언어가 더
    // 어렵다기보다 매 호출이 그 자체로 독립적인 도박에 가깝다. 실측:
    // '동피랑마을' 같은 일부 콘텐츠(어원 설명이 섞인 문장)는 실패율이
    // 유독 높아 세 번을 다 써도 계속 실패하는 경우가 있었다. 최대 다섯
    // 번까지 재시도한다(성공 확률이 매 시도마다 독립적이라면 시도를
    // 늘릴수록 최종 실패 확률이 빠르게 줄어든다).
    for (
      let attempt = 0;
      attempt < 5 && translationIsIncomplete(lang, korItem, fields);
      attempt += 1
    ) {
      logger?.warn?.('장소 기계번역 결과가 불완전해 재시도합니다.', {
        contentId: korItem?.contentId,
        lang,
        attempt: attempt + 1,
      });
      const retried = await requestPlaceTranslation(
        korItem,
        lang,
        generator,
        '이전 응답이 불완전했습니다. 응답 전체가 목표 언어가 아닌 다른 언어(예: 영어)로 나왔거나, 일부 필드가 한글 원문 그대로 남아 있었거나, 번역문에 괄호로 감싸지 않은 한글이 섞여 있었습니다. title을 제외한 모든 필드를 반드시 목표 언어로 다시 번역하고, 원문 한글을 남길 때는 반드시 괄호 안에만 넣으세요.',
      );
      if (Object.keys(retried).length > 0) {
        fields = retried;
      }
    }
    if (Object.keys(fields).length === 0) {
      logger?.warn?.('장소 기계번역이 모든 필드를 빈 값으로 반환해 다음 조회에서 다시 시도합니다.', {
        contentId: korItem?.contentId,
      });
      return { item: null, cacheable: false };
    }
    // 재시도를 다 써도 여전히 불완전하면, 이 결과를 캐시에 박제하지
    // 않는다 — 이번 요청엔 아쉬운 대로 보여주되, 다음 조회에서 바로 다시
    // 시도할 기회를 남겨 둔다.
    const cacheable = !translationIsIncomplete(lang, korItem, fields);
    if (!cacheable) {
      logger?.warn?.('재시도 후에도 번역이 불완전해 이번 결과는 캐시하지 않습니다.', {
        contentId: korItem?.contentId,
        lang,
      });
    }
    return { item: fields, cacheable };
  } catch (error) {
    logger?.warn?.('장소 기계번역에 실패해 국문 정보로 대체하고 다음 조회에서 다시 시도합니다.', {
      errorName: error?.name || 'Error',
    });
    return { item: null, cacheable: false };
  }
}

function createCachedPlacesService(options = {}) {
  const upstream = options.tourApiService || tourApiService;
  const repository = options.repository || placeCacheRepository;
  const config = options.config || getPlaceCacheConfig();
  const clock = options.clock || Date.now;
  const logger = options.logger || console;
  const llm = options.llmService || llmService;
  const inFlight = new Map();
  let dbUnavailableUntil = 0;

  function now() {
    return normalizeClockValue(clock());
  }

  function isFresh(record, timestamp) {
    return record && record.expiresAt > timestamp;
  }

  function isStaleUsable(record, timestamp) {
    return (
      record &&
      record.cachedAt <= timestamp &&
      record.cachedAt + config.staleMaxAgeMs > timestamp
    );
  }

  function markDatabaseFailure(error, operation, timestamp) {
    dbUnavailableUntil = Math.max(
      dbUnavailableUntil,
      timestamp + config.dbFailureCooldownMs,
    );
    logger?.warn?.('장소 캐시 DB를 일시적으로 우회합니다.', {
      cacheOperation: operation,
      errorName: error?.name || 'Error',
    });
  }

  async function readCache(method, key, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return { available: false, value: null };
    }

    try {
      return { available: true, value: await repository[method](key) };
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return { available: false, value: null };
    }
  }

  async function writeCache(method, input, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return false;
    }

    try {
      await repository[method](input);
      return true;
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return false;
    }
  }

  function runSingleFlight(key, task) {
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      });
    inFlight.set(key, promise);
    return promise;
  }

  async function getQuery(operation, input, fetchUpstream) {
    const request = canonicalQuery(operation, input);
    const cacheKey = createQueryCacheKey(request);
    const timestamp = now();
    const cacheRead = await readCache(
      'findQuery',
      cacheKey,
      operation,
      timestamp,
    );
    const cached = cacheRead.value;

    if (isFresh(cached, timestamp)) {
      return {
        items: cached.items,
        pagination: cached.pagination,
        cacheStatus: CACHE_STATUS.HIT,
      };
    }

    return runSingleFlight(`query:${cacheKey}`, async () => {
      try {
        const result = await fetchUpstream();
        const refreshedAt = now();
        const stored = cacheRead.available && await writeCache(
          'saveQuery',
          {
            cacheKey,
            operation,
            request,
            items: result.items,
            pagination: result.pagination,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          operation,
          refreshedAt,
        );
        return {
          ...result,
          cacheStatus: stored
            ? CACHE_STATUS.REFRESHED
            : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 검색 캐시를 반환합니다.', {
            cacheOperation: operation,
            errorName: error.name,
          });
          return {
            items: cached.items,
            pagination: cached.pagination,
            cacheStatus: CACHE_STATUS.STALE,
          };
        }
        throw error;
      }
    });
  }

  async function getKoreanDetail(input, contentId) {
    const timestamp = now();
    const cacheRead = await readCache(
      'findPlace',
      contentId,
      'placeDetail',
      timestamp,
    );
    const cachedPlace = cacheRead.value;
    const cached = cachedPlace?.detail
      ? {
        item: cachedPlace.detail,
        cachedAt: cachedPlace.detailCachedAt,
        expiresAt: cachedPlace.detailExpiresAt,
      }
      : null;

    if (isFresh(cached, timestamp)) {
      return { item: cached.item, cacheStatus: CACHE_STATUS.HIT };
    }

    return runSingleFlight(`detail:${contentId}`, async () => {
      try {
        const item = await upstream.getPlaceDetail(input);
        const refreshedAt = now();
        if (!item) {
          return {
            item: null,
            cacheStatus: CACHE_STATUS.BYPASS,
          };
        }

        const stored = cacheRead.available && await writeCache(
          'saveDetail',
          {
            item,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          'placeDetail',
          refreshedAt,
        );
        return {
          item,
          cacheStatus: stored
            ? CACHE_STATUS.REFRESHED
            : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 상세 캐시를 반환합니다.', {
            cacheOperation: 'placeDetail',
            errorName: error.name,
          });
          return { item: cached.item, cacheStatus: CACHE_STATUS.STALE };
        }
        throw error;
      }
    });
  }

  async function findTranslatedContentId(korItem, lang) {
    if (!korItem.title || korItem.latitude == null || korItem.longitude == null) {
      return null;
    }

    const searchResult = await upstream.searchPlacesByLocationTranslated(lang, {
      latitude: korItem.latitude,
      longitude: korItem.longitude,
      radius: TRANSLATION_MATCH_RADIUS_METERS,
      numOfRows: 20,
    });

    let bestContentId = null;
    let bestScore = 0;
    let bestDistance = Infinity;
    for (const candidate of searchResult.items) {
      if (candidate.latitude == null || candidate.longitude == null) {
        continue;
      }
      const score = countMatchingTokens(korItem.title, candidate.title);
      if (score === 0) {
        continue;
      }
      const distance = haversineMeters(
        korItem.latitude,
        korItem.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (score > bestScore || (score === bestScore && distance < bestDistance)) {
        bestScore = score;
        bestDistance = distance;
        bestContentId = candidate.contentId;
      }
    }

    return bestDistance <= MAX_TRANSLATION_MATCH_DISTANCE_METERS ? bestContentId : null;
  }

  async function getTranslatedDetail(contentId, korItem, lang) {
    const cacheOperation = `placeDetail:${lang}`;
    const timestamp = now();
    const cacheRead = await readCache(
      'findPlace',
      contentId,
      cacheOperation,
      timestamp,
    );
    const cachedPlace = cacheRead.value;
    const cachedTranslation = cachedPlace?.translations?.[lang];
    // cachedAt이 있으면 "조회는 해봤다"는 뜻이라, detail이 null이어도(번역이
    // 없다고 확인된 상태) 캐시 히트로 취급해 API를 다시 호출하지 않는다.
    const cached = cachedTranslation?.cachedAt != null
      ? {
        item: cachedTranslation.detail,
        cachedAt: cachedTranslation.cachedAt,
        expiresAt: cachedTranslation.expiresAt,
      }
      : null;

    // 지역 목록 화면은 요약 정보(overview 등 상세 전용 필드가 항상 비어있는
    // PlaceSummary)만 갖고 있어, 같은 장소를 목록에서 먼저 열람하면 그
    // 얕은 국문 정보로만 번역한 캐시가 먼저 저장될 수 있다. 그 캐시가
    // "신선"하다는 이유로 계속 재사용되면, 나중에 상세 화면이 overview 등
    // 실제로 값이 있는 국문 정보를 갖고 다시 요청해도 번역이 채워지지
    // 않는다. 지금 korItem에는 있는데 캐시된 번역에는 없는 필드가 있으면
    // 얕은 캐시로 보고 다시 번역한다. title은 특히 중요하니 늘 함께 본다 —
    // LLM이 특이한 상호명(예: 단어 하나짜리 고유명사)을 한 번은 자신 없어
    // 빈 값으로 남겨도, 다음 조회에서 다시 시도할 기회를 준다.
    const cacheIsThin = Boolean(cached?.item) && [...DETAIL_ONLY_TRANSLATION_FIELDS, 'title'].some(
      field => korItem?.[field] && !cached.item[field],
    );

    // 캐시된 번역에 한글이 그대로 새어나온 필드가 있으면(필드 전체가
    // 원문과 동일하거나, 괄호 밖에 한글이 남아 있으면) LLM이 그 부분을
    // 번역/음역하지 못하고 그대로 되돌려보낸 것으로 본다. 이 상태를
    // "신선"하다고 계속 재사용하면 해당 언어에서 영원히 원문 그대로
    // 보이므로, 다음 조회에서 다시 번역을 시도하도록 얕은 캐시로
    // 취급한다. needsCjkRetranslation은 여기서 쓰지 않는다 — 캐시된
    // 값은 TourAPI 자체 번역일 수도 있는데, 그쪽 주소는 도로명을
    // 로마자로만 표기해 정상인데도 "목표 언어 문자가 없다"에 걸리기
    // 때문이다(translationIsIncomplete 주석 참고).
    const cachedTranslationIsStale = Boolean(cached?.item) &&
      cachedTranslationLooksStale(lang, korItem, cached.item);

    if (isFresh(cached, timestamp) && !cacheIsThin && !cachedTranslationIsStale) {
      return { item: cached.item, cacheStatus: CACHE_STATUS.HIT };
    }

    return runSingleFlight(`detail:${lang}:${contentId}`, async () => {
      try {
        // TourAPI 번역 서비스 쪽 매칭 조회(findTranslatedContentId)나 상세
        // 조회(getPlaceDetailTranslated) 자체가 실패(레이트리밋·일시 장애
        // 등)해도, 그 이유만으로 LLM 폴백 기회까지 통째로 날리면 안 된다 —
        // LLM 번역은 TourAPI 번역 서비스 없이도 이미 검증된 국문 정보만
        // 있으면 되므로, 이 두 호출의 실패는 여기서만 흡수하고 "매칭 없음"
        // 취급해 아래에서 LLM으로 계속 진행한다.
        let item = null;
        try {
          const matchedContentId = await findTranslatedContentId(korItem, lang);
          item = matchedContentId
            ? await upstream.getPlaceDetailTranslated(lang, { contentId: matchedContentId })
            : null;
        } catch (matchError) {
          logger?.warn?.('TourAPI 번역 후보 조회에 실패해 매칭 없음으로 처리하고 LLM으로 넘어갑니다.', {
            errorName: matchError?.name || 'Error',
          });
          item = null;
        }
        // TourAPI 매칭 후보 자체가 없을 때뿐 아니라, 후보는 찾았는데 그
        // 번역 레코드 자체가 쓸모없는 경우도 마찬가지로 LLM 번역으로
        // 넘어가야 한다 — 이건 우리가 만든 게 아니라 공공데이터
        // 자체의 결함이다. 실측 두 가지: (1) title이 비어있음(가나아트
        // 센터 일본어 레코드), (2) title/overview에 괄호로 감싸지 않은
        // 한글이 섞이거나(강릉 선교장 중국어 title이 TourAPI 원본부터
        // '江陵船桥庄강릉 선교장') overview가 통째로 다른 언어(동피랑
        // 마을의 중국어 레코드가 overview 전체를 영어로 갖고 있음).
        let cacheable = true;
        if (!item || !item.title || translationIsIncomplete(lang, korItem, item)) {
          const llmResult = await translatePlaceFieldsWithLlm(korItem, lang, llm, logger);
          item = llmResult.item;
          cacheable = llmResult.cacheable;
        }
        const refreshedAt = now();
        if (cacheable) {
          await writeCache(
            'saveDetailTranslation',
            {
              contentId,
              lang,
              item,
              cachedAt: new Date(refreshedAt),
              expiresAt: new Date(refreshedAt + config.ttlMs),
            },
            cacheOperation,
            refreshedAt,
          );
        }
        return {
          item,
          cacheStatus: item ? CACHE_STATUS.REFRESHED : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 번역 상세 캐시를 반환합니다.', {
            cacheOperation,
            errorName: error.name,
          });
          return { item: cached.item, cacheStatus: CACHE_STATUS.STALE };
        }
        // 번역 상세 조회 실패는 전체 요청을 실패시키지 않는다. 국문 정보로 대체한다.
        logger?.warn?.('번역 장소 상세 조회에 실패해 국문 정보로 대체합니다.', {
          cacheOperation,
          errorName: error?.name || 'Error',
        });
        return { item: null, cacheStatus: CACHE_STATUS.BYPASS };
      }
    });
  }

  async function getPlaceDetail(input = {}) {
    const contentId = canonicalScalar(input.contentId);
    if (!contentId || !/^\d+$/.test(contentId)) {
      const item = await upstream.getPlaceDetail(input);
      return { item, cacheStatus: CACHE_STATUS.BYPASS };
    }

    const korResult = await getKoreanDetail(input, contentId);
    if (!korResult.item || !SUPPORTED_TRANSLATION_LANGS.has(input.lang)) {
      return korResult;
    }

    const translated = await getTranslatedDetail(contentId, korResult.item, input.lang);
    return {
      item: applyTranslationOverlay(korResult.item, translated.item),
      cacheStatus: korResult.cacheStatus,
    };
  }

  // 지역 장소 목록처럼 여러 건을 한 번에 보여줄 때 쓰는 가벼운 버전이다.
  // 상세 화면과 같은 검색+좌표 매칭·캐시 로직을 재사용한다.
  async function attachTranslationOverlay(items, lang) {
    return Promise.all(
      items.map(async item => {
        const contentId = canonicalScalar(item.contentId);
        if (!contentId) {
          return item;
        }
        const translated = await getTranslatedDetail(contentId, item, lang);
        return applyTranslationOverlay(item, translated.item);
      }),
    );
  }

  return Object.freeze({
    async getCachedQuery({ operation, input, fetchUpstream } = {}) {
      if (
        typeof operation !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9]{0,29}$/.test(operation)
      ) {
        throw new TypeError('캐시 operation 형식이 올바르지 않습니다.');
      }
      if (typeof fetchUpstream !== 'function') {
        throw new TypeError('캐시 fetchUpstream 함수가 필요합니다.');
      }
      return getQuery(operation, input, fetchUpstream);
    },
    async getAreaBasedPlaces(input) {
      const normalized = normalizeAreaBasedPlaceOptions(input);
      return getQuery(
        'areaBasedList2',
        normalized,
        () => upstream.getAreaBasedPlaces(normalized),
      );
    },
    getPlaceDetail,
    attachTranslationOverlay,
    async searchPlacesByKeyword(input) {
      const normalized = normalizeKeywordPlaceOptions(input);
      return getQuery(
        'searchKeyword2',
        normalized,
        () => upstream.searchPlacesByKeyword(normalized),
      );
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createCachedPlacesService();
  }
  return defaultService;
}

module.exports = {
  CACHE_STATUS,
  canonicalQuery,
  createCachedPlacesService,
  createQueryCacheKey,
  getCachedQuery: input => getDefaultService().getCachedQuery(input),
  getAreaBasedPlaces: input => getDefaultService().getAreaBasedPlaces(input),
  getPlaceDetail: input => getDefaultService().getPlaceDetail(input),
  attachTranslationOverlay: (items, lang) =>
    getDefaultService().attachTranslationOverlay(items, lang),
  searchPlacesByKeyword: input =>
    getDefaultService().searchPlacesByKeyword(input),
};
