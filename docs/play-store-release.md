# Google Play 출시 준비 체크리스트

`따라가방` (applicationId: `com.culturepath.frontend`) 안드로이드 출시용 정리.
코드로 이미 반영한 항목은 ✅, 사람이 콘솔/외부에서 해야 하는 항목은 ⬜.

---

## 1. 빌드 · 서명

- ✅ `android/app/build.gradle.kts`에 release signingConfig 추가. `android/key.properties`가 있으면 그 키로, 없으면 debug 키로 폴백(경고 출력).
- ✅ `android/key.properties.example` 템플릿 추가. `.gitignore`에 `key.properties`, `*.jks` 이미 포함.
- ⬜ **업로드 키스토어 생성 후 안전한 곳에 백업** (분실 시 앱 업데이트 영구 불가):
  ```
  keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
  ```
  `android/` 아래 두고, `key.properties.example`를 복사해 `android/key.properties` 작성.
- ⬜ Play Console에서 **Play 앱 서명(Play App Signing)** 등록 (업로드 키 → 구글이 배포 서명 키 관리).
- ⬜ AAB 빌드: `flutter build appbundle --release` → `build/app/outputs/bundle/release/app-release.aab`
- ⬜ `flutter build appbundle` 후 실제 `targetSdkVersion` 확인. 신규 앱은 **API 35(Android 15) 이상** 필수. 낮으면 Flutter SDK 업그레이드.
- ⬜ 릴리스 빌드 실기기 스모크 테스트: 로그인(이메일/구글), 지도, AI 채팅, 코스 저장/공유, 4개 언어 전환.

## 2. 앱 내 기능 (Play 정책 대응) — 코드 반영 완료

- ✅ **개인정보처리방침 · 이용약관 · 문의 링크**: `내 정보` 화면(게스트/로그인 모두)에 노출. `lib/core/app_info.dart`의 URL·이메일 상수를 **실제 값으로 교체 필요**.
- ✅ **AI 답변 신고 수단** (생성형 AI 정책): AI 어시스턴트 말풍선 길게 누르면 신고 → 메일 발송. 신고 수신 주소는 `AppInfo.supportEmail`.
- ✅ **AI 부정확성 고지**: AI 화면 입력창 위 상시 문구.
- ✅ **위치 권한 사전 안내**: 지도 화면에서 시스템 권한 팝업 전에 사용 목적 설명 다이얼로그, 거부해도 지도는 동작.
- ⬜ **계정 삭제** (팀원 진행 중): 앱 내 회원 탈퇴 + 서버 데이터 삭제 + 웹 삭제 URL. Play 필수.
- ⬜ `lib/core/app_info.dart` 값 교체:
  - `privacyPolicyUrl` — 아래 3번에서 호스팅한 주소
  - `termsOfServiceUrl` — 이용약관 호스팅 주소
  - `supportEmail` — 실제 지원 이메일 (Console 개발자 연락처와 통일 권장)

## 3. 개인정보처리방침 · 약관

- ✅ 초안: `docs/legal/privacy-policy.html` (한/영 토글). `【 】` 표시 항목 채우기:
  개인정보 항목 = 이메일/비밀번호(해시)/닉네임, 구글 계정 식별자, 코스·완주·좋아요 기록, AI 대화 내용, IP·로그, (선택적) 위치.
  위탁: Google(로그인·지도), 클라우드 호스팅사, AI 모델 제공업체.
- ⬜ 시행일, 운영자 정보, 각 보관기간, AI 대화 보관기간, 호스팅사/AI 벤더명, 삭제요청 URL 기입.
- ⬜ 공개 URL로 호스팅 (GitHub Pages / Netlify / 회사 도메인 등). HTTP 아닌 **HTTPS**.
- ⬜ 이용약관 문서 별도 작성 후 호스팅 (UGC 서비스이므로 금지 행위·콘텐츠 소유권·면책 조항 포함 권장).
- ⬜ Play Console → 앱 콘텐츠 → 개인정보처리방침 URL 입력.

## 4. Play Console — 앱 콘텐츠 / 데이터 안전

- ⬜ **데이터 안전(Data safety) 양식**:
  - 수집: 이메일, 이름(닉네임), 사용자 ID, 앱 활동(생성 콘텐츠), 앱 정보 및 성능(진단 로그), 기기/기타 ID, (위치 FINE 유지 시) 위치.
  - 전송 중 암호화됨: **예** (HTTPS 강제 — `api_client.dart`가 release에서 HTTP 차단).
  - 데이터 삭제 요청 경로 제공: **예** (앱 내 탈퇴 + 삭제 URL).
  - 제3자 공유: AI 대화 내용이 AI 벤더로 전송되면 "공유"로 표기 검토.
- ⬜ **광고 없음** 선택 (수익화/포함 SDK 없음).
- ⬜ **콘텐츠 등급 설문(IARC)**: UGC(코스 공유) 있음 → 사용자 상호작용/공유 기능 문항 정직하게. 폭력·성적 콘텐츠 없음.
- ⬜ **타겟 연령층**: 성인 대상 (만 14세 미만 비대상). 개인정보처리방침과 일치시킬 것.
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

- ⬜ 앱 아이콘 512×512 PNG
- ⬜ 피처 그래픽 1024×500
- ⬜ 폰 스크린샷 2~8장 (권장: 홈·탐색·코스·AI·지도)
- ⬜ 짧은 설명(80자), 전체 설명(4000자)
- ⬜ 한국어 + 영어 등록정보 별도 작성 (앱이 ko/en/ja/zh 지원)
- ⬜ 카테고리: 여행 및 지역정보 / 연락처 이메일 / 웹사이트(선택)

## 7. 배포 절차

- ⬜ 개인 개발자 계정(2023-11 이후 생성)이면 **비공개 테스트 12명 이상 · 14일 연속** 후 프로덕션 액세스 신청 가능 — 일정에 선반영.
- ⬜ 내부 테스트 → 비공개 테스트 → 프로덕션 트랙 순서로 올리며 검증.
- ⬜ 출시 후 versionCode는 매 빌드 증가 (현재 `pubspec.yaml` `version: 1.0.0+1`).

---

## 참고: 코드에서 이미 잘 되어 있는 것

- 릴리스 빌드에서 HTTP API 차단 (`api_client.dart`의 `kReleaseMode` 가드).
- 평문 트래픽 허용(`usesCleartextTraffic`)은 **debug 매니페스트로만** 한정됨.
- adaptive 아이콘 / 스플래시 설정 완료 (`pubspec.yaml`).
- 다국어 문자열 전면 적용 (ko/en/ja/zh).
