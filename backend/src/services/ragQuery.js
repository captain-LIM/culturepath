'use strict';

const { CULTURE_CATEGORIES } = require('../config/cultureCategoryMap');
const { REGION_DEFINITIONS } = require('../config/regionCatalog');

const CONTENT_TYPE_IDS = Object.freeze(new Set([
  '12', '14', '15', '25', '28', '32', '38', '39',
]));

const CATEGORY_ALIASES = Object.freeze([
  ['북스테이', '독립서점·책방'], ['독립서점', '독립서점·책방'],
  ['책방', '독립서점·책방'], ['서점', '독립서점·책방'],
  ['막걸리', '전통주·양조장'], ['양조장', '전통주·양조장'],
  ['전통주', '전통주·양조장'], ['소주', '전통주·양조장'],
  ['전통시장', '로컬 미식'], ['로컬푸드', '로컬 미식'],
  ['맛집', '로컬 미식'], ['음식', '로컬 미식'], ['미식', '로컬 미식'],
  ['공방', '공예·공방'], ['공예', '공예·공방'],
  ['미술관', '미술·갤러리'], ['갤러리', '미술·갤러리'], ['아트', '미술·갤러리'],
  ['애니메이션', '영화·애니메이션'], ['시네마', '영화·애니메이션'],
  ['영화', '영화·애니메이션'], ['애니', '영화·애니메이션'], ['만화', '영화·애니메이션'],
  ['문화유산', '근대 문화유산'], ['근대', '근대 문화유산'], ['개항', '근대 문화유산'],
  ['카페', '커피·카페'], ['커피', '커피·카페'],
]);

const SOFT_CONDITION_RULES = Object.freeze([
  ['indoor', /비\s*(?:오는|가|날)|우천|장마|실내/i],
  ['low-mobility', /걷기\s*(?:편한|적은)|이동\s*(?:적은|짧은)|저강도|휠체어|유모차/i],
  ['family', /부모님|어르신|아이|어린이|가족/i],
  ['pet', /반려\s*동물|반려견|강아지|애견/i],
  ['dietary', /채식|비건|알레르기|할랄/i],
  ['quiet', /조용한|한적한|붐비지\s*않/i],
]);

function normalizeRagQuery(value) {
  const normalized = String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > 500) {
    throw new TypeError('RAG 검색어는 1자 이상 500자 이하여야 합니다.');
  }
  return normalized;
}

function validateCategory(value) {
  if (value === undefined || value === null || value === '') return null;
  const category = String(value).trim();
  if (!CULTURE_CATEGORIES.includes(category)) {
    throw new TypeError('지원하지 않는 문화 필터입니다.');
  }
  return category;
}

function validateRegion(value) {
  if (value === undefined || value === null || value === '') return null;
  const requested = String(value).trim();
  const definition = Object.values(REGION_DEFINITIONS).find(region =>
    region.name === requested || region.areaCode === requested,
  );
  if (!definition) throw new TypeError('지원하지 않는 지역 필터입니다.');
  return definition;
}

function validateContentTypeId(value) {
  if (value === undefined || value === null || value === '') return null;
  const contentTypeId = String(value).trim();
  if (!CONTENT_TYPE_IDS.has(contentTypeId)) {
    throw new TypeError('지원하지 않는 관광 콘텐츠 유형입니다.');
  }
  return contentTypeId;
}

function routeQuery(query, structuredFilters = {}) {
  const normalizedQuery = normalizeRagQuery(query);
  const lowered = normalizedQuery.toLowerCase();
  const explicitRegion = validateRegion(structuredFilters.region);
  const inferredRegion = Object.values(REGION_DEFINITIONS).find(region =>
    lowered.includes(region.name.toLowerCase()),
  ) || null;
  const explicitCategory = validateCategory(structuredFilters.category);
  const inferredCategory = CULTURE_CATEGORIES.find(category =>
    lowered.includes(category.toLowerCase()),
  ) || CATEGORY_ALIASES.find(([alias]) => lowered.includes(alias))?.[1] || null;
  const region = explicitRegion || inferredRegion;
  const softConditions = SOFT_CONDITION_RULES
    .filter(([, pattern]) => pattern.test(normalizedQuery))
    .map(([condition]) => condition);

  return Object.freeze({
    areaCode: region?.areaCode || null,
    category: explicitCategory || inferredCategory,
    contentTypeId: validateContentTypeId(structuredFilters.contentTypeId),
    normalizedQuery,
    region: region?.name || null,
    softConditions: Object.freeze(softConditions),
  });
}

module.exports = {
  CONTENT_TYPE_IDS,
  normalizeRagQuery,
  routeQuery,
  validateCategory,
  validateContentTypeId,
  validateRegion,
};
