'use strict';

const CULTURE_CATEGORIES = Object.freeze([
  '독립서점·책방',
  '문학',
  '음악',
  '전통주·양조장',
  '로컬 미식',
  '공예·공방',
  '근대 문화유산',
  '미술·갤러리',
  '영화·애니메이션',
  '커피·카페',
]);

const DEFAULT_CULTURE_RESULTS = 20;
const MAX_CULTURE_PAGE = 5;
const MAX_CULTURE_RESULTS = 50;

// culture 필터가 걸린 검색에서 TourAPI로부터 끌어올 원본 후보 개수.
// MAX_CULTURE_RESULTS(최종 응답 개수)보다 넉넉히 크게 잡아야 분류 필터를
// 통과하는 실제 매칭 장소가 충분히 남는다. 공공데이터포털 페이지당 최대치인
// 50으로 맞춘다.
const CULTURE_CANDIDATE_FETCH_ROWS = 50;

const CULTURE_MATCH_STRENGTH = Object.freeze({
  NONE: 0,
  TITLE_KEYWORD: 1,
  OFFICIAL_CLASSIFICATION: 2,
  CONTENT_ID_OVERRIDE: 3,
});

// TourAPI 분류만으로 구분하기 어려운 장소를 contentId 기준으로 보정한다.
// 검증되지 않은 ID는 추측해서 추가하지 않는다.
const CONTENT_ID_OVERRIDES = Object.freeze({
  // TourAPI 신분류는 일반 박물관(VE07)으로만 제공하지만 장소 자체가
  // 근대사를 직접 다루는 것이 2026-08-24 국문 상세조회로 확인됐다.
  1684836: Object.freeze(['근대 문화유산']), // 군산근대역사박물관
  2607311: Object.freeze(['근대 문화유산']), // 목포근대역사관 1관
});

// culture만 지정되고 q가 없는 검색에서 searchKeyword2를 직접 호출할 때 쓰는
// 대표 검색어들. 문화 카테고리 하나당 검색어 하나만 쓰면 그 단어가 제목에
// 없는 실제 장소들이 후보에서 통째로 빠져 결과가 지나치게 적어진다. 문화별로
// 서로 다른 관점의 대표어 2개를 병렬 검색해 후보 폭을 넓힌다. KEYWORD_RULES·
// TourAPI 공식 소분류 명칭과 겹치는 안전한 단어만 사용한다.
const CULTURE_SEARCH_KEYWORDS = Object.freeze({
  '독립서점·책방': Object.freeze(['서점', '책방']),
  '문학': Object.freeze(['문학관', '문학']),
  '음악': Object.freeze(['공연장', '음악당', '콘서트홀']),
  '전통주·양조장': Object.freeze(['양조장', '전통주', '소주']),
  '로컬 미식': Object.freeze(['전통시장', '중앙시장', '향토음식']),
  '공예·공방': Object.freeze(['공방', '공예']),
  '근대 문화유산': Object.freeze(['근대건축물', '근대역사', '개항']),
  '미술·갤러리': Object.freeze(['미술관', '갤러리']),
  '영화·애니메이션': Object.freeze(['영화관', '애니메이션']),
  '커피·카페': Object.freeze(['카페', '커피']),
});

// lclsSystmCode2(신분류체계) 중분류·소분류 코드값은 getClassificationCodes()
// 라이브 조회로 확인했다(2026-08-06). 우리 10개 문화 카테고리와 명확히
// 일대일 대응되는 코드만 등록하고, 박물관/기념관/과학관처럼 애매한 코드는
// 추가하지 않는다.
const MID_CLASSIFICATION_CODE_RULES = Object.freeze({
  FD05: '커피·카페', // 카페/찻집
  EX02: '공예·공방', // 공예체험
});

const SUB_CLASSIFICATION_CODE_RULES = Object.freeze({
  VE070600: '미술·갤러리', // 미술관/화랑
  VE060100: '음악', // 공연장
  VE060200: '영화·애니메이션', // 영화관
  HS011100: '근대 문화유산', // 근대건축물
});

// 대형마트·올리브영·백화점 같은 프랜차이즈 지점명이 지명+'점'으로 끝날 때
// (예: '이마트 수서점', '올리브영 연신내범서점', 'NC백화점 강서점') 그
// 지명의 마지막 음절이 우연히 '서'로 끝나면 '서점'이라는 부분 문자열과
// 그대로 일치해 버려 실사용에서 다수의 오탐이 확인됐다. '독립'서점이라는
// 카테고리 취지상 체인점은 애초에 대상이 아니므로, 잘 알려진 프랜차이즈
// 표기가 제목에 포함되면 서점·책방 키워드가 있어도 매칭에서 제외한다.
const FRANCHISE_EXCLUSION_LOOKAHEAD =
  '(?!.*(?:이마트|홈플러스|롯데마트|다이소|올리브영|ABC\\s*마트|GS25|CU|세븐일레븐|스타벅스|투썸플레이스|백화점|아울렛|편의점|교보문고|영풍문고))';

const KEYWORD_RULES = Object.freeze([
  [
    '독립서점·책방',
    new RegExp(
      `^${FRANCHISE_EXCLUSION_LOOKAHEAD}.*(?:독립\\s*서점|서점|책방|북스테이|헌책방|고서점)`,
      'i',
    ),
  ],
  ['문학', /문학|문학관|작가|소설가|시인|박경리|유치환|청마/i],
  ['음악', /음악|공연장|콘서트|국악|오페라|재즈|뮤직/i],
  ['전통주·양조장', /전통주|막걸리|소주|양조장|브루어리|주조장|와이너리|술도가/i],
  ['로컬 미식', /향토\s*음식|로컬\s*푸드|맛집|전통시장|중앙시장|재래시장|원조|노포/i],
  ['공예·공방', /공예|공방|도예|나전칠기|한지|목공|금속공예/i],
  ['근대 문화유산', /근대|개항|적산가옥|일제강점기|등록문화재/i],
  ['미술·갤러리', /미술|미술관|갤러리|아트센터|예술관/i],
  ['영화·애니메이션', /영화|극장|시네마|애니메이션|만화/i],
  ['커피·카페', /커피|카페|로스터리|다방/i],
]);

const TOP_LEVEL_CANDIDATES = Object.freeze({
  AC: new Set(['독립서점·책방']),
  FD: new Set(['전통주·양조장', '로컬 미식', '커피·카페']),
  VE: new Set([
    '문학',
    '음악',
    '전통주·양조장',
    '공예·공방',
    '미술·갤러리',
    '영화·애니메이션',
  ]),
  HS: new Set(['문학', '근대 문화유산']),
  SH: new Set(['독립서점·책방', '공예·공방']),
  EX: new Set(['전통주·양조장', '공예·공방']),
});

function normalizeCategories(categories) {
  const requested = new Set(Array.isArray(categories) ? categories : []);
  return CULTURE_CATEGORIES.filter(category => requested.has(category));
}

function getTopLevelCode(item) {
  const code = getClassificationCodes(item).find(value => value.length === 2) || '';
  return code.slice(0, 2);
}

function getClassificationCodes(item) {
  const values = [
    item?.lclsSystm1,
    item?.lclsSystm2,
    item?.lclsSystm3,
    item?.lclsSystmCode1,
    item?.lcls_systm1,
    item?.lcls_systm2,
    item?.lcls_systm3,
    ...(Array.isArray(item?.lclsSystmCodes) ? item.lclsSystmCodes : []),
  ];

  return values
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter((value, index, all) => value && all.indexOf(value) === index);
}

function getCultureMatchStrengths(item, options = {}) {
  const contentId = String(item?.contentid ?? item?.contentId ?? '').trim();
  const overrides = options.contentIdOverrides || CONTENT_ID_OVERRIDES;

  if (Object.prototype.hasOwnProperty.call(overrides, contentId)) {
    return new Map(
      normalizeCategories(overrides[contentId]).map(category => [
        category,
        CULTURE_MATCH_STRENGTH.CONTENT_ID_OVERRIDE,
      ]),
    );
  }

  const title = String(item?.title || '').trim();
  const topLevelCode = getTopLevelCode(item);
  const hasClassificationCode = topLevelCode.length > 0;
  const allowedCategories = TOP_LEVEL_CANDIDATES[topLevelCode];
  const matches = new Map();

  for (const [category, pattern] of KEYWORD_RULES) {
    const categoryAllowed = hasClassificationCode
      ? allowedCategories?.has(category) === true
      : true;
    if (categoryAllowed && pattern.test(title)) {
      matches.set(category, CULTURE_MATCH_STRENGTH.TITLE_KEYWORD);
    }
  }

  for (const code of getClassificationCodes(item)) {
    const category =
      MID_CLASSIFICATION_CODE_RULES[code] ||
      SUB_CLASSIFICATION_CODE_RULES[code];
    if (category) {
      matches.set(category, CULTURE_MATCH_STRENGTH.OFFICIAL_CLASSIFICATION);
    }
  }

  return matches;
}

function classifyTourPlace(item, options = {}) {
  const matches = getCultureMatchStrengths(item, options);
  return CULTURE_CATEGORIES.filter(category => matches.has(category));
}

function getCultureMatchStrength(item, culture, options = {}) {
  if (!CULTURE_CATEGORIES.includes(culture)) {
    return CULTURE_MATCH_STRENGTH.NONE;
  }
  return getCultureMatchStrengths(item, options).get(culture) ||
    CULTURE_MATCH_STRENGTH.NONE;
}

module.exports = {
  CONTENT_ID_OVERRIDES,
  CULTURE_CANDIDATE_FETCH_ROWS,
  CULTURE_CATEGORIES,
  CULTURE_MATCH_STRENGTH,
  CULTURE_SEARCH_KEYWORDS,
  DEFAULT_CULTURE_RESULTS,
  MAX_CULTURE_PAGE,
  MAX_CULTURE_RESULTS,
  classifyTourPlace,
  getCultureMatchStrength,
};
