# TourAPI 장소 MySQL 캐시 계약

> **담당자:** 황찬우
>
> **적용 범위:** `GET /places/search`, `GET /places/:id`
>
> **목표:** 공개 응답 형식을 바꾸지 않으면서 TourAPI 중복 호출과 장애 영향을 줄인다.

## 1. 구조

장소 캐시는 두 테이블로 나눈다.

| 테이블 | 역할 |
| --- | --- |
| `places_cache` | `contentId`별 정규화된 장소 요약과 상세 JSON, 각각의 저장·만료 시각 보관 |
| `place_query_cache` | 정규화된 검색 조건, 결과 `contentId` 순서, 페이지 정보를 보관 |

목록을 새로 받아도 기존 상세 JSON을 지우지 않고, 상세를 새로 받아도 기존 장소 요약과 요약 TTL을 덮어쓰지 않는다. 상세만 먼저 조회돼 신규 행을 만들 때는 상세 객체에서 `PlaceSummary` 필드만 명시적으로 투영해 `summary_json`에 저장한다. 검색 결과 저장은 장소 요약 upsert와 검색 조건 저장을 하나의 트랜잭션으로 처리해 일부만 반영된 결과가 노출되지 않게 한다.

## 2. 검색 캐시 키

검색 캐시 키는 다음 공개 입력을 정규화한 JSON의 SHA-256 해시다.

- operation: `areaBasedList2` 또는 `searchKeyword2`
- `keyword`
- `lDongRegnCd`, `lDongSignguCd`
- `contentTypeId`
- `lclsSystm1`, `lclsSystm2`, `lclsSystm3`
- `arrange`, `pageNo`, `numOfRows`

문자열의 앞뒤 공백을 제거하고 기본값은 `arrange=A`, `pageNo=1`, `numOfRows=20`으로 통일한다. TourAPI 서비스키, 인증 헤더와 전체 외부 요청 URL은 캐시 키나 DB에 저장하지 않는다.

## 3. 유효 기간

| 설정 | 기본값 | 의미 |
| --- | ---: | --- |
| `PLACE_CACHE_TTL_SECONDS` | `86400` | 저장 후 24시간 동안 fresh |
| `PLACE_CACHE_STALE_MAX_AGE_SECONDS` | `604800` | 저장 시점부터 7일 미만인 데이터만 장애 fallback 허용 |
| `PLACE_CACHE_DB_FAILURE_COOLDOWN_SECONDS` | `30` | DB 장애 감지 후 재접속을 잠시 억제하는 시간 |

stale 최대 나이는 만료 시점부터가 아니라 `cached_at`부터 계산한다. 따라서 기본 정책에서는 저장 후 24시간까지 fresh, 그 이후 7일이 되기 전까지 조건부 stale, 7일 이상이면 사용할 수 없다. stale 최대 나이는 TTL보다 커야 한다.

## 4. 조회 흐름

### 검색

1. 정규화된 요청으로 캐시 키를 만든다.
2. fresh 검색 캐시가 있고 모든 `contentId`의 장소 요약이 존재하면 즉시 반환한다.
3. miss 또는 만료이면 TourAPI를 호출한다.
4. 정상 결과를 장소 요약과 검색 결과 캐시에 저장하고 반환한다.
5. TourAPI가 실패했고 기존 캐시가 stale 허용 기간 안이면 stale 결과를 반환한다.
6. 검증 오류이거나 stale이 없으면 기존 공개 오류 계약을 그대로 적용한다.

TourAPI와 같은 공용 입력 검증·정규화를 캐시 조회보다 먼저 수행한다. 따라서 잘못된 페이지·정렬·지역·분류 값은 warm cache가 있어도 `VALIDATION_ERROR`로 거부된다. 빈 검색 결과도 정상 결과로 캐시한다. 검색 캐시가 가리키는 장소 요약 중 하나라도 없으면 불완전한 결과를 반환하지 않고 cache miss로 취급한다.

### 상세

1. 숫자형 `contentId`의 상세 캐시를 조회한다.
2. fresh 상세 JSON이 있으면 즉시 반환한다.
3. miss 또는 만료이면 TourAPI 상세 조립을 호출하고 정상 결과를 저장한다.
4. TourAPI 장애 시 허용 기간 안의 stale 상세가 있으면 반환한다.
5. 장소 없음은 캐시하지 않아 이후 생성·갱신된 원본을 다시 확인할 수 있게 한다.

잘못된 `contentId`는 DB를 조회하지 않고 기존 TourAPI 서비스의 입력 검증으로 전달한다.

## 5. 장애 정책

| 상황 | 동작 | 상태 |
| --- | --- | --- |
| fresh cache | 외부 호출 없이 반환 | `HIT` |
| TourAPI 정상 갱신 + DB 저장 성공 | 새 결과 반환 | `REFRESHED` |
| TourAPI 장애 + 사용 가능한 stale | 오래된 결과 반환 | `STALE` |
| 캐시 비활성화, DB 장애 또는 저장 실패 | TourAPI 결과를 직접 반환 | `BYPASS` |
| TourAPI 검증 오류 | stale로 숨기지 않고 오류 반환 | 해당 없음 |
| TourAPI 장애 + stale 없음/7일 초과 | 기존 공개 오류 반환 | 해당 없음 |

DB 읽기나 쓰기가 실패하면 공개 API를 중단하지 않는 fail-open 정책을 사용한다. 실패 후 기본 30초 동안 DB 접근을 우회해 매 요청마다 동일한 연결 실패를 반복하지 않는다. 로그에는 작업명과 오류 타입만 남기고 인증키, 요청 URL, 검색어 전체를 남기지 않는다.

동일 Node.js 프로세스에서 같은 키로 동시에 들어온 갱신 요청은 single-flight로 합쳐 한 번만 TourAPI를 호출한다. 이 중복 방지는 여러 서버 인스턴스 사이의 분산 잠금은 제공하지 않는다.

## 6. 공개 API 표시

기존 body와 페이지 헤더는 변경하지 않는다. 다음 응답 헤더만 추가한다.

```text
X-Cache-Status: HIT | REFRESHED | STALE | BYPASS
```

브라우저 앱에서도 읽을 수 있도록 CORS의 exposed header에 `X-Cache-Status`를 포함한다. Swagger/OpenAPI에도 검색과 상세 응답 헤더를 명시한다.

## 7. 환경 변수

```dotenv
PLACE_CACHE_ENABLED=true
PLACE_CACHE_TTL_SECONDS=86400
PLACE_CACHE_STALE_MAX_AGE_SECONDS=604800
PLACE_CACHE_DB_FAILURE_COOLDOWN_SECONDS=30
```

캐시를 일시적으로 끄려면 `PLACE_CACHE_ENABLED=false`를 사용한다. 숫자 설정은 양의 정수 초 단위이며 잘못된 값은 서버 설정 오류로 처리한다.

## 8. 검증 상태와 남은 위험

이번 PR의 자동 테스트는 fake repository와 mock TourAPI만 사용한다.

- fresh hit, miss·refresh, expired refresh, stale fallback
- 검증 오류의 stale 차단
- DB 읽기·쓰기 장애 fail-open과 cooldown
- 동일 키 single-flight와 다른 키 병렬 처리
- 검색 결과 순서 보존과 트랜잭션 rollback
- 목록 갱신 시 상세 JSON 보존
- 설정 검증, 컨트롤러 헤더, Swagger 계약

노트북 자원 제약 때문에 Docker, 실제 MySQL과 live TourAPI는 이번 PR 검증에서 실행하지 않는다. 따라서 배포 전 통합 환경에서 다음을 추가 확인해야 한다.

- MySQL 8.0+에 `backend/schema.sql`이 정상 적용되는지
- JSON·`DATETIME(3)` 저장과 조회, upsert SQL, 트랜잭션 rollback이 실제 드라이버와 일치하는지
- 인덱스 사용과 데이터 증가 시 조회 성능
- 여러 서버 인스턴스에서 동시에 같은 키가 갱신될 때 허용 가능한 외부 호출량인지
- 만료 데이터 정리 작업과 운영 모니터링 정책
