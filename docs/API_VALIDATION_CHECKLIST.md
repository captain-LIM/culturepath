# 외부 관광 API 검증 현황 및 체크리스트

> 담당자: 황찬우  
> 최초 작성일: 2026-07-22  
> 목적: CulturePath에서 사용할 공공데이터 API의 Swagger 검증 결과와 남은 확인 항목을 한곳에서 관리한다.

## 1. 상태 표기

- `[x]`: 실제 Swagger 응답으로 성공을 확인함
- `[ ]`: 아직 실제 응답을 확인하지 않음
- `선택`: 당장 필수는 아니지만 구현 전에 확인하면 좋은 기능

인증키 원문, 인증키가 들어간 전체 요청 URL, `.env` 내용은 이 문서와 Git에 기록하지 않는다.

## 2. 전체 현황

| 서비스 | Base URL | 확인 상태 | 다음 필수 확인 |
| --- | --- | --- | --- |
| 국문 관광정보 서비스 | `https://apis.data.go.kr/B551011/KorService2` | 검색·상세·위치·분류 조회 성공 | 콘텐츠 유형별 표본 확대 |
| 관광지별 연관 관광지 정보 | `https://apis.data.go.kr/B551011/TarRlteTarService1` | 두 조회 기능 JSON 성공 | 코드 매핑 방식 확인 |
| 빅데이터 지역별 방문자 수 | `https://apis.data.go.kr/B551011/DataLabService` | 광역·기초지자체 조회 성공 | 최신 제공일·인코딩 확인 |

공통 인증키는 로컬 `backend/.env`의 `TOUR_API_KEY`를 사용한다. Swagger에서는 우선 공공데이터포털의 **Decoding 일반인증키**로 테스트한다.

## 3. 공통 성공 판정 기준

각 호출은 HTTP 상태만 보지 말고 응답 본문까지 확인한다.

- HTTP 상태가 `200`이다.
- `response.header.resultCode`가 `0000`이다.
- `response.header.resultMsg`가 `OK`이다.
- 데이터가 있어야 하는 요청이라면 `totalCount > 0`이고 `items.item`이 존재한다.
- 요청한 `numOfRows`, `pageNo`, 지역·날짜·콘텐츠 유형 조건이 응답에 반영된다.
- 필드가 없거나 빈 문자열인 항목이 있어도 전체 파싱이 실패하지 않는다.
- 한글과 JSON은 UTF-8로 정상 처리된다.

HTTP `200`이어도 `resultCode`가 오류 코드라면 실패로 처리한다.

## 4. 국문 관광정보 서비스 (`KorService2`)

### 4.1 확인 완료

#### [x] `GET /areaCode2` — 지역 코드 조회

2026-07-22 Swagger 호출 성공.

- HTTP `200`
- `resultCode`: `0000`
- `resultMsg`: `OK`
- `numOfRows`: `10`
- `pageNo`: `1`
- `totalCount`: `17`
- 서울 `1`, 인천 `2`, 대전 `3` 등 지역 코드 목록 확인

이 결과로 인증키가 활성화됐고 `KorService2`에 접근할 수 있음을 확인했다.

#### [x] `GET /areaBasedList2` — 지역 기반 관광정보 목록 조회

2026-07-22 Swagger 호출 성공.

- HTTP `200`
- `resultCode`: `0000`
- `resultMsg`: `OK`
- 테스트 조건: `areaCode=1`, `arrange=A`, `numOfRows=10`, `pageNo=1`
- 반환 건수: 요청 페이지 `10개`, 전체 `2,407개`
- 확인된 주요 필드: `contentid`, `contenttypeid`, `title`, `addr1`, `mapx`, `mapy`, `firstimage`, `firstimage2`, `createdtime`, `modifiedtime`, `areacode`, `sigungucode`, 분류 코드

`contentTypeId`를 비워 호출했기 때문에 관광지뿐 아니라 음식점·쇼핑·행사 등이 함께 반환됐다. 관광지만 시험할 때는 `contentTypeId=12`를 사용한다.

첨부 텍스트에서 일부 한글이 깨졌지만 응답 구조와 영문·숫자 필드는 정상이었다. 백엔드 연동 시 UTF-8 응답 처리와 한글 보존을 다시 확인한다.

### 4.2 필수 상세 흐름 확인

아래 호출은 모두 2026-07-22에 로컬 `backend/.env`의 키를 출력하지 않는 Node.js 스크립트로 검증했다.

#### [x] `GET /searchKeyword2` — 키워드 검색

검증에 사용한 값:

```text
numOfRows=10
pageNo=1
MobileOS=ETC
MobileApp=CulturePath
_type=json
arrange=A
keyword=경복궁
areaCode=1
sigunguCode=23
contentTypeId=12
```

- HTTP `200`, `content-type: application/json`
- `resultCode=0000`, `resultMsg=OK`, `totalCount=1`
- 결과: `한복남 경복궁점`
- `contentid=2390314`, `contenttypeid=12`
- 주소, 좌표, 대표 이미지, 한글 UTF-8 보존 확인

`keyword=경복궁` 검색이 정확히 `경복궁`만 반환하는 것은 아니며, 이름에 검색어가 포함된 관광지가 반환될 수 있다.

#### [x] `GET /detailCommon2` — 공통 상세정보

`contentId=2390314`로 검증했다.

- HTTP `200`, JSON, `resultCode=0000`, `totalCount=1`
- 제목, 주소, 좌표, 홈페이지, 개요, 대표 이미지, 지역·분류 코드 확인
- 목록과 상세 응답의 `contentid`, `contenttypeid` 일치
- `overview`와 한글이 UTF-8로 정상 보존됨

현재 `KorService2/detailCommon2`에는 구버전 플래그인 `defaultYN`, `firstImageYN`, `areacodeYN`, `catcodeYN`, `addrinfoYN`, `mapinfoYN`, `overviewYN`을 보내지 않는다. 실제로 `addrinfoYN`을 보내면 HTTP `200`의 최상위 오류 객체로 `resultCode=10`, `INVALID_REQUEST_PARAMETER_ERROR(addrinfoYN)`이 반환됐다. `contentId`만 지정해도 필요한 공통 필드가 모두 반환된다.

#### [x] `GET /detailIntro2` — 콘텐츠 유형별 소개정보

`contentId=2390314`, `contentTypeId=12`로 검증했다.

- HTTP `200`, JSON, `resultCode=0000`, `totalCount=1`
- 운영시간, 휴무일, 주차, 문의처, 반려동물·유모차·신용카드 가능 여부 등 관광지 소개 필드 확인
- 콘텐츠 유형에 따라 필드 구성이 달라지므로 `contentTypeId`를 반드시 함께 보낸다.

#### [x] `GET /detailImage2` — 이미지 정보

- `contentId=2390314`, `imageYN=Y`, `numOfRows=10`, `pageNo=1`로 검증
- HTTP `200`, JSON, `resultCode=0000`
- 추가 이미지 전체 `11개`, 첫 페이지 `10개` 반환
- `originimgurl`, `smallimageurl`, `imgname`, `cpyrhtDivCd`, `serialnum` 확인
- 이미지 URL이 `http`로 반환되므로 Flutter·웹의 혼합 콘텐츠 및 네트워크 보안 설정을 확인해야 함
- `cpyrhtDivCd=Type3` 표본 확인

현재 `KorService2/detailImage2`에는 구버전 `subImageYN`을 보내지 않는다. 보내면 HTTP `200`의 최상위 오류 객체로 `resultCode=10`, `INVALID_REQUEST_PARAMETER_ERROR(subImageYN)`이 반환된다.

#### [x] `GET /detailInfo2` — 반복 상세정보

`contentId=2390314`, `contentTypeId=12`로 검증했다.

- HTTP `200`, JSON, `resultCode=0000`, `totalCount=1`
- `serialnum`, `infoname`, `infotext`, `fldgubun` 확인
- 반복 정보의 한글 UTF-8 보존 확인

### 4.3 선택 확인

- [x] `GET /lclsSystmCode2`: 최상위 신분류 코드 `10개` 반환, 첫 항목 `AC / 숙박`, 한글·JSON 정상
- [x] `GET /locationBasedList2`: 경복궁점 좌표 반경 `1,000m`, 관광지 `12`, 거리순 `E` 조건에서 전체 `31개`, 첫 페이지 `10개` 반환
- [x] `GET /detailInfo2`: 위 필수 상세 흐름에서 검증 완료
- [x] 빈 검색 결과: HTTP `200`, `resultCode=0000`, `totalCount=0`, `items=""`
- [x] 잘못된 `areaCode=999`: HTTP `200`, `resultCode=0000`, `totalCount=0`, `items=""`
- [x] 필수 `keyword` 누락: HTTP `200`, 최상위 오류 객체, `resultCode=11`, `NO_MANDATORY_REQUEST_PARAMETERS_ERROR1(keyword)`
- [ ] `contentTypeId`별 표본 응답 확인: 관광지 `12`, 문화시설 `14`, 축제·행사 `15`, 여행코스 `25`, 레포츠 `28`, 숙박 `32`, 쇼핑 `38`, 음식점 `39`

성공 응답은 `response.header` 아래에 코드가 있지만 일부 검증 오류는 최상위 `resultCode`, `resultMsg`로 반환된다. HTTP 상태만 보거나 한 가지 응답 구조만 가정하지 않는다.

## 5. 관광지별 연관 관광지 정보 (`TarRlteTarService1`)

`KorService2/areaBasedList2`와 이름이 비슷하지만 별도 서비스다. 현재 공식 명세의 경로는 `TarRlteTarService1/areaBasedList1`이다.

이 데이터의 공식 제공 기간은 `2024-05`부터 `2025-04`까지이므로 현재 연월을 넣지 않는다.

### 5.1 필수 확인

#### [x] `GET /areaBasedList1` — 지역 기반 연관 관광지 조회

2026-07-22 Swagger 호출 성공.

- HTTP `200`
- `resultCode`: `0000`
- `resultMsg`: `OK`
- 테스트 조건: `baseYm=202503`, `areaCd=11`, `signguCd=11530`, `numOfRows=10`, `pageNo=1`
- 반환 건수: 요청 페이지 `10개`, 전체 `298개`
- 중심 관광지: `가리봉시장`
- 연관 장소 예시: `서울드래곤시티`, `독산동우시장`, `대림중앙시장`, `구로시장`
- 숙박·관광지·음식 등의 대분류와 호텔·시장·한식 등의 세분류 확인
- `rlteRank`가 `1`부터 `10`까지 순서대로 반환되는 것을 확인

확인된 주요 필드:

```text
baseYm
tAtsCd, tAtsNm
areaCd, areaNm, signguCd, signguNm
rlteTatsCd, rlteTatsNm
rlteRegnCd, rlteRegnNm
rlteSignguCd, rlteSignguNm
rlteCtgryLclsNm, rlteCtgryMclsNm, rlteCtgrySclsNm
rlteRank
```

`tAtsCd`와 `rlteTatsCd`는 해시 형태이며 `KorService2`의 숫자형 `contentid`와 형식이 다르다. 따라서 같은 ID라고 가정해서 직접 조인하지 않고, 실제 매핑 가능 여부를 별도로 검증해야 한다.

호출에 사용한 값:

```text
pageNo=1
numOfRows=10
MobileOS=ETC
MobileApp=CulturePath
baseYm=202503
areaCd=11
signguCd=11530
_type=json  # Swagger에 항목이 있을 때
```

추가 확인 결과:

- 해시형 `tAtsCd`·`rlteTatsCd`를 `KorService2`의 숫자형 `contentid`로 직접 사용할 수 없음을 확인했다.
- 이름과 연관 법정동 코드로 `searchKeyword2`를 조회한 뒤, 정규화된 제목과 법정동이 모두 같은 결과만 채택한다.
- 데이터가 없는 연월·지역 조합의 응답 형태는 아직 확인하지 않았다.

#### [x] `GET /searchKeyword1` — 키워드 기반 연관 관광지 조회

2026-07-22 Swagger 호출 성공.

- HTTP `200`
- `resultCode`: `0000`
- `resultMsg`: `OK`
- 테스트 조건: `baseYm=202503`, `areaCd=11`, `signguCd=11530`, `keyword=가리봉시장`, `_type=json`, `numOfRows=10`, `pageNo=1`
- 반환 건수: 요청 페이지 `10개`, 전체 `42개`
- `tAtsNm`: `가리봉시장`
- `rlteRank` `1`부터 `10`까지와 연관 장소·지역·카테고리 필드 확인
- `areaBasedList1`과 동일한 중심 관광지 코드 및 상위 연관 결과 확인
- 응답 헤더 `content-type: application/json` 확인

`searchKeyword1`은 키워드 검색이지만 `areaCd`와 `signguCd`도 필수 파라미터다. 백엔드 서비스 메서드와 요청 검증에서 두 지역 코드를 생략하지 않는다.

검증에 사용한 필수 파라미터:

```text
serviceKey=<Decoding 일반인증키>
pageNo=1
numOfRows=10
MobileOS=ETC
MobileApp=CulturePath
baseYm=202503
areaCd=11
signguCd=11530
keyword=가리봉시장
_type=json
```

추가로 확인할 내용:

- 띄어쓰기와 한글 URL 인코딩에 따른 검색 결과 차이

#### [x] `searchKeyword1` → `searchKeyword2` 제한 교차 매핑

2026-07-23 로컬 smoke test 성공. 실제 호출은 자동 재시도 없이 총 4회로 제한했다.

- 연관 관광지 호출: `searchKeyword1` 1회
- TourAPI 후보 조회: 상위 3개에 대한 `searchKeyword2` 3회
- 중심 장소: `가리봉시장`
- `서울드래곤시티`: 엄격한 제목·법정동 조건에서 매핑 제외
- `독산동우시장`: 엄격한 제목·법정동 조건에서 매핑 제외
- `대림중앙시장`: `contentId=2037026`으로 매핑 성공
- 인증키와 전체 요청 URL은 출력하거나 문서에 저장하지 않음

연관 API의 후보가 항상 TourAPI 장소로 연결되는 것은 아니다. 따라서 매핑 실패 후보를 유사 이름만으로 추측하지 않고 제외하며, 공개 응답이 5개보다 적거나 빈 배열일 수 있도록 유지한다.

### 5.2 해석 시 주의사항

- 연관성은 티맵 내비게이션의 차량 이동 데이터를 기반으로 한다.
- 실제 동반 방문자 수나 도보 이동 관계와 동일하다고 해석하지 않는다.
- UI에서는 단정적인 표현보다 `함께 가기 좋은 장소` 또는 `연관 방문 장소`처럼 사용한다.

## 6. 빅데이터 지역별 방문자 수 (`DataLabService`)

### 6.1 필수 확인

#### [x] `GET /metcoRegnVisitrDDList` — 광역지자체 방문자 수

2026-07-22 Swagger 및 직접 호출 성공.

- Swagger 기본 호출: HTTP `200`, XML, `resultCode=0000`, 전체 `51개`
- `_type=json` 직접 추가 호출: HTTP `200`, `content-type: application/json`, `resultCode=0000`, 전체 `51개`
- 테스트 날짜: `20210513`
- 광역지자체별로 현지인·외지인·외국인 3개 구분이 반환됨
- `17개 광역지자체 × 3개 방문자 구분 = 51개` 확인
- 실제 주요 필드: `areaCode`, `areaNm`, `daywkDivCd`, `daywkDivNm`, `touDivCd`, `touDivNm`, `touNum`, `baseYmd`

이 Swagger에는 `_type` 입력란이 없지만 API 자체는 JSON을 지원한다. 백엔드에서는 요청 URL에 `_type=json`을 직접 추가한다.

검증에 사용한 값:

```text
numOfRows=100
pageNo=1
MobileOS=ETC
MobileApp=CulturePath
startYmd=20210513
endYmd=20210513
_type=json  # 백엔드 또는 직접 호출에서 수동으로 추가
```

추가로 확인할 내용:

- 최근 제공 가능 날짜와 데이터 갱신 지연 기간

#### [x] `GET /locgoRegnVisitrDDList` — 기초지자체 방문자 수

2026-07-22 Swagger 및 직접 호출 성공.

- Swagger 기본 호출: HTTP `200`, XML, `resultCode=0000`, 요청 페이지 `10개`, 전체 `772개`
- `_type=json` 직접 추가 호출: HTTP `200`, `content-type: application/json`, `resultCode=0000`, 전체 `772개`
- 테스트 날짜: `20210513`
- 종로구·중구·용산구·성동구 등의 기초지자체 데이터 확인
- 기초지자체별로 현지인·외지인·외국인 3개 행이 반환됨
- 실제 주요 필드: `signguCode`, `signguNm`, `daywkDivCd`, `daywkDivNm`, `touDivCd`, `touDivNm`, `touNum`, `baseYmd`
- `touNum`은 정수가 아닌 소수로 반환될 수 있음

광역 조회와 마찬가지로 Swagger에는 `_type` 입력란이 없지만, 요청 URL에 `_type=json`을 직접 추가하면 JSON이 반환된다.

직접 JSON 호출을 확인한 PowerShell 클라이언트에서는 한글이 깨져 보였다. XML 응답의 한글은 정상이었으므로 Node.js 클라이언트 구현 시 응답 바이트를 UTF-8로 해석해 `signguNm`이 보존되는지 다시 확인한다.

추가로 확인할 내용:

- 응답에 별도 상위 광역지자체 필드가 없으므로 `signguCode`와 내부 지역 코드표의 연결 방식
- 페이지 크기가 전체 결과를 담기에 충분한지
- 광역과 기초지자체 수치를 임의로 더하지 않아야 한다는 데이터 제약
- Node.js JSON 호출에서 `signguNm` 한글이 UTF-8로 정상 보존되는지

### 6.2 해석 시 주의사항

- 이 API의 `방문자`는 정확한 방문 목적을 알 수 없어 `관광객`과 같은 의미가 아니다.
- 방문자 수는 일자별 순방문자 수다. 한 사람이 2박 3일 머물면 날짜별로 집계되어 총 3명처럼 나타날 수 있다.
- 광역지자체와 기초지자체는 집계 기준이 다르므로 두 값을 임의로 합산하지 않는다.
- CulturePath의 지역 점수에는 원본 수치보다 기간별 증감률이나 정규화된 지표를 사용하는 방안을 우선 검토한다.

## 7. Swagger 검증 후 백엔드에서 다시 확인할 항목

Swagger 성공은 인증과 원본 API 동작만 확인한 것이다. 실제 연동 완료 전에는 다음도 확인해야 한다.

- [x] Node.js 공통 클라이언트에서 세 서비스 모두 호출 성공
- [x] `serviceKey` 이중 URL 인코딩 방지
- [x] 연결 및 응답 타임아웃 적용
- [x] 공공데이터 응답의 `header`, `body`, `items.item` 형태 정규화
- [x] `item`이 단일 객체 또는 배열인 경우 모두 처리
- [x] 빈 문자열·빈 객체·누락된 `items` 처리
- [x] 한글 UTF-8 보존
- [x] 외부 API 원문을 그대로 Flutter로 넘기지 않고 내부 모델로 변환
- [x] 로그에서 `serviceKey`와 전체 요청 URL 마스킹
- [x] 동일 조건 호출 2단계 MySQL 캐시와 프로세스 내 single-flight 적용
  - fake repository·mock TourAPI 자동 테스트 완료
  - 실제 MySQL 8 DDL·upsert·인덱스와 다중 인스턴스 중복 호출은 배포 전 별도 검증
- [x] 내부 `500`과 외부 API `502`·`503`·`504`, 재시도 가능 여부를 구분한 명확한 오류 응답 제공

2026-07-22 Node.js 공통 클라이언트 smoke test에서 아래 대표 요청을 각각 1회 실행했다.

- `KorService2/areaCode2`: `resultCode=0000`, 한글 보존 확인
- `TarRlteTarService1/areaBasedList1`: `resultCode=0000`, 한글 보존 확인
- `DataLabService/metcoRegnVisitrDDList`: `resultCode=0000`, 한글 보존 확인

테스트 출력에는 서비스키와 전체 요청 URL을 기록하지 않았다. 타임아웃, 최대 1회 제한 재시도, 응답 형태 정규화와 키 인코딩은 실제 호출과 별도로 fixture 기반 단위 테스트에서 검증했다.

2026-07-22 TourAPI 목록·검색 서비스 계층에서 추가로 확인했다.

- `lclsSystmCode2`: `resultCode=0000`, 10개, 한글 보존
- `areaBasedList2`: 통영 코드 `36/17`, `resultCode=0000`, 전체 196개
- `searchKeyword2`: `박경리`, 통영 `36/17`, `contentTypeId=14` 조건에서 정상 빈 결과
- 목록 항목을 nullable 필드와 복수 `cultures`를 갖는 내부 `PlaceSummary`로 변환

코드 리뷰에서 공식 명세를 재확인한 결과 `areaCode`·`sigunguCode`는 미사용·삭제 예정이고 `lDongRegnCd`·`lDongSignguCd`로 대체됐다. 위 호출은 게이트웨이의 구 파라미터 호환 결과로만 기록하며, 서비스 구현과 내부 모델은 기존 관광 지역 코드와 법정동 코드를 구분하고 새 요청에는 법정동 코드만 사용한다.

2026-07-23 승인된 4회 한도에서 현행 법정동 흐름을 추가 확인했다.

- `ldongCode2` 최초 호출은 성공 응답 뒤 응답 모드 차이로 애플리케이션 정규화가 실패했다.
- 공식 변경 공지에 따라 코드 조회 요청에 `lDongListYn=N`을 명시하도록 수정했다.
- 수정 후 `ldongCode2` 호출은 8초 타임아웃이 발생했고 호출 한도 때문에 재시도하지 않았다.
- `areaBasedList2`: `48/220`, `resultCode=0000`, 첫 페이지 1개, 전체 434개, 한글 보존.
- `searchKeyword2`: `48/220`, `박경리`, `contentTypeId=14`, `resultCode=0000`, 1개, 한글 보존.

서비스키와 전체 요청 URL은 출력하지 않았고 smoke test의 자동 재시도는 비활성화했다. 현행 목록·검색은 live 검증 완료, `ldongCode2`는 공식 명세와 fixture 검증만 완료된 상태다.

## 8. 다음 실행 순서

세 공공데이터 서비스의 공통 클라이언트, TourAPI 현행 법정동 기반 목록·검색과 상세 원본 응답은 검증됐다. `ldongCode2` 코드 조회 모드는 공식 명세와 fixture 테스트를 반영했지만 실제 재검증은 타임아웃과 승인 호출 한도 때문에 남아 있다.

1. [x] 공통 HTTP 클라이언트와 환경설정 모듈을 구현한다.
2. [x] 성공·빈 결과·최상위 오류 객체를 하나의 내부 응답 또는 오류 형식으로 정규화한다.
3. [x] 현행 법정동 파라미터로 `areaBasedList2`와 `searchKeyword2` 실제 호출을 검증한다.
4. [ ] 다음 승인 시 `ldongCode2?lDongListYn=N` 실제 호출을 다시 검증한다.
5. [x] `searchKeyword2 → 상세 API` 서비스 흐름과 공개 `/places` 계약을 구현한다.
6. 연관 관광지의 해시 ID와 TourAPI 숫자형 `contentid` 매핑 전략을 정한다.
7. DataLab의 `areaCode`·`signguCode`를 내부 지역 모델과 매핑한다.
8. 캐시, 타임아웃, 호출량 제한, 키 마스킹을 적용한다.
9. 필요할 때 나머지 `contentTypeId`의 소개·반복정보 표본을 추가 검증한다.

## 9. 공식 참고자료

- [한국관광공사 국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do)
- [한국관광공사 관광지별 연관 관광지 정보](https://www.data.go.kr/data/15128560/openapi.do)
- [한국관광공사 빅데이터 지역별 방문자 수](https://www.data.go.kr/data/15101972/openapi.do)

공식 명세가 변경되면 이 문서보다 공공데이터포털의 현재 Swagger와 변경 공지를 우선하고, 확인된 새 경로를 이 문서에 반영한다.
