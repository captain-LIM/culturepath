'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { ExternalApiError } = require('../utils/externalApiError');
const { normalizeTourPlace } = require('../utils/normalizeTourPlace');
const {
  normalizeTourPlaceDetail,
} = require('../utils/normalizeTourPlaceDetail');
const { MAX_PLACE_DETAIL_IMAGES } = require('../config/placeMedia');
const {
  normalizePagination,
  requireOneOf,
  requirePattern,
  requireStringParams,
} = require('../utils/publicDataValidation');

const TOUR_CONTEXT = Object.freeze({ service: 'tour' });
const CODE_PATTERN = /^\d+$/;
const CONTENT_ID_PATTERN = /^\d+$/;
const LDONG_REGN_CODE_PATTERN = /^\d{2}$/;
const LDONG_SIGNGU_CODE_PATTERN = /^\d{3}$/;
const CLASSIFICATION_PATTERNS = Object.freeze({
  lclsSystm1: /^[A-Z]{2}$/,
  lclsSystm2: /^[A-Z]{2}\d{2}$/,
  lclsSystm3: /^[A-Z]{2}\d{6}$/,
});
const SORT_OPTIONS = Object.freeze(['A', 'C', 'D']);
const LOCATION_SORT_OPTIONS = Object.freeze(['A', 'C', 'D', 'E']);

function operationContext(operation) {
  return { ...TOUR_CONTEXT, operation };
}

function normalizeOptionalCode(value, name, context, pattern = CODE_PATTERN) {
  return requirePattern(value, name, pattern, context, { optional: true });
}

function requireNumberInRange(value, name, context, min, max) {
  const numeric = Number(value);
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === '' ||
    !Number.isFinite(numeric) ||
    numeric < min ||
    numeric > max
  ) {
    throw new ExternalApiError(`${name} 형식이 올바르지 않습니다.`, {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }
  return numeric;
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

function normalizeLegalDistrictItem(item, operation, parentRegionCode) {
  const genericCode = String(item?.code || '').trim();
  const genericName = String(item?.name || '').trim();
  const lDongRegnCd = String(
    item?.lDongRegnCd ??
      item?.ldongregncd ??
      (parentRegionCode ? parentRegionCode : genericCode),
  ).trim();
  const lDongRegnNm = String(
    item?.lDongRegnNm ?? item?.ldongregnnm ?? (parentRegionCode ? '' : genericName),
  ).trim();
  const lDongSignguCd = String(
    item?.lDongSignguCd ??
      item?.ldongsigngucd ??
      (parentRegionCode ? genericCode : ''),
  ).trim();
  const lDongSignguNm = String(
    item?.lDongSignguNm ??
      item?.ldongsigngunm ??
      (parentRegionCode ? genericName : ''),
  ).trim();

  if (
    !LDONG_REGN_CODE_PATTERN.test(lDongRegnCd) ||
    (parentRegionCode &&
      (!LDONG_SIGNGU_CODE_PATTERN.test(lDongSignguCd) || !lDongSignguNm)) ||
    (!parentRegionCode && !lDongRegnNm)
  ) {
    throw new ExternalApiError('TourAPI 법정동 코드 응답이 올바르지 않습니다.', {
      code: 'INVALID_RESPONSE',
      service: 'tour',
      operation,
    });
  }

  const rnum = Number(item?.rnum);
  return Object.freeze({
    lDongRegnCd,
    lDongRegnNm: lDongRegnNm || null,
    lDongSignguCd: lDongSignguCd || null,
    lDongSignguNm: lDongSignguNm || null,
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

function normalizeAreaBasedPlaceOptions({
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
  return Object.freeze({
    ...normalizeLegalDistrictParams(
      { lDongRegnCd, lDongSignguCd },
      context,
      { requireRegion: true },
    ),
    contentTypeId: normalizeOptionalCode(
      contentTypeId,
      'contentTypeId',
      context,
    ),
    ...normalizeClassificationParams(
      { lclsSystm1, lclsSystm2, lclsSystm3 },
      context,
    ),
    arrange: requireOneOf(arrange, 'arrange', SORT_OPTIONS, context),
    ...normalizePagination(pageNo, numOfRows, context),
  });
}

function normalizeKeywordPlaceOptions({
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

  return Object.freeze({
    keyword: normalizedKeyword,
    ...normalizeLegalDistrictParams(
      { lDongRegnCd, lDongSignguCd },
      context,
    ),
    contentTypeId: normalizeOptionalCode(
      contentTypeId,
      'contentTypeId',
      context,
    ),
    ...normalizeClassificationParams(
      { lclsSystm1, lclsSystm2, lclsSystm3 },
      context,
    ),
    arrange: requireOneOf(arrange, 'arrange', SORT_OPTIONS, context),
    ...normalizePagination(pageNo, numOfRows, context),
  });
}

function normalizeLocationPlaceOptions({
  latitude,
  longitude,
  radius,
  contentTypeId,
  lclsSystm1,
  lclsSystm2,
  lclsSystm3,
  arrange = 'E',
  pageNo,
  numOfRows,
} = {}) {
  const context = operationContext('locationBasedList2');
  const mapY = requireNumberInRange(latitude, 'latitude', context, -90, 90);
  const mapX = requireNumberInRange(longitude, 'longitude', context, -180, 180);
  const normalizedRadius = requireNumberInRange(radius, 'radius', context, 1, 20000);

  return Object.freeze({
    mapX: String(mapX),
    mapY: String(mapY),
    radius: String(Math.round(normalizedRadius)),
    contentTypeId: normalizeOptionalCode(
      contentTypeId,
      'contentTypeId',
      context,
    ),
    ...normalizeClassificationParams(
      { lclsSystm1, lclsSystm2, lclsSystm3 },
      context,
    ),
    arrange: requireOneOf(arrange, 'arrange', LOCATION_SORT_OPTIONS, context),
    ...normalizePagination(pageNo, numOfRows, context),
  });
}

function createTourApiService(options = {}) {
  const client =
    options.client ||
    createConfiguredPublicDataClient(options.serviceName || 'tour', options);
  const normalizePlace = options.normalizePlace || normalizeTourPlace;
  const normalizePlaceDetail =
    options.normalizePlaceDetail || normalizeTourPlaceDetail;
  const cultureOptions = options.cultureOptions || {};

  function normalizeContentId(contentId, context) {
    return requirePattern(
      contentId,
      'contentId',
      CONTENT_ID_PATTERN,
      context,
    );
  }

  async function getLegalDistrictCodes({
    lDongRegnCd,
    pageNo,
    numOfRows,
  } = {}) {
    const context = operationContext('ldongCode2');
    const pagination = normalizePagination(pageNo, numOfRows, context);
    const normalizedRegionCode = requirePattern(
      lDongRegnCd,
      'lDongRegnCd',
      LDONG_REGN_CODE_PATTERN,
      context,
      { optional: true },
    );
    const result = await client.get(context.operation, {
      params: {
        lDongRegnCd: normalizedRegionCode,
        lDongListYn: 'N',
      },
      ...pagination,
    });

    return {
      ...result,
      items: result.items.map(item =>
        normalizeLegalDistrictItem(
          item,
          context.operation,
          normalizedRegionCode,
        ),
      ),
    };
  }

  function getCommonDetail({ contentId } = {}) {
    const context = operationContext('detailCommon2');
    const normalizedContentId = normalizeContentId(contentId, context);
    return client.get(context.operation, {
      params: { contentId: normalizedContentId },
      pageNo: 1,
      numOfRows: 1,
    });
  }

  function getIntroDetail({ contentId, contentTypeId } = {}) {
    const context = operationContext('detailIntro2');
    const normalizedContentId = normalizeContentId(contentId, context);
    const normalizedContentTypeId = requirePattern(
      contentTypeId,
      'contentTypeId',
      CODE_PATTERN,
      context,
    );
    return client.get(context.operation, {
      params: {
        contentId: normalizedContentId,
        contentTypeId: normalizedContentTypeId,
      },
      pageNo: 1,
      numOfRows: 1,
    });
  }

  function getInfoDetail({
    contentId,
    contentTypeId,
    pageNo,
    numOfRows,
  } = {}) {
    const context = operationContext('detailInfo2');
    const pagination = normalizePagination(pageNo, numOfRows, context);
    const normalizedContentId = normalizeContentId(contentId, context);
    const normalizedContentTypeId = requirePattern(
      contentTypeId,
      'contentTypeId',
      CODE_PATTERN,
      context,
    );
    return client.get(context.operation, {
      params: {
        contentId: normalizedContentId,
        contentTypeId: normalizedContentTypeId,
      },
      ...pagination,
    });
  }

  function getDetailImages({
    contentId,
    imageYN = 'Y',
    pageNo,
    numOfRows,
  } = {}) {
    const context = operationContext('detailImage2');
    const pagination = normalizePagination(pageNo, numOfRows, context);
    const normalizedContentId = normalizeContentId(contentId, context);
    return client.get(context.operation, {
      params: {
        contentId: normalizedContentId,
        imageYN: requireOneOf(imageYN, 'imageYN', ['Y', 'N'], context),
      },
      ...pagination,
    });
  }

  async function getPlaceDetail({
    contentId,
    includeInfo = false,
    imageRows = MAX_PLACE_DETAIL_IMAGES,
  } = {}) {
    const context = operationContext('detailCommon2');
    const requestedContentId = normalizeContentId(contentId, context);
    const commonResult = await getCommonDetail({ contentId: requestedContentId });
    const commonItem = commonResult.items[0];
    if (!commonItem) {
      return null;
    }

    const responseContentId = String(
      commonItem.contentid ?? commonItem.contentId ?? '',
    ).trim();
    const contentTypeId = String(
      commonItem.contenttypeid ?? commonItem.contentTypeId ?? '',
    ).trim();
    if (
      !CONTENT_ID_PATTERN.test(responseContentId) ||
      responseContentId !== requestedContentId ||
      !CODE_PATTERN.test(contentTypeId)
    ) {
      throw new ExternalApiError(
        'TourAPI 공통 상세 응답의 식별자가 올바르지 않습니다.',
        { code: 'INVALID_RESPONSE', ...context },
      );
    }

    const introPromise = getIntroDetail({
      contentId: responseContentId,
      contentTypeId,
    });
    const normalizedImageRows = normalizePagination(
      1,
      Math.min(Number(imageRows), MAX_PLACE_DETAIL_IMAGES),
      context,
      { maxNumOfRows: MAX_PLACE_DETAIL_IMAGES },
    ).numOfRows;
    const imagePromise = getDetailImages({
      contentId: responseContentId,
      numOfRows: normalizedImageRows,
    });
    const infoPromise = includeInfo
      ? getInfoDetail({ contentId: responseContentId, contentTypeId })
      : Promise.resolve({ items: [] });
    const [introResult, imageResult, infoResult] = await Promise.all([
      introPromise,
      imagePromise,
      infoPromise,
    ]);

    return normalizePlaceDetail(
      {
        commonItem,
        introItem: introResult.items[0] || null,
        imageItems: imageResult.items,
        infoItems: infoResult.items,
      },
      { ...cultureOptions, operation: 'detailCommon2' },
    );
  }

  return Object.freeze({
    getCommonDetail,
    getDetailImages,
    getInfoDetail,
    getIntroDetail,
    getLegalDistrictCodes,
    getPlaceDetail,
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

    async getAreaBasedPlaces(input = {}) {
      const context = operationContext('areaBasedList2');
      const normalized = normalizeAreaBasedPlaceOptions(input);
      const { pageNo, numOfRows, ...params } = normalized;
      const result = await client.get(context.operation, {
        params,
        pageNo,
        numOfRows,
      });
      return mapPlaceResult(
        result,
        context.operation,
        normalizePlace,
        cultureOptions,
      );
    },

    async searchPlacesByKeyword(input = {}) {
      const context = operationContext('searchKeyword2');
      const normalized = normalizeKeywordPlaceOptions(input);
      const { pageNo, numOfRows, ...params } = normalized;
      const result = await client.get(context.operation, {
        params,
        pageNo,
        numOfRows,
      });
      return mapPlaceResult(
        result,
        context.operation,
        normalizePlace,
        cultureOptions,
      );
    },

    async searchPlacesByLocation(input = {}) {
      const context = operationContext('locationBasedList2');
      const normalized = normalizeLocationPlaceOptions(input);
      const { pageNo, numOfRows, ...params } = normalized;
      const result = await client.get(context.operation, {
        params,
        pageNo,
        numOfRows,
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

// 국문(KorService2) 외 언어별 TourAPI 서비스. 국문과 별개의 contentId 공간을
// 쓰기 때문에 키워드+좌표로 매칭해야 하며(cachedPlacesService 참고), 각 서비스는
// externalApis.js에 등록된 이름(tourEng/tourJpn)의 baseUrl·인증키를 그대로 쓴다.
const TRANSLATION_SERVICE_NAMES = Object.freeze({
  en: 'tourEng',
  ja: 'tourJpn',
});

const translationServices = {};

function getTranslationService(lang) {
  const serviceName = TRANSLATION_SERVICE_NAMES[lang];
  if (!serviceName) {
    throw new Error(`지원하지 않는 번역 언어입니다: ${lang}`);
  }
  if (!translationServices[lang]) {
    translationServices[lang] = createTourApiService({ serviceName });
  }
  return translationServices[lang];
}

function getPlaceDetailTranslated(lang, options) {
  return getTranslationService(lang).getPlaceDetail(options);
}

function searchPlacesByKeywordTranslated(lang, options) {
  return getTranslationService(lang).searchPlacesByKeyword(options);
}

function searchPlacesByLocationTranslated(lang, options) {
  return getTranslationService(lang).searchPlacesByLocation(options);
}

function getAreaCodes(options) {
  return getDefaultService().getAreaCodes(options);
}

function getClassificationCodes(options) {
  return getDefaultService().getClassificationCodes(options);
}

function getLegalDistrictCodes(options) {
  return getDefaultService().getLegalDistrictCodes(options);
}

function getCommonDetail(options) {
  return getDefaultService().getCommonDetail(options);
}

function getIntroDetail(options) {
  return getDefaultService().getIntroDetail(options);
}

function getInfoDetail(options) {
  return getDefaultService().getInfoDetail(options);
}

function getDetailImages(options) {
  return getDefaultService().getDetailImages(options);
}

function getPlaceDetail(options) {
  return getDefaultService().getPlaceDetail(options);
}

function getAreaBasedPlaces(options) {
  return getDefaultService().getAreaBasedPlaces(options);
}

function searchPlacesByKeyword(options) {
  return getDefaultService().searchPlacesByKeyword(options);
}

function searchPlacesByLocation(options) {
  return getDefaultService().searchPlacesByLocation(options);
}

module.exports = {
  createTourApiService,
  getCommonDetail,
  getDetailImages,
  getInfoDetail,
  getIntroDetail,
  getLegalDistrictCodes,
  getPlaceDetail,
  getPlaceDetailTranslated,
  getAreaBasedPlaces,
  getAreaCodes,
  getClassificationCodes,
  normalizeAreaBasedPlaceOptions,
  normalizeKeywordPlaceOptions,
  normalizeLocationPlaceOptions,
  searchPlacesByKeyword,
  searchPlacesByKeywordTranslated,
  searchPlacesByLocation,
  searchPlacesByLocationTranslated,
};
