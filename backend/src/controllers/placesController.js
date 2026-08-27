const cachedPlacesService = require('../services/cachedPlacesService');
const relatedPlacesService = require('../services/relatedPlacesService');
const { ExternalApiError } = require('../utils/externalApiError');
const {
  CULTURE_CANDIDATE_FETCH_ROWS,
  CULTURE_SEARCH_KEYWORDS,
  MAX_CULTURE_RESULTS,
} = require('../config/cultureCategoryMap');
const {
  combineCultureCacheStatus,
  isSupportedCulture,
  selectPlacesForCulture,
} = require('../services/culturePlaceSelection');
const { publicPlaceError } = require('../utils/publicPlaceError');
const { MAX_PLACE_DETAIL_IMAGES } = require('../config/placeMedia');
const { resolveLang } = require('../utils/resolveLang');

function toPublicPlace(place) {
  const result = {
    ...place,
    address: place.address || '',
    tel: place.tel || '',
    openTime: place.openTime || '',
    category: place.category || '기타',
    region: place.regionName || null,
  };
  if (Array.isArray(result.images)) {
    result.images = result.images.slice(0, MAX_PLACE_DETAIL_IMAGES);
  }
  return result;
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

const publicError = publicPlaceError;

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
      if (culture && !isSupportedCulture(culture)) {
        throw new ExternalApiError('지원하지 않는 문화 카테고리입니다.', {
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

      // q 없이 culture만 지정된 요청은 지역 목록을 사후 필터링만 하면
      // 모수가 너무 작다. TourAPI에 culture 대표 키워드들로 직접 검색한
      // 결과를 합쳐서 실제로 존재하는 장소를 더 찾아낸다. 대표 키워드 하나만
      // 쓰면 그 단어가 제목에 없는 장소가 통째로 빠지므로 문화별로 여러
      // 키워드를 병렬 검색한다.
      const cultureKeywords = culture && !query ? CULTURE_SEARCH_KEYWORDS[culture] || [] : [];
      const placeGroups = [result.items];
      let cacheStatus = result.cacheStatus;
      if (cultureKeywords.length) {
        const keywordResults = await Promise.all(
          cultureKeywords.map(keyword =>
            service.searchPlacesByKeyword({
              ...request,
              keyword,
              numOfRows: CULTURE_CANDIDATE_FETCH_ROWS,
            }),
          ),
        );
        for (const keywordResult of keywordResults) {
          placeGroups.push(keywordResult.items);
          cacheStatus = combineCultureCacheStatus(
            cacheStatus,
            keywordResult.cacheStatus,
          );
        }
      }

      const requestedCultureLimit = Number(
        result.pagination?.numOfRows || request.numOfRows,
      );
      const cultureLimit = Number.isInteger(requestedCultureLimit) &&
        requestedCultureLimit > 0
        ? Math.min(requestedCultureLimit, MAX_CULTURE_RESULTS)
        : MAX_CULTURE_RESULTS;
      const filteredItems = culture
        ? selectPlacesForCulture(placeGroups, culture, {
            limit: cultureLimit,
          })
        : result.items;
      const pagination = culture
        ? {
            ...result.pagination,
            numOfRows: cultureLimit,
            totalCount: filteredItems.length,
          }
        : result.pagination;

      setCacheStatusHeader(res, cacheStatus);
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
      const result = await service.getPlaceDetail({
        contentId: req.params?.id,
        lang: resolveLang(req),
      });
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
