# NCP 관광정보 중계: 현재 구현과 운영 절차

## 현재 상태

2026-09-10 현재 NCP `tourrelay/prod` 생성과 검증이 완료됐다. Stage ID는 `hiurtmzrn1`, 배포 번호는 `794780`, Invoke base URL은 `https://l4cnvpwq85.apigw.ntruss.com/tourrelay/prod`다. 캐시는 꺼져 있고 API Key가 필수이며, 메서드 및 Usage Plan rate는 초당 5회, 일 800회, 월 24,800회, 집계 조건은 `2xx`다.

- 로컬 prod 검색 2회와 국문 suite 12회가 모두 업무 코드 `0000`으로 성공했다.
- 키 없음은 401/210, POST 및 미등록 경로는 404/300으로 차단됐다.
- 실제 Railway 운영 컨테이너(Node 18.20.8, 배포 `a4721e40-e9ac-48eb-8964-2f773f0ac168`)에서도 prod 검색 2회가 성공했다(0000, 1715~2054ms).
- 검증 후 prod 키 사용량은 일 16회·월 16회로 집계됐다. 차단 응답 3회는 `2xx` 집계에 포함되지 않았다.
- 기존 `tourrelay/test`, `tour/test`, API 리소스는 변경하지 않았다. Railway 파일·환경변수·배포와 Git push도 하지 않았다.
- `scripts/provisionNcpTourProd.js`는 고정 대상과 기존 설정을 검증한 뒤 Stage 생성과 기본 Usage Plan 설정 두 번만 쓴다. 불확실한 쓰기는 재시도하거나 자동 삭제하지 않는다.
- NCP 구성 검증은 완료됐지만 앱의 운영 트래픽 전환은 아직이다. 백엔드 코드 최종 검토와 별도 승인을 거쳐 Railway에 배포·활성화해야 한다.

**최신 완료 결과(2026-09-09): 국문 test Gateway 구성 및 로컬 live 검증 완료.** `tourrelay/test`에 국문 GET 10개를 등록하고 배포 번호 `793804`로 배포했다. 사용자가 수동 생성한 검색 설정은 보존했다. 기존 tour API의 상세 설정 fingerprint도 전후 동일하다.

- 실제 NCP 경유 국문 12회 검사 전부 성공(0000, 120~347ms). 한글, 페이지 1/2, 지역 필터, 위치/코드/상세/이미지를 확인했다.
- 추가 3회 검사: Gateway 키 없는 검색 401, POST 404, 미등록 경로 404로 차단.
- 로컬 backend 테스트 481개 통과. `.env`는 바꾸지 않고 검증 설정을 메모리에서 주입했다.
- 이 test 기록 이후 Railway test/prod 경유 검증과 prod 구성이 완료됐다. 운영 코드 배포/환경변수 적용은 아직 하지 않았다.
- 부모 리소스를 먼저 생성하도록 보완했다. 이전 403의 원인은 부모/권한 변경이 겹쳐 확정되지 않았다.
- `provisionNcpTourTest.js`는 명시적인 `--resume-api-id`로 소유 표시와 기존 설정을 검증한 경우에만 재개한다. 불일치하는 수동 설정을 덮어쓰지 않는다. 범용 자동 복구 도구는 아니다.

## 과거 진행 기록

아래 기록은 문제 재현과 복구 맥락을 위한 과거 이력이다. 위의 2026-09-10 현재 상태가 이전의 '빈 API/권한 중단/검증 전' 설명보다 우선한다.

최신 상태(MANAGER 추가 후): `tourrelay` API(ID `cemirzlx5z`) 생성은 성공했으나 첫 Resource 추가가 HTTP 403 / 코드 10002로 거부됐다. 읽기 전용 확인 결과 새 API에는 빈 루트만 있고 Stage는 없다. 기존 `tour/test/search` 및 Railway는 그대로다. 연결 정책의 적용 범위/제한 확인이 필요하며, 더 높은 관리자 권한을 요구하지 않는다. 아래 이전의 '신규 API 없음' 기록은 이 부분 생성 이전 시점이다. 재개 시 기존 API의 소유/빈 상태를 확인하는 별도 경로가 필요하다.

최신 적용 시도(2026-09-09): 사용자가 test 생성을 승인하여 별도 `scripts/provisionNcpTourTest.js`로 진행했으나, 첫 API 생성 요청이 HTTP 403 / 코드 10011로 거부됐다. 재조회 결과 신규 API는 없고 기존 inventory도 동일하다. 관리 키의 생성 권한/정책 확인이 필요하다. 로컬 테스트는 480개 통과했다. 아래의 최초 구현 상태보다 이 기록이 우선한다.

새 provision 도구는 Product ID와 manifest hash 및 `--apply`가 일치할 때 새 `tourrelay/test`만 구성한다. 기존 API 자동 인수, 삭제, 실패한 쓰기 재시도는 하지 않는다. Stage는 cache TTL 생략(생성 후 검증), 메서드별 throttleRps 2, 고정 TourAPI upstream으로 요청한다. 성공 경로의 실제 생성/배포/live 검증은 권한 문제로 아직 실행하지 못했다. 범용 `ncpGateway.js`는 계속 읽기 전용이다.

권한 재개: Sub Account의 사용자 정의 정책에서 `Change/createAPI`와 연관 조회 액션을 확인한다. 생성 후 세부 구성에는 `Change/updateAPI`와 연관 조회 권한도 필요하며 가능한 경우 신규 API로 대상을 제한한다. `NCP_ADMINISTRATOR`는 필요 없다. `NCP_API_GATEWAY_MANAGER`는 API Gateway 전체 권한이므로 최소 권한 정책을 만들기 어려울 때만 사용자가 범위를 이해하고 별도로 선택한다. [공식 권한 정의](https://guide.ncloud-docs.com/docs/apigw-apigw-etc)

관리 인증 추가 확인(2026-09-09): 입력한 관리 키로 읽기 전용 `inspect`/`plan`이 성공했고, Product가 기존 로컬 테스트 URL과 일치했다. 기존 `tour` API의 `GET /search`, `test` Stage를 확인했으며 신규 `tourrelay/test` 이름 충돌은 없다. 관리 env는 Git 제외 상태다. 쓰기 권한과 상세 query/auth/cache/quota는 아직 검증하지 않았고, NCP 설정 및 Railway 배포는 변경하지 않았다. 아래 인증 준비 절차는 완료했으므로 반복할 필요 없다.

2026-09-09: 로컬 runtime transport, 읽기 전용 관리 도구, manifest, 국문 smoke 및 mock 테스트를 구현했다. 기본값은 direct이며 실제 `.env`, NCP 설정, Railway 변수/배포는 변경하지 않았다.

검증: backend 테스트 474개 통과, 실패 0. 실제 NCP/TourAPI 호출은 기본 테스트에서 차단된다.

아직 전체 전환 완료가 아니다. 관리 인증 준비와 실제 설정 검증이 남았다. `apply`, `deploy`, 완전한 설정 `verify`, 복구용 snapshot 저장은 아직 구현하지 않았으며 CLI는 해당 명령을 거부한다. 현재 inventory fingerprint는 목록 비교용이지 복구 백업/배포 승인 증명이 아니다.

기존 `/tour/test/search`는 페이지 크기가 1로 고정된 연결 확인용 API다. 새 runtime 설정에 사용할 수 없다. 새 API `tourrelay`의 test/prod Stage를 검증한 뒤 연결해야 한다.

## 지금 필요한 관리 인증 준비

1. 한국/VPC 콘솔에서 Sub Account를 열고 작업용 서브 계정을 준비한다.
2. API Gateway 접근을 허용한다. 콘솔 로그인 권한은 작업 방식에 따라 필요한 경우만 준다.
3. 최초 점검에는 `NCP_API_GATEWAY_VIEWER` 또는 필요한 조회 action만 부여한다. `NCP_ADMINISTRATOR`나 전체 인프라 관리자 권한은 주지 않는다.
4. 해당 서브 계정의 Access Key/Secret Key를 발급한다.
5. `.codex/ncp-admin.env`의 아래 항목에 직접 저장한다. 채팅이나 Git에 키를 붙이지 않는다.

```dotenv
NCP_ADMIN_ACCESS_KEY=
NCP_ADMIN_SECRET_KEY=
NCP_GATEWAY_PRODUCT_ID=
NCP_GATEWAY_API_ID=
```

Product ID는 기존 테스트 Invoke URL의 `<product-id>.apigw.ntruss.com` 부분이다. API ID는 선택사항이며 처음에는 비워 두면 해당 Product의 API 목록을 확인한다.

이 파일은 local-only다. 먼저 저장소 루트에서 `git check-ignore .codex/ncp-admin.env`가 성공하는지 확인한다. 관리 키를 `backend/.env`, Railway, Flutter에 넣지 않는다.

조회 권한만으로 변경 작업이 허용되는 것은 아니다. 실제 대상과 변경안을 확인한 뒤 필요한 변경 action을 따로 정한다. `NCP_API_GATEWAY_MANAGER`는 API Gateway 전체 기능 권한이므로 기본으로 요구하지 않는다. 세부 리소스 제한과 연관 필수 action도 확인한다. [공식 권한 안내](https://guide.ncloud-docs.com/docs/apigw-apigw-etc), [서브 계정 안내](https://guide.ncloud-docs.com/docs/subaccount-use)

## 구현된 관리 명령

모든 명령의 작업 디렉터리는 `culturepath/backend`다.

```powershell
# 키와 네트워크 없이 명세/변경 후보 확인
npm.cmd run ncp:gateway -- manifest --services tour --stage test
npm.cmd run ncp:gateway -- plan --offline --services tour --stage test

# 준비한 관리 키로 GET만 수행
npm.cmd run ncp:gateway -- inspect --env-file ../.codex/ncp-admin.env
npm.cmd run ncp:gateway -- plan --env-file ../.codex/ncp-admin.env --services tour --stage test
```

- 관리 endpoint는 공식 API Gateway 관리 origin에 고정된다.
- URL에 실제 전송할 query까지 포함해 서명하며 redirect를 추적하지 않는다.
- API/리소스/Stage 목록만 조회한다. API 키 목록, endpoint body, 전체 headers를 출력하지 않는다.
- API 목록이 불완전하거나 Product가 다르면 실패한다.
- `readyToApply`는 현재 항상 false다. 기존 GET이 있어도 query/auth/cache/quota가 검증됐다고 간주하지 않는다.
- 기존 `tour/test/search`나 다른 리소스를 수정·삭제하는 코드는 없다.

관리 기능 근거: [API 조회](https://api.ncloud-docs.com/docs/apigateway-api-apis), [Resource 목록](https://api.ncloud-docs.com/docs/apigateway-resource-getresourcelist), [서명](https://api.ncloud-docs.com/docs/common-ncpapi).

## runtime 환경변수

```dotenv
NCP_TOUR_GATEWAY_ENABLED=false
NCP_TOUR_GATEWAY_BASE_URL=
NCP_TOUR_GATEWAY_API_KEY=
NCP_TOUR_GATEWAY_SERVICES=tour
```

- 기본 disabled이며 기존 direct를 유지한다.
- enabled일 때 base URL은 `https://<product-id>.apigw.ntruss.com/tourrelay/test` 또는 `/tourrelay/prod`여야 한다.
- query/fragment/userinfo/비표준 port/다른 API 이름/임의 host/path traversal을 거부한다.
- URL과 키가 유효해도 실제 해당 Gateway 설정이 존재하는지는 별도 smoke로 확인한다.
- Gateway 키는 정확히 이 설정으로 선택한 Gateway 요청에만 추가한다.
- 원본 TourAPI base URL과 키는 보존한다. 선택 서비스의 원본 URL이 예상 공식 endpoint와 다르면 실패한다.
- 외국어 전용 키와 기존 공통 키 fallback은 유지한다.
- 활성 서비스 외에는 direct다. 알 수 없는 서비스 이름이나 중복 목록은 거부한다.
- startup에서 활성 설정을 검증하지만 외부 조회는 하지 않는다.

| 서비스 목록 항목 | 대상 | 후보 operation 수 |
| --- | --- | --- |
| tour | KorService2 | 10 |
| tourEng | EngService2 | 6 |
| tourJpn | JpnService2 | 6 |
| tourChs | ChsService2 | 6 |
| relatedTour | TarRlteTarService1 | 2 |
| dataLab | DataLabService | 2 |

runtime과 manifest는 같은 허용 목록을 사용한다. 32개가 코드에 정의되어 있다는 사실은 32개가 클라우드에 배포·검증됐다는 의미가 아니다.

## query 계약과 캐시

Manifest는 명시적 GET, API Key required, fixed upstream, query placeholder를 정의한다. `pageNo`/`numOfRows`는 요청값을 전달한다. prod live 검사에서 한글·페이지·지역 필터·위치·코드·상세·이미지에 사용한 선택 파라미터는 확인됐다. 모든 가능한 선택 파라미터 조합을 전수 검사한 것은 아니므로 Manifest의 `UNVERIFIED_OPTIONAL_SUBSTITUTION` 표시는 그 한계를 기록한다.

원래 캐시 key/TTL/stale/single-flight와 최대 1회 retry를 유지한다. NCP에서 명시적인 quota 소진 코드가 오는 경우 무의미한 retry를 하지 않는다. 요청 중 gateway 실패 뒤 direct를 또 호출하는 자동 fallback은 없다.

## 국문 smoke

```powershell
# preview: 키 파일을 읽지 않고 외부 호출 0회
npm.cmd run ncp:smoke

# 새 tourrelay runtime 변수를 준비한 다음에만 실행
# 키워드 page 1/2, 총 2회, retry 0
npm.cmd run ncp:smoke -- --live --suite search --max-requests 20

# 국문 10개 operation + 페이지/필터 확인, 총 최대 12회
npm.cmd run ncp:smoke -- --live --suite kor --max-requests 20

# 명시적으로 direct 비교가 필요할 때만 별도 실행
npm.cmd run ncp:smoke -- --live --direct --suite search --max-requests 20
```

- 현재 live smoke는 국문만 지원한다. 외국어/연관/통계 전용 smoke는 추가 구현·검증 대상이다.
- `--env-file`로 로컬 파일을 지정할 수 있다. 관리용 키는 필요하지 않다.
- 실제 요청을 하기 전에 예산을 검증한다. 예산은 최대 60이며 retry는 0으로 고정한다.
- 첫 실패에서 중단하고 누적 호출 수와 안전한 코드만 출력한다.
- 페이지 메타데이터를 검사하므로 기존 fixed-size `/search` 동작을 성공으로 처리하지 않는다.
- 실제 서비스 데이터에 따라 0건/페이지 크기 계약이 다르면 검사 실패를 보고한다. 이를 즉시 네트워크 장애로 단정하지 않는다.
- 인증키, 원문 응답, 검색어, 좌표, 전체 URL은 출력하지 않는다.
- 이 스크립트는 DB 캐시를 건드리지 않는다. 단, `--live` 요청은 실제 TourAPI 사용량을 소비한다.

## 비용과 배포

API Gateway cache는 꺼 두고 기존 앱 캐시를 사용한다. VM/NAT/Cloud Functions는 만들지 않는다. API 호출·전송량 무료 구간과 캐시 과금, 크레딧 만료는 실제 계정에서 확인한다. [공식 요금](https://www.ncloud.com/api-cms/service-product/static/apiGateway)

현재 남은 운영 순서:

1. NCP test/prod와 Railway 원격 smoke까지 완료된 현재 상태를 보존한다.
2. 관련 백엔드 변경만 선별해 사용자 승인 후 커밋·push한다.
3. 새 코드가 disabled 상태로 정상 배포됐는지 health와 기존 API로 확인한다.
4. Railway에 prod URL/key/서비스 목록을 준비하고 마지막에 flag를 활성화한다.
5. cache HIT만 보지 말고 실제 upstream 성공과 기존 응답 계약을 확인한다.
6. 안정화 후 필요할 때만 서비스별 별도 검증·승인을 거쳐 확장한다.

## 로그와 롤백

safe 로그는 service/operation/transport/errorLayer/code/httpStatus/resultCode/gatewayErrorCode/elapsedMs만 허용한다. provider 원문 message/cause는 기록하지 않는다. 오류 계층이 불분명하면 unknown이며 stale 응답은 정상 복구의 증거가 아니다.

전체 롤백은 `NCP_TOUR_GATEWAY_ENABLED=false`, 부분 롤백은 목록에서 해당 서비스를 제거한 뒤 Railway 재배포/재시작한다. 기존 base URL과 키가 보존되어 direct로 돌아간다. 원래 direct 장애가 남아 있으면 롤백도 정상 연결을 보장하지 않는다.

Gateway 이전 배포 복원은 실제 deployment ID와 Stage 설정 snapshot을 함께 확인한다. API/키 삭제를 롤백 대신 사용하지 않는다. Git push, 운영 배포, 리소스 삭제는 별도 승인을 거친다.
