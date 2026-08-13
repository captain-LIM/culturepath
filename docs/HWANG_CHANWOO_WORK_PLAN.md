# [황찬우 전용] RAG · API 연동 · FE 디자인 실행계획

> **문서 소유자:** 황찬우
>
> **전용 표시:** 이 문서는 CulturePath 프로젝트에서 황찬우가 맡은 작업만 추적하는 개인 실행 문서다.
>
> **담당 영역:** 외부 API 연동 · RAG/AI Backend · Frontend UI/UX Design
>
> **기준일:** 2026-07-20
>
> **최종 갱신:** 2026-08-13
>
> **관련 문서:** [서비스 계획서](./문화여행_따라가방_서비스_계획서.md) · [팀 역할 및 협업 기준](./TEAM_ROLES.md) · [잔여 PR 로드맵과 세션 인수인계](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md)

---

## 0. 이 문서의 사용법

- 이 문서는 아이디어 목록이 아니라 **실제 작업 순서와 완료 조건을 관리하는 체크리스트**다.
- 완료된 기반 설명은 참고하고, 잔여 작업은 **문화 관련도 → 이미지 → 다국어 관광 데이터 → Figma P0 → Flutter·지도 → RAG 평가 계약 → OpenRouter → 배포** 순서로 진행한다.
- 체크박스는 코드 작성만으로 완료 처리하지 않는다. 각 항목의 **완료 기준(Definition of Done)**을 만족해야 체크한다.
- 외부 API 키, Qdrant API 키, OpenRouter API 키 등 비밀값은 이 문서와 Git에 절대 기록하지 않는다.
- 수민님과 합의가 필요한 항목은 혼자 확정하지 않고 `협업 필요` 표시를 기준으로 먼저 인터페이스를 맞춘다.
- 서비스 범위가 변경되면 서비스 계획서를 먼저 갱신한 뒤 이 문서를 수정한다.

## 1. 내 역할 한 문장 정의

**한국관광공사 API의 실제 데이터를 안정적으로 수집·가공하고, 그 데이터를 Qdrant 기반 RAG와 OpenRouter LLM에 연결하며, 사용자가 이 기능을 편하게 경험하도록 Figma Make 기반 UI/UX를 설계한다.**

내 역할은 세 영역으로 나뉘지만 서로 독립적이지 않다.

```text
한국관광공사 OpenAPI
        ↓
응답 정규화 · MySQL 캐시
        ↓
내부 장소/지역 API ───────────────→ Flutter 화면
        ↓                              ↑
RAG 문서화 · 임베딩                   │
        ↓                              │
Qdrant 의미 검색                      │
        ↓                              │
OpenRouter 코스 변형 ──────────────→ AI 변형 UX

Figma Make ─→ 디자인 시스템·화면·상태 명세 ─→ 수민님 Flutter 구현
```

## 2. 두 차례 검토 결과

### 2.1 1차 검토 — 기획·역할 기준

서비스 계획서와 역할 문서를 기준으로 확인한 내 책임은 다음과 같다.

- P0 탐색 흐름에 필요한 TourAPI 연동과 관광 데이터 가공
- 지역별 장소 밀도와 방문자 데이터를 활용한 유명 지역 산출 기반 제공
- `places_cache` 적재·갱신과 외부 API 장애 대응
- Qdrant 검색, OpenRouter LLM, 프롬프트 및 코스 변형 로직
- `POST /ai/transform` 요청·응답 설계와 구현
- Figma Make를 활용한 디자인 시스템 및 핵심 화면 설계
- AI 변형 결과의 변경 전·후 비교, 적용, 취소 UX 설계
- 수민님에게 API 명세와 디자인 명세를 전달하고 통합 결과 검수

### 2.2 2차 검토 — 현재 코드 기준

현재 저장소는 TourAPI·MySQL 캐시·Qdrant/RAG 코드·AI 변경안 UX와 코스 지도까지 구현돼 있다. 남은 핵심은 문화 탐색 품질, 이미지, 관광 데이터 다국어화, 정보구조·지도 UX, 실제 데이터 평가 계약과 OpenRouter live 검증이다.

| 구분 | 현재 상태 | 목표 상태 | 내가 해야 할 일 |
| --- | --- | --- | --- |
| 관광지 데이터 | 목록·상세·연관 장소와 MySQL 캐시 구현·실환경 저장 확인 | TourAPI + MySQL 캐시 | 현재 계약 유지와 이미지/상세 UI 연결 |
| 문화 관련도 | R11 후보 재분류·오탐 제거·근거 강도 정렬 구현 | 근거 기반 필터·안정 정렬 | 실제 데이터 커버리지 감사 전까지 결정론적 fixture 회귀 유지 |
| 지역·문화 데이터 | DataLab 점수와 TourAPI 장소 목록 연결 | 실데이터 + 안전한 큐레이션 fallback | 배포 전 표본·장애 시나리오 재검증 |
| 장소 이미지 | Backend 상세에는 이미지가 있으나 Flutter 목록은 `이미지 준비 중` | 목록 썸네일 + 상세 갤러리 | nullable 필드·fallback·캐시·상세 이동 구현 |
| 다국어 관광 데이터 | Flutter 고정 문구만 `ko/en/ja/zh` 번역, TourAPI 데이터는 한국어 | locale별 공식 데이터 + 안전한 한국어 fallback | 공급원·ID 매핑·locale 캐시·표시 계약 구현 |
| 벡터 검색 | Qdrant 코드와 환경·연결 검증 완료, OpenRouter 실임베딩 미실행 | 실제 장소 의미 검색 | live 평가 계약 확정 후 최소 호출로 인덱싱·평가 |
| LLM | OpenRouter 어댑터·Mock 구현, live 연결 연기 | OpenRouter | 이미지·디자인·평가 계약 뒤 모델·비용·제한 검증 |
| AI API | 구조화 `POST /ai/transform`과 후보 검증 구현 | 실제 코스 변형 | Qdrant 후보와 OpenRouter 실모델 품질 검증 |
| AI 화면 | 전체 변경안·diff·Fork·적용·취소·원본 복구 구현 | 안전한 코스 변경 UX | R15에서 P0 디자인과 실기기 QA 적용 |
| DB | 로컬 MySQL 8.4.11 schema·migration·최소 권한 연결·캐시 저장 성공 | 배포 DB에서도 재현 가능 | staging/production migration·복구 절차 검증 |
| 지도 | 코스 Day별 Google Map·좌표 저장·pan 구현 | 지역 지도와 목록 연동·번호 마커·순서선 | 유료 경로 API 없이 P0 지도 UX 고도화 |
| 디자인 | 기본 UI와 AI 화면, 과거 Figma 초안 존재 | 최신 정보구조와 사람이 검수한 P0 원본 | 홈·탐색·지도 재구성 후 Flutter 적용·QA |

### 2.3 반드시 바로잡을 명칭

- 국문 관광정보 서비스의 공식 키워드 검색 오퍼레이션은 `keywordSearch2`가 아니라 **`searchKeyword2`**다.
- RAG의 핵심 제품 기능은 자유 대화가 아니라 **기존 코스를 사용자 조건에 맞게 변형하는 기능**이다.
- MySQL은 원본 데이터와 CRUD의 기준 저장소이며, Qdrant는 검색 인덱스다. Qdrant를 원본 DB처럼 사용하지 않는다.

## 3. 전체 우선순위

초기 기반 1~8은 구현됐다. 2026-08-12부터의 실제 잔여 순서는 다음과 같다.

| 순서 | 단계 | 핵심 결과 |
| --- | --- | --- |
| 1 | 문화 관련도 | 문화별 오탐 제거와 근거가 강한 장소 우선 정렬 |
| 2 | 관광지 이미지·상세 | 실제 썸네일·갤러리·연관 장소를 Flutter까지 전달 |
| 3 | 다국어 관광 데이터 | 언어 선택 시 장소 데이터도 locale별 표시 |
| 4 | Figma Make P0 | 홈·탐색·지도 정보구조와 비-AI형 시각 언어 확정 |
| 5 | Flutter·지도 적용·QA | P0 구현과 Android 실기기·release 검증 |
| 6 | RAG 평가 계약 | Mock fixture와 실제 TourAPI live 기준 분리 |
| 7 | OpenRouter live | BGE-M3·Qdrant 검색·AI 변형 품질과 비용 검증 |
| 8 | 배포·제출 | staging/production, 보안, Google Play, 공모전 데모 완성 |

### 3.1 PR 실행 단위

이 문서의 작업을 실제 PR 순서와 범위로 나눈 기준은 [황찬우 전용 잔여 PR 로드맵과 세션 인수인계](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md)에서 관리한다. 새 세션은 해당 문서의 현재 상태, 첫 번째 미완료 PR, 결정 필요 항목을 확인한 뒤 계획 승인 절차부터 재개한다.

---

# Part A. 외부 API 연동

## A-1. 활용 신청 상태

다음 세 API는 활용 신청 완료 상태다.

- [x] 한국관광공사_국문 관광정보 서비스_GW
- [x] 한국관광공사_관광지별 연관 관광지 정보
- [x] 한국관광공사_빅데이터_지역별 방문자수_GW

현재 P0/P1에 필요하지 않은 무장애·반려동물·혼잡도 API는 핵심 흐름 완성 전까지 보류한다. 관광 데이터 다국어화는 팀원 요구에 따라 R13의 P0 범위로 승격했다. 2026-08-13 공식 포털에서 `EngService2`, `JpnService2`, `ChsService2`, `ChtService2`의 현재 제공과 Base URL은 확인했지만 활용 신청·승인과 실제 호출은 아직 완료하지 않았다.

## A-2. API 키와 환경변수

### 할 일

- [x] 공공데이터포털 마이페이지에서 기존 세 API의 승인 상태와 서비스키 확인
- [x] Swagger와 Backend smoke로 기존 세 API를 최소 한 번 직접 호출
- [x] 인코딩 키와 디코딩 키 사용 방식 확인
- [x] 백엔드 `.env`에 실제 키 저장
- [x] `.env.example`에는 변수명과 예시값만 기록
- [x] Git 추적 대상에 `.env`가 포함되지 않는지 확인
- [x] 현재 Git diff와 추적 파일에 API 키 원문이 없는지 재검증
- [ ] 다국어 네 서비스의 활용 신청·승인과 실호출 검증

### 권장 환경변수

```env
TOUR_API_KEY=replace_me
TOUR_API_BASE_URL=https://apis.data.go.kr/B551011/KorService2
RELATED_TOUR_API_BASE_URL=https://apis.data.go.kr/B551011/TarRlteTarService1
DATALAB_API_BASE_URL=https://apis.data.go.kr/B551011/DataLabService
EXTERNAL_API_TIMEOUT_MS=8000
TOUR_CACHE_TTL_HOURS=24
```

### 기존 세 API 완료 기준

- 실제 키가 코드와 문서에 노출되지 않는다.
- 세 API에서 성공 응답을 받는다.
- 실패 응답의 HTTP 상태, 공공데이터 응답 코드, 메시지를 확인할 수 있다.

다국어 관광정보의 별도 성공 기준과 미완료 항목은 [외부 관광 API 검증 체크리스트](./API_VALIDATION_CHECKLIST.md)의 다국어 관광정보 절에서 관리한다.

## A-3. 외부 API 공통 클라이언트

### 권장 파일 구조

```text
backend/src/
├─ config/
│  └─ externalApis.js
├─ services/
│  ├─ publicDataClient.js
│  ├─ tourApiService.js
│  ├─ relatedTourApiService.js
│  └─ dataLabService.js
└─ utils/
   ├─ externalApiError.js
   └─ normalizeTourData.js
```

### 공통 클라이언트가 담당할 것

- [x] 서비스키와 공통 쿼리 파라미터 주입
- [x] `_type=json`, 페이지 번호, 페이지 크기 등 기본값 관리
- [x] 연결 및 응답 타임아웃 처리
- [x] 네트워크 오류와 공공데이터 업무 오류를 구분
- [x] 재시도 가능한 오류만 제한적으로 재시도
- [x] 요청 URL에서 서비스키를 마스킹한 로그 생성
- [x] 빈 `items`, 단일 객체, 배열 응답 차이 정규화
- [x] 외부 API 오류를 내부 API의 일관된 오류 형태로 변환
- [x] 테스트에서 실제 외부 호출을 대체할 수 있도록 서비스 경계 분리

### 하지 말아야 할 것

- 컨트롤러마다 서비스키와 URL을 직접 작성하지 않는다.
- 무조건 재시도하지 않는다. 잘못된 파라미터나 인증 오류는 재시도해도 해결되지 않는다.
- 외부 API 응답 전체를 가공 없이 Flutter에 전달하지 않는다.
- 서비스키가 포함된 전체 URL을 로그로 남기지 않는다.

## A-4. 국문 관광정보 API 구현 순서

### 1단계 — 코드·분류 기준

- [x] `areaCode2`: 기존 관광 지역 코드 확보(목록·검색 필터에서는 폐기 예정)
- [x] `ldongCode2`: 코드 조회 모드와 정규화 구현·fixture 검증 (`lDongListYn=N` live 재검증은 타임아웃으로 보류)
- [x] `lclsSystmCode2`: 신분류체계 코드 확보
- [x] 내부 문화 카테고리 10종과 신분류체계 코드 매핑표 작성
- [x] 매핑되지 않는 장소와 복수 문화에 해당하는 장소의 처리 규칙 정의

### 2단계 — 목록·검색

- [x] `areaBasedList2`: 지역별 장소 목록
- [ ] `locationBasedList2`: 좌표·반경 기반 장소 후보
- [x] `searchKeyword2`: 장소 검색과 코스 빌더 자동완성
- [x] 페이지네이션과 최대 조회량 정책 결정

### 3단계 — 상세·이미지

- [x] `detailCommon2`: 이름, 주소, 좌표, 개요 등
- [x] `detailIntro2`: 콘텐츠 유형별 운영 정보
- [x] `detailInfo2`: 선택 호출 메서드와 반복 상세정보 정규화
- [x] `detailImage2`: 대표·추가 이미지
- [ ] 이미지가 없는 장소의 디자인 fallback 정의

### 첫 번째 수직 기능 목표

**`통영 × 문학`을 선택했을 때 실제 TourAPI의 관광지가 Flutter 카드에 표시되고 코스에 담기는 것**을 첫 완료 목표로 잡는다.

이 목표가 끝나기 전에는 전국 데이터 전체 수집이나 P2 API에 손대지 않는다.

## A-5. 연관 관광지 API

### 할 일

- [x] 지역 기반 연관 관광지 응답 정규화
- [x] 키워드 기반 연관 관광지 응답 정규화
- [x] 결과의 관광지·음식·숙박 카테고리 보존
- [x] 해시형 식별자는 TourAPI `contentId`와 직접 연결하지 않도록 분리
- [x] 정규화된 이름과 같은 법정동이 모두 일치할 때만 보조 매핑
- [x] 검증된 기준 연월 `202503`과 환경변수 갱신 정책 기록
- [x] 차량 이동 기반 데이터라는 한계를 API/문서에 과장 없이 반영
- [x] 승인된 제한 smoke test로 실제 교차 매핑 확인

### 활용 위치

- 장소 상세의 `연관 방문 장소`
- 코스 빌더의 다음 장소 후보
- RAG가 코스를 변형할 때 사용할 후보군

## A-6. 지역별 방문자 수 API

### 할 일

- [x] 광역·기초지자체별 조회 파라미터 확인
- [x] 날짜 단위와 검증된 기준일 고정 정책 확인
- [x] 기준일과 7일 전 방문자 추이를 내부 형식으로 정규화
- [x] 동일 날짜·동일 조회 단위 재요청을 DataLab 전용 MySQL 캐시에 저장
- [x] 방문자 수를 관광객 수와 동일하게 표현하지 않도록 계약 문구 정의
- [x] 초기 지역 문화점수 40/30/30 정규화 방식 합의
- [x] 승인된 제한 smoke test 실행 — `20260723`·`20260716`이 모두 0건이라 최근 유효일과 갱신 지연은 미확인 위험으로 기록

### 초기 지역 문화점수 권장 운영

```text
초기 단계:
장소 밀도 40% + 방문자 추이 30% + 큐레이션 30%

사용자 데이터 축적 후:
장소 밀도 40% + 방문자 추이 30% + 코스/Fork 활동 20% + 큐레이션 10%
```

사용자 활동 데이터가 없는 초기 서비스에서 활동량을 억지로 0점 처리하지 않는다. 초기에는 큐레이션 비중으로 대체하고, 데이터가 쌓이면 계획서의 원래 비율로 전환한다.

## A-7. 내부 표준 장소 모델

외부 API의 필드명을 앱 전체에 퍼뜨리지 않고 다음과 같은 내부 모델로 변환한다.

```json
{
  "contentId": "string",
  "contentTypeId": "string",
  "title": "string",
  "overview": "string",
  "areaCode": "string",
  "sigunguCode": "string",
  "lDongRegnCd": "string",
  "lDongSignguCd": "string",
  "regionName": "string",
  "address": "string",
  "latitude": 0.0,
  "longitude": 0.0,
  "tel": "string|null",
  "openTime": "string|null",
  "restDate": "string|null",
  "imageUrl": "string|null",
  "thumbnailUrl": "string|null",
  "lclsSystmCodes": [],
  "cultures": [],
  "source": "TOUR_API",
  "sourceUpdatedAt": "ISO-8601|null",
  "cachedAt": "ISO-8601"
}
```

### 데이터 규칙

- `contentId`는 TourAPI 원본 ID를 문자열로 보존한다.
- 기존 관광 지역 코드와 현행 법정동 코드를 같은 필드에 섞지 않는다. 새 목록·검색 요청은 법정동 코드를 사용한다.
- 전화번호·운영시간·휴무일은 없을 수 있으므로 nullable로 처리한다.
- HTML이 포함된 개요는 안전하게 정리한 뒤 저장·표시한다.
- 이미지가 없다고 장소를 제거하지 않는다.
- `cultures`는 외부 원본이 아니라 내부 매핑 결과임을 구분한다.
- 원본 갱신 시각과 캐시 시각을 분리한다.

## A-8. MySQL 캐시

### 협업 필요

수민님은 일반 MySQL 구조와 CRUD를 담당하고, 나는 캐시에 들어갈 외부 데이터 필드와 갱신 로직을 담당한다. 테이블을 혼자 확정하지 말고 먼저 스키마를 공유한다.

### 확정된 저장 구조

```text
places_cache
- content_id (PK)
- content_type_id
- title
- l_dong_regn_cd
- l_dong_signgu_cd
- cultures_json
- summary_json
- detail_json
- source_updated_at
- summary_cached_at / summary_expires_at
- detail_cached_at / detail_expires_at

place_query_cache
- cache_key (정규화된 공개 검색 조건의 SHA-256)
- operation
- request_json
- content_ids_json
- pagination_json
- cached_at / expires_at
```

목록 갱신이 기존 상세 JSON을 지우지 않도록 요약과 상세의 저장·만료 시각을 분리한다. 검색 결과는 장소 요약 upsert와 같은 트랜잭션에서 저장한다.

### 캐시 동작

```text
1. 내부 API 요청
2. 캐시 조회
3. 유효한 캐시가 있으면 반환
4. 없거나 만료됐으면 외부 API 호출
5. 정규화 후 upsert
6. 새 데이터 반환
7. 외부 장애 시 허용 범위 안에서 오래된 캐시 반환
```

기본 fresh TTL은 24시간이고 stale은 저장 시점부터 7일 미만일 때만 허용한다. MySQL 장애는 TourAPI 직통으로 우회하고 30초 동안 DB 재접속을 억제한다. 동일 프로세스의 같은 키 갱신은 single-flight로 합친다. 공개 body는 유지하고 `X-Cache-Status` 헤더로 상태를 표시한다.

### 완료 기준

- [x] 같은 장소·검색 조건의 반복 조회가 불필요한 외부 호출을 만들지 않는다.
- [x] 캐시 만료 후 새 데이터로 갱신된다.
- [x] 외부 API 장애 시 허용 기간 안의 기존 데이터로 핵심 화면을 유지할 수 있다.
- [x] MySQL 장애 시 TourAPI 직통으로 공개 API를 유지한다.
- [x] 로컬 MySQL 8.4.11에서 schema·migration·최소 권한 연결과 실제 캐시 저장을 검증한다.
- [ ] 캐시를 삭제해도 TourAPI에서 다시 만들 수 있는지 통합 환경에서 확인한다.

구현 세부사항은 [TourAPI 장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md)을 따른다. 자동 테스트는 외부 서비스 없이 실행하고, 별도의 수동 실환경 검증에서 로컬 MySQL 연결과 TourAPI 기반 캐시 저장을 확인했다. 배포 DB의 migration·삭제 후 재구축 검증은 R18에 남긴다.

## A-9. 내부 API 교체 순서

- [x] `GET /places/search`: 하드코딩 검색을 TourAPI/캐시 검색으로 교체
- [x] `GET /places/:id`: 공통·소개·이미지 상세 결합
- [x] `GET /places/:id/related`: 연관 관광지 데이터 연결
- [x] `GET /regions/:code/spots?culture=`: 지역×문화 필터 적용
- [x] `GET /cultures/:id/regions`: 장소 밀도·방문자 추이 반영

각 API는 기존 Flutter 모델을 깨지 않도록 현재 응답과 새 응답의 차이를 먼저 수민님에게 공유한다.

## A-10. API 품질·보안·비용 체크

- [ ] API별 성공·실패·캐시 적중 횟수 기록
- [x] 외부 호출 타임아웃 설정
- [x] 페이지 크기 상한 설정
- [x] 사용자 입력을 그대로 외부 쿼리에 전달하지 않도록 길이·형식 검증
- [x] 서비스키 마스킹
- [x] 동일 프로세스의 동일 요청 중복 호출 방지
- [ ] 개발 환경에서 과도한 전체 데이터 수집 금지
- [x] Qdrant 인덱싱은 완료 batch의 문서 hash를 재사용해 실패 후 재실행 비용 제한
- [ ] 공공데이터 이미지 이용조건과 출처 표기 필요 여부 확인

---

# Part B. RAG 및 AI Backend

## B-1. 목표 아키텍처

```text
MySQL places_cache (원본)
        ↓ 인덱싱 작업
검색 문서 생성
        ↓ 임베딩
Qdrant Collection (검색 인덱스)
        ↑ 사용자 요청 임베딩
지역·문화·조건 필터 + 유사도 검색
        ↓ Top-K 장소
OpenRouter LLM
        ↓ 구조화된 JSON
POST /ai/transform
        ↓
Flutter diff 미리보기 → 적용/취소
```

### 비용 최소화 원칙

- MySQL에 상세 원본을 저장하고 Qdrant에는 벡터와 검색에 필요한 최소 payload만 저장한다.
- 개발 중에는 Mock 모드를 유지하되, 실제 검색 검증 단계에서는 Mock 문서를 사용하지 않는다.
- Qdrant Cloud 무료 클러스터로 시작한다.
- OpenRouter의 저비용 다국어 `baai/bge-m3`를 1024차원으로 사용하되, R16에서 Mock/live 평가 계약을 분리한 뒤 실제 품질을 검증한다.
- 무료 단일 공급자 모델의 가용성보다 변경분만 재임베딩하는 재현 가능한 저비용 계약을 우선한다.
- LLM 호출은 모든 화면 조회가 아니라 사용자가 `AI 변형`을 요청했을 때만 수행한다.
- 동일 입력·동일 코스에 대한 단기 결과 캐시 가능성을 검토한다.
- 프롬프트에 관광지 전체 JSON을 넣지 않고 검색된 최소 문맥만 전달한다.

## B-2. 현재 코드에서 정리할 차이

- [x] `vectorStore.js`의 `supabaseSearch` TODO를 Qdrant 검색 어댑터로 교체
- [x] 새 의존성 없이 기존 native `fetch` 기반 Qdrant REST 클라이언트를 컬렉션·인덱싱 작업까지 확장
- [x] Anthropic 직접 SDK를 OpenRouter 호출 방식으로 교체
- [x] `ANTHROPIC_API_KEY` 중심 설정을 `OPENROUTER_API_KEY` 중심으로 변경
- [x] `USE_MOCK_RAG`는 정확히 `false`일 때만 실서비스를 사용하고 기본 테스트는 강제로 Mock 유지
- [ ] `/ai/chat`을 유지할지, `/ai/transform`으로 완전히 전환할지 수민님과 합의
- [x] 계획서의 핵심인 `/ai/transform` 구현
- [x] Flutter `AiRepository`와 변경 전·후 미리보기의 구조화 계약 기반 연결

## B-3. Qdrant 컬렉션 설계

### 권장 초기 구성

```text
Collection: culturepath_places_v1
Point ID: contentId를 안정적으로 변환한 UUID 또는 별도 deterministic UUID
Vector: 장소 검색 문서의 dense embedding
Distance: 임베딩 모델 권장값에 맞춤
```

### Payload 최소 필드

```json
{
  "contentId": "123456",
  "title": "박경리기념관",
  "regionName": "통영",
  "areaCode": "tongyeong",
  "lDongRegnCd": "48",
  "lDongSignguCd": "220",
  "cultures": ["문학"],
  "contentTypeId": "14",
  "sourceUpdatedAt": "20260801093000",
  "documentVersion": "culturepath-place-v1",
  "documentHash": "sha256...",
  "embeddingModel": "baai/bge-m3"
}
```

### 설계 규칙

- 임베딩 모델을 바꾸면 벡터 차원과 의미공간이 달라지므로 컬렉션 버전을 올리고 전체 재인덱싱한다.
- `regionName`, `areaCode`, `cultures`, `contentTypeId`처럼 필터에 사용할 필드는 payload index를 만든다.
- 상세 설명 전체를 payload에 중복 저장할지 여부는 크기와 응답 속도를 측정한 뒤 결정한다.
- Qdrant 데이터는 삭제돼도 MySQL에서 재생성할 수 있어야 한다.
- 무료 클러스터 비활성 삭제에 대비해 인덱싱 명령 하나로 복구 가능하게 만든다.

## B-4. 검색 문서 생성

### 장소당 기본 문서 예시

```text
[장소명] 박경리기념관
[지역] 경상남도 통영시
[문화] 문학
[유형] 문화시설
[설명] 박경리 작가의 생애와 작품 세계를 소개하는 기념관...
[이용정보] 운영시간 ..., 휴무일 ...
[특징] 실내 관람, 문학 기행, 인근 연관 장소 ...
```

### 할 일

- [x] 장소별 검색 문서 템플릿 작성
- [x] 상류 TourAPI 정규화 후 제어문자와 불필요한 공백 제거
- [x] 결측값을 사실처럼 채우지 않도록 처리
- [x] 문화 카테고리 매핑 결과 포함
- [ ] 연관 관광지를 검색 문서에 넣을지 별도 payload로 둘지 비교
- [x] 초기 계약은 장소당 문서·벡터 하나로 고정
- [x] 문서 내용 해시를 저장해 변경된 장소만 재임베딩
- [x] 전체 성공 후 명시적 `--prune`으로 삭제된 장소를 Qdrant에서도 제거

## B-5. 인덱싱 파이프라인

### 필요한 명령 또는 스크립트

```text
npm run rag:index        # 전체 또는 변경분 인덱싱
npm run rag:index -- --dry-run --limit=20
npm run rag:index -- --prune
```

### 처리 흐름

- [x] MySQL에서 cursor 기반 인덱싱 대상 조회
- [x] 검색 문서 생성
- [x] OpenRouter batch 임베딩 코드 구현
- [x] Qdrant batch upsert 코드 구현
- [x] 처리·임베딩·스킵·삭제 건수와 입력 토큰 출력
- [x] 완료 batch의 hash 비교로 실패 후 안전하게 재실행
- [x] 같은 작업을 재실행해도 중복 point가 생기지 않도록 멱등성 보장
- [x] 문서 버전과 임베딩 모델 기록

구체적인 실행·삭제 안전장치와 payload는 [Qdrant 장소 인덱싱 계약](./QDRANT_PLACE_INDEXING_CONTRACT.md)을 따른다.

## B-6. 검색 전략

### 1차 검색

1. 사용자 요청에서 지역·문화·조건 추출
2. 명시된 지역과 문화는 Qdrant payload 필터로 강제
3. 나머지 의미는 벡터 유사도로 검색
4. Top-K 후보 반환
5. 유효하지 않은 장소와 중복 장소 제거
6. MySQL에서 최신 상세정보 재조회

### 초기 파라미터

- 기본 `topK`: 8, 최대 10
- 지역이 명시됐으면 지역 필터 적용
- 문화가 명시됐으면 문화 필터 적용
- 명시적으로 전달된 TourAPI 콘텐츠 유형만 allowlist 검증 후 필터 적용
- 결과가 3개 미만이어도 필터를 자동으로 해제하지 않고 부족 상태를 진단한다.
- `QDRANT_SCORE_THRESHOLD`는 live 평가 전에는 비워 두고 threshold sweep 결과로 확정한다.
- 우천·동행·이동성·반려동물·식이 조건은 구조화 근거가 없으면 hard filter로 단정하지 않는다.

### 2차 고도화 후보

- Dense 의미 검색 + Sparse 키워드 검색의 하이브리드 검색
- 인기도·거리·영업 여부를 반영한 재정렬
- 연관 관광지 데이터를 이용한 다음 장소 후보 확장
- 사용자 코스·Fork·완주 데이터를 이용한 개인화

고도화는 기본 Dense 검색과 필터가 평가 세트를 통과한 후 진행한다.

## B-7. `/ai/transform` 요청 계약

### 권장 요청 예시

```json
{
  "courseId": 42,
  "request": "비 오는 날 부모님과 당일치기 실내 코스로 바꿔줘",
  "constraints": {
    "days": 1,
    "weather": "rain",
    "companions": ["parents"],
    "mobility": "low",
    "dietary": [],
    "startRegion": "통영"
  }
}
```

### 검증 규칙

- [x] `request` 빈 문자열 금지 및 길이 제한
- [x] `courseId`로 서버 코스를 다시 조회하고 공개 여부·현재 사용자 권한 확인
- [x] 클라이언트 `currentTracks`를 신뢰하지 않고 `courseId`로 서버 코스와 장소를 재조회
- [ ] 허용된 제약 값과 자유 텍스트의 경계 정의
- [x] 최대 장소 수와 최대 대화·요청 크기 제한
- [x] 프롬프트 명령 삽입을 데이터와 지시문 분리로 완화

## B-8. `/ai/transform` 응답 계약

### 권장 응답 예시

```json
{
  "course": {
    "id": 42,
    "title": "통영 문학 당일 코스",
    "description": "원본 설명",
    "tracks": [
      {
        "trackNumber": 1,
        "places": [
          { "contentId": "123456", "title": "박경리기념관" }
        ]
      }
    ]
  },
  "summary": "실내 여부를 검증할 수 없어 원본 코스를 유지했습니다.",
  "explanation": "실내 여부를 검증할 수 없어 원본 코스를 유지했습니다.",
  "sources": [],
  "warnings": ["장소별 실내 여부 데이터가 없습니다."],
  "usage": {
    "model": "google/gemini-2.5-flash-lite",
    "inputTokens": 0,
    "outputTokens": 0
  },
  "mock": false
}
```

### 응답 원칙

- LLM이 생성한 장소명을 그대로 신뢰하지 않고 `contentId`가 검색 후보에 있는지 검증한다.
- 운영시간·휴무일·거리처럼 변동되거나 계산이 필요한 정보는 원본 데이터 또는 별도 로직으로 검증한다.
- 변경 이유는 사용자에게 보여줄 수 있는 짧은 문장으로 제공한다.
- 결과를 즉시 DB에 덮어쓰지 않고 사용자가 `적용`을 눌렀을 때만 저장한다.
- 원본 코스는 변형 미리보기 단계에서 보존한다.
- 내부 모델 출력의 `status`는 공개 응답에 추가하지 않아 기존 Flutter 파서를 유지한다.
- 검증할 수 없는 핵심 조건은 원본 코스를 유지하고 `warnings`에 이유를 기록한다.

## B-9. OpenRouter 연동

### 할 일

- [x] `OPENROUTER_API_KEY` 환경변수 추가
- [x] 개발·운영 모델명을 환경변수로 분리
- [x] 타임아웃과 최대 출력 토큰 설정
- [x] `google/gemini-2.5-flash-lite`와 strict JSON Schema 사용
- [x] 모델 응답 JSON 파싱 실패 처리
- [x] 429, 5xx, 타임아웃을 내부 오류로 정규화
- [x] 입력·출력 토큰 기록과 기본 1,600 출력 토큰 상한 적용
- [ ] 운영 환경에서 Mock 응답이 노출되지 않도록 배포 설정 검증
- [x] 모델 교체 시 비즈니스 로직을 수정하지 않도록 `llmService` 인터페이스 유지

### 프롬프트 구성

```text
System: 역할, 허용 범위, JSON 출력 규칙
Policy: 검색 결과 밖의 장소 생성 금지, 불확실성 표시
Context: Qdrant에서 검색하고 MySQL로 검증한 장소만 삽입
Course: 현재 코스 구조
Constraints: 기간·날씨·동행·식이·이동 조건
User Request: 사용자의 원문
```

## B-10. RAG 평가 세트

황찬우 소유의 35개 고정 질문 `culturepath-rag-eval-v1`을 저장소에 두고 코드 변경 전·후
Mock 결과를 비교한다. 실제 TourAPI title·culture와 정답 계약이 다르므로 이 fixture를 그대로
live 합격 기준으로 사용하지 않는다. R16에서 `contentId` 중심 live fixture를 별도로 확정한 뒤
승인된 `--live` 평가를 실행한다.

### 평가 범주

- 지역+문화 명시: `통영 문학 당일치기`
- 문화만 명시: `독립서점 중심 여행`
- 지역만 명시: `강릉에서 조용한 문화 코스`
- 날씨: `비 오는 날 실내 코스`
- 동행: `부모님`, `아이`, `혼자`, `반려동물`
- 일정: `반나절`, `당일`, `1박 2일`
- 식이: 채식, 알레르기 등
- 충돌 조건: 장소 부족, 지역과 문화 후보 없음
- 공격적 입력: 외부 지시 무시 요구, 과도한 길이, 잘못된 ID

### 평가 항목

| 항목 | 확인 기준 |
| --- | --- |
| 검색 적합성 | 지역·문화·조건에 맞는 장소가 상위에 있는가 |
| 근거성 | 제안한 장소가 검색 문맥과 실제 DB에 존재하는가 |
| 제약 준수 | 기간·날씨·동행 조건을 반영했는가 |
| 코스 유효성 | 중복·누락 없이 순서가 유효한가 |
| 설명 품질 | 변경 이유가 짧고 이해 가능한가 |
| 안정성 | 같은 입력에서 구조가 깨지지 않는가 |
| 비용 | 불필요하게 긴 문맥과 출력을 사용하지 않는가 |

기존 Mock 회귀의 초기 검색 기준은 Hit@8 0.80 이상, MRR@8 0.50 이상, routing·hard filter
1.00이다. live MySQL 원본 비율은 1.00을 요구하되 Hit/MRR 정답과 title·alias 판정은 R16에서
확정한다. 지연시간 p50·p95와 임베딩 입력 토큰은 기록하되 R17 전에는 hard gate로 사용하지 않는다.

## B-11. RAG 완료 기준

- [ ] Mock 문서가 아닌 TourAPI 기반 장소를 검색한다.
- [x] Qdrant가 비어 있으면 명확한 오류를 반환한다.
- [x] 지역·문화·명시적 콘텐츠 유형 필터가 AND 조건으로 적용된다.
- [x] `/ai/transform` 내부 모델 응답을 strict JSON Schema와 Backend 검증으로 제한한다.
- [x] 존재하지 않는 장소를 결과에 포함하지 않는다.
- [x] 사용자가 적용하기 전 원본 코스를 변경하지 않는다.
- [ ] live 평가 세트 결과와 대표 실패 사례를 문서로 남긴다.
- [x] 검색 요청별 임베딩 모델·입력 토큰·지연시간을 확인할 수 있다.
- [x] Qdrant 전체 재인덱싱이 가능하다.

---

# Part C. Frontend 디자인

## C-1. 디자인 목표

사용자가 처음부터 지역을 고르는 일반 여행 앱이 아니라, **문화를 고르고 지역과 장소를 발견한 뒤 코스로 엮는 흐름**을 한눈에 이해하도록 만든다.

브랜드 무드는 다음 키워드를 유지한다.

- 책
- 잉크
- 종이
- 골목
- 서가
- 따뜻함
- 문학적 감성
- 음악 셋리스트 같은 코스 흐름

## C-2. 현재 Flutter UI 감사

새 디자인을 만들기 전에 현재 구현을 화면별로 캡처하고 다음을 확인한다.

- [ ] 홈의 문화 카테고리가 가장 중요한 진입점으로 보이는가
- [ ] 시즌 배너가 핵심 탐색을 방해하지 않는가
- [ ] 지역 순위와 선정 이유가 이해되는가
- [ ] 관광지 카드에서 이미지·운영시간·주소·담기 행동의 위계가 적절한가
- [ ] 코스 빌더에서 Track과 장소 순서를 쉽게 구분할 수 있는가
- [ ] Fork 원본 크레딧이 명확한가
- [ ] AI 화면이 단순 상담 채팅이 아니라 코스 변형 도구로 느껴지는가
- [ ] 프로필과 완주 화면이 전체 브랜드와 일관적인가
- [ ] 작은 모바일 화면과 Flutter Web에서 레이아웃이 무너지지 않는가

## C-3. 디자인 시스템

### 색상

| 역할 | 색상 | HEX | 사용 원칙 |
| --- | --- | --- | --- |
| Primary | 딥 네이비 | `#2B2D42` | 주요 제목, 내비게이션, 핵심 버튼 |
| Background | 웜 크림 | `#F7F3E9` | 기본 배경 |
| Accent | 테라코타 | `#C75B39` | 선택, 담기, AI 변화 강조 |
| Accent 2 | 머스타드 골드 | `#D9A441` | Fork, 완주, 특별 상태 |
| Text | 차콜 | `#1E1E1E` | 본문 |

### 타이포그래피

- 제목: Noto Serif KR
- 본문: Pretendard 또는 Noto Sans KR
- 숫자·순위·운영정보는 작은 크기에서도 읽히는 산세리프 우선
- 명조체를 모든 텍스트에 사용하지 않고 브랜드 제목과 핵심 헤드라인에 제한

### Figma 변수·스타일로 만들 항목

- [ ] Color tokens
- [ ] Typography scale
- [ ] Spacing scale
- [ ] Border radius
- [ ] Elevation/shadow
- [ ] Icon size
- [ ] Mobile/Web breakpoint
- [ ] Motion duration과 easing 기본값

## C-4. Figma Make 활용 순서

1. 현재 Flutter 화면 캡처와 서비스 계획서를 참고자료로 준비한다.
2. 한 번에 앱 전체가 아니라 한 사용자 흐름씩 프롬프트를 작성한다.
3. Figma Make가 생성한 시안을 디자인 시스템에 맞춰 수동 정리한다.
4. 실제 Flutter로 구현하기 어려운 효과와 과도한 애니메이션을 제거한다.
5. 컴포넌트와 Variant로 반복 UI를 통합한다.
6. 기본·로딩·빈 상태·오류·선택·비활성 상태를 추가한다.
7. Prototype으로 핵심 전환을 연결한다.
8. 수민님에게 시안을 전달하고 구현 난이도 피드백을 받는다.
9. 구현본을 캡처해 Figma와 비교하고 차이를 기록한다.

### Figma Make 프롬프트에 항상 포함할 내용

- 서비스 목적과 대상 사용자
- 현재 화면의 목적 하나
- 반드시 포함할 정보와 주요 행동
- 브랜드 색상과 타이포그래피
- 모바일 우선 규격
- Flutter로 구현 가능한 컴포넌트 구조
- 필요한 상태 목록
- 접근성 대비와 터치 영역
- 생성하면 안 되는 불필요한 요소

## C-5. 화면 우선순위와 산출물

### P0-1 홈

- [ ] 문화 카테고리 10종 그리드
- [ ] 검색 진입
- [ ] 시즌 추천 배너
- [ ] AI 진입 버튼의 우선순위 조정
- [ ] 하단 내비게이션
- [ ] 로딩·오류·빈 상태

**핵심 질문:** 앱을 처음 본 사용자가 `지역보다 문화를 먼저 선택하는 서비스`임을 5초 안에 이해하는가?

### P0-2 카테고리 상세

- [ ] 선택한 문화의 정체성 표시
- [ ] 유명 지역 순위
- [ ] `왜 유명한지` 한 줄 설명
- [ ] 장소 수와 문화 적합도 점수
- [ ] 리스트·지도 토글 상태
- [ ] 데이터 부족 지역 표시

### P0-3 지역 상세

- [ ] 문화×지역 맥락 유지
- [ ] 실제 TourAPI 이미지 카드
- [ ] 주소·운영시간·휴무일
- [ ] 코스에 담기
- [ ] 함께 가면 좋은 장소
- [ ] 이미지 없음·운영정보 없음 상태
- [ ] 외부 데이터 오류 시 재시도 UX

### P0-4 코스 빌더·상세

- [ ] Track 1→2→3 셋리스트 타임라인
- [ ] 드래그앤드롭 순서 변경
- [ ] 장소 검색·담기·삭제
- [ ] 예상 체류시간
- [ ] Fork 원본 크레딧
- [ ] 저장 전 검증 오류
- [ ] 저장 중·성공·실패 상태

### P1 AI 코스 변형

- [x] 최대 500자 자연어 입력
- [x] 현재 근거로 수행 가능한 빠른 조건 칩
- [x] AI 처리 중 상태와 중복 제출 차단
- [x] 원본과 변경안 비교
- [x] 유지·추가·삭제·Day 이동·순서 변경의 아이콘·라벨 구분
- [x] 전체 변경 요약과 결정론적 변경 위치
- [x] 데이터 부족 경고와 unchanged 상태
- [x] 편집 화면 진입·다른 요청·취소
- [x] 적용 실패와 저장 전 원본 복구 상태

## C-6. 핵심 컴포넌트

- [ ] `CultureCard`
- [ ] `RegionCard`
- [ ] `SpotCard`
- [ ] `TrackTimeline`
- [ ] `CoursePlaceCard`
- [ ] `ForkBadge`
- [ ] `AiConstraintChip`
- [ ] `AiChangeCard`
- [ ] `DiffLegend`
- [ ] `EmptyState`
- [ ] `ErrorState`
- [ ] `SkeletonCard`
- [ ] `PrimaryButton` / `SecondaryButton` / `TextButton`

각 컴포넌트는 최소한 Default, Pressed, Selected, Disabled, Loading 상태를 검토한다.

## C-7. 반응형·접근성

- [ ] 모바일을 기준으로 먼저 완성
- [ ] Flutter Web의 넓은 화면에서 콘텐츠 최대 너비 정의
- [ ] 텍스트 확대 시 잘리지 않는지 확인
- [ ] 색상만으로 AI diff 상태를 구분하지 않고 아이콘·라벨 병행
- [ ] 작은 텍스트와 배경의 대비 확인
- [ ] 터치 영역 최소 크기 확보
- [ ] 이미지에 의미 있는 대체 설명 전달 가능 여부 확인
- [ ] 긴 관광지 이름·주소·운영시간의 줄바꿈 확인
- [ ] 로딩 중 중복 제출 방지 상태 설계

## C-8. 디자인 핸드오프 패키지

수민님에게 화면 이미지만 전달하지 않는다. 다음을 한 묶음으로 제공한다.

- Figma 원본 링크와 페이지 구조
- 디자인 토큰
- 컴포넌트와 Variant
- 화면별 Prototype
- 간격·크기·폰트 명세
- 에셋과 아이콘 출처
- API 필드와 UI 요소 매핑표
- 로딩·빈 상태·오류·비활성 상태
- 애니메이션이 있다면 지속시간과 조건
- 구현 우선순위와 변경 이력

## C-9. 디자인 완료 기준

- [ ] 핵심 사용자 흐름 Prototype이 처음부터 끝까지 연결된다.
- [ ] API의 nullable 필드가 UI에서 안전하게 표현된다.
- [ ] 모든 핵심 화면에 로딩·빈 상태·오류 상태가 있다.
- [ ] AI 변경 전·후와 적용·취소 흐름이 명확하다.
- [ ] 수민님이 별도 추측 없이 Flutter 구현을 시작할 수 있다.
- [ ] Flutter 구현본을 기준으로 최소 1회 디자인 QA를 완료한다.

---

# Part D. 수민님과의 협업 계약

## D-1. 내가 먼저 전달해야 할 것

- [ ] 내부 표준 장소 JSON
- [ ] 각 내부 API의 요청·응답 예시
- [ ] nullable 필드 목록
- [ ] 오류 코드와 사용자 메시지 구분
- [ ] 페이지네이션 방식
- [ ] 캐시 데이터의 최신성 표시 여부
- [x] `/ai/transform` JSON Schema와 기존 Flutter 호환 공개 응답
- [ ] Figma 화면·컴포넌트·상태 명세

## D-2. 수민님에게 받아야 할 것

- [ ] 현재 MySQL 스키마와 변경 절차
- [ ] 코스·트랙의 최종 데이터 모델
- [ ] 인증 미들웨어에서 사용할 사용자 정보 형태
- [ ] Flutter 모델 변경 가능 범위
- [ ] 디자인 구현 가능성 피드백
- [ ] AI 변형 결과를 코스에 적용·저장하는 내부 API 방식

## D-3. 경계 원칙

- 나는 외부 API 인증·호출·가공·캐시 갱신을 담당한다.
- 수민님은 가공된 내부 데이터를 사용하는 일반 CRUD와 Flutter 구현을 담당한다.
- 나는 AI 검색·생성 결과를 제공하고, 수민님은 적용된 결과의 일반 코스 저장 흐름을 연결한다.
- 나는 Figma와 디자인 QA를 담당하고, 수민님은 Flutter 코드 구현을 담당한다.
- 공통 파일을 수정할 때는 변경 전 서로에게 영향을 공유한다.

---

# Part E. 단계별 실행 일정

과거 Phase 번호는 구현 이력을 설명하기 위해 보존한다. 현재 실제 PR 순서와 범위는 로드맵 `R11`~`R18`이 우선한다.

## Phase 0~2 — 완료된 데이터 기반

- [x] Qdrant + OpenRouter 사용 확정
- [ ] 내부 장소 모델 합의
- [x] `/ai/transform` 초안 합의
- [x] 숫자형 TourAPI `contentId` 공통 ID 사용 합의
- [x] 세 API smoke와 공통 외부 API 클라이언트
- [x] TourAPI 목록·상세·연관 장소와 응답 정규화
- [x] `places_cache`·`place_query_cache` 구현과 fake repository 테스트
- [x] 연관 관광지
- [x] 방문자 추이
- [x] 지역 문화점수 초기 버전
- [x] TourAPI stale fallback과 MySQL fail-open
- [x] 로컬 MySQL 8.4.11 schema·migration·최소 권한 연결·캐시 저장
- [x] 코스 좌표 migration·응답과 Day별 Google Map 기반

**남은 계약:** 문화 관련도 R11은 완료됐다. 이미지 필드는 R12, locale별 관광 데이터는 R13에서 Backend·Swagger·Flutter를 함께 맞춘다.

## Phase 3A / R11 — 문화 관련도·정렬 품질

- [x] culture 키워드 결과의 공식 분류·제목 규칙 재검증
- [x] 선택 culture를 무조건 category로 덮어쓰는 동작 제거
- [x] 지역 목록·키워드 후보 병합과 `contentId` 중복 제거
- [x] 근거 강도 기반 안정 정렬과 오탐 제거
- [x] 10개 문화별 정상·오탐·빈 결과 fixture
- [x] `/regions/:code/spots`·`/places/search` 판정 일관성

**완료 결과:** 사용자가 문화를 누르면 관련 없는 장소가 제거되고 근거가 강한 실제 관광지가 먼저 나온다.

## Phase 3B / R12 — 이미지·상세·연관 장소

- [ ] 지역 장소 목록에 `thumbnailUrl`·`imageUrl` 전달
- [ ] Flutter 카드 네트워크 이미지와 placeholder
- [ ] 장소 상세·이미지 갤러리
- [ ] 연관 장소 UI와 상세 이동
- [ ] 빈 URL·실패·긴 제목·느린 네트워크 상태
- [ ] Backend·Swagger·Flutter 모델·테스트 동시 갱신

**완료 결과:** 실제 TourAPI 이미지와 상세정보를 휴대폰에서 안정적으로 탐색한다.

## Phase 3C / R13 — 다국어 관광 데이터

- [ ] 지원 locale과 Backend 전달 계약 (`ko`, `en`, `ja`, `zh`)
- [ ] 공식 `EngService2`·`JpnService2`·`ChsService2`·`ChtService2` 활용 신청과 API·ID·지역 코드 검증
- [ ] 현재 단일 `zh`를 `zh-CN`으로 매핑할지 `zh-CN`·`zh-TW`로 분리할지 확정
- [ ] title·주소·소개·운영정보 locale 모델
- [ ] locale별 캐시 격리와 한국어 fallback
- [ ] canonical `contentId`와 표시 번역 경계
- [ ] 번역 누락·혼합 언어·API 장애 테스트

**완료 결과:** 언어 선택 시 앱 문구뿐 아니라 지원되는 관광지 데이터도 바뀌고, 번역이 없으면 안전하게 한국어로 돌아간다.

## Phase 3D / R14 — Figma Make 정보구조·디자인·지도 P0

- [ ] 최신 Flutter와 서비스 계획서 감사
- [ ] 탐색의 `내 코스 / 커뮤니티 / 인기 코스` 정보구조
- [ ] 홈 빈 공간을 실제 데이터 섹션으로 보완
- [ ] 지역 목록/지도 전환·마커 카드·코스 번호 마커·순서선
- [ ] 색·타입·간격·radius·elevation 토큰
- [ ] 홈·문화·지역·장소·코스·AI P0 화면
- [ ] loading·empty·error·offline/stale·이미지/번역/좌표 없음 상태
- [ ] 반복 카드·pill·gradient·과한 그림자를 줄이는 휴먼 디자인 검수
- [ ] Android 360·390·430dp 명세
- [ ] Figma Make 프롬프트·검수표·수민님 핸드오프

**완료 결과:** 홈·탐색·지도 요구와 실제 데이터 길이를 반영한 구현 가능한 P0 디자인이 확정된다.

## Phase 3E / R15 — Flutter 디자인·지도 적용과 모바일 QA

- [ ] 공통 Theme·컴포넌트와 P0 화면 적용
- [ ] 탐색 내 코스·홈 추가 섹션 구현
- [ ] 지역 목록/지도 전환과 마커·카드 동기화
- [ ] 코스 번호 마커·단순 순서선·Day 표시
- [ ] 접근성·긴 다국어·text scale·safe area 대응
- [ ] Google Maps 키·좌표 결측·지도 실패 상태
- [ ] 360·390·430dp와 Android 실제 기기 QA
- [ ] `flutter analyze`, `flutter test`, release 빌드
- [ ] Figma 명세와 구현 캡처 비교

**완료 결과:** Google Play 대상 휴대폰 화면에서 핵심 흐름과 디자인이 안정적으로 동작한다.

## Phase 4A / R16 — RAG 평가 계약 확정

- [x] 35개 Mock 회귀 fixture와 실행기
- [ ] Mock fixture와 live fixture 분리
- [ ] 실제 TourAPI 기준 `contentId` 중심 정답 계약
- [ ] title alias·canonicalization·`cultures=[]` 판정 규칙
- [ ] 검증된 `CONTENT_ID_OVERRIDES`의 근거·변경 절차
- [ ] live 합격 지표와 fixture 버전 관리

**완료 결과:** 실제 데이터 차이를 모델 실패로 오판하지 않는 평가 기준이 생긴다.

## Phase 4B / R17 — OpenRouter live RAG·AI

- [x] Qdrant 환경·연결 검증
- [x] 컬렉션·payload index·증분 인덱싱 코드
- [x] 지역·문화 필터 검색과 MySQL 원본 재검증 코드
- [x] OpenRouter 어댑터·구조화 `/ai/transform`·후보 ID 검증 코드
- [ ] OpenRouter 모델 이용 가능 여부·가격·예산 확인
- [ ] 장소 1건 실임베딩과 1024차원 확인
- [ ] 제한된 증분 인덱싱과 document hash skip 확인
- [ ] R16 live fixture 전체 검색 평가
- [ ] 실제 `/ai/transform` 최소 smoke와 비용·latency 기록

**완료 결과:** 실제 장소만 사용한 의미 검색과 구조화 코스 변형이 승인된 품질·비용 범위에서 동작한다.

## Phase 5 / R18 — 배포·제출 품질

- [ ] staging/production MySQL과 migration·복구 runbook
- [ ] HTTPS Backend·CORS·환경변수·비밀값 관리
- [ ] Qdrant 재구축과 OpenRouter 예산·rate limit·장애 정책
- [ ] 다국어·이미지·Google Maps 키 제한과 공급자 이용조건
- [ ] Android application ID·서명·권한·release 빌드
- [ ] 대표 지역 실데이터 표본
- [ ] API·RAG 장애 시나리오 검증
- [ ] 비용 상한 검증
- [ ] 대표 평가 결과 정리
- [ ] 발표용 데이터 흐름 그림
- [ ] 시연용 사용자 시나리오
- [ ] 최종 UI 정리

**완료 결과:** 공모전 심사에서 TourAPI 활용, RAG 차별성, 디자인 완성도를 실제 동작으로 설명하고 Google Play 제출을 준비할 수 있다.

---

# Part F. 비용 최소화 운영 원칙

## 저장소별 역할

| 저장소 | 저장 대상 | 비용 통제 방식 |
| --- | --- | --- |
| MySQL | 회원·코스·TourAPI 원본·캐시 | 중복 외부 호출 방지 |
| Qdrant Free | 벡터·`contentId`·검색 필터 | 상세 JSON 중복 최소화 |
| OpenRouter | 저장소가 아닌 호출 게이트웨이 | 변형 요청 시에만 호출 |

## 필수 비용 방어선

- [x] 개발 환경의 기본값은 Mock 또는 명시적 실호출 모드로 설정
- [x] LLM 요청당 입력·출력 토큰 상한
- [x] 사용자별 요청 빈도 제한
- [ ] 같은 버튼 중복 탭 방지
- [x] 검색 Top-K 기본 8·최대 10 상한
- [x] 프롬프트에 불필요한 원본 JSON 제거
- [x] 임베딩은 내용이 바뀐 문서만 재생성하도록 코드 구현
- [x] Qdrant에는 최소 payload만 저장하도록 계약·코드 구현
- [x] 외부 API와 LLM 사용량 로그 기반 구현
- [x] 무료 Qdrant 삭제 시 MySQL에서 재구축 가능한 명령 구현
- [ ] 실제 OpenRouter 호출로 위 비용 방어선 검증

## 비용이 발생하기 시작할 때 판단 순서

1. 캐시 적중률과 중복 호출을 먼저 확인한다.
2. 프롬프트와 출력 길이를 줄인다.
3. 저비용 모델 품질을 평가한다.
4. 배치 임베딩과 변경분 인덱싱을 적용한다.
5. 그래도 부족할 때만 유료 인프라 증설을 검토한다.

---

# Part G. 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| TourAPI 키·파라미터 오류 | 실데이터 연동 지연 | 앱 연결 전 Swagger Smoke Test |
| API 호출 제한 | 화면 실패·개발 중단 | MySQL 캐시, 배치, 호출 로그 |
| 필드 결측 | 카드 깨짐 | nullable 모델과 fallback 디자인 |
| 문화 코드 매핑·키워드 오탐 | 관련 없는 관광지 노출 | 공식 분류·제목 근거 재검증 + culture fixture |
| locale 캐시 충돌 | 언어가 섞이거나 원문 손실 | canonical ID 유지 + locale별 캐시·한국어 fallback |
| 지도 공급자 키·좌표 결측 | 빈 지도·빌드 환경 차이 | 키 제한·명시적 빈 상태·nullable 좌표 |
| 유료 경로 API 과사용 | 지도 비용 증가 | P0는 마커·순서선만 사용, Routes는 별도 승인 |
| Qdrant 무료 클러스터 비활성 삭제 | 검색 인덱스 손실 | MySQL 원본 + 재인덱싱 명령 |
| 한국어 임베딩 품질 부족 | 엉뚱한 장소 검색 | 고정 평가 세트로 모델 비교 |
| LLM 환각 | 존재하지 않는 코스 | 검색 후보 `contentId` 검증 |
| JSON 구조 파손 | Flutter 오류 | Schema 출력 + 서버 검증 + 재시도 |
| 디자인과 Flutter 구현 차이 | 완성도 저하 | 상태 명세 + 구현 캡처 QA |
| 두 사람의 공통 파일 충돌 | 일정 지연 | API·스키마 선합의, 작은 단위 커밋 |

---

# Part H. 지금 바로 실행할 체크리스트

다음 항목을 위에서 아래로 진행한다. 상세 PR 범위는 잔여 PR 로드맵을 따른다.

- [x] 1. R11 문화별 관광지 관련도·정렬 품질
- [ ] 2. R12 관광지 이미지·상세·연관 장소 수직 연결
- [ ] 3. R13 다국어 관광지 데이터 계약과 연결
- [ ] 4. R14 Figma Make 정보구조·P0 디자인·지도 UX 확정
- [ ] 5. R15 Flutter 디자인·지도 적용과 Android 모바일 QA
- [ ] 6. R16 Mock/live RAG 평가 계약 분리
- [ ] 7. R17 OpenRouter 최소 실호출·인덱싱·검색·AI 품질/비용 검증
- [ ] 8. R18 배포 환경·보안·Google Play·공모전 데모 마감

## 다음 사용자 가시 완료 목표

```text
문화 → 지역 → 실제 TourAPI 장소 목록
→ 관련 문화 근거로 오탐 제거·정렬
→ 썸네일 카드
→ 장소 상세와 이미지 갤러리
→ 연관 장소 이동
→ 선택 언어의 관광지 정보
→ 코스 담기
```

## 최종 RAG 완료 목표

```text
“비 오는 날 통영 문학 실내 코스로 바꿔줘”
→ Qdrant가 실제 통영 문학 장소 검색
→ OpenRouter가 구조화된 변경안 생성
→ 존재하는 contentId만 반환
→ Flutter가 변경 전·후 미리보기 표시
→ 사용자가 적용 또는 취소
```

OpenRouter가 준비되기 전까지 이 흐름은 Mock 회귀로만 확인한다. 실제 의미 검색과 실제 AI 생성 완료 표시는 R16 계약 확정과 R17 live 검증 뒤에만 한다.

---

# Part I. 최종 Definition of Done

## API 연동 완료

- 승인받은 세 API가 실제 서비스 흐름에 사용된다.
- 서비스키가 서버 밖으로 노출되지 않는다.
- 외부 응답이 내부 표준 모델로 변환된다.
- 캐시·타임아웃·오류·재시도 정책이 동작한다.
- P0 탐색 화면이 하드코딩 없이 동작한다.

## RAG 완료

- TourAPI 기반 문서가 Qdrant에 인덱싱된다.
- 지역·문화·조건 기반 검색이 검증된다.
- `/ai/transform`이 구조화된 변경안을 반환한다.
- 결과의 모든 장소가 실제 `contentId`로 검증된다.
- 재인덱싱, 오류 처리, 비용 로그가 준비된다.

## FE 디자인 완료

- 핵심 화면과 AI 변형 Prototype이 Figma에 존재한다.
- 디자인 토큰과 컴포넌트 상태가 정의된다.
- 로딩·빈 상태·오류·비활성 상태가 빠짐없이 있다.
- 수민님이 명세를 기준으로 Flutter를 구현할 수 있다.
- 구현본에 대한 디자인 QA를 완료한다.

## 내 담당 전체 완료

**실제 관광 데이터가 안정적으로 수집되고, 그 데이터만 근거로 AI가 코스를 변형하며, 사용자가 디자인된 화면에서 결과를 확인·적용할 수 있을 때 내 담당이 완료된다.**
