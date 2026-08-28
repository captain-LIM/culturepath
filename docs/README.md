# CulturePath 문서

CulturePath의 현행 계약과 작업 인수인계를 관리한다. 완료된 단계의 상세 기록은
[`archive`](./archive/README.md), 최신 결정으로 대체된 문서는
[`decay`](./decay/README.md)에 보관한다.

> **현행 기준:** 2026-08-28 `main` (PR #25까지 반영)
>
> **자동 검증:** Backend 332개 테스트와 Flutter analyze·test·Android release CI 통과

## 먼저 읽을 문서

| 문서 | 용도 |
| --- | --- |
| [서비스 계획서](./문화여행_따라가방_서비스_계획서.md) | 제품 목적, 사용자 흐름, 핵심 기능과 기술 구조 |
| [팀 역할 및 협업 기준](./TEAM_ROLES.md) | 임수민·황찬우 담당 범위와 연동 경계 |
| [황찬우 현행 잔여 PR 로드맵](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md) | 현재 완료 상태, 다음 PR, 보류 항목과 새 세션 인수인계 |
| [R17 AI 여행 도우미 최종 의사결정 기록](./R17_AI_ASSISTANT_DECISION_RECORD.md) | 통합 대화 UX, 세션, 의도 해석, 지역 태그, 추천·코스 편집의 최종 결정 |
| [AI 기능 개편 계약](./AI_MYSQL_TOURAPI_LLM_TARGET_ARCHITECTURE.md) | MySQL→TourAPI 탐색, LLM 역할, 기존 장소 코스 편집의 최신 결정 |

## 현행 제품·API 계약

| 문서 | 내용 |
| --- | --- |
| [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md) | 목록·검색·상세, 문화 필터, 페이지와 오류 계약 |
| [장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md) | 장소·검색 캐시, TTL·stale·fail-open |
| [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md) | 목록 이미지, 상세 갤러리, placeholder와 캐시 |
| [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md) | 공개 코스 중복 제거 집계, API 필드와 fail-open |
| [연관 방문 장소 계약](./RELATED_PLACES_CONTRACT.md) | 연관 장소 매핑, 호출 상한과 공개 응답 |
| [DataLab 지역점수 계약](./DATALAB_REGION_SCORE_CONTRACT.md) | 방문자 점수, 전용 캐시와 fallback |
| [AI 여행 챗봇 계약](./AI_CHAT_CONTRACT.md) | `/ai/chat`, MySQL→TourAPI 후보와 신뢰 장소 카드 |
| [AI 코스 다듬기 계약](./AI_TRANSFORM_CONTRACT.md) | `/ai/transform`, 기존 장소 전용 편집과 원본 보호 |

AI 문서는 현재 **R17 구현에 반영된 계약**이다. 활성 AI 요청 경로는 Qdrant 없이
MySQL→TourAPI 후보 resolver와 기존 장소 전용 transform을 사용한다. PR #24의
Backend·Flutter CI는 완료됐고 OpenRouter live smoke만 실환경 검증으로 남아 있다.

Flutter의 현행 하단 root 목적지는 `홈 / 탐색 / 만들기 / AI / 내정보` 5개다. R14·R15의
4탭 문서는 당시 디자인 이력이며 현행 내비게이션 기준이 아니다.

## 현재 남은 큰 작업

1. 로컬·운영 DB에 `20260827_add_course_revision.sql` 적용 및 재실행 검증
2. 실제 MySQL·TourAPI·OpenRouter를 사용한 `/ai/chat`, `/ai/transform` 최소 live smoke
3. R18 운영 Backend·DB·비밀값과 Android release·실기기·Google Play 준비
4. 선택 작업인 공개 코스 장소 사용 횟수 UI 표시 여부 결정

상세 범위와 담당 제외 항목은 [현행 잔여 PR 로드맵](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md)을
기준으로 한다.

## 문서 관리 기준

- 현재 동작 또는 승인된 다음 구현을 규정하는 계약은 이 디렉터리 루트에 둔다.
- 목표 계약이 아직 코드에 반영되지 않았다면 문서 상단에 구현 상태를 명시한다.
- 완료된 PR의 프롬프트·검수표·장문 계획·일회성 결과는 `archive`로 이동한다.
- 최신 결정으로 폐기된 계약·runbook은 `decay`로 이동하며 현행 지침으로 사용하지 않는다.
- 현행 계약, `archive`, `decay`가 충돌하면 실제 소스코드와 루트의 현행 계약을 함께
  확인한다. 문서와 실제 코드가 다르면 그 차이를 결함 또는 남은 작업으로 추적한다.
- 역할이나 제품 범위가 바뀌면 서비스 계획서와 팀 역할 문서를 함께 갱신한다.
