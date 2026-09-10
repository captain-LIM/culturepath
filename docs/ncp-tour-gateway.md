# NCP TourAPI 중계 운영 가이드

> **기준일:** 2026-09-10
>
> **상태:** production 전환 및 검증 완료

## 1. 운영 구조

Railway의 해외 동적 IP에서 공공데이터포털 TourAPI 호출이 반복적으로 timeout 되는 문제를
줄이기 위해 국문 관광정보 요청을 NCP API Gateway의 한국 리전 경유로 전환했다.

```text
Flutter
→ Railway Backend
→ NCP API Gateway (tourrelay/prod)
→ 한국관광공사 KorService2
→ Backend MySQL 장소 캐시
```

Gateway 장애 시 원본 TourAPI로 자동 우회하지 않는다. 두 경로가 같은 외부 서비스와
일일 할당량을 공유하고, 장애 중 중복 요청을 만들 수 있기 때문이다. 기존 장소 캐시의
fresh/stale/fail-open 정책은 그대로 유지한다.

## 2. 현재 운영값

| 항목 | 값 |
| --- | --- |
| NCP Product ID | `l4cnvpwq85` |
| API 이름 / ID | `tourrelay` / `cemirzlx5z` |
| production Stage ID | `hiurtmzrn1` |
| NCP deployment | `794780` |
| Invoke base URL | `https://l4cnvpwq85.apigw.ntruss.com/tourrelay/prod` |
| Gateway cache | 비활성화 |
| 인증 | API Key 필수 |
| throttle | 메서드 및 Usage Plan 모두 초당 5회 |
| Usage Plan quota | 일 800회, 월 24,800회, `2xx` 응답 집계 |
| 적용 코드 | PR #30, merge commit `24b6ae8` |

기존 `tourrelay/test`, `tour/test`와 관련 리소스는 삭제하거나 변경하지 않았다.

## 3. 완료된 검증

2026-09-10 기준 다음 항목을 확인했다.

- Backend 자동 테스트 485개 통과
- NCP 국문 operation 10개와 페이지·필터 검증을 포함한 smoke suite 통과
- API Key 없음은 401, POST와 미등록 경로는 404로 차단
- Railway 배포 `f8b5f5eb-4f44-4dc4-9aeb-5d4887a3efb0` 성공
- strict migration 실행 결과 적용할 migration 없음
- 외부 HTTPS `/health` 200
- `/places/search`가 `X-Cache-Status: REFRESHED`로 실제 갱신 성공
- `/places/:id`가 `X-Cache-Status: REFRESHED`로 상세·이미지 반환 성공
- 위 호출 뒤 NCP production 집계가 16회에서 20회로 증가
- 활성 배포의 최근 로그에서 retry, stale, `CONFIG_ERROR`, `ExternalApiError`가 모두 0건

NCP의 `2xx` Usage Plan 집계는 전체 TourAPI 일일 한도와 같은 지표가 아니다. 차단 응답이나
원본 서비스의 실패 응답은 NCP 집계 조건에 포함되지 않을 수 있으므로 두 콘솔의 사용량을
구분해 본다.

## 4. Railway 환경 변수

운영 Backend에는 다음 변수만 설정한다. 실제 키 값은 Git, 문서, 채팅, 로그에 남기지 않는다.

```dotenv
NCP_TOUR_GATEWAY_ENABLED=true
NCP_TOUR_GATEWAY_BASE_URL=https://l4cnvpwq85.apigw.ntruss.com/tourrelay/prod
NCP_TOUR_GATEWAY_API_KEY=<Railway secret>
NCP_TOUR_GATEWAY_SERVICES=tour
```

`tour`만 활성화했으므로 현재 KorService2 요청만 Gateway를 사용한다. 영문·일문·중문,
연관 관광지와 DataLab 서비스는 기존 direct 경로를 유지한다. 관리 API의 Access Key와
Secret Key는 Railway에 넣지 않는다.

## 5. 정상 동작 확인

배포나 환경 변수 변경 뒤 다음 순서로 확인한다.

1. Railway deployment가 `SUCCESS`인지 확인한다.
2. startup 로그에서 설정 오류와 migration 실패가 없는지 확인한다.
3. 외부 주소의 `GET /health`가 200인지 확인한다.
4. 이전에 조회하지 않은 검색 조건으로 `/places/search`를 호출한다.
5. 응답의 `X-Cache-Status`가 `REFRESHED`인지 확인한다.
6. 반환된 숫자형 `contentId`로 `/places/:id`를 호출하고 상세를 확인한다.
7. 같은 요청을 다시 호출해 `HIT`인지 확인한다.
8. NCP production 통계의 성공 요청 수가 증가했는지 확인한다.
9. Railway 로그에서 timeout, retry, stale와 외부 API 오류를 확인한다.

캐시 `HIT`만으로는 NCP 경유를 증명할 수 없다. 최소 한 번은 새 검색 조건이나 만료된
데이터의 `REFRESHED` 응답과 NCP 집계 증가를 함께 확인한다.

## 6. 장애 진단

| 증상 | 우선 확인 |
| --- | --- |
| startup `CONFIG_ERROR` | enabled, base URL, API Key, services 값과 공백·따옴표 |
| Gateway 401 | Railway의 API Key 누락·불일치, NCP Stage의 API Key 요구 설정 |
| Gateway 404 | base URL의 API 이름·Stage, 등록된 operation 경로 |
| Gateway 429 | 초당 5회 throttle 또는 일·월 Usage Plan quota |
| TourAPI resultCode 오류 | 공공데이터포털 승인 상태, 원본 일일 한도, query 계약 |
| timeout·`ExternalApiError` | NCP 지표, 원본 TourAPI 상태, Railway 로그의 error layer |
| 계속 `STALE` | 새 갱신 실패 원인을 먼저 확인하고 stale 최대 나이 점검 |

로그에는 service, operation, transport, error layer, 상태 코드, 결과 코드와 처리 시간만
남긴다. API Key, 전체 URL, 검색어 원문과 외부 응답 원문은 기록하지 않는다.

## 7. 롤백

긴급 롤백은 Railway에서 아래 값만 바꾸고 재배포한다.

```dotenv
NCP_TOUR_GATEWAY_ENABLED=false
```

그러면 국문 TourAPI 요청은 기존 direct URL을 사용한다. 원래 문제였던 해외 IP timeout이
재발할 수 있으므로 롤백은 정상화가 아니라 임시 우회다. 부분 롤백은
`NCP_TOUR_GATEWAY_SERVICES`에서 `tour`를 제거하는 방식으로도 가능하다.

NCP API, Stage, Usage Plan 삭제는 롤백 절차에 포함하지 않는다. 삭제가 필요하면 실제
의존성과 최근 트래픽을 별도로 확인하고 명시적인 승인을 받아 수행한다.

## 8. 비용·보안 운영

- NCP API Gateway 캐시는 끄고 Backend MySQL 장소 캐시를 사용한다.
- NCP와 공공데이터포털의 일·월 사용량과 과금 알림을 각각 확인한다.
- API Key와 관리 키를 정기적으로 회전하고 서로 다른 용도로 재사용하지 않는다.
- 관리용 `.codex/ncp-admin.env`는 Git 제외 상태를 유지한다.
- throttle이나 quota를 높이기 전에 캐시 miss 원인과 중복 요청을 먼저 점검한다.
- 여러 Railway 인스턴스의 single-flight는 공유되지 않으므로 수평 확장 시 호출량을 본다.

## 9. 관련 문서

- [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md)
- [TourAPI 장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md)
- [NCP API Gateway 권한 안내](https://guide.ncloud-docs.com/docs/apigw-apigw-etc)
- [NCP API Gateway 요금](https://www.ncloud.com/api-cms/service-product/static/apiGateway)
