'use strict';

function createPlaceSummary(fields) {
  if (!fields?.contentId || !fields?.title) {
    throw new TypeError('PlaceSummary에는 contentId와 title이 필요합니다.');
  }

  const cultures = Object.freeze([...(fields.cultures || [])]);
  const lclsSystmCodes = Object.freeze([...(fields.lclsSystmCodes || [])]);

  return Object.freeze({
    contentId: fields.contentId,
    contentTypeId: fields.contentTypeId ?? null,
    title: fields.title,
    overview: null,
    areaCode: fields.areaCode ?? null,
    sigunguCode: fields.sigunguCode ?? null,
    lDongRegnCd: fields.lDongRegnCd ?? null,
    lDongSignguCd: fields.lDongSignguCd ?? null,
    regionName: null,
    address: fields.address ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    tel: fields.tel ?? null,
    openTime: null,
    restDate: null,
    imageUrl: fields.imageUrl ?? null,
    thumbnailUrl: fields.thumbnailUrl ?? null,
    lclsSystmCodes,
    cultures,
    category: cultures[0] || '기타',
    source: 'TOUR_API',
    sourceUpdatedAt: fields.sourceUpdatedAt ?? null,
  });
}

module.exports = { createPlaceSummary };
