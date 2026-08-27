'use strict';

const { REGION_DEFINITIONS } = require('./regionCatalog');

const REGION_PROFILES = Object.freeze({
  seoul: Object.freeze({
    tags: Object.freeze(['book', 'art', 'coffee']),
    evidence: Object.freeze(['지원 지역의 검토된 서점·미술·카페 장소 구성']),
  }),
  gangneung: Object.freeze({
    tags: Object.freeze(['sea', 'coffee', 'literature', 'food']),
    evidence: Object.freeze(['해안 지역과 검토된 커피·문학 장소 구성']),
  }),
  jeonju: Object.freeze({
    tags: Object.freeze(['traditional', 'food', 'craft', 'book']),
    evidence: Object.freeze(['검토된 한옥·미식·공예·책방 장소 구성']),
  }),
  tongyeong: Object.freeze({
    tags: Object.freeze(['sea', 'literature', 'music', 'food', 'craft']),
    evidence: Object.freeze(['해안 지역과 검토된 문학·음악·미식 장소 구성']),
  }),
  chuncheon: Object.freeze({
    tags: Object.freeze(['animation', 'literature', 'nature']),
    evidence: Object.freeze(['검토된 애니메이션·문학 장소와 지역 자연 자원']),
  }),
  pohang: Object.freeze({
    tags: Object.freeze(['sea', 'modern_history', 'art']),
    evidence: Object.freeze(['해안 지역과 검토된 근대·예술 장소 구성']),
  }),
  andong: Object.freeze({
    tags: Object.freeze(['traditional', 'traditional_liquor']),
    evidence: Object.freeze(['검토된 전통문화·전통주·역사 장소 구성']),
  }),
  hadong: Object.freeze({
    tags: Object.freeze(['literature', 'nature', 'food']),
    evidence: Object.freeze(['검토된 문학·미식 장소와 지역 자연 자원']),
  }),
  gunsan: Object.freeze({
    tags: Object.freeze(['sea', 'modern_history', 'food']),
    evidence: Object.freeze(['해안 지역과 검토된 근대문화유산·미식 장소 구성']),
  }),
  mokpo: Object.freeze({
    tags: Object.freeze(['sea', 'modern_history', 'food']),
    evidence: Object.freeze(['해안 지역과 검토된 근대문화유산·미식 장소 구성']),
  }),
});

const PREFERENCE_ALIASES = Object.freeze({
  sea: Object.freeze(['바다', '해변', '해안', '항구', '오션']),
  quiet: Object.freeze(['조용', '한적', '차분', '여유']),
  nature: Object.freeze(['자연', '산책', '풍경']),
  traditional: Object.freeze(['전통', '한옥', '역사']),
  modern_history: Object.freeze(['근대', '개항', '일제강점기']),
  food: Object.freeze(['맛집', '미식', '먹거리', '시장']),
  coffee: Object.freeze(['커피', '카페']),
  book: Object.freeze(['책', '책방', '서점']),
  literature: Object.freeze(['문학', '작가', '소설', '시인']),
  music: Object.freeze(['음악', '공연', '콘서트']),
  art: Object.freeze(['미술', '그림', '갤러리']),
  craft: Object.freeze(['공예', '공방', '만들기 체험']),
  animation: Object.freeze(['영화', '애니메이션', '만화']),
  traditional_liquor: Object.freeze(['전통주', '막걸리', '양조장', '소주']),
});

const TAG_TO_CULTURES = Object.freeze({
  animation: Object.freeze(['영화·애니메이션']),
  art: Object.freeze(['미술·갤러리']),
  book: Object.freeze(['독립서점·책방']),
  coffee: Object.freeze(['커피·카페']),
  craft: Object.freeze(['공예·공방']),
  food: Object.freeze(['로컬 미식']),
  literature: Object.freeze(['문학']),
  modern_history: Object.freeze(['근대 문화유산']),
  music: Object.freeze(['음악']),
  traditional_liquor: Object.freeze(['전통주·양조장']),
});

function extractPreferenceTags(text) {
  const normalized = String(text || '').toLowerCase();
  return Object.entries(PREFERENCE_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => normalized.includes(alias)))
    .map(([tag]) => tag);
}

function culturesForTags(tags) {
  const result = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    for (const culture of TAG_TO_CULTURES[tag] || []) {
      if (!result.includes(culture)) result.push(culture);
    }
  }
  return result;
}

function regionsForTags(tags, limit = 3) {
  const requested = new Set(Array.isArray(tags) ? tags : []);
  return Object.entries(REGION_PROFILES)
    .map(([region, profile]) => ({
      region,
      name: REGION_DEFINITIONS[region]?.name || region,
      matchedTags: profile.tags.filter(tag => requested.has(tag)),
    }))
    .filter(item => item.matchedTags.length > 0)
    .sort((left, right) =>
      right.matchedTags.length - left.matchedTags.length ||
      left.name.localeCompare(right.name, 'ko'),
    )
    .slice(0, limit);
}

module.exports = {
  PREFERENCE_ALIASES,
  REGION_PROFILES,
  TAG_TO_CULTURES,
  culturesForTags,
  extractPreferenceTags,
  regionsForTags,
};
