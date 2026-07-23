# CulturePath 문서

CulturePath(문화여행·따라가방)의 기획과 협업 문서를 관리하는 디렉터리다.

## 문서 목록

| 문서 | 내용 |
| --- | --- |
| [서비스 계획서](./문화여행_따라가방_서비스_계획서.md) | 서비스 컨셉, 사용자 흐름, 기능, 데이터, 기술 구조, 디자인 시스템 및 로드맵 |
| [팀 역할 및 협업 기준](./TEAM_ROLES.md) | 임수민과 황찬우의 담당 범위, 연동 지점, 일정별 산출물 및 협업 원칙 |
| [황찬우 전용 실행계획](./HWANG_CHANWOO_WORK_PLAN.md) | 황찬우가 담당하는 RAG, 외부 API 연동, FE 디자인의 상세 작업과 완료 기준 |
| [황찬우 전용 잔여 PR 로드맵](./HWANG_CHANWOO_REMAINING_PR_ROADMAP.md) | 완료된 기반, R1~R10 잔여 PR, 의존 관계, 결정 항목 및 새 세션 인수인계 절차 |
| [외부 관광 API 검증 체크리스트](./API_VALIDATION_CHECKLIST.md) | Swagger 검증 완료 내역, 남은 엔드포인트, 성공 기준 및 백엔드 연동 전 확인사항 |
| [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md) | TourAPI 목록·검색·상세 파라미터, PlaceSummary·PlaceDetail, 공개 장소 API와 오류 계약 |
| [TourAPI 장소 MySQL 캐시 계약](./PLACE_CACHE_CONTRACT.md) | 장소·검색 2단계 캐시, TTL·stale·fail-open 정책, 응답 헤더와 잔여 실DB 검증 |

## 문서 관리 기준

- 서비스 범위나 우선순위가 바뀌면 서비스 계획서를 먼저 갱신한다.
- 담당 범위나 일정이 바뀌면 팀 역할 문서를 함께 갱신한다.
- 구현 세부 문서가 필요해지면 RAG 설계, API 명세, 디자인 가이드 등을 별도 파일로 분리한다.
