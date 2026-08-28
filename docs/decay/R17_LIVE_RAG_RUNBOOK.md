# R17 실환경 RAG 검증 실행서

> 담당: 황찬우
> 목적: 비밀값과 불필요한 비용을 노출하지 않고 MySQL 장소를 OpenRouter·Qdrant RAG로 검증한다.

## 현재 확인 상태

- MySQL `places_cache` 1건 dry-run: 성공
- OpenRouter 임베딩 1건: 성공
- 응답 임베딩 차원: 1024
- 실제 Qdrant 인덱싱·검색: `QDRANT_URL` 설정 후 진행
- Qdrant Cloud처럼 인증이 필요한 배포만 `QDRANT_API_KEY`를 사용한다.
- 키, 인증 헤더, 전체 인증 URL과 임베딩 원문 벡터는 결과에 기록하지 않는다.

## 환경변수

`backend/.env`에 다음 이름을 사용한다. 실제 값은 문서와 Git에 기록하지 않는다.

```dotenv
USE_MOCK_RAG=false
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_EMBEDDING_MODEL=baai/bge-m3
OPENROUTER_EMBEDDING_DIMENSIONS=1024
QDRANT_URL=...
QDRANT_API_KEY=... # 인증이 필요한 경우에만
QDRANT_COLLECTION=culturepath_places_v1
```

운영 Backend에서 실제 AI를 사용하려면 `USE_MOCK_RAG=false`가 필요하다. 테스트
부트스트랩은 외부 키를 제거하고 Mock을 강제하므로 기본 자동 테스트는 비용을 만들지 않는다.

## 최소 비용 실행 순서

Backend 디렉터리에서 실행한다.

```powershell
# MySQL 입력만 확인하고 외부 호출·쓰기는 하지 않음
npm.cmd run rag:index -- --dry-run --limit=1

# 장소 1건만 임베딩하고 Qdrant에 기록
npm.cmd run rag:index -- --limit=1 --batch-size=1

# 같은 장소를 다시 실행해 document hash skip 확인
npm.cmd run rag:index -- --limit=1 --batch-size=1

# live fixture 중 처음 3건만 검색 연결 확인
npm.cmd run rag:evaluate -- --live --limit=3

# 제한 검증이 정상일 때만 전체 장소 인덱싱
npm.cmd run rag:index

# 전체 live baseline 평가
npm.cmd run rag:evaluate -- --live
```

첫 인덱싱 결과는 `embedded=1`, 같은 명령의 재실행은 `unchanged=1`이어야 한다.
제한 평가는 운영 오류가 없으면 종료에 성공하지만 전체 품질 합격을 의미하지 않는다.

## 장애 판정

| 코드 | 의미 | 조치 |
| --- | --- | --- |
| `OPENROUTER_NOT_CONFIGURED` | OpenRouter 설정 누락 | `.env` 변수명 확인 |
| `OPENROUTER_TIMEOUT` | 임베딩·생성 시간 초과 | 자동 재호출하지 않고 잠시 뒤 수동 재검증 |
| `QDRANT_NOT_CONFIGURED` | Qdrant URL 또는 collection 누락 | `QDRANT_URL` 확인 |
| `QDRANT_INDEX_EMPTY` | 컬렉션에 장소 point가 없음 | 제한 인덱싱부터 재실행 |
| `QDRANT_COLLECTION_INCOMPATIBLE` | 차원·distance 계약 불일치 | 기존 컬렉션을 덮지 말고 새 버전 검토 |

Qdrant는 원본 DB가 아니다. 삭제되거나 비어도 MySQL `places_cache`에서 재생성하며,
검색 결과는 공개 응답 전에 항상 MySQL 원본으로 재검증한다.
