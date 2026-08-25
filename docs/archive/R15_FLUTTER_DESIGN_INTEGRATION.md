# [황찬우 전용] R15 Flutter 디자인 적용과 검증 기록

> **상태:** PR #18 머지·GitHub CI 완료 — Android 실기기 수동 검증은 R18에서 진행
>
> **기준:** [R14 최종 결과와 R15 인계](./R14_MANUS_PROTOTYPE_RESULT.md) · [R14 P0 디자인 명세](./R14_FIGMA_P0_DESIGN_SPEC.md) · [R14 검수표](./R14_DESIGN_REVIEW_CHECKLIST.md)

## 1. 목적과 경계

R15는 승인된 R14 프로토타입의 정보구조와 시각 언어를 기존 Flutter 제품 흐름에 적용한다. React 프로토타입 코드나 fixture는 복사하지 않고, 기존 GoRouter·Riverpod·Repository·Backend API·`contentId` 계약을 유지한다.

이번 PR에는 다음을 포함한다.

- paper·ink·terracotta 중심의 최종 토큰과 평면 편집물 UI
- 홈의 검색 → 계절 편집 노트 → 문화 10종 2열 → 최대 2개 내 코스 구조
- 탐색의 `내 코스 / 커뮤니티 / 인기` 3개 탭과 커뮤니티 `최신 / 인기` 세그먼트
- 서버·게스트 내 코스 통합 표시, 게스트 수정·삭제·중복 저장 방지
- 네트워크 장애 시 서버 코스 캐시가 오래된 자료임을 표시
- 문화 → 지역 → 장소 → 상세, 코스 만들기·상세·AI 변경안의 시각 정리
- TourAPI HTTPS 사진, thumbnail 우선, 최대 1600px cache/decode, 상세 최대 10장 계약 유지
- 360·390·430dp와 200% text scale 구조 테스트, Android release CI 빌드

다음은 포함하지 않는다.

- 다국어 TourAPI 데이터와 locale 연동, 지도 고도화: 임수민 담당
- Backend·MySQL·Qdrant·OpenRouter 변경
- 새로운 이미지 API·정적 여행 사진·폰트 asset 추가
- GoRouter deep route를 하단 navigation shell 안으로 옮기는 구조 변경

## 2. 구현 계약

### 디자인 시스템

| 토큰 | 값 |
| --- | --- |
| ink | `#2B2D42` |
| paper | `#F7F3E9` |
| surface | `#FFFFFF` |
| terracotta | `#C05534` |
| mustard | `#D9A441` |
| charcoal | `#1E1E1E` |
| muted | `#6D6E6D` |
| line | `#DDD8CE` |
| success | `#3F6B50` |
| danger | `#A33D32` |

간격은 4dp 배수, 일반 조작 영역은 최소 44dp, 주요 버튼은 높이 48dp를 기준으로 한다. 제목은 Noto Serif KR, 본문은 Noto Sans KR의 기존 `google_fonts` 구성을 유지한다.

### 데이터와 소유권

- 로그인 사용자의 내 코스는 기존 `/courses`를 사용하고, 연결 오류·timeout·5xx에서만 마지막 캐시를 `stale` 표시와 함께 사용한다.
- 게스트 내 코스는 기존 SharedPreferences 목록을 사용한다. 게스트 목록에서 연 항목은 구버전 데이터에 서버 ID가 남아 있어도 재편집·공유 링크·AI·완주에서 서버 코스로 취급하지 않는다.
- 게스트 편집·삭제는 로드 당시 index와 원본 fingerprint를 함께 확인한다. 앞 항목이 다른 화면에서 먼저 삭제돼 index가 이동했으면 원본 fingerprint로 대상을 다시 찾는다. 일치 항목이 없거나 같은 fingerprint가 둘 이상이면 다른 코스를 건드리지 않고 안전하게 실패한다.
- 신규 게스트 코스는 첫 저장에서 얻은 index와 snapshot을 화면이 기억해 같은 편집 화면의 다음 저장부터 기존 항목을 교체한다.
- 공개 코스의 로컬 Fork는 서버 `id`를 제거하고 `forkedFrom`에만 원본 출처를 남겨 서버 원본 상세가 로컬 변경을 덮지 않게 한다.
- `PlaceItem` 직렬화에 기존 nullable 이미지 URL을 보존해 로컬 저장 후 사진이 사라지지 않게 한다.
- 홈은 내 코스 최대 2개만 표시하고, 탐색은 전체 목록을 표시한다.

### 라우팅과 담당 경계

- 하단 4개 목적지는 홈·탐색·만들기·내정보 root에서만 유지한다.
- 문화·장소·코스·AI deep screen은 기존처럼 back navigation을 사용하되 코스 카드, 검색 결과, 내정보 목록에서 여는 상세는 root navigator에 쌓아 하단 navigation을 남기지 않는다.
- 번역 파일은 탐색의 세 label과 R15에서 새로 노출된 공통 UI 문구만 맞춘다. 관광 데이터의 언어별 조회 로직은 변경하지 않는다.

## 3. 자동 검증

| 검증 | 상태 | 비고 |
| --- | --- | --- |
| 번역 JSON 파싱 | PASS | ko/en/ja/zh 모두 파싱 |
| `git diff --check` | PASS | whitespace 오류 없음 |
| Backend 전체 테스트 | PASS | 로컬 harness `230/230` |
| `flutter analyze` | PASS | GitHub CI |
| `flutter test` | PASS | GitHub CI |
| Android release APK | PASS | GitHub CI `flutter build apk --release --no-pub` |

추가된 회귀 테스트는 다음 계약을 고정한다.

- 승인된 최종 색상 토큰
- 게스트 코스 수정 시 교체, 선택 삭제, 이미지 URL 직렬화
- 오래된 guest index의 원본 재탐색과 중복 fingerprint 안전 거부, 신규 게스트 코스의 연속 저장, 로컬 Fork의 서버 ID 제거 및 서버 ID가 남은 구버전 게스트 코스의 상세 refresh 차단
- 로그인 상태가 바뀔 때 게스트/서버 내 코스 source 재평가
- 정상 서버 응답 뒤 로컬 cache write가 실패해도 최신 응답 유지
- 네트워크 장애 시 내 코스 stale snapshot
- 비어 있는 stale snapshot에도 stale 표시 유지
- 홈 문화 10종 2열과 내 코스 최대 2개
- 탐색의 3개 탭과 내 코스 기본 선택
- 홈 코스 상세와 검색 결과가 branch shell이 아닌 root navigator에 열림
- 360·390·430dp, 200% text scale에서 홈 overflow 부재
- 장소 상세 갤러리의 `{장소명} 관광지 사진 n/전체` semantics

## 4. 수동 검증 인계

다음 항목은 자동 검증 완료와 별개로 R18에서 실제 Android 기기로 확인한다.

1. status bar·gesture navigation safe area
2. 코스 제목·설명 입력 중 IME가 저장 버튼과 현재 입력을 가리지 않는지
3. 360·390·430dp 및 text scale 1.3·2.0에서 핵심 흐름 overflow
4. 실제 TourAPI 이미지의 thumbnail → image → placeholder 전환
5. 상세 최대 10장 스크롤의 cache/decode 메모리와 체감 성능
6. TalkBack에서 사진 순서, 장소 상세 진입과 코스 담기, AI 적용·원본 복구가 구분되는지

실기기 결과가 기록되기 전에는 R14에서 넘긴 Android safe area·IME와 실제 이미지 성능 항목을 `PASS`로 바꾸지 않는다.
