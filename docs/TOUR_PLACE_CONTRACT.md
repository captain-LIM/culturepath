# TourAPI 장소 목록·검색·상세 계약

이 문서는 `KorService2` 목록·검색·상세 응답을 CulturePath 내부 장소 데이터와 공개 `/places` API로 변환하는 규칙을 정의한다. 내부 모델은 원본 결측값을 `null`로 보존하고, 공개 검색 응답은 기존 Flutter 호환성을 위해 일부 문자열 결측값을 빈 문자열로 변환한다.

## 지원 오퍼레이션

| 오퍼레이션 | 역할 | 주요 제약 |
| --- | --- | --- |
| `lclsSystmCode2` | 신분류 코드 조회 | 페이지 기본 20개, 최대 50개 |
| `ldongCode2` | 법정동 시·도/시·군·구 코드 조회 | 코드 조회 모드 `lDongListYn=N` |
| `areaBasedList2` | 지역별 장소 목록 | `lDongRegnCd` 필수, 정렬 `A/C/D` |
| `searchKeyword2` | 키워드 장소 검색 | `keyword` 필수·최대 100자, 정렬 `A/C/D` |
| `detailCommon2` | 장소 공통 상세 | 숫자형 `contentId` 필수 |
| `detailIntro2` | 콘텐츠 유형별 소개 | `contentId`, `contentTypeId` 필수 |
| `detailImage2` | 장소 이미지 | `imageYN=Y`, `subImageYN` 미사용 |
| `detailInfo2` | 반복 상세정보 | 서비스 메서드는 제공하지만 공개 상세 기본 호출에서는 제외 |

정렬값은 제목순 `A`, 수정일순 `C`, 등록일순 `D`만 허용한다. 페이지는 1부터 시작하며 `numOfRows`는 기본 20, 최대 50이다. `lDongSignguCd`를 사용할 때는 `lDongRegnCd`를 함께 전달한다.

공식 현행 계약은 법정동 코드 `lDongRegnCd`·`lDongSignguCd`를 사용한다. 기존 관광 지역 코드 `areaCode`·`sigunguCode`는 폐기 예정이므로 목록·검색 요청에는 보내지 않는다. `lclsSystm2`에는 `lclsSystm1`, `lclsSystm3`에는 1·2Depth가 모두 필요하며 코드 형식과 상위 prefix를 호출 전에 검증한다.

## 내부 `PlaceSummary`

```json
{
  "contentId": "string",
  "contentTypeId": "string|null",
  "title": "string",
  "overview": null,
  "areaCode": "string|null",
  "sigunguCode": "string|null",
  "lDongRegnCd": "string|null",
  "lDongSignguCd": "string|null",
  "regionName": null,
  "address": "string|null",
  "latitude": 0.0,
  "longitude": 0.0,
  "tel": "string|null",
  "openTime": null,
  "restDate": null,
  "imageUrl": "string|null",
  "thumbnailUrl": "string|null",
  "lclsSystmCodes": ["VE", "VE01", "VE010100"],
  "cultures": ["문학"],
  "category": "문학",
  "source": "TOUR_API",
  "sourceUpdatedAt": "2026-07-22T15:30:45+09:00"
}
```

- `contentId`와 `title`이 없는 원본 항목은 잘못된 외부 응답으로 처리한다.
- 누락된 전화번호, 이미지, 주소, 좌표와 원본 수정 시각은 빈 문자열이 아니라 `null`이다.
- `mapx`는 경도, `mapy`는 위도로 변환하며 유효 범위를 벗어나면 `null`이다.
- 기존 관광 지역 코드와 법정동 코드는 서로 다른 필드로 보존한다. 새 지역 필터는 법정동 코드를 기준으로 한다.
- 목록에서 제공하지 않는 상세 필드는 `null`이고 상세조회 PR에서 채운다.
- `category`는 기존 Flutter 계약을 위한 임시 단일 값이다. 새 코드에서는 `cultures`를 기준으로 사용한다.

## 내부 `PlaceDetail`

`PlaceDetail`은 `PlaceSummary`를 확장한다. `detailCommon2`를 먼저 조회하고, 공통 응답에 있는 `contentTypeId`로 `detailIntro2`를 호출하며 `detailImage2`를 함께 조합한다.

```json
{
  "contentId": "2390314",
  "contentTypeId": "12",
  "title": "장소명",
  "overview": "태그를 제거한 개요|null",
  "openTime": "운영시간|null",
  "restDate": "휴무일|null",
  "homepage": "https://example.com|null",
  "parking": "주차 안내|null",
  "images": [
    {
      "imageUrl": "https://example.com/image.jpg|null",
      "thumbnailUrl": "https://example.com/thumb.jpg|null",
      "name": "이미지명|null",
      "copyrightType": "Type3|null",
      "serialNumber": "1|null"
    }
  ],
  "additionalInfo": []
}
```

- 기본 `GET /places/:id`는 공통·소개·이미지 3종만 호출한다.
- 상세 이미지 조회와 공개 갤러리는 최대 10장이다. 이전 캐시에 더 많은 이미지가 있어도 공개 응답은 10장으로 제한한다.
- `detailInfo2` 메서드와 `additionalInfo` 정규화는 준비하지만 기본 요청에서는 호출하지 않는다.
- 공통 응답의 `contentId`가 요청과 다르거나 식별자가 숫자형이 아니면 외부 응답 오류로 거부한다.
- 소개 또는 이미지 조회가 실패하면 부분 상세를 반환하지 않고 전체 요청을 해당 외부 오류로 실패시킨다.
- 홈페이지와 이미지 URL은 `http`·`https`만 허용한다.
- 개요와 상세 문자열은 HTML 엔티티를 디코딩한 뒤 태그를 제거하고 공백을 정리한다.
- 원본·썸네일 사이의 교차 중복을 포함해 이미지 URL이 중복되거나 안전하지 않으면 제외한다.

## 공개 장소 API

### `GET /places/search`

- `q`가 2자 이상이면 `searchKeyword2`를 호출한다.
- `q`가 없고 `lDongRegnCd`가 있으면 `areaBasedList2`를 호출한다.
- 두 값이 모두 없거나 `q`가 1자이면 외부 호출 없이 `400 VALIDATION_ERROR`를 반환한다.
- 응답 body는 기존 Flutter 호환을 위해 배열을 유지한다.
- 내부에서 `null`인 `address`, `tel`, `openTime`은 공개 응답에서 빈 문자열이다.
- 페이지 정보는 `X-Page-No`, `X-Num-Of-Rows`, `X-Total-Count` 헤더에 담는다.
- `culture`는 허용된 10개 내부 문화명만 받으며 그 외 값은 외부 호출 없이 `400 VALIDATION_ERROR`다.
- `q` 없이 `culture`가 있으면 지역 일반 목록과 첫 문화 검색어를 먼저 조회하고, 엄격한 필터 결과가 요청 개수보다 적을 때만 보조 검색어를 순차 조회한다. 문화별 검색어는 최대 3개다.
- 대표 키워드는 후보를 넓히는 용도일 뿐 분류 근거가 아니다. 합친 장소는 현재 분류 규칙으로 다시 판정해 선택 culture와 일치하는 항목만 반환한다.
- 결과는 `contentId override → 공식 중·소분류 코드 → 제목 규칙` 순으로 정렬하고 같은 근거 안에서는 TourAPI 발견 순서를 유지한다.
- `X-Total-Count`는 엄격한 필터 후 실제 반환 건수다.

### `GET /regions/:code/spots`

- CulturePath 지역 slug와 선택 `culture`, `pageNo`, `numOfRows`로 장소를 조회한다. 기본 20개, 페이지당 최대 50개이며 통합 후보 페이지는 최대 5페이지다.
- 공식 신분류와 일대일 대응되는 `커피·카페`, `공예·공방`, `미술·갤러리`, `음악`, `영화·애니메이션`, `근대 문화유산`은 지역 일반 목록 대신 `lclsSystm1~3` 조건의 `areaBasedList2`를 기본 후보 소스로 사용한다. 기존 문화 검색어도 함께 조회해 TourAPI 분류가 누락된 장소를 보완한다.
- 위 6개 문화의 엄격한 일치 결과가 5개 미만이거나 공식 코드 후보 조회가 실패하면, 같은 법정동의 분류 조건 없는 `areaBasedList2`를 조건부 fallback으로 추가한다. 검증된 결과가 충분한 정상 요청에서는 이 광범위한 조회를 호출하지 않는다.
- 공식 코드 하나로 정확하게 표현할 수 없는 `독립서점·책방`, `문학`, `전통주·양조장`, `로컬 미식`은 기존 지역 일반 목록과 최대 3개의 문화 검색어 후보를 유지하며, 비슷해 보이는 대분류 코드를 억지로 적용하지 않는다.
- 공식 코드, 검색어, 조건부 지역 일반 목록은 어디까지나 후보 수집 수단이다. 모든 후보를 `contentId override → 공식 중·소분류 → 제목 규칙`으로 다시 검증하고 `contentId`로 중복을 제거한다.
- 통합 후보 재조회는 공개 요청 하나가 TourAPI 호출을 무제한 증폭하지 않도록 5페이지로 제한한다. 5페이지에서는 더 먼 upstream 후보가 있더라도 `X-Has-More: false`이며 `X-Next-Page`를 제공하지 않는다.
- 배열 응답은 유지하며 `X-Page-No`, `X-Num-Of-Rows`, `X-Has-More`, 조건부 `X-Next-Page` 헤더를 제공한다. 후속 Flutter 무한 스크롤은 이 계약을 사용한다.
- 선택 culture를 응답 `category`에 덮어쓰지 않고 재분류된 장소의 실제 대표 category를 유지한다.
- 일치 장소가 없으면 가상 seed로 개수를 채우지 않고 `200 []`를 반환한다.
- 문화 필터 후보 중 하나 이상 성공하면 검증된 부분 결과를 반환한다. 모든 후보 조회가 실패하면 가상 `SPOT_MAP`으로 숨기지 않고 공통 `502`·`503`·`504` 오류 계약을 따른다.
- 문화 필터가 없는 기존 요청의 외부 장애 seed fallback은 하위 호환을 위해 R11 범위에서 유지한다.
- 관련도 강도는 내부 정렬에만 사용하며 공개 응답에 숫자로 노출하지 않는다.
- 지역 목록과 키워드 검색의 캐시 상태가 다르면 `STALE → BYPASS → REFRESHED → HIT` 순으로 더 보수적인 상태를 응답 헤더에 사용한다.
- 실제 표본으로 확인한 `AC + 서점/책방`, `EX·VE + 전통주/양조장/소주`는 강한 제목 근거가 함께 있을 때만 허용한다. 행사 대분류 `EV`는 제외한다.
- 전주(완산구·덕진구)와 포항(남구·북구)은 각 구를 별도 조회해 합친다. 시·도 전체 조회로 다른 시·군 장소를 섞지 않는다.
- 각 항목은 목록 원본의 nullable `thumbnailUrl`, `imageUrl`을 포함한다. 목록 카드 때문에 장소별 `detailImage2`를 추가 호출하지 않는다.
- 각 항목은 공개 코스에서 해당 `contentId`가 사용된 코스 수 `publicCourseCount`를 포함한다. 정상적인 미사용은 `0`, 집계 장애는 `null`이며 이 보조 지표는 기존 관련도 순서를 바꾸지 않는다.
- 공개 코스 사용 횟수의 집계·장애·개인정보 계약은 [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md)을 따른다.
- Flutter 이미지·상세·연관 장소 표시 계약은 [관광지 이미지·상세·연관 장소 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md)을 따른다.

### `GET /places/:id`

- 숫자형 TourAPI `contentId`를 받는다.
- 장소가 없으면 `404 PLACE_NOT_FOUND`를 반환한다.
- 기본 상세 응답은 `PlaceDetail`에 기존 Flutter 호환 필드 `region`과 빈 문자열 변환을 적용한다.

### `GET /places/:id/related`

- 숫자형 TourAPI `contentId`를 중심 장소로 사용한다.
- 차량 이동 기반 연관 관광지 상위 5개를 이름과 법정동이 정확히 일치하는 TourAPI 장소로 매핑한다.
- 자기 자신, 중복과 안전하게 매핑되지 않은 후보는 제외한다.
- 기존 Flutter 호환 `PlaceSummary` 배열을 유지하며 결과가 없으면 `200 []`이다.
- 성공 응답은 `X-Cache-Status`를 제공한다.
- 세부 정책은 [연관 방문 장소 API 계약](./RELATED_PLACES_CONTRACT.md)을 따른다.

### 캐시 상태

- 검색·상세·연관 장소 응답 body는 캐시 적용 전 계약을 그대로 유지한다.
- 성공 응답은 `X-Cache-Status` 헤더로 `HIT`, `REFRESHED`, `STALE`, `BYPASS` 중 하나를 제공한다.
- `STALE`은 TourAPI 검증 오류가 아닌 장애가 발생했고 저장 후 7일 미만인 기존 데이터가 있을 때만 사용한다.
- MySQL 장애는 TourAPI 직통으로 우회하며, 상세 404는 캐시하지 않는다.
- 상세 정책은 [TourAPI 장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md)을 따른다.

### 오류 계약

```json
{
  "code": "EXTERNAL_API_TIMEOUT",
  "message": "관광정보 응답 시간이 초과되었습니다.",
  "retryable": true
}
```

| HTTP | 대표 코드 | 의미 |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | 클라이언트 파라미터 오류 |
| `404` | `PLACE_NOT_FOUND` | 장소 없음 |
| `500` | `INTERNAL_ERROR` | 예상하지 못한 Backend 내부 오류 |
| `502` | `EXTERNAL_API_ERROR` | TourAPI 업무·HTTP·응답 오류 |
| `503` | `TOUR_API_UNAVAILABLE` | Backend 외부 API 설정 또는 서비스 사용 불가 |
| `504` | `EXTERNAL_API_TIMEOUT` | TourAPI 타임아웃 |

개발 환경에서는 `/api-docs`로 Swagger UI, `/openapi.json`으로 OpenAPI 3.0 명세를 확인할 수 있다. TourAPI 인증키는 두 문서에 노출하지 않는다.

## 문화 분류

문화 분류와 culture 필터 정렬은 다음 우선순위의 결정론적 규칙을 사용한다.

1. 검증된 `contentId` 수동 override
2. 공식 신분류 중·소분류 코드의 일대일 대응
3. 공식 최상위 코드로 후보를 제한한 장소명 보수 키워드 규칙

한 장소는 여러 문화에 속할 수 있다. 분류 근거가 부족한 장소를 임의로 배정하지 않으며 `cultures=[]`, 호환용 `category="기타"`로 유지한다. 문화 필터에서는 제외할 수 있지만 일반 검색 결과에서는 제거하지 않는다.

분류는 TourAPI 원본의 `lclsSystm1~3`뿐 아니라 정규화된 `PlaceSummary.lclsSystmCodes`에도 동일하게 적용한다. 따라서 MySQL 캐시에서 꺼낸 장소도 현재 규칙으로 재검증할 수 있다. 키워드 검색에 포함됐다는 사실이나 음식 최상위 분류 `FD`만으로 특정 문화를 부여하지 않는다.

현재 `culturesController.js` 시드의 `lcls_codes`는 기존 임시 값이므로 이 매핑의 근거로 사용하지 않는다. 실제 신분류 코드와 검증된 override는 `cultureCategoryMap.js`에서 관리한다.

### AI 여행 챗봇 후보 수집

AI 여행 챗봇도 별도의 벡터 인덱스를 사용하지 않고 이 문서의 장소 검색·문화 분류 계약을
재사용한다.

1. LLM이 strict Schema로 해석하고 Backend가 allowlist·세션 문맥으로 검증한 지역·문화
   조건으로 MySQL의 `places_cache`와 `place_query_cache`를 먼저 조회한다.
2. 캐시 후보가 부족하거나 갱신이 필요할 때만 TourAPI를 호출한다.
3. 공식 신분류 코드로 정확히 대응되는 문화는 `lclsSystm1~3` 조건을 우선한다.
4. 공식 코드 하나로 구분하기 어려운 문화는 기존의 검토된 복수 검색어로 후보를 넓힌다.
5. 어느 방식으로 얻은 후보든 이 절의 결정론적 문화 분류와 지역 경계를 다시 통과해야 한다.
6. LLM은 후보를 검색·추가·재분류하지 않고 Backend가 확정한 후보만 설명한다.

위 흐름은 [AI 기능 개편 계약](./AI_MYSQL_TOURAPI_LLM_TARGET_ARCHITECTURE.md)에 따라 R17
작업 브랜치에 반영됐다. 후보 resolver는 최대 10개를 요청하고, 캐시 서비스의 최신성·
stale·fail-open 계약을 그대로 재사용한다. 지원하지 않는 지역, 모호한 다중 지역과 후보
밖 장소 참조는 외부 호출 전에 거부하거나 재질문한다.

## 2026-07-22 Node.js smoke test

- `lclsSystmCode2`: 성공, 10개, 한글 보존
- `areaBasedList2`: 폐기 예정 호환 파라미터 `areaCode=36`, `sigunguCode=17`로 성공, 전체 196개
- `searchKeyword2`: 폐기 예정 호환 파라미터와 `박경리`, 문화시설 `contentTypeId=14` 조합은 성공 응답이지만 결과 0개

위 실제 호출은 코드 리뷰 전에 수행한 구 파라미터 호환 확인이다. 공식 명세 대조 후 구현은 법정동 코드 `48/220`으로 교체했으며, 합의된 3회 호출 한도를 넘기지 않기 위해 새 파라미터의 실제 재호출은 하지 않았다. 다음 공개 API 연결 PR에서 법정동 코드 조회와 함께 재검증한다. 빈 검색 결과는 호출 실패가 아니며, `박경리` 장소를 문화시설 `14`로 단정하지 않는다.

## 2026-07-23 현행 법정동 smoke test

사용자가 승인한 외부 요청 최대 4회를 재시도 없이 실행했다.

- 1회차 `ldongCode2`: 공공데이터 성공 응답까지 도달했지만 `lDongListYn`을 명시하지 않아 애플리케이션 정규화가 `INVALID_RESPONSE`로 차단했다.
- 공식 변경 공지 확인 후 코드 조회 모드 `lDongListYn=N`을 명시하도록 수정했다.
- 2회차 `ldongCode2`: 8초 타임아웃으로 종료됐다. 호출 한도를 지키기 위해 다시 시도하지 않았으므로 현행 코드 조회의 live 검증은 미완료다.
- 3회차 `areaBasedList2`: `lDongRegnCd=48`, `lDongSignguCd=220`, `resultCode=0000`, 전체 434개, 한글 보존.
- 4회차 `searchKeyword2`: 같은 법정동 코드와 `박경리`, `contentTypeId=14` 조건에서 `resultCode=0000`, 1개, 한글 보존.

따라서 현행 법정동 기반 목록·검색은 검증 완료됐고, `ldongCode2`의 `lDongListYn=N` 정규화는 공식 명세와 fixture 테스트만 통과한 상태다. 다음 live 호출은 새 사용자 승인이 있을 때만 수행한다.

현행 요청 파라미터의 기준은 [공공데이터포털 국문 관광정보 서비스 명세](https://www.data.go.kr/data/15101578/openapi.do)다.
