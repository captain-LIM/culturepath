'use strict';

const { getExternalApiConfig } = require('../config/externalApis');
const cachedPlacesService = require('./cachedPlacesService');
const relatedTourApiService = require('./relatedTourApiService');
const { ExternalApiError } = require('../utils/externalApiError');

const CONTENT_ID_PATTERN = /^\d+$/;
const BASE_YM_PATTERN = /^\d{4}(0[1-9]|1[0-2])$/;
const LDONG_REGN_CODE_PATTERN = /^\d{2}$/;
const LDONG_SIGNGU_CODE_PATTERN = /^\d{3}$/;
const MAX_RELATED_PLACES = 5;

class MissingOriginError extends Error {}

function normalizeMatchTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function unwrapDetail(result) {
  if (
    result &&
    Object.prototype.hasOwnProperty.call(result, 'item') &&
    Object.prototype.hasOwnProperty.call(result, 'cacheStatus')
  ) {
    return result.item;
  }
  return result;
}

function isSamePlace(candidate, relation) {
  return (
    normalizeMatchTitle(candidate?.title) ===
      normalizeMatchTitle(relation.title) &&
    String(candidate?.lDongRegnCd || '') === relation.lDongRegnCd &&
    String(candidate?.lDongSignguCd || '') === relation.lDongSignguCd
  );
}

function createRelatedPlacesService(options = {}) {
  const places = options.placesService || cachedPlacesService;
  const relatedApi = options.relatedTourApiService || relatedTourApiService;
  const baseYm =
    options.baseYm ||
    getExternalApiConfig(options.env).relatedTourBaseYm;
  if (!BASE_YM_PATTERN.test(baseYm)) {
    throw new ExternalApiError(
      '연관 관광지 기준 연월 설정이 올바르지 않습니다.',
      {
        code: 'CONFIG_ERROR',
        service: 'relatedTour',
        operation: 'relatedPlaces',
      },
    );
  }

  async function resolveCandidate(relation) {
    const result = await places.searchPlacesByKeyword({
      keyword: relation.title,
      lDongRegnCd: relation.lDongRegnCd,
      lDongSignguCd: relation.lDongSignguCd,
      arrange: 'A',
      pageNo: 1,
      numOfRows: 5,
    });
    return result.items.find(item =>
      CONTENT_ID_PATTERN.test(String(item?.contentId || '')) &&
      isSamePlace(item, relation),
    ) || null;
  }

  async function loadMappedPlaces(origin) {
    if (
      !LDONG_REGN_CODE_PATTERN.test(origin.lDongRegnCd || '') ||
      !LDONG_SIGNGU_CODE_PATTERN.test(origin.lDongSignguCd || '')
    ) {
      return {
        items: [],
        pagination: { pageNo: 1, numOfRows: MAX_RELATED_PLACES, totalCount: 0 },
      };
    }

    const sourceSignguCd =
      `${origin.lDongRegnCd}${origin.lDongSignguCd}`;
    const result = await relatedApi.searchRelatedPlacesByKeyword({
      baseYm,
      areaCd: origin.lDongRegnCd,
      signguCd: sourceSignguCd,
      keyword: origin.title,
      pageNo: 1,
      numOfRows: MAX_RELATED_PLACES,
    });
    const sourceTitle = normalizeMatchTitle(origin.title);
    const relations = result.items
      .filter(relation =>
        normalizeMatchTitle(relation.sourceTitle) === sourceTitle &&
        relation.sourceAreaCd === origin.lDongRegnCd &&
        relation.sourceSignguCd === sourceSignguCd,
      )
      .sort((left, right) => left.rank - right.rank)
      .slice(0, MAX_RELATED_PLACES);

    const mapped = [];
    const seen = new Set([String(origin.contentId)]);
    for (const relation of relations) {
      const place = await resolveCandidate(relation);
      const contentId = String(place?.contentId || '');
      if (!place || seen.has(contentId)) {
        continue;
      }
      seen.add(contentId);
      mapped.push(place);
    }

    return {
      items: mapped,
      pagination: {
        pageNo: 1,
        numOfRows: MAX_RELATED_PLACES,
        totalCount: mapped.length,
      },
    };
  }

  async function getRelatedPlaces({ contentId } = {}) {
    const normalizedContentId = String(contentId || '').trim();
    if (!CONTENT_ID_PATTERN.test(normalizedContentId)) {
      throw new ExternalApiError('contentId 형식이 올바르지 않습니다.', {
        code: 'VALIDATION_ERROR',
        service: 'relatedTour',
        operation: 'relatedPlaces',
      });
    }

    try {
      return await places.getCachedQuery({
        operation: 'relatedPlaces',
        input: { baseYm, contentId: normalizedContentId },
        async fetchUpstream() {
          const origin = unwrapDetail(
            await places.getPlaceDetail({ contentId: normalizedContentId }),
          );
          if (!origin) {
            throw new MissingOriginError();
          }
          return loadMappedPlaces(origin);
        },
      });
    } catch (error) {
      if (error instanceof MissingOriginError) {
        return null;
      }
      throw error;
    }
  }

  return Object.freeze({ getRelatedPlaces });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createRelatedPlacesService();
  }
  return defaultService;
}

module.exports = {
  createRelatedPlacesService,
  getRelatedPlaces: input => getDefaultService().getRelatedPlaces(input),
  isSamePlace,
  normalizeMatchTitle,
};
