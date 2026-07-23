const cachedPlacesService = require('../services/cachedPlacesService');
const { ExternalApiError } = require('../utils/externalApiError');

// 연관 관광지 API 연동 전 /places/:id/related 전용 시드 데이터
const ALL_PLACES = [
  { contentId: 'gn001', title: '하슬라아트월드', address: '강릉시 강동면 율곡로 1441', tel: '033-644-9411', openTime: '09:00~18:00', category: '미술·갤러리', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn002', title: '안목해변 커피거리', address: '강릉시 창해로14번길', tel: '', openTime: '상시', category: '커피·카페', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn003', title: '오죽헌', address: '강릉시 율곡로 3139번길 24', tel: '033-660-3301', openTime: '09:00~18:00', category: '문학', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn004', title: '강릉독립예술극장 신영', address: '강릉시 경강로 2072', tel: '033-646-0555', openTime: '상영 시간표 참고', category: '영화', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn005', title: '책방 나다', address: '강릉시 경강로 2121', tel: '', openTime: '12:00~20:00', category: '독립서점', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'jj001', title: '전주 한옥마을', address: '전주시 완산구 기린대로 99', tel: '063-282-1330', openTime: '상시', category: '문화유산', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj002', title: '경암책방', address: '전주시 완산구 최명희길 29', tel: '063-284-3397', openTime: '10:00~19:00', category: '독립서점', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj003', title: '전주 막걸리 골목', address: '전주시 완산구 전라감영5길', tel: '', openTime: '11:00~22:00', category: '전통주', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj004', title: '전주 공예품전시관', address: '전주시 완산구 기린대로 119', tel: '063-231-4565', openTime: '09:00~18:00', category: '공예', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj005', title: '남부시장 청년몰', address: '전주시 완산구 풍남문3길 1', tel: '063-900-5893', openTime: '12:00~21:00', category: '로컬 미식', areaCode: 'jeonju', region: '전주' },
  { contentId: 'ty001', title: '박경리기념관', address: '통영시 산양읍 산양중앙로 173', tel: '055-650-2541', openTime: '09:00~18:00', category: '문학', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty002', title: '통영국제음악당', address: '통영시 도천동 문화마당로 1', tel: '055-650-0800', openTime: '공연 시간표 참고', category: '음악', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty003', title: '청마문학관', address: '통영시 망일1길 82', tel: '055-650-4621', openTime: '09:00~18:00', category: '문학', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty004', title: '통영 중앙시장', address: '통영시 중앙로 51', tel: '', openTime: '06:00~21:00', category: '로컬 미식', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty005', title: '나전칠기 체험관', address: '통영시 광도면 죽림4로', tel: '055-650-0400', openTime: '09:00~17:00', category: '공예', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'cc001', title: '춘천 애니메이션박물관', address: '춘천시 서면 박사로 854', tel: '033-245-6490', openTime: '10:00~18:00', category: '애니메이션', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'cc002', title: '김유정문학촌', address: '춘천시 신동면 김유정로 1430-14', tel: '033-261-4650', openTime: '09:00~18:00', category: '문학', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'cc003', title: '소양강 스카이워크', address: '춘천시 영서로 2663', tel: '033-250-3033', openTime: '09:00~21:00', category: '관광지', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'ph001', title: '포항시립미술관', address: '포항시 북구 환호공원길 10', tel: '054-270-5051', openTime: '10:00~18:00', category: '미술', areaCode: 'pohang', region: '포항' },
  { contentId: 'ph002', title: '구룡포 근대문화역사거리', address: '포항시 남구 구룡포읍 구룡포길', tel: '', openTime: '상시', category: '근대 문화유산', areaCode: 'pohang', region: '포항' },
  { contentId: 'ph003', title: '스페이스워크', address: '포항시 북구 환호동 146', tel: '054-289-1475', openTime: '24시간', category: '미술', areaCode: 'pohang', region: '포항' },
  { contentId: 'sl001', title: '땡스북스 (합정)', address: '마포구 양화로 7안길 61', tel: '02-322-4979', openTime: '12:00~21:00', category: '독립서점', areaCode: 'seoul', region: '서울' },
  { contentId: 'sl002', title: '유어마인드 (홍대)', address: '마포구 성지1길 5-13', tel: '02-323-1441', openTime: '13:00~21:00', category: '독립서점', areaCode: 'seoul', region: '서울' },
  { contentId: 'sl003', title: '을지로 갤러리 구역', address: '중구 을지로 일대', tel: '', openTime: '가게별 상이', category: '미술', areaCode: 'seoul', region: '서울' },
  { contentId: 'ad001', title: '안동소주 전통음식박물관', address: '안동시 수상동 산 36-1', tel: '054-858-4541', openTime: '09:00~18:00', category: '전통주', areaCode: 'andong', region: '안동' },
  { contentId: 'ad002', title: '하회마을', address: '안동시 풍천면 하회종가길 40', tel: '054-853-0109', openTime: '09:00~18:00', category: '문화유산', areaCode: 'andong', region: '안동' },
  { contentId: 'hd001', title: '최참판댁', address: '하동군 악양면 평사리길 66-7', tel: '055-884-2154', openTime: '09:00~18:00', category: '문학', areaCode: 'hadong', region: '하동' },
  { contentId: 'hd002', title: '하동 화개장터', address: '하동군 화개면 쌍계로 15', tel: '', openTime: '상시', category: '로컬 미식', areaCode: 'hadong', region: '하동' },
  { contentId: 'gs001', title: '근대역사박물관', address: '군산시 해망로 240', tel: '063-454-7870', openTime: '09:00~18:00', category: '근대 문화유산', areaCode: 'gunsan', region: '군산' },
  { contentId: 'gs002', title: '신흥동 일본식 가옥', address: '군산시 구영1길 17', tel: '063-454-3274', openTime: '09:00~18:00', category: '근대 문화유산', areaCode: 'gunsan', region: '군산' },
  { contentId: 'mp001', title: '목포 근대역사문화공간', address: '목포시 중앙로1가 일대', tel: '', openTime: '상시', category: '근대 문화유산', areaCode: 'mokpo', region: '목포' },
  { contentId: 'mp002', title: '국립해양문화재연구소', address: '목포시 남농로 136', tel: '061-270-2000', openTime: '09:00~18:00', category: '문화유산', areaCode: 'mokpo', region: '목포' },
];

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

  return Object.freeze({ getPlaceDetail, searchPlaces });
}

const defaultController = createPlacesController();
const { getPlaceDetail, searchPlaces } = defaultController;

// GET /places/:id/related
async function getRelatedPlaces(req, res) {
  const place = ALL_PLACES.find(p => p.contentId === req.params.id);
  if (!place) return res.status(404).json({ message: '장소를 찾을 수 없습니다.' });

  const related = ALL_PLACES
    .filter(p => p.contentId !== place.contentId &&
      (p.areaCode === place.areaCode || p.category === place.category))
    .slice(0, 5);

  return res.json(related);
}

module.exports = {
  createPlacesController,
  getPlaceDetail,
  getRelatedPlaces,
  publicError,
  setCacheStatusHeader,
  searchPlaces,
  toPublicPlace,
};
