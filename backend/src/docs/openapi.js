'use strict';

const errorResponses = Object.freeze({
  400: {
    description: '요청 파라미터 오류',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  502: {
    description: 'TourAPI 응답 오류',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  503: {
    description: 'TourAPI 설정 또는 서비스 사용 불가',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  504: {
    description: 'TourAPI 응답 시간 초과',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
  500: {
    description: '예상하지 못한 서버 오류',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  },
});

const cacheStatusHeader = Object.freeze({
  description:
    '장소 데이터 출처. HIT=유효 캐시, REFRESHED=TourAPI 갱신, STALE=장애 fallback, BYPASS=캐시 우회',
  schema: {
    type: 'string',
    enum: ['HIT', 'REFRESHED', 'STALE', 'BYPASS'],
  },
});

module.exports = Object.freeze({
  openapi: '3.0.3',
  info: {
    title: 'CulturePath API',
    version: '1.0.0',
    description:
      'CulturePath 공개 API 계약입니다. 외부 TourAPI 인증키는 Backend에서만 사용합니다.',
  },
  servers: [{ url: '/', description: '현재 CulturePath Backend' }],
  tags: [{ name: 'Places', description: '관광 장소 검색과 상세조회' }],
  paths: {
    '/places/search': {
      get: {
        tags: ['Places'],
        summary: '장소 목록 또는 키워드 검색',
        description:
          '`q`가 있으면 키워드 검색, `q` 없이 `lDongRegnCd`가 있으면 지역 목록을 반환합니다. 둘 다 없으면 400입니다.',
        parameters: [
          {
            name: 'q',
            in: 'query',
            description: '검색어. 사용할 때는 2~100자입니다.',
            schema: { type: 'string', minLength: 2, maxLength: 100 },
          },
          {
            name: 'culture',
            in: 'query',
            description: '현재 페이지 결과에 적용할 내부 문화 분류',
            schema: { type: 'string' },
          },
          { $ref: '#/components/parameters/LDongRegnCd' },
          { $ref: '#/components/parameters/LDongSignguCd' },
          { $ref: '#/components/parameters/ContentTypeId' },
          { $ref: '#/components/parameters/Arrange' },
          { $ref: '#/components/parameters/PageNo' },
          { $ref: '#/components/parameters/NumOfRows' },
        ],
        responses: {
          200: {
            description: '장소 배열',
            headers: {
              'X-Cache-Status': cacheStatusHeader,
              'X-Page-No': { schema: { type: 'integer', minimum: 1 } },
              'X-Num-Of-Rows': { schema: { type: 'integer', minimum: 1 } },
              'X-Total-Count': { schema: { type: 'integer', minimum: 0 } },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PlaceSummary' },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/places/{id}': {
      get: {
        tags: ['Places'],
        summary: '장소 상세조회',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'TourAPI 숫자형 contentId',
            schema: { type: 'string', pattern: '^\\d+$' },
          },
        ],
        responses: {
          200: {
            description: '공통·소개·이미지를 조합한 장소 상세',
            headers: {
              'X-Cache-Status': cacheStatusHeader,
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlaceDetail' },
              },
            },
          },
          404: {
            description: '장소 없음',
            headers: {
              'X-Cache-Status': cacheStatusHeader,
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/places/{id}/related': {
      get: {
        tags: ['Places'],
        summary: '연관 방문 장소 조회',
        description:
          '차량 이동 기반 연관 관광지 상위 5개를 TourAPI 장소 카드로 안전하게 매핑해 반환합니다.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: '중심 장소의 TourAPI 숫자형 contentId',
            schema: { type: 'string', pattern: '^\\d+$' },
          },
        ],
        responses: {
          200: {
            description: '연관 방문 장소 배열. 매핑되지 않은 후보는 제외됩니다.',
            headers: {
              'X-Cache-Status': cacheStatusHeader,
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  maxItems: 5,
                  items: { $ref: '#/components/schemas/PlaceSummary' },
                },
              },
            },
          },
          404: {
            description: '중심 장소 없음',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
  },
  components: {
    parameters: {
      LDongRegnCd: {
        name: 'lDongRegnCd',
        in: 'query',
        description: '법정동 시·도 코드 2자리',
        schema: { type: 'string', pattern: '^\\d{2}$', example: '48' },
      },
      LDongSignguCd: {
        name: 'lDongSignguCd',
        in: 'query',
        description: '법정동 시·군·구 코드 3자리. 시·도 코드와 함께 사용합니다.',
        schema: { type: 'string', pattern: '^\\d{3}$', example: '220' },
      },
      ContentTypeId: {
        name: 'contentTypeId',
        in: 'query',
        schema: { type: 'string', pattern: '^\\d+$', example: '14' },
      },
      Arrange: {
        name: 'arrange',
        in: 'query',
        schema: { type: 'string', enum: ['A', 'C', 'D'], default: 'A' },
      },
      PageNo: {
        name: 'pageNo',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      NumOfRows: {
        name: 'numOfRows',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['code', 'message', 'retryable'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          retryable: { type: 'boolean' },
        },
      },
      PlaceSummary: {
        type: 'object',
        required: ['contentId', 'title', 'address', 'tel', 'openTime', 'category'],
        properties: {
          contentId: { type: 'string' },
          contentTypeId: { type: 'string', nullable: true },
          title: { type: 'string' },
          overview: { type: 'string', nullable: true },
          areaCode: { type: 'string', nullable: true, deprecated: true },
          sigunguCode: { type: 'string', nullable: true, deprecated: true },
          lDongRegnCd: { type: 'string', nullable: true },
          lDongSignguCd: { type: 'string', nullable: true },
          regionName: { type: 'string', nullable: true },
          region: { type: 'string', nullable: true, description: '기존 Flutter 호환 필드' },
          address: { type: 'string', description: '누락 시 빈 문자열' },
          latitude: { type: 'number', format: 'double', nullable: true },
          longitude: { type: 'number', format: 'double', nullable: true },
          tel: { type: 'string', description: '누락 시 빈 문자열' },
          openTime: { type: 'string', description: '누락 시 빈 문자열' },
          restDate: { type: 'string', nullable: true },
          imageUrl: { type: 'string', format: 'uri', nullable: true },
          thumbnailUrl: { type: 'string', format: 'uri', nullable: true },
          lclsSystmCodes: { type: 'array', items: { type: 'string' } },
          cultures: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          source: { type: 'string', enum: ['TOUR_API'] },
          sourceUpdatedAt: { type: 'string', nullable: true },
        },
      },
      PlaceImage: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', format: 'uri', nullable: true },
          thumbnailUrl: { type: 'string', format: 'uri', nullable: true },
          name: { type: 'string', nullable: true },
          copyrightType: { type: 'string', nullable: true },
          serialNumber: { type: 'string', nullable: true },
        },
      },
      PlaceDetail: {
        allOf: [
          { $ref: '#/components/schemas/PlaceSummary' },
          {
            type: 'object',
            properties: {
              homepage: { type: 'string', format: 'uri', nullable: true },
              parking: { type: 'string', nullable: true },
              images: {
                type: 'array',
                items: { $ref: '#/components/schemas/PlaceImage' },
              },
              additionalInfo: {
                type: 'array',
                description: '기본 상세조회에서는 비어 있으며 선택 조회용으로 예약된 필드',
                items: { type: 'object' },
              },
            },
          },
        ],
      },
    },
  },
});
