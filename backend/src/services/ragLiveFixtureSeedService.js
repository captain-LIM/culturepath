'use strict';

const {
  auditRagLiveFixture,
  collectExpectations,
} = require('./ragLiveFixtureAuditService');
const { classifyTourPlace } = require('../config/cultureCategoryMap');

function normalizedContentId(value) {
  return String(value ?? '').trim();
}

function seededItem(result) {
  return result?.item || null;
}

function sameCultures(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

async function seedRagLiveFixture({
  dataset,
  fetchAndCachePlace,
  findExistingPlaces,
  updatePlaceCultures,
}) {
  if (typeof fetchAndCachePlace !== 'function') {
    throw new TypeError('live fixture 적재에는 fetchAndCachePlace 함수가 필요합니다.');
  }
  if (typeof findExistingPlaces !== 'function') {
    throw new TypeError('live fixture 적재에는 findExistingPlaces 함수가 필요합니다.');
  }
  if (typeof updatePlaceCultures !== 'function') {
    throw new TypeError('live fixture 적재에는 updatePlaceCultures 함수가 필요합니다.');
  }

  const expectations = collectExpectations(dataset);
  const expectedContentIds = expectations.map(item => item.contentId);
  const existing = await findExistingPlaces(expectedContentIds);
  const existingIds = new Set(
    (existing || []).map(place => normalizedContentId(place?.contentId)),
  );
  const missingContentIds = expectedContentIds.filter(contentId => !existingIds.has(contentId));
  const seededContentIds = [];

  for (const contentId of missingContentIds) {
    const result = await fetchAndCachePlace(contentId);
    const item = seededItem(result);
    if (!item) {
      const error = new Error('TourAPI에서 live fixture 장소를 찾지 못했습니다.');
      error.code = 'LIVE_FIXTURE_PLACE_NOT_FOUND';
      throw error;
    }
    if (normalizedContentId(item.contentId) !== contentId) {
      const error = new Error('TourAPI live fixture 장소 식별자가 일치하지 않습니다.');
      error.code = 'LIVE_FIXTURE_CONTENT_ID_MISMATCH';
      throw error;
    }
    seededContentIds.push(contentId);
  }

  const persistedPlaces = await findExistingPlaces(expectedContentIds);
  const reclassifiedContentIds = [];
  for (const place of persistedPlaces || []) {
    const summary = place?.summary || {};
    const cultures = classifyTourPlace(summary);
    if (sameCultures(summary.cultures, cultures)) continue;
    const updated = await updatePlaceCultures({
      contentId: place.contentId,
      cultures,
      summary: { ...summary, cultures },
    });
    if (!updated) {
      const error = new Error('live fixture 캐시 문화 재분류 대상을 찾지 못했습니다.');
      error.code = 'LIVE_FIXTURE_CACHE_UPDATE_MISSING';
      throw error;
    }
    reclassifiedContentIds.push(place.contentId);
  }

  const audit = await auditRagLiveFixture({ dataset, findExistingPlaces });
  return {
    audit,
    expectedContentIds: expectedContentIds.length,
    reclassifiedContentIds,
    requestedContentIds: missingContentIds,
    seededContentIds,
    skippedContentIds: expectedContentIds.filter(contentId => existingIds.has(contentId)),
    readyForEvidenceReview:
      audit.issueCount === 0 && audit.foundContentIds === audit.auditedContentIds,
  };
}

module.exports = {
  seedRagLiveFixture,
};
