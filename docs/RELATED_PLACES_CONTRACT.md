# 연관 방문 장소 API 계약

> **담당자:** 황찬우
>
> **공개 API:** `GET /places/:id/related`
>
> **원본 서비스:** 한국관광공사 관광지별 연관 관광지 정보 `TarRlteTarService1`

## 1. 목적과 해석 범위

장소 상세에서 현재 장소와 차량 이동 패턴상 연관된 장소를 최대 5개 제공한다. 원본 데이터는 티맵 내비게이션의 차량 이동을 기반으로 하므로 동반 방문, 도보 이동, 개인 취향 또는 품질 평가를 의미하지 않는다.

화면과 문서에서는 **연관 방문 장소**라고 표현한다. RAG 재순위화와 개인화 추천은 이 계약의 범위가 아니다.

## 2. 기준 연월

```dotenv
RELATED_TOUR_BASE_YM=202503
```

공식 데이터 제공 기간 안에서 실제 응답을 확인한 `202503`을 기본값으로 사용한다. 실행 중 최신 월을 자동 탐색하지 않는다. 제공 데이터가 갱신되면 환경변수와 검증 문서를 함께 변경한다.

## 3. 원본 조회

중심 장소의 TourAPI 상세에서 다음 값을 사용한다.

```text
title
lDongRegnCd
lDongSignguCd
```

연관 관광지 API 요청 코드는 다음처럼 만든다.

```text
areaCd = lDongRegnCd
signguCd = lDongRegnCd + lDongSignguCd
keyword = title
```

예를 들어 `lDongRegnCd=48`, `lDongSignguCd=220`이면 `areaCd=48`, `signguCd=48220`이다. `searchKeyword1`은 `areaCd`와 `signguCd`도 필수다.

기준 장소의 법정동 코드가 없으면 외부 연관 관광지 API를 호출하지 않고 빈 배열을 반환한다.

## 4. 해시 ID와 TourAPI 장소 매핑

연관 관광지 API의 `tAtsCd`, `rlteTatsCd`는 해시형이며 TourAPI 숫자형 `contentId`와 직접 연결하지 않는다.

1. `searchKeyword1` 결과를 `rlteRank` 순서로 정렬한다.
2. 상위 5개만 매핑 대상으로 사용한다.
3. 중심 관광지명과 중심 지역 코드가 요청 장소와 일치하는 행만 사용한다.
4. 연관 장소명과 연관 법정동 코드로 TourAPI `searchKeyword2`를 호출한다.
5. 유니코드, 대소문자, 공백과 문장부호를 정규화한 장소명이 같고 법정동 시·도/시·군·구 코드도 같을 때만 채택한다.
6. 자기 자신과 중복 `contentId`를 제거한다.
7. 매핑에 실패한 후보는 더 느슨하게 추측하지 않고 제외한다.

최종 응답은 원본 `rlteRank` 순서를 보존하지만 매핑 실패 때문에 5개보다 적거나 빈 배열일 수 있다.

## 5. 공개 응답

기존 Flutter 호환을 위해 wrapper 없이 `PlaceSummary` 배열을 유지한다.

```json
[
  {
    "contentId": "string",
    "title": "string",
    "address": "string",
    "imageUrl": "string|null",
    "category": "string",
    "region": "string|null"
  }
]
```

- 중심 장소가 없으면 `404 PLACE_NOT_FOUND`
- 숫자형이 아닌 `contentId`는 `400 VALIDATION_ERROR`
- 연관 데이터 또는 안전하게 매핑된 장소가 없으면 `200 []`
- 외부 API 오류는 기존 장소 API의 `502`·`503`·`504` 계약 사용

엄격한 이름·지역 일치가 곧 내부의 높은 매핑 신뢰도 기준이다. 공개 body에는 별도 confidence 필드를 추가하지 않는다.

## 6. 캐시와 호출 상한

최종 매핑된 장소 배열은 R2의 `place_query_cache`를 재사용한다.

- cache operation: `relatedPlaces`
- cache key 입력: `baseYm`, 중심 `contentId`
- fresh TTL: 24시간
- 외부 장애 시 stale 허용: 저장 시점부터 7일 미만
- 응답 헤더: `X-Cache-Status`
- 동일 프로세스·동일 키 갱신: single-flight
- MySQL 장애: 외부 API 직통 fail-open

연관 결과 캐시를 중심 장소 상세보다 먼저 조회한다. fresh cache면 중심 상세와 모든 외부 매핑 호출을 생략하고, 갱신 중 중심 상세 또는 외부 API가 실패하면 사용 가능한 stale 연관 결과를 반환한다. 중심 장소가 실제로 없다는 결과는 negative cache하지 않는다.

연관 후보 갱신 한 번에서 연관 관광지 API는 최대 1회, TourAPI 후보 검색은 최대 5회다. 중심 장소 상세가 캐시되지 않았다면 이 후보 갱신에 앞서 기존 장소 상세 조립 호출이 별도로 발생할 수 있으므로, 이 상한은 중심 상세 조회를 제외한 연관 후보 파이프라인의 상한이다. 매핑된 결과 순서는 `content_ids_json`에 보존한다.

## 7. 검증 기준

기본 자동 테스트는 실제 네트워크를 차단하고 fixture/mock만 사용한다.

- `areaBasedList1`, `searchKeyword1` 입력과 응답 정규화
- 해시 ID를 숫자형 `contentId`로 직접 사용하지 않는지
- 중심 장소명·지역 불일치 제거
- 정확한 이름·법정동 매핑
- 숫자형 `contentId`가 아닌 후보 제거
- 순위 보존, 자기 자신·중복 제거
- 빈 결과, 부분 매핑, 잘못된 입력과 외부 오류
- fresh cache의 중심 상세 조회 생략, stale fallback, bypass 헤더와 공개 배열 계약

승인된 smoke test는 중심 장소 1개와 상위 후보 3개까지만 확인하고 자동 재시도하지 않는다. 인증키와 전체 외부 URL은 출력하거나 문서에 기록하지 않는다.

2026-07-23 `가리봉시장`을 중심으로 정확히 4회 호출해 검증했다. 상위 후보 3개 중 `대림중앙시장(contentId=2037026)`만 제목과 법정동이 모두 일치했고, 나머지 2개는 매핑하지 않았다. 이 결과는 원본 후보가 TourAPI 장소와 항상 일대일로 연결되지 않으며 안전한 부분 매핑이 필요하다는 계약을 확인한다.
