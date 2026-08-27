# CulturePath 문서

CulturePath의 현행 계약과 작업 인수인계를 관리한다. 완료된 단계의 상세 기록은 [`archive`](./archive/README.md)에 보관한다.

## 먼저 읽을 문서

| 문서 | 용도 |
| --- | --- |
| [서비스 계획서](./문화여행_따라가방_서비스_계획서.md) | 제품 목적, 사용자 흐름, 핵심 기능과 기술 구조 |
| [팀 역할 및 협업 기준](./TEAM_ROLES.md) | 임수민·황찬우 담당 범위와 연동 경계 |
| [황찬우 현행 잔여 PR 로드맵](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md) | 현재 완료 상태, 다음 PR, 보류 항목과 새 세션 인수인계 |

## 현행 제품·API 계약

| 문서 | 내용 |
| --- | --- |
| [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md) | 목록·검색·상세, 문화 필터, 페이지와 오류 계약 |
| [장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md) | 장소·검색 캐시, TTL·stale·fail-open |
| [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md) | 목록 이미지, 상세 갤러리, placeholder와 캐시 |
| [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md) | 공개 코스 중복 제거 집계, API 필드와 fail-open |
| [연관 방문 장소 계약](./RELATED_PLACES_CONTRACT.md) | 연관 장소 매핑, 호출 상한과 공개 응답 |
| [DataLab 지역점수 계약](./DATALAB_REGION_SCORE_CONTRACT.md) | 방문자 점수, 전용 캐시와 fallback |
| [AI 코스 변형 계약](./AI_TRANSFORM_CONTRACT.md) | `/ai/transform`, 인증·검증·호출 제한 |
| [Qdrant 인덱싱 계약](./QDRANT_PLACE_INDEXING_CONTRACT.md) | BGE-M3, collection·payload, 증분 인덱싱 |
| [RAG 검색·평가 계약](./RAG_SEARCH_EVALUATION_CONTRACT.md) | query routing, strict filter, Mock/live 평가 |

## 현재 남은 큰 작업

1. R16.2 Flutter 장소 목록 추가 로딩
2. 공개 코스 장소 사용 횟수 UI 표시 여부 결정
3. R17 OpenRouter live RAG·AI 품질/비용 검증
4. R18 배포·실기기·Google Play 준비

상세 범위와 담당 제외 항목은 [현행 잔여 PR 로드맵](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md)을 기준으로 한다.

## 문서 관리 기준

- 현재 동작을 규정하는 계약은 이 디렉터리 루트에 둔다.
- 완료된 PR의 프롬프트·검수표·장문 계획·일회성 결과는 `archive`로 이동한다.
- 아카이브와 현행 계약이 충돌하면 실제 소스코드와 현행 계약이 우선한다.
- 역할이나 제품 범위가 바뀌면 서비스 계획서와 팀 역할 문서를 함께 갱신한다.
