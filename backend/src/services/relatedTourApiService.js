'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { getExternalApiConfig } = require('../config/externalApis');
const { ExternalApiError } = require('../utils/externalApiError');
const {
  normalizePagination,
  requirePattern,
  requireStringParams,
} = require('../utils/publicDataValidation');

const AREA_CODE_PATTERN = /^\d{2}$/;
const BASE_YM_PATTERN = /^\d{4}(0[1-9]|1[0-2])$/;
const SIGNGU_CODE_PATTERN = /^\d{5}$/;
const MAX_KEYWORD_LENGTH = 100;

function operationContext(operation) {
  return { service: 'relatedTour', operation };
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function readField(item, ...names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item?.[name] !== null) {
      return item[name];
    }
  }
  return null;
}

function invalidRelatedResponse(operation) {
  return new ExternalApiError(
    '연관 관광지 응답의 장소 식별자·지역·순위가 올바르지 않습니다.',
    {
      code: 'INVALID_RESPONSE',
      service: 'relatedTour',
      operation,
    },
  );
}

function normalizeRelatedCandidate(item, operation) {
  const sourceKey = normalizeText(
    readField(item, 'tAtsCd', 'tatsCd', 'tatscd'),
  );
  const sourceTitle = normalizeText(
    readField(item, 'tAtsNm', 'tatsNm', 'tatsnm'),
  );
  const relatedKey = normalizeText(
    readField(item, 'rlteTatsCd', 'rltetatsCd', 'rltetatscd'),
  );
  const title = normalizeText(
    readField(item, 'rlteTatsNm', 'rltetatsNm', 'rltetatsnm'),
  );
  const sourceAreaCd = normalizeText(
    readField(item, 'areaCd', 'areacd'),
  );
  const sourceSignguCd = normalizeText(
    readField(item, 'signguCd', 'signgucd'),
  );
  const relatedAreaCd = normalizeText(
    readField(item, 'rlteRegnCd', 'rlteregnCd', 'rlteregncd'),
  );
  const relatedSignguCd = normalizeText(
    readField(item, 'rlteSignguCd', 'rltesignguCd', 'rltesigngucd'),
  );
  const rank = Number(readField(item, 'rlteRank', 'rlterank'));

  if (
    !sourceKey ||
    !sourceTitle ||
    !relatedKey ||
    !title ||
    !AREA_CODE_PATTERN.test(sourceAreaCd || '') ||
    !SIGNGU_CODE_PATTERN.test(sourceSignguCd || '') ||
    !sourceSignguCd.startsWith(sourceAreaCd) ||
    !AREA_CODE_PATTERN.test(relatedAreaCd || '') ||
    !SIGNGU_CODE_PATTERN.test(relatedSignguCd || '') ||
    !relatedSignguCd.startsWith(relatedAreaCd) ||
    !Number.isInteger(rank) ||
    rank < 1
  ) {
    throw invalidRelatedResponse(operation);
  }

  return Object.freeze({
    baseYm: normalizeText(readField(item, 'baseYm', 'baseym')),
    sourceKey,
    sourceTitle,
    sourceAreaCd,
    sourceSignguCd,
    relatedKey,
    title,
    relatedAreaCd,
    relatedSignguCd,
    lDongRegnCd: relatedAreaCd,
    lDongSignguCd: relatedSignguCd.slice(2),
    areaName: normalizeText(
      readField(item, 'rlteRegnNm', 'rlteregnNm', 'rlteregnnm'),
    ),
    signguName: normalizeText(
      readField(item, 'rlteSignguNm', 'rltesignguNm', 'rltesigngunm'),
    ),
    categoryLarge: normalizeText(
      readField(item, 'rlteCtgryLclsNm', 'rltectgrylclsnm'),
    ),
    categoryMedium: normalizeText(
      readField(item, 'rlteCtgryMclsNm', 'rltectgrymclsnm'),
    ),
    categorySmall: normalizeText(
      readField(item, 'rlteCtgrySclsNm', 'rltectgrysclsnm'),
    ),
    rank,
  });
}

function normalizeBaseRequest(
  { baseYm, areaCd, signguCd, pageNo, numOfRows },
  operation,
  defaultBaseYm,
) {
  const context = operationContext(operation);
  const normalizedBaseYm = requirePattern(
    baseYm ?? defaultBaseYm,
    'baseYm',
    BASE_YM_PATTERN,
    context,
  );
  const normalizedAreaCd = requirePattern(
    areaCd,
    'areaCd',
    AREA_CODE_PATTERN,
    context,
  );
  const normalizedSignguCd = requirePattern(
    signguCd,
    'signguCd',
    SIGNGU_CODE_PATTERN,
    context,
  );
  if (!normalizedSignguCd.startsWith(normalizedAreaCd)) {
    throw new ExternalApiError(
      'signguCd는 areaCd로 시작하는 5자리 코드여야 합니다.',
      { code: 'VALIDATION_ERROR', ...context },
    );
  }

  return {
    context,
    params: {
      baseYm: normalizedBaseYm,
      areaCd: normalizedAreaCd,
      signguCd: normalizedSignguCd,
    },
    pagination: normalizePagination(pageNo, numOfRows, context, {
      defaultNumOfRows: 5,
      maxNumOfRows: 50,
    }),
  };
}

function createRelatedTourApiService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('relatedTour', options);
  const defaultBaseYm =
    options.baseYm ||
    getExternalApiConfig(options.env).relatedTourBaseYm;

  async function call(operation, input, keyword) {
    const request = normalizeBaseRequest(
      input || {},
      operation,
      defaultBaseYm,
    );
    const params = { ...request.params };
    if (keyword !== undefined) {
      const context = request.context;
      requireStringParams({ keyword }, ['keyword'], context);
      const normalizedKeyword = String(keyword).trim();
      if (normalizedKeyword.length > MAX_KEYWORD_LENGTH) {
        throw new ExternalApiError(
          `keyword는 ${MAX_KEYWORD_LENGTH}자를 초과할 수 없습니다.`,
          { code: 'VALIDATION_ERROR', ...context },
        );
      }
      params.keyword = normalizedKeyword;
    }

    const result = await client.get(operation, {
      params,
      ...request.pagination,
    });
    return {
      ...result,
      items: result.items.map(item =>
        normalizeRelatedCandidate(item, operation),
      ),
    };
  }

  return Object.freeze({
    getAreaBasedRelatedPlaces(input = {}) {
      return call('areaBasedList1', input);
    },
    searchRelatedPlacesByKeyword(input = {}) {
      return call('searchKeyword1', input, input.keyword);
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createRelatedTourApiService();
  }
  return defaultService;
}

module.exports = {
  createRelatedTourApiService,
  getAreaBasedRelatedPlaces: input =>
    getDefaultService().getAreaBasedRelatedPlaces(input),
  normalizeRelatedCandidate,
  searchRelatedPlacesByKeyword: input =>
    getDefaultService().searchRelatedPlacesByKeyword(input),
};
