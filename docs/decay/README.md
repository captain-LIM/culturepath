# 폐기·대체된 문서

이 디렉터리는 한때 구현 또는 검증 기준으로 사용했지만 최신 제품 결정으로 대체된
문서를 보관한다. 완료 이력을 보관하는 [`archive`](../archive/README.md)와 달리, 여기의
문서는 **현재 구현 지침이나 완료 조건으로 사용하면 안 된다.**

## 2026-08-26 AI 구조 개편으로 이동한 문서

| 문서 | 이동 사유 |
| --- | --- |
| [Qdrant 장소 인덱싱 계약](./QDRANT_PLACE_INDEXING_CONTRACT.md) | 제출 전 운영 경로에서 Qdrant·BGE-M3를 제거하기로 결정 |
| [RAG 검색·필터·평가 계약](./RAG_SEARCH_EVALUATION_CONTRACT.md) | 벡터 검색 평가가 MySQL→TourAPI 후보 resolver 계약으로 대체됨 |
| [R17 라이브 RAG 실행 가이드](./R17_LIVE_RAG_RUNBOOK.md) | Qdrant 인덱싱·live RAG smoke가 R17 완료 조건에서 제외됨 |

현재 기준은 [AI 기능 개편 계약](../AI_MYSQL_TOURAPI_LLM_TARGET_ARCHITECTURE.md)이다.

소스코드에는 전환 전 Qdrant/RAG 구현이 남아 있을 수 있다. 이는 위 문서가 다시 현행이
된다는 뜻이 아니라, 목표 계약으로의 코드 리팩터링이 아직 끝나지 않았다는 뜻이다.
과거 판단 근거를 확인할 때만 이 디렉터리를 참고하며, 명령·환경변수·운영 절차를 그대로
실행하지 않는다.
