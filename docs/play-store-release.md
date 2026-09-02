# Google Play 출시 준비 체크리스트

`따라가방` (applicationId: `com.culturepath.frontend`) 안드로이드 출시용 정리.
코드로 이미 반영한 항목은 ✅, 사람이 콘솔/외부에서 해야 하는 항목은 ⬜.

---

## 1. 빌드 · 서명

- ✅ `android/app/build.gradle.kts`에 release signingConfig 추가. 업로드 키가 없거나 불완전하면 release 빌드는 실패.
- ✅ CI가 매 실행마다 폐기용 JKS와 `key.properties`를 만들고 `bundleRelease` AAB를 빌드한 뒤 `jarsigner`로 서명과 `CulturePath CI` 인증서를 검증. debug 서명 폴백을 사용하지 않음.
- ✅ `android/key.properties.example` 템플릿 추가. `.gitignore`에 `key.properties`, `*.jks` 이미 포함.
- ⬜ **업로드 키스토어 생성 후 안전한 곳에 백업** (분실 시 앱 업데이트 영구 불가):
  ```
  keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
  ```
  `android/` 아래 두고, `key.properties.example`를 복사해 `android/key.properties` 작성.
- ⬜ Play Console에서 **Play 앱 서명(Play App Signing)** 등록 (업로드 키 → 구글이 배포 서명 키 관리).
- ✅ 임시 CI 업로드 키를 사용하는 AAB 빌드 경로 검증: `flutter build appbundle --release` → `build/app/outputs/bundle/release/app-release.aab`.
- ⬜ 실제 운영 업로드 키와 로컬 `key.properties`를 사용하는 최종 AAB 수동 빌드·서명 인증서 확인.
- ✅ **targetSdk 확인 완료**: Flutter 3.41.9(CI 고정) 기준 병합 매니페스트가 `minSdkVersion=24 / targetSdkVersion=36 / compileSdk=36`. Play의 API 35+ 요건 충족. (`flutter build appbundle --release` 검증 통과.)
- ⬜ 릴리스 빌드 실기기 스모크 테스트: 로그인(이메일/구글), 지도, AI 채팅, 코스 저장/공유, 4개 언어 전환.

## 2. 앱 내 기능 및 Play 정책 대응

- ✅ **개인정보처리방침 · 이용약관 · 문의 링크**: `내 정보` 화면(게스트/로그인 모두)에 노출. Railway 운영 URL과 `culturepath.support@gmail.com` 반영.
- ✅ **AI 답변 신고 수단** (생성형 AI 정책): AI 어시스턴트 말풍선을 길게 눌러 사유를 입력하면 앱 내부 API로 접수되고 moderation DB에 저장.
- ✅ **AI 부정확성 고지**: AI 화면 입력창 위 상시 문구.
- ✅ **위치 권한 사전 안내**: 지도 화면에서 시스템 권한 팝업 전에 사용 목적 설명 다이얼로그, 거부해도 지도는 동작.
- ✅ **계정 삭제**: 앱 내 회원 탈퇴 + 서버 데이터 삭제 + 이메일 확인 기반 `/account-deletion` 외부 직접 삭제 폼 구현. `mailto:`는 수동 요청용 보조 경로로 유지.
- ✅ `lib/core/app_info.dart`에 운영 개인정보처리방침·약관 URL과 지원 이메일 반영.
- ⬜ **공개 코스 UGC 출시 차단 항목(별도 후속 PR)**: 공개 콘텐츠 생성 전 이용약관 동의, 공개 코스·작성자 신고, 사용자 차단 기능. PR #27 범위에서는 구현하지 않으며 Play 제출 전 완료해야 함.

## 3. 개인정보처리방침 · 약관

- ✅ 개인정보처리방침: `backend/public/privacy-policy/index.html`. 계정·활동·AI 신고·기술정보, 위치의 기기 내 처리, Google/Railway/OpenRouter, 보유·삭제 기준과 외부 삭제 경로를 한/영으로 명시.
- ✅ 이용약관: `backend/public/terms/index.html`. UGC 라이선스·금지행위·AI 면책·준거법을 한/영으로 명시.
- ✅ Railway 운영 HTTPS 경로 `/privacy-policy`, `/terms`에서 공개하도록 백엔드 라우트 추가.
- ⬜ Play Console → 앱 콘텐츠 → 개인정보처리방침 URL 입력.

## 4. Play Console — 앱 콘텐츠 / 데이터 안전

- ⬜ **데이터 안전(Data safety) 양식**:
  - 수집: 이메일, 이름(닉네임), 사용자 ID, 앱 활동(생성 콘텐츠), 앱 정보 및 성능(진단 로그), 기기/기타 ID, (위치 FINE 유지 시) 위치.
  - 전송 중 암호화됨: **예** (HTTPS 강제 — `api_client.dart`가 release에서 HTTP 차단).
  - 데이터 삭제 요청 경로 제공: **예** (앱 내 탈퇴 + 삭제 URL).
  - 제3자 공유: AI 대화 내용이 AI 벤더로 전송되면 "공유"로 표기 검토.
- ⬜ **광고 없음** 선택 (수익화/포함 SDK 없음).
- ⬜ **콘텐츠 등급 설문(IARC)**: UGC(코스 공유) 있음 → 사용자 상호작용/공유 기능 문항 정직하게. 폭력·성적 콘텐츠 없음.
- ⬜ **타겟 연령층**: 만 14세 미만은 서비스를 이용하거나 가입할 수 없음. Play Console 타겟 연령층 및 법적 문서와 일치시킬 것.
- ⬜ **정부 앱 아님 / 뉴스 앱 아님 / 금융 앱 아님** 등 기본 선언.
- ⬜ **앱 접근 권한**: 리뷰어용 테스트 계정(이메일/비번) 제공 — 백엔드가 상시 가동 중이어야 함. 게스트로 접근 가능한 범위도 명시.
- ⬜ **민감 권한 선언 — 위치**: `ACCESS_FINE_LOCATION` 유지 결정됨. Console 권한 선언 폼에
  "지도에 사용자의 현재 위치를 표시해 코스 장소와의 근접도를 확인. 포그라운드 전용, 백그라운드 위치 미사용, 서버 미전송" 취지로 작성.

## 5. 서드파티 키 · 인증

- ⬜ **Google Maps API 키**: 프로덕션 키를 패키지명 `com.culturepath.frontend` + **릴리스(업로드/배포) SHA-1** 두 개로 제한. `android/local.properties`의 `maps.apiKey`에 주입되는 구조 유지.
- ⬜ **Google Sign-In / OAuth**: `AuthRepository._serverClientId` 사용 중.
  - OAuth 동의 화면을 **프로덕션(게시됨)** 상태로 전환.
  - Play App Signing 등록 후 구글이 발급한 **배포 서명 SHA-1**을 Firebase/GCP OAuth 클라이언트에 추가 (안 하면 스토어 배포본에서 구글 로그인 실패).
  - `google-services.json` 최신본 확인.
- ⬜ `API_BASE_URL`(dart-define)을 프로덕션 HTTPS 주소로 빌드. CI/빌드 스크립트에 반영.

## 6. 스토어 등록정보 (자산)

- ✅ 등록정보 문안 초안: `docs/store-listing.md` — 앱 이름, 짧은/자세한 설명(ko·en), 출시 노트, 카테고리·태그, 실제 이메일·개인정보처리방침 URL 반영.
- ⬜ 앱 아이콘 512×512 PNG (디자인 자산 필요)
- ⬜ 피처 그래픽 1024×500 (디자인 자산 필요)
- ⬜ 폰 스크린샷 2~8장 (권장: 홈·탐색·코스·AI·지도)
- ⬜ 일본어·중국어 등록정보는 선택 (초안엔 ko·en만 작성)
- ⬜ Console에 카테고리(여행 및 지역정보) / 연락처 이메일 / 웹사이트(선택) 입력

## 7. 배포 절차

- ✅ PR #28의 `backend/scripts/migrate.js`가 `migrations/*.sql`을 파일명 순으로 적용하고 `schema_migrations`에 체크섬과 적용 이력을 기록. `--strict`는 이미 적용된 파일이 수정됐으면 배포를 실패시킴.
- ✅ Railway production의 저장소 외부 **Pre-deploy Command**가 `npm run migrate -- --strict`로 설정되어 있으며 최근 배포 로그에서 앱 시작 전에 실행됨을 확인. 다른 Railway 환경을 추가하면 동일 설정을 별도로 확인해야 함.
- ✅ PR #27의 계정 삭제 정책 변경은 기존 마이그레이션을 수정하지 않고 새 forward migration으로 FK를 `ON DELETE CASCADE`로 교체.
- ⚠️ 과거 `ON DELETE SET NULL`로 이미 익명화된 AI 신고는 원래 사용자를 신뢰성 있게 식별할 수 없어 자동 삭제하지 않음. 임의 일괄 삭제 금지.
- ✅ 외부 삭제 폼용 `20260902_add_account_deletion_requests.sql`은 기존과 같은 Railway Pre-deploy Command에서 백엔드 시작 전에 자동 적용됨. 배포 순서는 **마이그레이션 성공 → 새 백엔드 시작**이며 `--strict` 실패 시 배포를 중단해야 함.
- ✅ 공모전 운영 SMTP는 `culturepath.support@gmail.com`의 Gmail SMTP로 확정. 개인정보처리방침의 Google LLC 위탁 업무에 계정 삭제 확인 메일 발송을 반영.
- ⬜ 해당 Google 계정의 2단계 인증과 전용 앱 비밀번호를 설정하고 Railway 비밀 변수에 직접 등록. 앱 비밀번호를 저장소·PR·채팅에 공유하지 않음.
- ⬜ Railway에 `ACCOUNT_DELETION_PUBLIC_BASE_URL`과 SMTP 환경 변수를 입력하되, 최초 배포는 `ACCOUNT_DELETION_WEB_FORM_ENABLED=false`로 유지.
- ⬜ 운영 DB에서 `account_deletion_requests` 테이블·FK·인덱스 생성 및 `/account-deletion` 보안 헤더를 확인한 뒤 테스트 계정으로 요청→메일→최종 삭제를 검증.
- ⬜ 위 검증과 모니터링 준비가 끝난 뒤에만 `ACCOUNT_DELETION_WEB_FORM_ENABLED=true`로 전환. 실패 시 false로 되돌리면 앱 내 탈퇴와 `mailto:` 보조 경로는 계속 사용 가능.

- ⬜ 개인 개발자 계정(2023-11 이후 생성)이면 **비공개 테스트 12명 이상 · 14일 연속** 후 프로덕션 액세스 신청 가능 — 일정에 선반영.
- ⬜ 내부 테스트 → 비공개 테스트 → 프로덕션 트랙 순서로 올리며 검증.
- ⬜ 출시 후 versionCode는 매 빌드 증가 (현재 `pubspec.yaml` `version: 1.0.0+1`).

---

## 참고: 코드에서 이미 잘 되어 있는 것

- 릴리스 빌드에서 HTTP API 차단 (`api_client.dart`의 `kReleaseMode` 가드).
- 평문 트래픽 허용(`usesCleartextTraffic`)은 **debug 매니페스트로만** 한정됨.
- adaptive 아이콘 / 스플래시 설정 완료 (`pubspec.yaml`).
- 다국어 문자열 전면 적용 (ko/en/ja/zh).
