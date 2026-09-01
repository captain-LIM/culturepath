'use strict';

const {
  CULTURE_CATEGORIES,
  MAX_CULTURE_PAGE,
  MAX_CULTURE_RESULTS,
} = require('../config/cultureCategoryMap');
const { MAX_PLACE_DETAIL_IMAGES } = require('../config/placeMedia');

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

const regionDataStatusHeader = Object.freeze({
  description:
    '지역점수 데이터 출처. HIT=유효 캐시, REFRESHED=DataLab 갱신, STALE=장애 fallback, BYPASS=DB 우회 실데이터, CURATED=큐레이션 fallback',
  schema: {
    type: 'string',
    enum: ['HIT', 'REFRESHED', 'STALE', 'BYPASS', 'CURATED'],
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
  tags: [
    { name: 'Regions', description: '문화별 지역 탐색과 지역점수' },
    { name: 'Places', description: '관광 장소 검색과 상세조회' },
    { name: 'AI', description: '인증된 사용자의 RAG 기반 코스 변형' },
    { name: 'Users', description: '인증된 사용자의 계정 관리' },
  ],
  paths: {
    '/cultures/{id}/regions': {
      get: {
        tags: ['Regions'],
        summary: '문화별 유명 지역 조회',
        description:
          '초기 장소 밀도·DataLab 외지인 방문 추이·큐레이션을 40:30:30으로 조합해 기존 지역 카드 형식으로 반환합니다.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: '문화 카테고리 숫자형 ID',
            schema: { type: 'integer', minimum: 1 },
          },
        ],
        responses: {
          200: {
            description: '점수 내림차순 지역 카드 배열',
            headers: {
              'X-Region-Data-Status': regionDataStatusHeader,
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/RegionItem' },
                },
              },
            },
          },
          404: {
            description: '문화 카테고리 없음',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageError' },
              },
            },
          },
          500: {
            description: '예상하지 못한 지역점수 처리 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageError' },
              },
            },
          },
        },
      },
    },
    '/regions/{code}/spots': {
      get: {
        tags: ['Regions'],
        summary: '지역별 관광 장소 조회',
        description:
          '`culture`가 있으면 정확한 TourAPI 신분류 코드가 있는 문화는 공식 코드 목록과 최대 3개의 문화 검색어를 사용하고, 엄격 검증 결과가 5개 미만이거나 공식 조회가 실패하면 지역 일반 목록으로 보충합니다. 공식 코드가 모호한 문화는 지역 일반 목록과 문화 검색어를 유지합니다. 모든 후보는 contentId override·공식 분류 코드·제목 규칙으로 다시 검증하며 관련도 점수는 내부 정렬에만 사용합니다.',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            description: 'CulturePath 지역 slug',
            schema: { type: 'string', example: 'tongyeong' },
          },
          {
            name: 'culture',
            in: 'query',
            description: '허용된 내부 문화 카테고리. 지정하면 엄격한 관련도 필터를 적용합니다.',
            schema: {
              type: 'string',
              enum: [...CULTURE_CATEGORIES],
            },
          },
          { $ref: '#/components/parameters/CulturePageNo' },
          { $ref: '#/components/parameters/NumOfRows' },
        ],
        responses: {
          200: {
            description: '관련도 근거가 강한 순서의 장소 배열. 일치 장소가 없으면 빈 배열입니다.',
            headers: {
              'X-Cache-Status': cacheStatusHeader,
              'X-Page-No': { schema: { type: 'integer', minimum: 1 } },
              'X-Num-Of-Rows': { schema: { type: 'integer', minimum: 1, maximum: 50 } },
              'X-Has-More': {
                description: '다음 후보 페이지가 있을 수 있는지 나타냅니다.',
                schema: { type: 'boolean' },
              },
              'X-Next-Page': {
                description: 'X-Has-More가 true일 때 요청할 다음 pageNo입니다.',
                schema: { type: 'integer', minimum: 2 },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  maxItems: MAX_CULTURE_RESULTS,
                  items: { $ref: '#/components/schemas/RegionSpot' },
                },
              },
            },
          },
          404: {
            description: '지원하지 않는 지역',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageError' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/ai/transform': {
      post: {
        tags: ['AI'],
        summary: '현재 코스의 기존 장소를 자연어로 편집',
        description:
          '서버에서 다시 조회한 현재 코스의 기존 장소만 사용해 삭제·Day 이동·명시적 순서 변경 미리보기를 반환합니다. 신규 장소 검색·추가와 거리 기반 최적화는 하지 않으며, OpenRouter 출력은 엄격한 JSON Schema와 서버 검증을 모두 통과해야 합니다. 응답은 사용자 확인 전 저장되지 않습니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CourseTransformRequest' },
            },
          },
        },
        responses: {
          200: {
            description: '검증된 코스 변경안',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CourseTransformResponse' },
              },
            },
          },
          400: {
            description: 'AI 코스 변형 요청 오류',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          401: {
            description: '인증 필요',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          403: {
            description: '소유하지 않은 코스 — 먼저 Fork 필요',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          404: {
            description: '코스를 찾을 수 없음',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          429: {
            description: '사용자별 AI 호출 제한 초과',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          502: {
            description: 'OpenRouter 응답 또는 AI 출력 검증 오류',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          503: {
            description: 'OpenRouter 설정 누락',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          504: {
            description: 'OpenRouter 응답 시간 초과',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          500: {
            description: '서버 또는 데이터베이스 오류',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
        },
      },
    },
    '/ai/chat': {
      post: {
        tags: ['AI'],
        summary: 'MySQL·TourAPI 검증 후보 기반 AI 여행 상담',
        description:
          '짧은 수명의 사용자 세션에서 지역·문화·선호 문맥을 유지합니다. LLM은 strict 의도 해석과 검증 후보 설명만 담당하고, 장소 검색과 클릭 가능한 sources 구성은 Backend가 수행합니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AiChatRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'AI 상담 응답',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AiChatResponse' } } },
          },
          400: { description: '메시지 형식 또는 길이 오류' },
          401: { description: '인증 필요' },
          429: { description: '사용자별 AI 호출 제한 초과' },
          500: { description: '서버 오류' },
          502: { description: 'OpenRouter 또는 TourAPI 응답 오류' },
          503: { description: 'AI 또는 관광정보 설정 누락·일시 장애' },
          504: { description: 'AI 또는 관광정보 응답 시간 초과' },
        },
      },
    },
    '/ai/chat/sessions/{sessionId}': {
      delete: {
        tags: ['AI'],
        summary: 'AI 여행 대화 세션 종료',
        security: [{ bearerAuth: [] }],
        parameters: [{
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        }],
        responses: {
          204: { description: '세션 종료 성공' },
          400: { description: '세션 ID 형식 오류' },
          401: { description: '인증 필요' },
          403: { description: '다른 사용자의 세션' },
          404: { description: '세션 없음 또는 만료' },
        },
      },
    },
    '/ai/chat/sessions': {
      delete: {
        tags: ['AI'],
        summary: '현재 사용자의 AI 대화 세션 전체 종료',
        description: '로그아웃 직전에 현재 사용자가 보유한 짧은 수명의 AI 세션을 모두 제거합니다.',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: '사용자 AI 세션 전체 종료 성공' },
          401: { description: '인증 필요' },
        },
      },
    },
    '/ai/chat/sessions/{sessionId}/course-saved': {
      post: {
        tags: ['AI'],
        summary: '저장된 코스를 대화 문맥에 반영',
        description:
          '코스 저장 후 대화 세션을 종료하지 않고 최신 코스 문맥으로 갱신합니다. 적용이 끝난 초안과 편집 미리보기만 제거합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [{
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['courseId'],
                properties: { courseId: { type: 'integer', minimum: 1 } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '세션 코스 문맥 갱신 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionId', 'courseId'],
                  properties: {
                    sessionId: { type: 'string', format: 'uuid' },
                    courseId: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
          400: { description: '세션 ID 또는 코스 ID 형식 오류' },
          401: { description: '인증 필요' },
          403: { description: '세션 또는 코스 권한 없음' },
          404: { description: '세션 또는 코스 없음' },
        },
      },
    },
    '/ai/edit-course': {
      post: {
        tags: ['AI'],
        summary: 'AI 코스 변형 호환 별칭',
        description: '`POST /ai/transform`의 이전 Flutter 빌드 호환 별칭입니다.',
        deprecated: true,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/CourseTransformRequest' },
                  { $ref: '#/components/schemas/LegacyCourseTransformRequest' },
                ],
              },
            },
          },
        },
        responses: {
          200: {
            description: '검증된 코스 변경안',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseTransformResponse' } } },
          },
          400: { description: '요청 오류' },
          401: { description: '인증 필요' },
          403: { description: '접근 권한 없음' },
          404: { description: '코스를 찾을 수 없음' },
          429: { description: '호출 제한 초과' },
          500: { description: '서버 오류' },
          502: { description: 'OpenRouter 또는 AI 검증 응답 오류' },
          503: { description: 'OpenRouter 설정 누락' },
          504: { description: 'OpenRouter 응답 시간 초과' },
        },
      },
    },
    '/users/me': {
      delete: {
        tags: ['Users'],
        summary: '내 계정과 관련 데이터 삭제',
        description:
          '사용자가 만든 공개·비공개 코스와 관련 기록을 삭제하고, 다른 사용자의 복제본 원작자 표시는 익명화합니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['confirmation'],
                properties: {
                  confirmation: { type: 'string', enum: ['DELETE'] },
                },
              },
            },
          },
        },
        responses: {
          204: { description: '계정과 관련 데이터 삭제 완료' },
          400: {
            description: '탈퇴 확인 값 오류',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          401: {
            description: '인증 실패',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          404: {
            description: '사용자 없음',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
          500: {
            description: '계정 삭제 실패',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageError' } } },
          },
        },
      },
    },
    '/places/search': {
      get: {
        tags: ['Places'],
        summary: '장소 목록 또는 키워드 검색',
        description:
          '`q`가 있으면 키워드 검색, `q` 없이 `lDongRegnCd`가 있으면 지역 목록을 반환합니다. culture가 있으면 허용된 문화인지 검증하고, q가 없는 경우 지역 목록과 최대 3개의 문화 검색어 후보를 합친 뒤 엄격하게 재분류합니다. 문화 필터 결과는 최대 50개입니다.',
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
            description: '허용된 내부 문화 분류. 그 외 값은 400입니다.',
            schema: { type: 'string', enum: [...CULTURE_CATEGORIES] },
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
                  maxItems: 50,
                  'x-culture-filter-max-items': MAX_CULTURE_RESULTS,
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
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
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
        description: `culture만 지정한 통합 후보 조회는 최대 ${MAX_CULTURE_PAGE}페이지입니다.`,
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      CulturePageNo: {
        name: 'pageNo',
        in: 'query',
        description: '통합 후보 재조회 비용을 제한하기 위한 지역 장소 페이지입니다.',
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_CULTURE_PAGE,
          default: 1,
        },
      },
      NumOfRows: {
        name: 'numOfRows',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
    },
    schemas: {
      MessageError: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string' },
        },
      },
      RegionItem: {
        type: 'object',
        required: [
          'areaCode',
          'name',
          'description',
          'spotCount',
          'score',
        ],
        properties: {
          areaCode: { type: 'string', example: 'tongyeong' },
          name: { type: 'string', example: '통영' },
          description: {
            type: 'string',
            example: '박경리·청마 유치환의 흔적',
          },
          spotCount: {
            type: 'integer',
            minimum: 0,
            description: '초기 큐레이션 장소 수. 전국 TourAPI 적재 완료 전까지 잠정값',
          },
          score: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: '초기 문화 적합도 점수',
          },
        },
      },
      RegionSpot: {
        type: 'object',
        required: [
          'contentId',
          'title',
          'address',
          'tel',
          'openTime',
          'category',
          'latitude',
          'longitude',
          'imageUrl',
          'thumbnailUrl',
          'publicCourseCount',
        ],
        properties: {
          contentId: { type: 'string' },
          title: { type: 'string' },
          address: { type: 'string', description: '누락 시 빈 문자열' },
          tel: { type: 'string', description: '누락 시 빈 문자열' },
          openTime: { type: 'string', description: '누락 시 빈 문자열' },
          category: {
            type: 'string',
            description: '선택값을 덮어쓰지 않은 실제 내부 대표 문화 분류',
          },
          latitude: { type: 'number', format: 'double', nullable: true },
          longitude: { type: 'number', format: 'double', nullable: true },
          imageUrl: { type: 'string', format: 'uri', nullable: true },
          thumbnailUrl: { type: 'string', format: 'uri', nullable: true },
          publicCourseCount: {
            type: 'integer',
            minimum: 0,
            nullable: true,
            description: '해당 장소를 한 번 이상 담은 공개 코스 수. 집계 장애 시 null',
          },
        },
      },
      ApiError: {
        type: 'object',
        required: ['code', 'message', 'retryable'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          retryable: { type: 'boolean' },
        },
      },
      CoursePlace: {
        type: 'object',
        required: ['contentId', 'title'],
        properties: {
          contentId: { type: 'string', minLength: 1, maxLength: 100 },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          address: { type: 'string' },
          category: { type: 'string' },
          region: { type: 'string', nullable: true },
          tel: { type: 'string' },
          openTime: { type: 'string' },
        },
      },
      CourseTrack: {
        type: 'object',
        required: ['trackNumber', 'places'],
        properties: {
          trackNumber: { type: 'integer', minimum: 1, maximum: 3 },
          places: {
            type: 'array',
            maxItems: 20,
            items: { $ref: '#/components/schemas/CoursePlace' },
          },
        },
      },
      CourseDraft: {
        type: 'object',
        required: ['title', 'description', 'tracks'],
        properties: {
          id: { type: 'integer', nullable: true },
          revision: { type: 'integer', minimum: 1, nullable: true },
          title: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 2000 },
          isPublic: { type: 'boolean' },
          tracks: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { $ref: '#/components/schemas/CourseTrack' },
          },
        },
      },
      CourseTransformRequest: {
        type: 'object',
        required: ['courseId', 'request'],
        properties: {
          courseId: { type: 'integer', minimum: 1 },
          request: { type: 'string', minLength: 1, maxLength: 500 },
          constraints: { $ref: '#/components/schemas/TransformConstraints' },
        },
      },
      TransformConstraints: {
        type: 'object',
        additionalProperties: false,
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 3 },
          weather: { type: 'string', maxLength: 100 },
          companions: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 100 } },
          mobility: { type: 'string', maxLength: 100 },
          dietary: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 100 } },
          startRegion: { type: 'string', maxLength: 100 },
        },
      },
      LegacyCourseTransformRequest: {
        type: 'object',
        deprecated: true,
        required: ['course', 'userRequest'],
        properties: {
          course: {
            allOf: [
              { $ref: '#/components/schemas/CourseDraft' },
              {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'integer', minimum: 1 } },
              },
            ],
          },
          userRequest: { type: 'string', minLength: 1, maxLength: 500 },
          constraints: { $ref: '#/components/schemas/TransformConstraints' },
        },
      },
      AiChatMessage: {
        type: 'object',
        required: ['role', 'content'],
        properties: {
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
      AiChatEntryContext: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['general', 'course'] },
          courseId: { type: 'integer', minimum: 1, nullable: true },
        },
      },
      AiChatRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['messages'],
        properties: {
          sessionId: { type: 'string', format: 'uuid', nullable: true },
          entryContext: { $ref: '#/components/schemas/AiChatEntryContext' },
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { $ref: '#/components/schemas/AiChatMessage' },
          },
        },
      },
      AiChatResponse: {
        type: 'object',
        required: ['sessionId', 'action', 'content', 'mock', 'sources', 'suggestedCourse'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          action: {
            type: 'string',
            enum: [
              'clarify',
              'discover_regions',
              'discover_cultures',
              'discover_places',
              'create_course_draft',
              'edit_course',
              'explain_place',
              'unsupported',
            ],
          },
          content: { type: 'string' },
          mock: { type: 'boolean' },
          sources: {
            type: 'array',
            maxItems: 10,
            description: 'MySQL 원본으로 재검증된 TourAPI 근거 장소',
            items: {
              type: 'object',
              required: ['contentId', 'title', 'address', 'category', 'region'],
              properties: {
                contentId: { type: 'string', pattern: '^[0-9]+$' },
                title: { type: 'string', minLength: 1, maxLength: 200 },
                address: { type: 'string', maxLength: 500 },
                category: { type: 'string', maxLength: 100 },
                region: { type: 'string', maxLength: 100 },
              },
            },
          },
          suggestedCourse: {
            allOf: [{ $ref: '#/components/schemas/CourseDraft' }],
            nullable: true,
          },
          usage: { type: 'object' },
        },
      },
      CourseTransformResponse: {
        type: 'object',
        required: ['course', 'summary', 'explanation', 'sources', 'warnings', 'usage', 'mock'],
        properties: {
          course: { $ref: '#/components/schemas/CourseDraft' },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          explanation: { type: 'string', minLength: 1, maxLength: 500, description: '이전 Flutter 빌드 호환 필드' },
          sources: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              required: ['contentId', 'title'],
              properties: {
                contentId: { type: 'string', pattern: '^[0-9]+$' },
                title: { type: 'string', minLength: 1, maxLength: 200 },
              },
            },
          },
          warnings: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', minLength: 1, maxLength: 300 },
          },
          usage: {
            type: 'object',
            required: ['model', 'inputTokens', 'outputTokens'],
            properties: {
              model: { type: 'string' },
              inputTokens: { type: 'integer', minimum: 0 },
              outputTokens: { type: 'integer', minimum: 0 },
            },
          },
          mock: { type: 'boolean' },
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
                maxItems: MAX_PLACE_DETAIL_IMAGES,
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
