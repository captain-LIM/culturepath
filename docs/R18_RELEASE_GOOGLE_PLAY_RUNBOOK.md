# R18 운영 배포·실기기·Google Play 출시 준비 가이드

> **문서 상태:** 실행 전 현행 계획
>
> **기준일:** 2026-08-28
>
> **대상:** CulturePath 팀 공동 작업
>
> **목표:** 현재 구현을 운영 환경에 연결하고 Google Play 비공개 테스트에 제출할 수 있는
> release AAB를 만든 뒤, 정식 출시 심사 조건까지 준비한다.

## 1. 결론과 완료 단계 정의

핵심 사용자 기능은 대부분 구현됐다. 이제 남은 일은 대규모 기능 추가보다 **운영 배포,
release 설정, 개인정보·계정 삭제, 실기기 검증, Play Console 제출**이다.

Backend·MySQL 배포와 휴대전화 실행만 끝났다고 곧바로 정식 출시하는 것은 아니다. 다음 세
단계를 구분한다.

| 단계 | 의미 | 완료 조건 |
| --- | --- | --- |
| G1 운영 통합 준비 | 앱이 실제 Backend·DB·외부 API를 사용 | HTTPS Backend, 운영 MySQL, migration, OpenRouter smoke 통과 |
| G2 비공개 테스트 준비 | Google Play에 테스트용 AAB 업로드 가능 | 최종 package ID, release 서명, 정책 문서, 실기기 핵심 흐름 통과 |
| G3 정식 출시 준비 | production access와 심사 신청 가능 | 비공개 테스트 조건, 스토어 정보, Data safety, 콘텐츠 등급, 잔여 blocker 해결 |

현재 목표는 먼저 **G2 비공개 테스트 제출**이다. 테스트에서 실제 사용자 피드백을 받은 뒤
G3로 진행한다.

## 2. 현재 확인된 상태

### 완료된 기반

- Backend 자동 테스트 332개 통과
- Flutter analyze·test·Android release CI 통과
- TourAPI 실제 호출과 MySQL 장소·검색 캐시 저장 검증 완료
- Qdrant는 제출 전 활성 경로에서 사용하지 않음
- AI 챗봇은 MySQL→TourAPI 후보 resolver와 OpenRouter 설명 계층을 사용
- AI 코스 다듬기는 현재 코스의 기존 장소만 삭제·Day 이동·명시적 순서 변경
- Flutter root 목적지는 `홈 / 탐색 / 만들기 / AI / 내정보` 5개

### 현재 코드에서 확인된 출시 차단 항목

| 항목 | 현재 상태 | 필요한 조치 | 심각도 |
| --- | --- | --- | --- |
| Android application ID | `com.culturepath.frontend`이며 최종 확정 기록 없음 | 최초 Play 앱 생성 전에 소유 가능한 최종 ID 확정 | BLOCKER |
| Release 서명 | release가 debug signing config 사용 | 업로드 키 생성, release signing, Play App Signing 설정 | BLOCKER |
| Target API | `flutter.targetSdkVersion`에 위임 | 생성 AAB가 API 36 이상인지 확인하고 부족하면 상향 | BLOCKER |
| 운영 AI 모드 | `.env.example` 기본값이 `USE_MOCK_AI=true` | 운영 환경은 명시적으로 `USE_MOCK_AI=false`, 응답 `mock=false` 확인 | BLOCKER |
| OpenRouter 실연결 | 자동 테스트 완료, 제한된 live smoke 미완료 | `/ai/chat`, `/ai/transform` 최소 실제 호출 검증 | BLOCKER |
| 회원 탈퇴 | 회원가입·Google 로그인은 있으나 계정 삭제 API·화면 없음 | 앱 내부 탈퇴와 외부 탈퇴 요청 페이지 구현 | BLOCKER |
| 개인정보처리방침 | 앱 내부 진입점과 운영 URL 미확인 | 공개 HTTPS 문서와 앱 내부 링크 제공 | BLOCKER |
| Release Backend 주소 | `API_BASE_URL` 주입 필요 | 실제 HTTPS URL로 release AAB 생성 | BLOCKER |
| Google Maps release 키 | 로컬 `maps.apiKey` 주입 구조 | 최종 package ID와 release SHA 인증서로 키 제한 | BLOCKER |
| 운영 DB migration | 로컬 검증과 운영 적용은 별개 | 운영 DB에 전체 migration 적용·재실행·복구 확인 | BLOCKER |
| 실기기 QA | 웹·CI 중심 검증 완료 | release 설정으로 Android 실기기 핵심 흐름 검증 | BLOCKER |

디자인 추가 개선, 공개 코스 사용 횟수 UI 표시, Qdrant 재도입은 출시 필수 조건이 아니다.
화면이 깨지거나 핵심 행동을 방해하지 않는다면 제출 이후 개선할 수 있다.

## 3. 전체 실행 순서

```text
배포 의사결정 확정
→ 운영 MySQL 구축·migration
→ HTTPS Backend 배포·비밀값 주입
→ TourAPI·OpenRouter 실환경 smoke
→ 계정 삭제·개인정보처리방침 준비
→ Android package ID·release 서명·API 36
→ 지도·Firebase release 등록
→ release AAB 생성
→ 실기기 통합 QA
→ Play Console 내부 테스트
→ 비공개 테스트
→ production access 신청
→ 정식 출시 심사
```

각 단계가 실패하면 다음 단계로 넘어가지 않는다. 운영 장애를 앱 문제로 오인하지 않도록
Backend·DB부터 검증한 다음 Android를 연결한다.

## 4. 1단계 — 배포 의사결정

작업 시작 전에 다음 값을 팀에서 확정한다.

- 최종 Android application ID
- Play Console을 소유할 Google 계정과 개인·조직 계정 유형
- 사용자에게 표시할 개발자명, 지원 이메일, 개인정보 문의 연락처
- Backend와 MySQL 배포 제공자 및 예상 월 예산
- staging과 production을 분리할지 여부
- 개인정보처리방침과 계정 삭제 페이지를 게시할 HTTPS 도메인
- OpenRouter 월·일 예산과 사용할 모델

application ID는 Play에 앱을 만든 뒤 변경하면 다른 앱으로 취급될 수 있으므로 서명과
Firebase·Google Maps 설정 전에 확정한다.

## 5. 2단계 — 운영 MySQL

### 구축 원칙

- 로컬 MySQL과 분리된 관리형 MySQL을 우선한다.
- MySQL 포트를 모든 인터넷에 공개하지 않는다.
- 가능하면 Backend와 DB를 같은 제공자의 private network로 연결한다.
- 애플리케이션은 `root`가 아니라 최소권한 계정을 사용한다.
- 자동 백업과 복구 가능 시점을 확인한다.
- 운영·staging을 함께 쓴다면 DB와 계정을 분리한다.

### 적용 순서

1. 빈 DB에 `backend/schema.sql`을 적용한다.
2. `backend/migrations`의 SQL을 날짜 순서대로 모두 적용한다.
3. 마지막 `20260827_add_course_revision.sql`까지 포함됐는지 확인한다.
4. 재실행 가능한 migration은 한 번 더 실행해 멱등성을 확인한다.
5. 최소권한 애플리케이션 계정으로 Backend 연결을 확인한다.
6. 테스트 데이터를 넣고 코스 저장·조회·수정·삭제를 확인한다.
7. 백업을 생성하고 별도 DB 또는 임시 환경에서 복구 절차를 점검한다.

DB 비밀번호와 전체 접속 문자열은 문서, Git, CI 로그, 채팅에 기록하지 않는다. 배포
제공자의 secret variable로 주입한다.

## 6. 3단계 — HTTPS Backend 배포

### 필수 설정

- `NODE_ENV=production`
- `USE_MOCK_AI=false`
- 충분히 긴 무작위 `JWT_SECRET`
- 운영 MySQL의 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- TourAPI 국문·영문·일문·중문 키 중 실제 사용하는 키
- OpenRouter 키, 모델, timeout, 출력 토큰 한도
- 장소·DataLab 캐시 TTL과 stale 허용 시간
- AI rate limit, 세션 TTL, 최대 세션 수

현재 활성 AI 경로는 Qdrant와 embedding을 사용하지 않는다. 운영 배포를 위해 Qdrant를
새로 만들거나 `OPENROUTER_EMBEDDING_*`을 설정할 필요는 없다.

### 운영 점검

- `GET /health`가 외부 HTTPS 주소에서 성공
- HTTP 주소가 HTTPS로 전환되거나 차단
- 서버 재시작 후 DB 데이터 유지
- 잘못된 JWT와 타 사용자 코스 접근 거부
- TourAPI timeout·빈 결과·일부 실패에서 서버가 종료되지 않음
- MySQL 일시 장애에서 캐시 fail-open 또는 명확한 오류 응답
- 로그에 JWT, API 키, DB 비밀번호, 전체 인증 URL이 없음
- 운영 응답에 stack trace와 내부 SQL이 노출되지 않음
- 프로세스 재시작 정책과 기본 모니터링·알림 설정

무료 또는 저비용 인스턴스가 sleep되는 경우 첫 요청 지연이 생길 수 있다. 공모전 시연과
Play 심사 계정이 접속할 시간에는 서버가 실제로 깨어 있고 DB 연결이 유지되는지 확인한다.

## 7. 4단계 — TourAPI·OpenRouter 실환경 smoke

실제 호출은 최소 횟수로 수행하며 키와 전체 URL을 출력하지 않는다.

### TourAPI

- 문화·지역 조합 한 건 조회
- 공식 분류 코드가 있는 문화 한 건과 모호 문화 한 건
- 장소 상세 및 이미지 한 건
- MySQL cache miss → TourAPI → cache upsert
- 동일 요청의 cache hit

### OpenRouter

- `/ai/chat`: 지역·문화가 명확한 질문 한 건
- 반환된 모든 장소가 Backend 후보의 숫자형 `contentId`인지 확인
- 응답의 `mock=false` 확인
- `/ai/transform`: 기존 장소 한 건의 명시적 Day 이동 또는 삭제
- 미리보기 생성 전후 DB가 바뀌지 않는지 확인
- 사용자 승인 저장 후 revision 충돌 방지 확인
- timeout·rate limit·모델 오류가 사용자용 메시지로 변환되는지 확인

OpenRouter 비용 제한과 rate limit은 출시 전에 설정한다. 사용량이나 provider 오류는
기록하되 사용자 질문 원문과 개인 식별자를 불필요하게 장기 보관하지 않는다.

## 8. 5단계 — 계정 삭제와 개인정보

CulturePath는 이메일 회원가입과 Google 로그인을 제공하므로 계정 삭제가 출시 필수다.

### 필요한 제품 기능

- 로그인 사용자가 앱의 내정보에서 탈퇴를 시작할 수 있음
- 재확인 후 계정과 연관 데이터를 삭제 또는 정책에 맞게 익명화
- 다른 사용자의 코스·데이터를 삭제하지 않도록 소유권 검증
- 탈퇴 후 JWT와 로그인 상태 폐기
- 동일 사용자의 AI 채팅 세션 삭제
- 실패 시 일부만 삭제된 상태가 남지 않도록 transaction 또는 복구 정책 적용
- 웹에서도 탈퇴를 요청할 수 있는 공개 페이지 제공

계정 삭제가 영향을 주는 `users`, 코스, 좋아요, 완주 기록, AI 세션과 공개 커뮤니티
콘텐츠의 보존·삭제 정책은 구현 전에 공동 결정한다. 외부 페이지 URL은 Play Console의
계정 삭제 항목에 등록한다.

### 개인정보처리방침 필수 내용

- 서비스명과 운영 주체·문의 방법
- 수집하는 데이터와 수집 목적
- 이메일·Google 로그인 식별자 처리
- 정확한 위치 또는 대략적 위치 사용 여부와 목적
- 사용자가 만든 코스·커뮤니티 콘텐츠 처리
- AI 질문·코스 정보가 OpenRouter에 전달되는 범위
- Google Maps, TourAPI 등 외부 서비스 이용
- 보관 기간, 탈퇴·삭제 절차, 보안 조치
- 제3자 제공·처리위탁 여부

개인정보처리방침은 로그인 없이 열리는 공개 HTTPS 페이지여야 하며 앱 내에서도 접근할 수
있어야 한다. 실제 앱·SDK의 데이터 처리와 Play Console Data safety 답변이 서로 같아야
한다.

## 9. 6단계 — Android release 구성

### application ID와 서명

1. 최종 application ID를 확정한다.
2. 업로드 keystore를 생성하고 안전한 별도 저장소에 백업한다.
3. keystore 비밀번호와 alias를 Git에 넣지 않는다.
4. `key.properties` 또는 CI secrets를 이용해 release signing을 구성한다.
5. debug signing을 release에서 제거한다.
6. Play App Signing을 활성화하고 업로드 키와 앱 서명 키의 차이를 기록한다.

키를 잃으면 업데이트 배포가 어려워질 수 있으므로 팀 공용 비밀번호 관리 도구나 안전한
오프라인 백업 위치를 정한다.

### API와 SDK 설정

- 2026-08-31 이후 신규 제출을 고려해 target API 36 이상 확인
- `API_BASE_URL=https://...`로 release AAB 생성
- Google Maps Android 키를 최종 application ID와 Play App Signing 인증서 SHA-1로 제한
- Google 로그인 OAuth Android client에 최종 application ID와 Play App Signing 인증서
  SHA-1 등록
- 필요한 경우 Firebase에 release SHA-1·SHA-256 등록
- 위치 권한은 실제 지도·근처 장소 기능을 사용할 때만 요청
- 권한 거부 후에도 지역을 수동 선택할 수 있어야 함

Google Maps 키는 APK에서 완전히 숨길 수 있는 비밀이 아니다. 대신 Android 앱 제한과 API
제한, 할당량을 반드시 설정한다. 반면 TourAPI·OpenRouter·DB·JWT 비밀값은 Flutter에
절대 넣지 않고 Backend에만 둔다. Play에서 설치되는 앱은 업로드 키가 아니라 Play App
Signing 인증서로 다시 서명되므로 Play Console에 표시되는 앱 서명 인증서를 기준으로
Google Maps·Google 로그인을 등록한다. 로컬 release 설치가 필요하면 해당 로컬 인증서도
별도로 제한 목록에 추가한다.

### 빌드 산출물

```powershell
flutter analyze
flutter test
flutter build appbundle --release --dart-define=API_BASE_URL=https://운영-백엔드-주소
```

Play 제출 산출물은 APK가 아니라 `.aab`를 기준으로 한다. AAB 업로드 후 Play Console이
표시하는 target API, 권한, native library 호환성과 기기 지원 범위를 확인한다.

## 10. 7단계 — 실기기·에뮬레이터 통합 QA

### 최소 기기 조합

- 최신 Android 또는 최신 API 에뮬레이터 1개
- 실제 저사양 또는 중저가 Android 휴대전화 1개
- 가능하면 화면이 작은 기기와 큰 기기 각 1개

### P0 사용자 흐름

1. 신규 회원가입 또는 Google 로그인
2. 위치 허용 및 위치 거부 각각 확인
3. 문화 선택 → 지역 선택 → 장소 목록
4. 50개 이후 추가 로딩과 마지막 페이지
5. 장소 상세·이미지·연관 장소
6. 장소를 코스에 담고 Day·순서 수정 후 저장
7. 저장 코스 상세·공개·Fork·삭제
8. AI 탭에서 지역·문화 대화 후 장소 카드 확인
9. 코스 상세에서 AI로 다듬기 → 미리보기 → 적용·취소
10. 로그아웃·재로그인과 앱 강제 종료 후 데이터 유지
11. 내정보에서 개인정보처리방침과 회원 탈퇴

### 오류·접근성

- 네트워크 없음·느린 네트워크·Backend 5xx
- TourAPI·OpenRouter timeout
- 이미지 없음·깨진 URL·긴 목록 스크롤
- 정확한 위치 거부·대략적 위치·GPS 꺼짐
- 키보드가 입력창과 저장 버튼을 가리지 않음
- safe area, 뒤로 가기, 화면 회전 정책
- 글자 크기 130%·200%, TalkBack, 44px 이상 터치 영역
- 사용자에게 provider 이름, 내부 오류 코드, stack trace가 노출되지 않음

문제가 발생하면 기기·OS·앱 versionCode·재현 절차·기대/실제 결과를 기록한다. 수정판은
versionCode를 올리고 같은 핵심 흐름을 다시 검증한다.

## 11. 8단계 — Play Console 준비

### 스토어 등록정보

- 앱 이름, 80자 이하 짧은 설명, 상세 설명
- 512×512 Play 스토어 아이콘
- 1024×500 feature graphic
- 실제 앱에서 재현 가능한 휴대전화 스크린샷
- 지원 이메일과 선택한 웹사이트
- 카테고리와 연락처

스크린샷과 설명에는 아직 구현하지 않은 기능, 가짜 평점·거리·실시간 정보, Qdrant 기반
추천을 표시하지 않는다.

### App content

- 개인정보처리방침 URL
- Data safety
- 광고 포함 여부
- 앱 접근 방법과 심사용 테스트 계정
- 목표 연령과 아동 대상 여부
- 콘텐츠 등급 설문
- 위치 등 권한 사용 목적
- 계정 삭제 외부 URL

위치 또는 로그인 때문에 심사자가 기능에 접근할 수 없다면 재현 가능한 계정과 단계별
접근 방법을 제공한다.

### 테스트 트랙과 출시

1. 내부 테스트에 AAB를 올려 설치·로그인을 확인한다.
2. 비공개 테스트 참여자를 등록하고 실제 피드백을 수집한다.
3. 신규 개인 개발자 계정이면 Play Console에 표시되는 참여 인원·기간 조건을 충족한다.
4. 테스트 중 수정한 내용과 피드백 근거를 기록한다.
5. production access를 신청한다.
6. 승인 후 단계적 출시를 우선하고 crash·ANR·서버 지표를 확인한다.

신규 개인 개발자 계정에는 일반적으로 12명 이상이 14일 연속 참여하는 비공개 테스트가
요구될 수 있다. 계정마다 Play Console에 표시되는 실제 조건을 최종 기준으로 삼는다.

## 12. 팀 권장 분담

기존 [팀 역할 및 협업 기준](./TEAM_ROLES.md)에 따른 권장안이며 실제 담당은 착수 전에
둘이 확정한다.

| 작업 | 주 담당 권장 | 공동 확인 |
| --- | --- | --- |
| 운영 MySQL·일반 CRUD migration | 임수민 | 황찬우가 캐시·AI 테이블 확인 |
| HTTPS Backend와 공통 인증 배포 | 임수민 | 황찬우가 외부 API 비밀값 확인 |
| TourAPI·캐시·OpenRouter smoke | 황찬우 | 임수민이 Flutter 응답 연결 확인 |
| application ID·release signing·AAB | 임수민 | 황찬우가 release 화면 QA |
| Google Maps·GPS·Google 로그인 release 설정 | 임수민 | 황찬우가 권한·디자인 QA |
| 회원 탈퇴 Backend·Flutter | 임수민 | 정책과 AI 세션 삭제는 공동 결정 |
| 개인정보처리방침 기술 항목·Data safety 초안 | 황찬우 | 최종 답변은 공동 검수 |
| 스토어 설명·이미지·스크린샷 | 황찬우 | 임수민이 실제 기능 일치 확인 |
| 실기기 P0 회귀 | 공동 | 각 담당 기능 교차 검증 |

한 사람이 만든 release를 다른 사람이 최소 한 번 설치·검수한다. 배포 비밀번호와 서명
키는 메신저 평문보다 합의된 비밀 공유 수단을 사용한다.

## 13. 출시 금지 조건

다음 중 하나라도 해당하면 정식 출시를 신청하지 않는다.

- release가 debug 키로 서명됨
- 운영 앱이 localhost 또는 HTTP Backend를 바라봄
- TourAPI·OpenRouter·DB 비밀값이 앱이나 Git에 포함됨
- `USE_MOCK_AI=true`이거나 사용자에게 mock 응답이 제공됨
- 회원가입은 가능하지만 계정 탈퇴가 불가능함
- 개인정보처리방침·Data safety가 실제 위치·로그인·AI 처리와 다름
- 심사자가 로그인 또는 핵심 기능을 재현할 수 없음
- 코스 저장·조회가 앱 재시작 또는 서버 재시작 후 사라짐
- 위치 권한 거부 시 앱 전체가 막힘
- P0 흐름에서 재현 가능한 crash 또는 데이터 소유권 오류가 남아 있음

## 14. 최종 완료 체크리스트

### G1 운영 통합

- [ ] 운영 MySQL 최소권한 연결
- [ ] 전체 migration 적용·재실행 확인
- [ ] HTTPS Backend `/health` 확인
- [ ] TourAPI cache miss·hit 확인
- [ ] OpenRouter chat·transform `mock=false` 확인
- [ ] 외부 API·DB 장애 처리 확인
- [ ] 비밀값·민감 로그 점검

### G2 비공개 테스트

- [ ] 최종 application ID
- [ ] release signing과 키 백업
- [ ] target API 36 이상 확인
- [ ] 지도·Google 로그인 release 인증서 등록
- [ ] 계정 삭제 앱·웹 경로
- [ ] 개인정보처리방침 앱·웹 경로
- [ ] release AAB 실기기 P0 통과
- [ ] 내부 테스트 설치 성공

### G3 정식 출시

- [ ] 스토어 텍스트·아이콘·feature graphic·스크린샷
- [ ] Data safety·광고·목표 연령·콘텐츠 등급
- [ ] 심사용 계정·접근 안내
- [ ] 비공개 테스트와 피드백 반영
- [ ] production access 승인
- [ ] 단계적 출시·모니터링·rollback 담당 확정

## 15. 공식 참고 자료

- [Google Play Target API 요구사항](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL)
- [신규 개인 개발자 계정 테스트 요구사항](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [앱 심사 준비와 App content](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)
- [Data safety 작성 안내](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN)
- [스토어 미리보기 asset 요구사항](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)

정책은 바뀔 수 있으므로 실제 제출일에는 Play Console 경고와 공식 도움말을 다시 확인한다.
