const regionScoreService = require('../services/regionScoreService');
const cachedPlacesService = require('../services/cachedPlacesService');
const coursePlaceUsageRepository = require('../repositories/coursePlaceUsageRepository');
const { getRegionDefinition } = require('../config/regionCatalog');
const {
  CULTURE_SEARCH_KEYWORDS,
  DEFAULT_CULTURE_RESULTS,
  MAX_CULTURE_PAGE,
  MAX_CULTURE_RESULTS,
} = require('../config/cultureCategoryMap');
const {
  CULTURE_RESULT_FLOOR,
  collectAreaPlacePage,
  combineCultureCacheStatus,
  isSupportedCulture,
  selectPlacesForCulture,
} = require('../services/culturePlaceSelection');
const { publicPlaceError } = require('../utils/publicPlaceError');
const { resolveLang } = require('../utils/resolveLang');
const { normalizePagination } = require('../utils/publicDataValidation');

const CULTURE_ID_TO_NAME = Object.freeze({
  1: '독립서점·책방',
  2: '문학',
  3: '음악',
  4: '전통주·양조장',
  5: '로컬 미식',
  6: '공예·공방',
  7: '근대 문화유산',
  8: '미술·갤러리',
  9: '영화·애니메이션',
  10: '커피·카페',
});

const SPOT_MAP = {
  gangneung: [
    { contentId: 'gn001', title: '하슬라아트월드', address: '강릉시 강동면 율곡로 1441', tel: '033-644-9411', openTime: '09:00~18:00', category: '미술·갤러리', latitude: 37.7064767, longitude: 129.0102036 },
    { contentId: 'gn002', title: '안목해변 커피거리', address: '강릉시 창해로14번길', tel: '', openTime: '상시', category: '커피·카페', latitude: 37.7722618, longitude: 128.9482754 },
    { contentId: 'gn003', title: '오죽헌', address: '강릉시 율곡로 3139번길 24', tel: '033-660-3301', openTime: '09:00~18:00', category: '문학', latitude: 37.7791389, longitude: 128.8796621 },
    { contentId: 'gn004', title: '강릉독립예술극장 신영', address: '강릉시 경강로 2072', tel: '033-646-0555', openTime: '상영 시간표 참고', category: '영화·애니메이션' },
    { contentId: 'gn005', title: '책방 나다', address: '강릉시 경강로 2121', tel: '', openTime: '12:00~20:00', category: '독립서점·책방' },
  ],
  jeonju: [
    { contentId: 'jj001', title: '전주 한옥마을', address: '전주시 완산구 기린대로 99', tel: '063-282-1330', openTime: '상시', category: '근대 문화유산', latitude: 35.8182728, longitude: 127.1536126 },
    { contentId: 'jj002', title: '경암책방', address: '전주시 완산구 최명희길 29', tel: '063-284-3397', openTime: '10:00~19:00', category: '독립서점·책방' },
    { contentId: 'jj003', title: '전주 막걸리 골목', address: '전주시 완산구 전라감영5길', tel: '', openTime: '11:00~22:00', category: '전통주·양조장' },
    { contentId: 'jj004', title: '전주 공예품전시관', address: '전주시 완산구 기린대로 119', tel: '063-231-4565', openTime: '09:00~18:00', category: '공예·공방' },
    { contentId: 'jj005', title: '남부시장 청년몰', address: '전주시 완산구 풍남문3길 1', tel: '063-900-5893', openTime: '12:00~21:00', category: '로컬 미식' },
  ],
  tongyeong: [
    { contentId: 'ty001', title: '박경리기념관', address: '통영시 산양읍 산양중앙로 173', tel: '055-650-2541', openTime: '09:00~18:00', category: '문학', latitude: 34.8023371, longitude: 128.4035838 },
    { contentId: 'ty002', title: '통영국제음악당', address: '통영시 도천동 문화마당로 1', tel: '055-650-0800', openTime: '공연 시간표 참고', category: '음악', latitude: 34.8265162, longitude: 128.4403434 },
    { contentId: 'ty003', title: '청마문학관', address: '통영시 망일1길 82', tel: '055-650-4621', openTime: '09:00~18:00', category: '문학', latitude: 34.8452509, longitude: 128.4354789 },
    { contentId: 'ty004', title: '통영 중앙시장', address: '통영시 중앙로 51', tel: '', openTime: '06:00~21:00', category: '로컬 미식' },
    { contentId: 'ty005', title: '나전칠기 체험관', address: '통영시 광도면 죽림4로', tel: '055-650-0400', openTime: '09:00~17:00', category: '공예·공방' },
  ],
  chuncheon: [
    { contentId: 'cc001', title: '춘천 애니메이션박물관', address: '춘천시 서면 박사로 854', tel: '033-245-6490', openTime: '10:00~18:00', category: '영화·애니메이션', latitude: 37.8930314, longitude: 127.6918673 },
    { contentId: 'cc002', title: '김유정문학촌', address: '춘천시 신동면 김유정로 1430-14', tel: '033-261-4650', openTime: '09:00~18:00', category: '문학', latitude: 37.8183632, longitude: 127.7176781 },
    { contentId: 'cc003', title: '소양강 스카이워크', address: '춘천시 영서로 2663', tel: '033-250-3033', openTime: '09:00~21:00', category: '관광지', latitude: 37.8932774, longitude: 127.7236633 },
  ],
  pohang: [
    { contentId: 'ph001', title: '포항시립미술관', address: '포항시 북구 환호공원길 10', tel: '054-270-5051', openTime: '10:00~18:00', category: '미술·갤러리', latitude: 36.0662764, longitude: 129.3910763 },
    { contentId: 'ph002', title: '구룡포 근대문화역사거리', address: '포항시 남구 구룡포읍 구룡포길', tel: '', openTime: '상시', category: '근대 문화유산', latitude: 35.9905829, longitude: 129.5616299 },
    { contentId: 'ph003', title: '스페이스워크', address: '포항시 북구 환호동 146', tel: '054-289-1475', openTime: '24시간', category: '미술·갤러리', latitude: 36.0650404, longitude: 129.3923889 },
  ],
  seoul: [
    { contentId: 'sl001', title: '땡스북스 (합정)', address: '마포구 양화로 7안길 61', tel: '02-322-4979', openTime: '12:00~21:00', category: '독립서점·책방' },
    { contentId: 'sl002', title: '유어마인드 (홍대)', address: '마포구 성지1길 5-13', tel: '02-323-1441', openTime: '13:00~21:00', category: '독립서점·책방' },
    { contentId: 'sl003', title: '을지로 갤러리 구역', address: '중구 을지로 일대', tel: '', openTime: '가게별 상이', category: '미술·갤러리' },
  ],
  andong: [
    { contentId: 'ad001', title: '안동소주 전통음식박물관', address: '안동시 수상동 산 36-1', tel: '054-858-4541', openTime: '09:00~18:00', category: '전통주·양조장', latitude: 36.5496587, longitude: 128.7091861 },
    { contentId: 'ad002', title: '하회마을', address: '안동시 풍천면 하회종가길 40', tel: '054-853-0109', openTime: '09:00~18:00', category: '근대 문화유산', latitude: 36.5506149, longitude: 128.5282935 },
  ],
  hadong: [
    { contentId: 'hd001', title: '최참판댁', address: '하동군 악양면 평사리길 66-7', tel: '055-884-2154', openTime: '09:00~18:00', category: '문학', latitude: 35.155594, longitude: 127.68809 },
    { contentId: 'hd002', title: '하동 화개장터', address: '하동군 화개면 쌍계로 15', tel: '', openTime: '상시', category: '로컬 미식', latitude: 35.1879888, longitude: 127.6240662 },
  ],
  gunsan: [
    { contentId: 'gs001', title: '근대역사박물관', address: '군산시 해망로 240', tel: '063-454-7870', openTime: '09:00~18:00', category: '근대 문화유산', latitude: 35.9908197, longitude: 126.7121232 },
    { contentId: 'gs002', title: '신흥동 일본식 가옥 (히로쓰 가옥)', address: '군산시 구영1길 17', tel: '063-454-3274', openTime: '09:00~18:00', category: '근대 문화유산' },
  ],
  mokpo: [
    { contentId: 'mp001', title: '목포 근대역사문화공간', address: '목포시 중앙로1가 일대', tel: '', openTime: '상시', category: '근대 문화유산', latitude: 34.786212, longitude: 126.3826645 },
    { contentId: 'mp002', title: '국립해양문화재연구소', address: '목포시 남농로 136', tel: '061-270-2000', openTime: '09:00~18:00', category: '근대 문화유산' },
  ],
};

// 지역별 TourAPI 법정동 코드 (lDongRegnCd: 2자리 시도, lDongSignguCd: 3자리 시군구)
const REGION_TOUR_CODES = Object.freeze({
  seoul:     { lDongRegnCd: '11' },
  gangneung: { lDongRegnCd: '51', lDongSignguCd: '150' },
  jeonju:    [
    { lDongRegnCd: '52', lDongSignguCd: '111' },
    { lDongRegnCd: '52', lDongSignguCd: '113' },
  ],
  tongyeong: { lDongRegnCd: '48', lDongSignguCd: '220' },
  chuncheon: { lDongRegnCd: '51', lDongSignguCd: '110' },
  pohang:    [
    { lDongRegnCd: '47', lDongSignguCd: '111' },
    { lDongRegnCd: '47', lDongSignguCd: '113' },
  ],
  andong:    { lDongRegnCd: '47', lDongSignguCd: '170' },
  hadong:    { lDongRegnCd: '48', lDongSignguCd: '850' },
  gunsan:    { lDongRegnCd: '52', lDongSignguCd: '130' },
  mokpo:     { lDongRegnCd: '46', lDongSignguCd: '110' },
});

function setRegionDataStatusHeader(res, status) {
  if (!status) {
    return;
  }
  if (typeof res.set === 'function') {
    res.set({ 'X-Region-Data-Status': status });
    return;
  }
  res.setHeader?.('X-Region-Data-Status', status);
}

function setSpotPaginationHeaders(res, pagination, hasMore) {
  const values = {
    'X-Page-No': pagination.pageNo,
    'X-Num-Of-Rows': pagination.numOfRows,
    'X-Has-More': String(hasMore),
  };
  if (hasMore) {
    values['X-Next-Page'] = pagination.pageNo + 1;
  }
  if (typeof res.set === 'function') {
    res.set(values);
    return;
  }
  for (const [name, value] of Object.entries(values)) {
    res.setHeader?.(name, String(value));
  }
}

function localizedRegionName(definition, lang) {
  if (lang === 'en' && definition?.nameEn) return definition.nameEn;
  if (lang === 'ja' && definition?.nameJa) return definition.nameJa;
  if (lang === 'zh' && definition?.nameZh) return definition.nameZh;
  return definition?.name || '';
}

function toPublicSpot(place) {
  return {
    contentId: place.contentId,
    title: place.title,
    address: place.address || '',
    tel: place.tel || '',
    openTime: place.openTime || '',
    category: place.category || '기타',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    imageUrl: place.imageUrl ?? null,
    thumbnailUrl: place.thumbnailUrl ?? null,
    publicCourseCount: place.publicCourseCount ?? null,
  };
}

// "문화별 유명한 지역" 목록은 관련도 높은 관광지가 이 개수 미만인
// 지역은 아예 보여주지 않는다 — 큐레이션 문구만 그럴듯하고 실제로는
// 매칭되는 장소가 거의 없는 지역이 추천 목록에 끼는 걸 막는다.
const MIN_RELEVANT_REGION_SPOT_COUNT = 3;

// 문화 하나당 지역이 이 개수보다 적게 남으면, 손으로 큐레이션해둔
// 후보만으로는 부족하다는 뜻이다 — 나머지 등록 지역도 실시간으로
// 확인해서 채운다.
const MIN_REGIONS_PER_CULTURE = 3;

// collectCulturePlacePage는 "요청한 pageNo 하나당 새 매칭이 pageSize개씩
// 나온다"고 가정하고 오프셋을 (pageNo-1)*pageSize로 계산한다. 문학·음악처럼
// 실제 매칭이 희귀한 카테고리는 이 가정이 깨져서, 뒤쪽 원본 페이지에서
// 분명히 찾아낸 매칭인데도 그 오프셋 밖으로 밀려나 어떤 페이지 응답에도
// 나타나지 않고 사라져 버린다 (예: 통영의 '박경리 기념관'이 문학 필터에서
// 이렇게 누락되는 걸 실제로 확인했다 — 3번째 원본 페이지에서 발견은 되지만
// 오프셋 100~149 구간에는 아무것도 없어 빈 배열로만 응답됨). 원본 후보를
// 최대 MAX_CULTURE_PAGE 페이지까지 전부 모아 한 번에 분류·선별하면 이
// 오프셋 불일치가 생기지 않는다 — 이후 페이지네이션은 이 완전한 목록을
// 그대로 잘라서 쓰면 되므로 항상 정확하다.
async function fetchAllRawPages(fetchPage, baseParams, logger) {
  const items = [];
  let cacheStatus;
  let firstPageError = null;

  for (let pageNo = 1; pageNo <= MAX_CULTURE_PAGE; pageNo += 1) {
    let result;
    try {
      result = await fetchPage({ ...baseParams, pageNo, numOfRows: MAX_CULTURE_RESULTS });
    } catch (error) {
      if (pageNo === 1) {
        firstPageError = error;
      }
      logger?.warn?.('원본 장소 후보 일부를 불러오지 못했습니다.', {
        errorName: error?.name || 'Error',
      });
      break;
    }
    items.push(...result.items);
    cacheStatus = combineCultureCacheStatus(cacheStatus, result.cacheStatus);
    if (result.items.length < MAX_CULTURE_RESULTS) {
      break;
    }
  }

  // 첫 페이지부터 실패해서 이 소스에서 아무것도 못 건진 경우에만
  // "이 소스는 완전히 실패했다"로 표시한다 (collectAllCulturePlaces가
  // 모든 소스가 이렇게 실패했을 때만 에러를 전파하도록 쓴다).
  return { items, cacheStatus, error: items.length === 0 ? firstPageError : null };
}

// 문화 필터로 실제 매칭되는 관광지를 전부(상한 없음) 모은다.
// getSpotsByRegion의 목록과 countLiveCulturePlaces의 배지 개수가
// 이 함수 하나로 항상 일치한다.
async function collectAllCulturePlaces(placesService, tourCodes, cultureName, logger) {
  const baseRequests = Array.isArray(tourCodes) ? tourCodes : [tourCodes];
  const keywords = CULTURE_SEARCH_KEYWORDS[cultureName] || [];

  const sourceResults = await Promise.all([
    ...baseRequests.map(request =>
      fetchAllRawPages(params => placesService.getAreaBasedPlaces(params), request, logger)),
    ...baseRequests.flatMap(request =>
      keywords.map(keyword =>
        fetchAllRawPages(
          params => placesService.searchPlacesByKeyword(params),
          { ...request, keyword },
          logger,
        ))),
  ]);

  if (sourceResults.every(result => result.error)) {
    throw sourceResults[0].error;
  }

  const rawGroups = sourceResults.map(result => result.items);
  const cacheStatus = sourceResults
    .map(result => result.cacheStatus)
    .reduce((combined, status) => combineCultureCacheStatus(combined, status), undefined);

  const items = selectPlacesForCulture(rawGroups, cultureName, {
    limit: Number.MAX_SAFE_INTEGER,
    allowCumulative: true,
  });

  if (items.length < CULTURE_RESULT_FLOOR) {
    const relaxed = selectPlacesForCulture(rawGroups, cultureName, {
      limit: Number.MAX_SAFE_INTEGER,
      allowCumulative: true,
      relaxed: true,
    });
    const seen = new Set(items.map(place => place.contentId));
    for (const place of relaxed) {
      if (items.length >= CULTURE_RESULT_FLOOR) {
        break;
      }
      if (!seen.has(place.contentId)) {
        items.push(place);
        seen.add(place.contentId);
      }
    }
  }

  return { items, cacheStatus };
}

async function countLiveCulturePlaces(placesService, tourCodes, cultureName, logger) {
  const result = await collectAllCulturePlaces(placesService, tourCodes, cultureName, logger);
  return result.items.length;
}

function createRegionsController(options = {}) {
  const service = options.regionScoreService || regionScoreService;
  const placesService = options.placesService || cachedPlacesService;
  const placeUsageRepository = options.placeUsageRepository || coursePlaceUsageRepository;
  const logger = options.logger || console;

  async function attachPublicCourseCounts(items) {
    try {
      const counts = await placeUsageRepository.findPublicCourseCounts(
        items.map(item => item.contentId),
      );
      return items.map(item => ({
        ...item,
        publicCourseCount: counts.get(String(item.contentId)) ?? 0,
      }));
    } catch (error) {
      logger?.warn?.('공개 코스 장소 사용 횟수 집계에 실패했습니다.', {
        errorName: error?.name || 'Error',
      });
      return items.map(item => ({ ...item, publicCourseCount: null }));
    }
  }

  // 조회에 실패하면 가용성을 위해 기존 큐레이션 추정치를 그대로 둔다.
  async function attachLiveSpotCounts(items, cultureName) {
    return Promise.all(items.map(async item => {
      const tourCodes = REGION_TOUR_CODES[item.areaCode];
      if (!tourCodes) {
        return item;
      }
      try {
        const spotCount = await countLiveCulturePlaces(
          placesService,
          tourCodes,
          cultureName,
          logger,
        );
        return { ...item, spotCount };
      } catch (error) {
        logger?.warn?.('실시간 장소 수 계산에 실패해 큐레이션 수치를 유지합니다.', {
          areaCode: item.areaCode,
          errorName: error?.name || 'Error',
        });
        return item;
      }
    }));
  }

  // 손으로 큐레이션해둔 후보만으로 MIN_REGIONS_PER_CULTURE를 못 채우면,
  // 아직 안 써본 등록 지역들도 실시간으로 확인해서 관련도 기준을 넘는
  // 만큼만 채운다. 이 지역들은 문화별 큐레이션 설명이 없으므로 일반
  // 문구를 쓴다.
  async function collectFallbackRegions(cultureName, excludeAreaCodes, needed, lang) {
    if (needed <= 0) {
      return [];
    }

    const candidateAreaCodes = Object.keys(REGION_TOUR_CODES)
      .filter(areaCode => !excludeAreaCodes.has(areaCode));
    const scored = await Promise.all(candidateAreaCodes.map(async areaCode => {
      try {
        const spotCount = await countLiveCulturePlaces(
          placesService,
          REGION_TOUR_CODES[areaCode],
          cultureName,
          logger,
        );
        return { areaCode, spotCount };
      } catch (error) {
        logger?.warn?.('지역 후보 확장 중 실시간 장소 수 계산에 실패했습니다.', {
          areaCode,
          errorName: error?.name || 'Error',
        });
        return { areaCode, spotCount: 0 };
      }
    }));

    return scored
      .filter(entry => entry.spotCount >= MIN_RELEVANT_REGION_SPOT_COUNT)
      .sort((left, right) => right.spotCount - left.spotCount)
      .slice(0, needed)
      .map(({ areaCode, spotCount }) => ({
        areaCode,
        name: localizedRegionName(getRegionDefinition(areaCode), lang),
        description: `${cultureName} 명소`,
        spotCount,
        score: Math.min(100, 40 + spotCount * 2),
      }));
  }

  async function getRegionsByCulture(req, res) {
    const rawCultureId = String(req.params?.id || '').trim();
    if (!/^\d+$/.test(rawCultureId)) {
      return res.status(404).json({
        message: '해당 문화 카테고리를 찾을 수 없습니다.',
      });
    }

    try {
      const result = await service.getRegionsByCulture(
        Number(rawCultureId),
        resolveLang(req),
      );
      if (!result) {
        return res.status(404).json({
          message: '해당 문화 카테고리를 찾을 수 없습니다.',
        });
      }
      const cultureName = CULTURE_ID_TO_NAME[Number(rawCultureId)];
      let items = result.items;
      if (cultureName) {
        const withLiveCounts = await attachLiveSpotCounts(result.items, cultureName);
        items = withLiveCounts.filter(
          item => (item.spotCount ?? 0) >= MIN_RELEVANT_REGION_SPOT_COUNT,
        );

        if (items.length < MIN_REGIONS_PER_CULTURE) {
          const alreadyChecked = new Set(withLiveCounts.map(item => item.areaCode));
          const extras = await collectFallbackRegions(
            cultureName,
            alreadyChecked,
            MIN_REGIONS_PER_CULTURE - items.length,
            resolveLang(req),
          );
          items = [...items, ...extras];
        }

        items = [...items].sort((left, right) => (right.spotCount ?? 0) - (left.spotCount ?? 0));
      }
      setRegionDataStatusHeader(res, result.dataStatus);
      return res.json(items);
    } catch (error) {
      logger?.error?.('문화별 지역점수 처리에 실패했습니다.', {
        errorName: error?.name || 'Error',
      });
      return res.status(500).json({
        message: '지역 정보를 불러올 수 없습니다.',
      });
    }
  }

  // GET /regions/:code/spots?culture=
  async function getSpotsByRegion(req, res) {
    const { code } = req.params;
    const cultureFilter = String(req.query?.culture || '').trim();
    const tourCodes = REGION_TOUR_CODES[code];
    const lang = resolveLang(req);

    if (!tourCodes) {
      return res.status(404).json({ message: '해당 지역 정보를 찾을 수 없습니다.' });
    }
    if (cultureFilter && !isSupportedCulture(cultureFilter)) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: '지원하지 않는 문화 카테고리입니다.',
        retryable: false,
      });
    }

    let pagination;
    try {
      pagination = normalizePagination(
        req.query?.pageNo,
        req.query?.numOfRows,
        { service: 'tour', operation: 'regionSpots' },
        {
          defaultNumOfRows: DEFAULT_CULTURE_RESULTS,
          maxPageNo: MAX_CULTURE_PAGE,
          maxNumOfRows: 50,
        },
      );
    } catch (error) {
      const response = publicPlaceError(error);
      return res.status(response.status).json(response.body);
    }

    try {
      let items;
      let cacheStatus;
      let hasMore;
      const regionRequests = (Array.isArray(tourCodes) ? tourCodes : [tourCodes])
        .map(regionCodes => ({ ...regionCodes, ...pagination }));

      if (cultureFilter) {
        const result = await collectAllCulturePlaces(placesService, tourCodes, cultureFilter, logger);
        const offset = (pagination.pageNo - 1) * pagination.numOfRows;
        items = result.items.slice(offset, offset + pagination.numOfRows);
        cacheStatus = result.cacheStatus;
        hasMore = result.items.length > offset + pagination.numOfRows;
      } else {
        const result = await collectAreaPlacePage({
          placesService,
          requests: regionRequests,
          pagination,
          logger,
        });
        items = result.items;
        cacheStatus = result.cacheStatus;
        hasMore = result.hasMore;
      }

      if (typeof res.set === 'function' && cacheStatus) {
        res.set({ 'X-Cache-Status': cacheStatus });
      }
      setSpotPaginationHeaders(
        res,
        pagination,
        hasMore && pagination.pageNo < MAX_CULTURE_PAGE,
      );

      const publicItems = lang !== 'ko'
        ? await placesService.attachTranslationOverlay(items, lang)
        : items;
      const itemsWithUsage = await attachPublicCourseCounts(publicItems);
      return res.json(itemsWithUsage.map(toPublicSpot));
    } catch (error) {
      if (cultureFilter) {
        const response = publicPlaceError(error);
        if (response.status === 500) {
          logger?.error?.('문화별 지역 장소 처리에 실패했습니다.', {
            errorName: error?.name || 'Error',
          });
        }
        return res.status(response.status).json(response.body);
      }

      // 문화 필터가 없는 이전 흐름은 가용성을 위해 기존 seed fallback을 유지한다.
      const fallbackItems = SPOT_MAP[code] || [];
      const fallbackOffset = (pagination.pageNo - 1) * pagination.numOfRows;
      const fallbackPage = fallbackItems.slice(
        fallbackOffset,
        fallbackOffset + pagination.numOfRows,
      );
      const publicFallback = lang !== 'ko'
        ? await placesService.attachTranslationOverlay(fallbackPage, lang)
        : fallbackPage;
      setSpotPaginationHeaders(
        res,
        pagination,
        fallbackOffset + pagination.numOfRows < fallbackItems.length,
      );
      const fallbackWithUsage = await attachPublicCourseCounts(publicFallback);
      return res.json(fallbackWithUsage.map(toPublicSpot));
    }
  }

  return Object.freeze({ getRegionsByCulture, getSpotsByRegion });
}

const { getRegionsByCulture, getSpotsByRegion } = createRegionsController();

module.exports = {
  createRegionsController,
  getRegionsByCulture,
  getSpotsByRegion,
  setRegionDataStatusHeader,
  setSpotPaginationHeaders,
};
