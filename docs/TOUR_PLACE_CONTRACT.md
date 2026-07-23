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
- `culture` 필터는 외부 응답의 현재 페이지를 내부 `cultures`로 후처리한다. 이때 `X-Total-Count`는 필터 후 현재 페이지 건수다.

### `GET /places/:id`

- 숫자형 TourAPI `contentId`를 받는다.
- 장소가 없으면 `404 PLACE_NOT_FOUND`를 반환한다.
- 기본 상세 응답은 `PlaceDetail`에 기존 Flutter 호환 필드 `region`과 빈 문자열 변환을 적용한다.

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

문화 분류는 다음 우선순위의 결정론적 규칙을 사용한다.

1. 검증된 `contentId` 수동 override
2. 공식 신분류 최상위 코드로 가능한 문화 후보 제한
3. 장소명에 대한 보수적인 키워드 규칙
4. 음식 분류 `FD`이면서 세부 키워드가 없으면 `로컬 미식`

한 장소는 여러 문화에 속할 수 있다. 분류 근거가 부족한 장소를 임의로 배정하지 않으며 `cultures=[]`, 호환용 `category="기타"`로 유지한다. 문화 필터에서는 제외할 수 있지만 일반 검색 결과에서는 제거하지 않는다.

현재 `culturesController.js` 시드의 `lcls_codes`는 기존 임시 값이므로 이 매핑의 근거로 사용하지 않는다. 실제 신분류 코드와 검증된 override는 `cultureCategoryMap.js`에서 관리한다.

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
