# TourAPI 장소 목록·검색 계약

이 문서는 `KorService2` 목록·검색 응답을 CulturePath 내부 장소 데이터로 변환하는 규칙을 정의한다. 현재 단계에서는 Backend 서비스 계층만 다루며 공개 라우트와 Flutter 응답은 변경하지 않는다.

## 지원 오퍼레이션

| 오퍼레이션 | 역할 | 주요 제약 |
| --- | --- | --- |
| `lclsSystmCode2` | 신분류 코드 조회 | 페이지 기본 20개, 최대 50개 |
| `areaBasedList2` | 지역별 장소 목록 | `lDongRegnCd` 필수, 정렬 `A/C/D` |
| `searchKeyword2` | 키워드 장소 검색 | `keyword` 필수·최대 100자, 정렬 `A/C/D` |

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

현행 요청 파라미터의 기준은 [공공데이터포털 국문 관광정보 서비스 명세](https://www.data.go.kr/data/15101578/openapi.do)다.
