# RAG 검색·필터·평가 계약

> 기준일: 2026-08-04
>
> 소유자: 황찬우
>
> 범위: R8 — R7에서 만든 `culturepath_places_v1`을 재현 가능하게 검색하고 품질을 같은 기준으로 비교하는 기반

## 1. 경계

- R8은 검색 후보를 만들고 검증·평가하는 단계다.
- 최종 자연어 코스 변경안 생성과 채팅 모델 선택은 R9 범위다.
- Flutter 변경 전·후 UI와 적용·취소는 R10 범위다.
- 기본 테스트와 기본 평가 명령은 OpenRouter, Qdrant, MySQL을 호출하지 않는다.
- 실제 검색 평가는 황찬우가 별도로 승인한 `--live` 실행에서만 수행한다.
- Qdrant 결과는 검색 후보일 뿐 원본으로 신뢰하지 않는다. 최종 후보는 MySQL `places_cache`에서 다시 조회한다.

## 2. 확정된 검색 정책

| 항목 | 정책 |
| --- | --- |
| 기본 Top-K | `8` |
| 최대 Top-K | `10` |
| 후보 부족 기준 | 기본 `3`개 미만 |
| 최소 점수 | live 평가 전에는 적용하지 않음 |
| 필터 완화 | 자동 완화하지 않음 |
| query routing | 규칙 기반, 추가 LLM 호출 없음 |
| 원본 검증 | Qdrant `contentId`를 MySQL에서 재조회 |
| live 실패 | Mock이나 큐레이션 결과로 조용히 대체하지 않음 |

`QDRANT_SCORE_THRESHOLD`는 빈 값이면 Qdrant 요청에 전달하지 않는다. 고정 평가 결과의
threshold sweep을 확인한 뒤 최종값을 정한다. 모델이나 차원이 바뀌면 R7 계약에 따라 새
컬렉션 버전을 만들고 이 평가를 다시 수행한다.

## 3. query 정규화와 routing

입력 query는 다음 순서로 정규화한다.

1. Unicode NFC 정규화
2. 제어문자와 zero-width 문자를 공백으로 치환
3. 연속 공백 축소와 앞뒤 공백 제거
4. 1~500자 경계 검증

지역은 `regionCatalog.js`, 문화는 `cultureCategoryMap.js`와 고정 alias를 사용한다. 자연어
문장에서 지역·문화가 명시되면 Qdrant hard filter로 적용한다. 콘텐츠 유형은 다음
TourAPI allowlist 중 호출자가 구조화해서 전달한 값만 hard filter로 사용한다.

```text
12, 14, 15, 25, 28, 32, 38, 39
```

다음 조건은 현재 장소 원본에 정확한 구조화 필드가 없으므로 hard filter로 단정하지 않는다.

- 비·우천·실내
- 걷기·휠체어·유모차·저강도 이동
- 부모님·아이·가족
- 반려동물
- 채식·비건·알레르기
- 조용함·혼잡도

이 조건은 query 의미 검색에는 남기되 진단에
`SOFT_CONDITIONS_NOT_HARD_FILTERED`를 기록한다. R9는 검증되지 않은 조건을 사실처럼
표현하지 않고 필요하면 warning으로 전달해야 한다.

## 4. 검색과 원본 재검증

```text
사용자 query
  → 규칙 기반 정규화·routing
  → OpenRouter BGE-M3 query 임베딩
  → Qdrant 지역·문화·콘텐츠 유형 AND 필터 + Dense Top-K
  → 숫자 TourAPI contentId 검증·중복 제거
  → MySQL places_cache 일괄 재조회
  → 현재 원본으로 문서 재생성
  → 현재 원본이 hard filter를 여전히 만족하는지 재검증
  → 신뢰 가능한 후보와 진단 반환
```

다음 후보는 제거한다.

- 숫자 TourAPI `contentId`가 없는 point
- 중복 `contentId`
- MySQL 원본에 없는 장소
- 원본 문서를 다시 만들 수 없는 장소
- 인덱싱 후 원본이 바뀌어 현재 hard filter와 맞지 않는 장소

검색 순서는 Qdrant 점수 순서를 유지한다. 원본 재조회 결과의 제목·주소·문화·지역을
Qdrant payload 값으로 덮어쓰지 않는다.

## 5. 호환 인터페이스와 진단

기존 `vectorStore.search()`는 계속 문서 배열을 반환한다. R8은 내부 평가와 장애 판단에
사용할 `searchDetailed()` 경로를 추가한다. 주요 진단 필드는 다음과 같다.

```json
{
  "filters": {
    "region": "통영",
    "category": "문학",
    "contentTypeId": null,
    "topK": 8,
    "scoreThreshold": null,
    "filtersRelaxed": false
  },
  "returnedCount": 2,
  "shortage": true,
  "warnings": ["INSUFFICIENT_RESULTS"],
  "latencyMs": {
    "embedding": 0,
    "qdrant": 0,
    "total": 0
  },
  "usage": {
    "embeddingModel": "baai/bge-m3",
    "inputTokens": 0
  }
}
```

live 모드에서 컬렉션이 없거나 point 수가 0이면 `QDRANT_INDEX_EMPTY`로 실패한다. hard
filter에 맞는 장소가 없는 것은 정상적인 빈 결과이며 필터를 자동으로 해제하지 않는다.

## 6. 고정 평가 세트

평가 세트는 `backend/test/fixtures/rag-evaluation-v1.json`에 저장한다.

- 소유자: 황찬우
- 버전: `culturepath-rag-eval-v1`
- case 수: 35개
- Top-K: 8
- 범주: 지역+문화, 지역만, 문화만, alias, 명시적 콘텐츠 유형, 우천·동행 soft 조건, 후보 없음
- 기대값: 원본에 존재해야 하는 제목 또는 명시적인 빈 결과

초기 합격 기준은 다음과 같다.

| 지표 | 기준 |
| --- | --- |
| Hit@8 | `0.80` 이상 |
| MRR@8 | `0.50` 이상 |
| routing 정확도 | `1.00` |
| hard filter 준수율 | `1.00` |
| 기대 빈 결과 정확도 | `1.00` |
| MySQL 신뢰 원본 비율 | live에서 `1.00` |

제한 실행은 smoke 용도이므로 `complete=false`, `passed=false`로 기록한다. 전체 35건을
실행해야 최종 합격으로 판정한다. 지연시간 p50·p95와 임베딩 입력 토큰은 기록하지만
Qdrant 클러스터와 네트워크가 정해지기 전에는 hard gate로 사용하지 않는다.

제한 smoke는 품질 합격 판정과 별개로 처리한다. 실행 case 중 운영 오류가 하나라도 있으면
프로세스는 실패 코드로 종료하고, 오류 없이 제한된 case를 마친 경우에만 성공 종료한다.

최소 점수 후보는 `0`, `0.2`, `0.3`, `0.35`, `0.4`, `0.5`를 같은 검색 결과에 적용한
Hit@8·MRR@8 sweep으로 비교한다. raw vector와 API 키는 결과에 기록하지 않는다.

## 7. 실행

Backend 디렉터리에서 실행한다.

```powershell
# 외부 호출 없이 Mock 문서로 평가기와 고정 세트를 회귀 검증
npm run rag:evaluate

# 실제 설정 후 처음 3건만 연결 smoke test
npm run rag:evaluate -- --live --limit=3

# 승인된 전체 live 평가
npm run rag:evaluate -- --live
```

live 실행에는 다음 설정이 필요하다.

```dotenv
DB_HOST=...
DB_USER=...
DB_NAME=...
OPENROUTER_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
QDRANT_COLLECTION=culturepath_places_v1
```

키는 `backend/.env`에만 저장한다. 기본 테스트 부트스트랩은 실제 키를 비우고 네트워크를
차단한다. CLI 오류는 알려진 오류 코드만 출력하며 URL·인증 헤더·키를 출력하지 않는다.

## 8. 현재 검증 상태와 남은 위험

- 35개 고정 case의 Mock 회귀는 외부 호출 없이 통과하도록 구현했다.
- Qdrant client의 지역·문화·콘텐츠 유형 AND 필터와 Top-K 상한을 자동 테스트한다.
- 중복·잘못된 ID·MySQL 누락·원본 필터 불일치를 제거하는 경로를 자동 테스트한다.
- 실제 Qdrant 클러스터와 OpenRouter 키는 아직 설정되지 않았고 live 평가는 실행하지 않았다.
- 실제 MySQL 캐시가 기대 제목을 충분히 포함하지 않으면 live 평가는 데이터 커버리지 부족으로
  실패할 수 있다. Qdrant 결과를 정답으로 다시 등록해서 평가를 통과시키지 않는다.
- `QDRANT_SCORE_THRESHOLD` 최종값과 live 지연시간 기준은 전체 live 평가 후 확정한다.
