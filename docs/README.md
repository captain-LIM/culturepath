# CulturePath 문서

CulturePath의 현행 계약과 운영 인수인계를 관리한다. 완료된 단계의 상세 기록은
[`archive`](./archive/README.md), 최신 결정으로 대체된 문서는
[`decay`](./decay/README.md)에서 확인한다.

> **현행 기준:** 2026-09-10 `main` (PR #30 및 NCP TourAPI Gateway 운영 전환 반영)
>
> **최근 자동 검증:** Backend 485개 테스트 통과

## 먼저 읽을 문서

| 문서 | 용도 |
| --- | --- |
| [서비스 계획서](./문화여행_따라가방_서비스_계획서.md) | 제품 목적, 사용자 여정, 핵심 기능과 기술 구조 |
| [팀 역할 및 협업 기준](./TEAM_ROLES.md) | 임수민·황찬우 담당 범위와 연동 경계 |
| [황찬우 현행 잔여 작업](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md) | 완료 상태, 다음 작업과 제외 범위 |
| [R18 출시 준비 가이드](./R18_RELEASE_GOOGLE_PLAY_RUNBOOK.md) | 운영 Backend·DB, Android release와 Google Play 준비 |
| [NCP TourAPI 중계 운영 가이드](./ncp-tour-gateway.md) | production 구성, 검증, 장애 진단과 롤백 |
| [npm 취약점 원인 분석](./NPM_SECURITY_AUDIT_2026-09-10.md) | Railway High 경고의 원인, 노출 범위와 권장 수정 |
| [R17 AI 최종 의사결정](./R17_AI_ASSISTANT_DECISION_RECORD.md) | 통합 AI UX, 세션, 의도 해석과 코스 편집 결정 |
| [AI 기능 개편 계약](./AI_MYSQL_TOURAPI_LLM_TARGET_ARCHITECTURE.md) | MySQL·TourAPI 탐색, LLM 역할과 현행 구조 |

## 현행 제품·API 계약

| 문서 | 내용 |
| --- | --- |
| [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md) | 목록·검색·상세, 문화 필터, 페이지와 오류 계약 |
| [장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md) | 장소·검색 캐시, TTL·stale·fail-open |
| [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md) | 목록 이미지, 상세 갤러리, placeholder와 캐시 |
| [공개 코스 장소 사용 횟수](./PLACE_USAGE_CONTRACT.md) | 공개 코스 중복 제거 집계, API 필드와 fail-open |
| [연관 방문 장소](./RELATED_PLACES_CONTRACT.md) | 연관 장소 매핑, 호출 상한과 공개 응답 |
| [DataLab 지역 점수](./DATALAB_REGION_SCORE_CONTRACT.md) | 방문자 점수, 전용 캐시와 fallback |
| [AI 여행 챗봇](./AI_CHAT_CONTRACT.md) | `/ai/chat`, MySQL·TourAPI 후보와 장소 카드 |
| [AI 코스 다듬기](./AI_TRANSFORM_CONTRACT.md) | `/ai/transform`, 기존 장소 편집과 원본 보호 |

AI 문서는 R17 구현을 반영한 현행 계약이다. 활성 AI 요청 경로는 Qdrant 없이
MySQL·TourAPI 후보 resolver와 기존 장소 전용 transform을 사용한다. OpenRouter 실제
운영 smoke는 아직 남아 있으므로 자동 테스트 통과와 실환경 검증 완료를 구분한다.

Flutter의 현행 하단 root 목적지는 `홈 / 탐색 / 만들기 / AI / 내정보` 5개다. R14·R15의
4탭 문서는 당시 디자인 이력이며 현행 내비게이션 계약이 아니다.

## 현재 남은 필수 작업

1. 실제 OpenRouter로 `/ai/chat`, `/ai/transform`의 `mock=false` 제한 smoke 수행
2. `brace-expansion`을 5.0.9 이상으로 올리고 Railway production-only 설치 검증
3. Android application ID, release 서명, API 36, 실기기와 Play 비공개 테스트 준비
4. 회원 탈퇴와 개인정보처리방침의 앱·웹 경로 구현
5. 선택 작업인 공개 코스 장소 사용 횟수 UI 표시 여부 결정

NCP KorService2 production 경유, Railway 환경 변수 적용, migration, health, 장소 검색과
상세의 cache refresh 검증은 2026-09-10 완료했다. 세부 결과는
[NCP TourAPI 중계 운영 가이드](./ncp-tour-gateway.md)를 따른다.

## 문서 관리 기준

- 현재 동작 또는 승인된 다음 구현을 규정하는 계약은 이 디렉터리 루트에 둔다.
- 목표 계약이 코드에 아직 반영되지 않았다면 문서 상단에 구현 상태를 명시한다.
- 완료된 PR 계획·검수표·질문 계획·일회성 결과는 `archive`로 이동한다.
- 최신 결정으로 폐기된 계약과 runbook은 `decay`로 이동해 현행 지침으로 사용하지 않는다.
- 문서와 코드가 다르면 실제 테스트·코드를 확인하고 차이를 결함 또는 후속 작업으로 기록한다.
- 역할이나 제품 범위가 바뀌면 서비스 계획서와 팀 역할 문서를 함께 갱신한다.
