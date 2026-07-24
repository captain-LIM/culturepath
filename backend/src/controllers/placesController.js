const cachedPlacesService = require('../services/cachedPlacesService');
const relatedPlacesService = require('../services/relatedPlacesService');
const { ExternalApiError } = require('../utils/externalApiError');

function toPublicPlace(place) {
  return {
    ...place,
    address: place.address || '',
    tel: place.tel || '',
    openTime: place.openTime || '',
    category: place.category || '기타',
    region: place.regionName || null,
  };
}

function setPaginationHeaders(res, pagination, returnedCount) {
  const values = {
    'X-Page-No': pagination?.pageNo ?? 1,
    'X-Num-Of-Rows': pagination?.numOfRows ?? returnedCount,
    'X-Total-Count': pagination?.totalCount ?? returnedCount,
  };

  if (typeof res.set === 'function') {
    res.set(values);
    return;
  }
  for (const [name, value] of Object.entries(values)) {
    res.setHeader?.(name, String(value));
  }
}

function setCacheStatusHeader(res, cacheStatus) {
  if (!cacheStatus) {
    return;
  }
  if (typeof res.set === 'function') {
    res.set({ 'X-Cache-Status': cacheStatus });
    return;
  }
  res.setHeader?.('X-Cache-Status', cacheStatus);
}

function publicError(error) {
  if (!(error instanceof ExternalApiError)) {
    return {
      status: 500,
      body: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다.',
        retryable: false,
      },
    };
  }

  if (error.code === 'VALIDATION_ERROR') {
    return {
      status: 400,
      body: { code: error.code, message: error.message, retryable: false },
    };
  }
  if (error.code === 'CONFIG_ERROR') {
    return {
      status: 503,
      body: {
        code: 'TOUR_API_UNAVAILABLE',
        message: '관광정보 서비스를 사용할 수 없습니다.',
        retryable: false,
      },
    };
  }
  if (error.code === 'TIMEOUT') {
    return {
      status: 504,
      body: {
        code: 'EXTERNAL_API_TIMEOUT',
        message: '관광정보 응답 시간이 초과되었습니다.',
        retryable: true,
      },
    };
  }

  return {
    status: 502,
    body: {
      code: 'EXTERNAL_API_ERROR',
      message: '관광정보를 불러오지 못했습니다.',
      retryable: error.retryable === true,
    },
  };
}

function createPlacesController(options = {}) {
  const service =
    options.placesService ||
    options.tourApiService ||
    cachedPlacesService;
  const relatedService =
    options.relatedPlacesService ||
    relatedPlacesService;
  const logger = options.logger || console;

  async function searchPlaces(req, res) {
    try {
      const query = String(req.query?.q || '').trim();
      const culture = String(req.query?.culture || '').trim();
      const lDongRegnCd = req.query?.lDongRegnCd;
      const lDongSignguCd = req.query?.lDongSignguCd;
      if (!query && !lDongRegnCd) {
        throw new ExternalApiError('q 또는 lDongRegnCd가 필요합니다.', {
          code: 'VALIDATION_ERROR',
          service: 'tour',
          operation: 'placesSearch',
        });
      }
      if (query && query.length < 2) {
        throw new ExternalApiError('q는 2자 이상이어야 합니다.', {
          code: 'VALIDATION_ERROR',
          service: 'tour',
          operation: 'placesSearch',
        });
      }

      const request = {
        lDongRegnCd,
        lDongSignguCd,
        contentTypeId: req.query?.contentTypeId,
        arrange: req.query?.arrange,
        pageNo: req.query?.pageNo,
        numOfRows: req.query?.numOfRows,
      };
      const result = query
        ? await service.searchPlacesByKeyword({ ...request, keyword: query })
        : await service.getAreaBasedPlaces(request);
      const filteredItems = culture
        ? result.items.filter(place => place.cultures.includes(culture))
        : result.items;
      const pagination = culture
        ? { ...result.pagination, totalCount: filteredItems.length }
        : result.pagination;

      setCacheStatusHeader(res, result.cacheStatus);
      setPaginationHeaders(res, pagination, filteredItems.length);
      return res.json(filteredItems.map(toPublicPlace));
    } catch (error) {
      const response = publicError(error);
      if (response.status === 500) {
        logger?.error?.('장소 검색 처리에 실패했습니다.', {
          errorName: error?.name || 'Error',
        });
      }
      return res.status(response.status).json(response.body);
    }
  }

  async function getPlaceDetail(req, res) {
    try {
      const result = await service.getPlaceDetail({ contentId: req.params?.id });
      const wrapped =
        result &&
        Object.prototype.hasOwnProperty.call(result, 'item') &&
        Object.prototype.hasOwnProperty.call(result, 'cacheStatus');
      const place = wrapped ? result.item : result;
      setCacheStatusHeader(res, wrapped ? result.cacheStatus : null);
      if (!place) {
        return res.status(404).json({
          code: 'PLACE_NOT_FOUND',
          message: '장소를 찾을 수 없습니다.',
          retryable: false,
        });
      }
      return res.json(toPublicPlace(place));
    } catch (error) {
      const response = publicError(error);
      if (response.status === 500) {
        logger?.error?.('장소 상세 처리에 실패했습니다.', {
          errorName: error?.name || 'Error',
        });
      }
      return res.status(response.status).json(response.body);
    }
  }

  async function getRelatedPlaces(req, res) {
    try {
      const result = await relatedService.getRelatedPlaces({
        contentId: req.params?.id,
      });
      if (!result) {
        return res.status(404).json({
          code: 'PLACE_NOT_FOUND',
          message: '장소를 찾을 수 없습니다.',
          retryable: false,
        });
      }
      setCacheStatusHeader(res, result.cacheStatus);
      return res.json(result.items.map(toPublicPlace));
    } catch (error) {
      const response = publicError(error);
      if (response.status === 500) {
        logger?.error?.('연관 장소 처리에 실패했습니다.', {
          errorName: error?.name || 'Error',
        });
      }
      return res.status(response.status).json(response.body);
    }
  }

  return Object.freeze({ getPlaceDetail, getRelatedPlaces, searchPlaces });
}

const defaultController = createPlacesController();
const { getPlaceDetail, getRelatedPlaces, searchPlaces } = defaultController;

module.exports = {
  createPlacesController,
  getPlaceDetail,
  getRelatedPlaces,
  publicError,
  setCacheStatusHeader,
  searchPlaces,
  toPublicPlace,
};
