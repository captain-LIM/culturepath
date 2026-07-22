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

// TourAPI 분류만으로 구분하기 어려운 장소를 contentId 기준으로 보정한다.
// 검증되지 않은 ID는 추측해서 추가하지 않는다.
const CONTENT_ID_OVERRIDES = Object.freeze({});

const KEYWORD_RULES = Object.freeze([
  ['독립서점·책방', /독립\s*서점|서점|책방|북스테이/i],
  ['문학', /문학|문학관|작가|소설가|시인|박경리|유치환|청마/i],
  ['음악', /음악|공연장|콘서트|국악|오페라|재즈|뮤직/i],
  ['전통주·양조장', /전통주|막걸리|소주|양조장|브루어리/i],
  ['로컬 미식', /향토\s*음식|로컬\s*푸드|맛집|전통시장|중앙시장/i],
  ['공예·공방', /공예|공방|도예|나전칠기|한지|목공|금속공예/i],
  ['근대 문화유산', /근대|개항|적산가옥|일제강점기/i],
  ['미술·갤러리', /미술|미술관|갤러리|아트센터|예술관/i],
  ['영화·애니메이션', /영화|극장|시네마|애니메이션|만화/i],
  ['커피·카페', /커피|카페|로스터리/i],
]);

const TOP_LEVEL_CANDIDATES = Object.freeze({
  FD: new Set(['전통주·양조장', '로컬 미식', '커피·카페']),
  VE: new Set(['문학', '음악', '공예·공방', '미술·갤러리', '영화·애니메이션']),
  HS: new Set(['문학', '근대 문화유산']),
  SH: new Set(['독립서점·책방', '공예·공방']),
  EX: new Set(['공예·공방']),
});

function normalizeCategories(categories) {
  const requested = new Set(Array.isArray(categories) ? categories : []);
  return CULTURE_CATEGORIES.filter(category => requested.has(category));
}

function getTopLevelCode(item) {
  const code = String(
    item?.lclsSystm1 ?? item?.lclsSystmCode1 ?? item?.lcls_systm1 ?? '',
  )
    .trim()
    .toUpperCase();
  return code.slice(0, 2);
}

function classifyTourPlace(item, options = {}) {
  const contentId = String(item?.contentid ?? item?.contentId ?? '').trim();
  const overrides = options.contentIdOverrides || CONTENT_ID_OVERRIDES;

  if (Object.prototype.hasOwnProperty.call(overrides, contentId)) {
    return normalizeCategories(overrides[contentId]);
  }

  const title = String(item?.title || '').trim();
  const topLevelCode = getTopLevelCode(item);
  const hasClassificationCode = topLevelCode.length > 0;
  const allowedCategories = TOP_LEVEL_CANDIDATES[topLevelCode];
  const matches = [];

  for (const [category, pattern] of KEYWORD_RULES) {
    const categoryAllowed = hasClassificationCode
      ? allowedCategories?.has(category) === true
      : true;
    if (categoryAllowed && pattern.test(title)) {
      matches.push(category);
    }
  }

  if (matches.length === 0 && topLevelCode === 'FD') {
    matches.push('로컬 미식');
  }

  return normalizeCategories(matches);
}

module.exports = {
  CONTENT_ID_OVERRIDES,
  CULTURE_CATEGORIES,
  classifyTourPlace,
};
