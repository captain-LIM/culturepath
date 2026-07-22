'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { ExternalApiError } = require('../utils/externalApiError');
const { normalizeTourPlace } = require('../utils/normalizeTourPlace');
const {
  normalizePagination,
  requireOneOf,
  requirePattern,
  requireStringParams,
} = require('../utils/publicDataValidation');

const TOUR_CONTEXT = Object.freeze({ service: 'tour' });
const CODE_PATTERN = /^\d+$/;
const LDONG_REGN_CODE_PATTERN = /^\d{2}$/;
const LDONG_SIGNGU_CODE_PATTERN = /^\d{3}$/;
const CLASSIFICATION_PATTERNS = Object.freeze({
  lclsSystm1: /^[A-Z]{2}$/,
  lclsSystm2: /^[A-Z]{2}\d{2}$/,
  lclsSystm3: /^[A-Z]{2}\d{6}$/,
});
const SORT_OPTIONS = Object.freeze(['A', 'C', 'D']);

function operationContext(operation) {
  return { ...TOUR_CONTEXT, operation };
}

function normalizeOptionalCode(value, name, context, pattern = CODE_PATTERN) {
  return requirePattern(value, name, pattern, context, { optional: true });
}

function normalizeClassificationParams(values, context) {
  const normalized = {};
  for (const name of ['lclsSystm1', 'lclsSystm2', 'lclsSystm3']) {
    const value = values?.[name];
    const uppercaseValue =
      value === undefined || value === null ? value : String(value).trim().toUpperCase();
    normalized[name] = normalizeOptionalCode(
      uppercaseValue,
      name,
      context,
      CLASSIFICATION_PATTERNS[name],
    );
  }

  if (normalized.lclsSystm2 && !normalized.lclsSystm1) {
    throw new ExternalApiError('lclsSystm2를 사용할 때는 lclsSystm1이 필요합니다.', {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }
  if (normalized.lclsSystm3 && !normalized.lclsSystm2) {
    throw new ExternalApiError(
      'lclsSystm3를 사용할 때는 lclsSystm1과 lclsSystm2가 필요합니다.',
      { code: 'VALIDATION_ERROR', ...context },
    );
  }
  if (
    normalized.lclsSystm2 &&
    !normalized.lclsSystm2.startsWith(normalized.lclsSystm1)
  ) {
    throw new ExternalApiError('lclsSystm2가 lclsSystm1 계층과 일치하지 않습니다.', {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }
  if (
    normalized.lclsSystm3 &&
    !normalized.lclsSystm3.startsWith(normalized.lclsSystm2)
  ) {
    throw new ExternalApiError('lclsSystm3가 lclsSystm2 계층과 일치하지 않습니다.', {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }

  return normalized;
}

function normalizeLegalDistrictParams(values, context, options = {}) {
  const lDongRegnCd = requirePattern(
    values?.lDongRegnCd,
    'lDongRegnCd',
    LDONG_REGN_CODE_PATTERN,
    context,
    { optional: options.requireRegion !== true },
  );
  const lDongSignguCd = requirePattern(
    values?.lDongSignguCd,
    'lDongSignguCd',
    LDONG_SIGNGU_CODE_PATTERN,
    context,
    { optional: true },
  );

  if (lDongSignguCd && !lDongRegnCd) {
    throw new ExternalApiError(
      'lDongSignguCd를 사용할 때는 lDongRegnCd가 필요합니다.',
      { code: 'VALIDATION_ERROR', ...context },
    );
  }

  return { lDongRegnCd, lDongSignguCd };
}

function normalizeClassificationItem(item, operation) {
  const code = String(item?.code || '').trim();
  const name = String(item?.name || '').trim();
  if (!code || !name) {
    throw new ExternalApiError('TourAPI 신분류 코드 응답이 올바르지 않습니다.', {
      code: 'INVALID_RESPONSE',
      service: 'tour',
      operation,
    });
  }

  const rnum = Number(item.rnum);
  return Object.freeze({
    code,
    name,
    rnum: Number.isFinite(rnum) ? rnum : null,
  });
}

function mapPlaceResult(result, operation, normalizePlace, cultureOptions) {
  return {
    ...result,
    items: result.items.map(item =>
      normalizePlace(item, { ...cultureOptions, operation }),
    ),
  };
}

function createTourApiService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('tour', options);
  const normalizePlace = options.normalizePlace || normalizeTourPlace;
  const cultureOptions = options.cultureOptions || {};

  return Object.freeze({
    getAreaCodes({ areaCode, pageNo, numOfRows } = {}) {
      const context = operationContext('areaCode2');
      const pagination = normalizePagination(pageNo, numOfRows, context);
      const normalizedAreaCode = normalizeOptionalCode(
        areaCode,
        'areaCode',
        context,
      );

      return client.get(context.operation, {
        params: { areaCode: normalizedAreaCode },
        ...pagination,
      });
    },

    async getClassificationCodes({
      lclsSystm1,
      lclsSystm2,
      lclsSystm3,
      pageNo,
      numOfRows,
    } = {}) {
      const context = operationContext('lclsSystmCode2');
      const pagination = normalizePagination(pageNo, numOfRows, context);
      const classificationParams = normalizeClassificationParams(
        { lclsSystm1, lclsSystm2, lclsSystm3 },
        context,
      );
      const result = await client.get(context.operation, {
        params: classificationParams,
        ...pagination,
      });

      return {
        ...result,
        items: result.items.map(item =>
          normalizeClassificationItem(item, context.operation),
        ),
      };
    },

    async getAreaBasedPlaces({
      lDongRegnCd,
      lDongSignguCd,
      contentTypeId,
      lclsSystm1,
      lclsSystm2,
      lclsSystm3,
      arrange = 'A',
      pageNo,
      numOfRows,
    } = {}) {
      const context = operationContext('areaBasedList2');
      const pagination = normalizePagination(pageNo, numOfRows, context);
      const legalDistrictParams = normalizeLegalDistrictParams(
        { lDongRegnCd, lDongSignguCd },
        context,
        { requireRegion: true },
      );
      const classificationParams = normalizeClassificationParams(
        { lclsSystm1, lclsSystm2, lclsSystm3 },
        context,
      );
      const params = {
        ...legalDistrictParams,
        contentTypeId: normalizeOptionalCode(
          contentTypeId,
          'contentTypeId',
          context,
        ),
        ...classificationParams,
        arrange: requireOneOf(arrange, 'arrange', SORT_OPTIONS, context),
      };
      const result = await client.get(context.operation, {
        params,
        ...pagination,
      });
      return mapPlaceResult(
        result,
        context.operation,
        normalizePlace,
        cultureOptions,
      );
    },

    async searchPlacesByKeyword({
      keyword,
      lDongRegnCd,
      lDongSignguCd,
      contentTypeId,
      lclsSystm1,
      lclsSystm2,
      lclsSystm3,
      arrange = 'A',
      pageNo,
      numOfRows,
    } = {}) {
      const context = operationContext('searchKeyword2');
      requireStringParams({ keyword }, ['keyword'], context);
      const normalizedKeyword = String(keyword).trim();
      if (normalizedKeyword.length > 100) {
        throw new ExternalApiError('keyword는 100자를 초과할 수 없습니다.', {
          code: 'VALIDATION_ERROR',
          ...context,
        });
      }

      const pagination = normalizePagination(pageNo, numOfRows, context);
      const legalDistrictParams = normalizeLegalDistrictParams(
        { lDongRegnCd, lDongSignguCd },
        context,
      );
      const classificationParams = normalizeClassificationParams(
        { lclsSystm1, lclsSystm2, lclsSystm3 },
        context,
      );
      const result = await client.get(context.operation, {
        params: {
          keyword: normalizedKeyword,
          ...legalDistrictParams,
          contentTypeId: normalizeOptionalCode(
            contentTypeId,
            'contentTypeId',
            context,
          ),
          ...classificationParams,
          arrange: requireOneOf(arrange, 'arrange', SORT_OPTIONS, context),
        },
        ...pagination,
      });
      return mapPlaceResult(
        result,
        context.operation,
        normalizePlace,
        cultureOptions,
      );
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createTourApiService();
  }
  return defaultService;
}

function getAreaCodes(options) {
  return getDefaultService().getAreaCodes(options);
}

function getClassificationCodes(options) {
  return getDefaultService().getClassificationCodes(options);
}

function getAreaBasedPlaces(options) {
  return getDefaultService().getAreaBasedPlaces(options);
}

function searchPlacesByKeyword(options) {
  return getDefaultService().searchPlacesByKeyword(options);
}

module.exports = {
  createTourApiService,
  getAreaBasedPlaces,
  getAreaCodes,
  getClassificationCodes,
  searchPlacesByKeyword,
};
