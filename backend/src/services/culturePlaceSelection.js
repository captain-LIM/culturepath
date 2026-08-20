'use strict';

const {
  CULTURE_CATEGORIES,
  MAX_CULTURE_RESULTS,
  classifyTourPlace,
  getCultureMatchStrength,
} = require('../config/cultureCategoryMap');

const CACHE_STATUS_PRIORITY = Object.freeze({
  HIT: 1,
  REFRESHED: 2,
  BYPASS: 3,
  STALE: 4,
});

function isSupportedCulture(culture) {
  return CULTURE_CATEGORIES.includes(culture);
}

function reclassifyPlace(place) {
  const cultures = classifyTourPlace(place);
  return {
    ...place,
    cultures,
    category: cultures[0] || '기타',
  };
}

function selectPlacesForCulture(placeGroups, culture, options = {}) {
  if (!isSupportedCulture(culture)) {
    throw new RangeError('지원하지 않는 문화 카테고리입니다.');
  }

  const requestedLimit = Number(options.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_CULTURE_RESULTS)
    : MAX_CULTURE_RESULTS;
  const candidates = new Map();
  let discoveryIndex = 0;

  for (const group of placeGroups) {
    for (const originalPlace of Array.isArray(group) ? group : []) {
      const place = reclassifyPlace(originalPlace);
      const strength = getCultureMatchStrength(place, culture);
      const contentId = String(place.contentId || '').trim();
      const index = discoveryIndex;
      discoveryIndex += 1;

      if (!contentId || strength === 0) {
        continue;
      }

      const existing = candidates.get(contentId);
      if (!existing) {
        candidates.set(contentId, { place, strength, index });
        continue;
      }

      if (strength > existing.strength) {
        candidates.set(contentId, {
          place,
          strength,
          index: existing.index,
        });
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) =>
      right.strength - left.strength || left.index - right.index,
    )
    .slice(0, limit)
    .map(candidate => candidate.place);
}

function combineCultureCacheStatus(primaryStatus, secondaryStatus) {
  return [primaryStatus, secondaryStatus]
    .filter(Boolean)
    .sort((left, right) =>
      (CACHE_STATUS_PRIORITY[right] || 0) -
      (CACHE_STATUS_PRIORITY[left] || 0),
    )[0];
}

module.exports = {
  combineCultureCacheStatus,
  isSupportedCulture,
  reclassifyPlace,
  selectPlacesForCulture,
};
