# 안정화 변경 배포 메모

> 최종 상태 갱신: 2026-08-12

## MySQL 마이그레이션

신규 DB는 `backend/schema.sql`을 사용한다. 기존 DB는 백업 후
`backend/migrations`의 SQL을 파일명 순서대로 반드시 실행한다. 상세 명령과
재실행·동시 실행 정책은 `backend/migrations/README.md`를 따른다.

자동 테스트는 노트북 자원을 아끼기 위해 Docker나 실DB에 의존하지 않는다. 별도 수동
검증에서는 로컬 MySQL 8.4.11에 `schema.sql`을 적용하고 migration 2개를 실행했으며,
두 번째 migration 재실행도 성공했다. 최소 권한 `culturepath_app` 계정의 Backend 연결과
실제 TourAPI 응답의 `places_cache`·`place_query_cache` 저장도 확인했다.

이 결과는 로컬 환경 검증이며 배포 DB 검증을 대신하지 않는다. 운영 반영 전 staging 또는
production과 동일한 MySQL 8 환경에서 백업, 기존 DB migration, 재실행과 복구 절차를 다시
검증한다.

## 코스 생성과 Fork 재시도

Flutter는 생성/Fork마다 `Idempotency-Key`를 만들고 응답을 받기 전까지 로컬에
보관한다. Backend는 `(user_id, idempotency_key)` unique constraint와 요청 의미의
SHA-256 지문으로 같은 요청의 재시도를 기존 코스로 돌려준다. 같은 키를 다른 생성
내용이나 다른 원본 Fork에 재사용하면 `409`로 거부한다. 따라서 연결이 commit 직후
끊겨도 동일 요청을 다시 보내 중복 코스를 만들지 않는다.

## AI 호출 제한

현재 제한기는 단일 Backend 프로세스 안에서만 사용자별 요청 수를 센다. 단일
인스턴스 배포에는 맞지만, 여러 인스턴스를 사용할 때는 Redis 등 공유 저장소 기반
limiter로 교체한 뒤 확장해야 한다.

## 아직 필요한 실환경 확인

- Flutter SDK가 있는 환경의 `flutter analyze`와 `flutter test`
- staging/production MySQL 8 migration·백업·복구 재현
- Qdrant 환경·연결 이후 OpenRouter BGE-M3를 사용한 실제 장소 인덱싱과 검색 품질 평가
- RAG Mock/live 평가 계약 분리와 실제 TourAPI `contentId` 중심 합격 기준 확정
- 비용 한도를 설정한 OpenRouter 임베딩·코스 변형 smoke test
- Android release 빌드, 실기기 UX와 HTTPS Backend 연결
