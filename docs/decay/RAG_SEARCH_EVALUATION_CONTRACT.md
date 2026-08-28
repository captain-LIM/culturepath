# RAG 검색·필터·평가 계약

> 기준일: 2026-08-04
>
> 최종 상태 갱신: 2026-08-21
>
> 소유자: 황찬우
>
> 범위: R8 검색 기반 + R16 Mock/live 평가 계약 분리

## 1. 경계

- R8은 검색 후보를 만들고 검증·평가하는 단계다.
- 최종 자연어 코스 변경안 생성과 채팅 모델 선택은 R9 범위다.
- Flutter 변경 전·후 UI와 적용·취소는 R10 범위다.
- 기본 테스트와 기본 평가 명령은 OpenRouter, Qdrant, MySQL을 호출하지 않는다.
- 실제 검색 평가는 황찬우가 별도로 승인한 `--live` 실행에서만 수행한다.
- Qdrant 결과는 검색 후보일 뿐 원본으로 신뢰하지 않는다. 최종 후보는 MySQL `places_cache`에서 다시 조회한다.

### 1.1 2026-08-12 계약 감사 결과

현재 구현과 fixture를 다시 추적한 결과, 이 문서의 검색 파이프라인 계약과 **평가 정답 계약**은 구분해야 한다.

- `backend/test/fixtures/rag-evaluation-v1.json`은 35개 case와 12개 고유 기대 title을 가진다.
- 기대값은 12개 `vectorStore.js` Mock 문서의 canonical title·culture를 기준으로 작성돼 있다.
- fixture에는 기대 `contentId`가 없고, title 기대 case는 정규화한 문자열로 비교한다.
- 현재 title 정규화는 Unicode·대소문자·공백·일부 문장부호 차이만 줄인다. 장소 별칭이나 `contentId` canonicalization은 아니다.
- 실제 TourAPI title이 `오죽헌`이 아니라 `강릉 오죽헌·시립박물관`으로 오면 현재 비교에서는 같은 장소로 판정되지 않는다.
- 실제 장소의 `cultures=[]`는 분류 규칙에 걸리지 않은 정상적인 보수적 결과다. 그러나 culture hard filter가 있는 기존 fixture에서는 검색 후보가 될 수 없다.

따라서 현재 35개 fixture는 **Mock 회귀 기준**으로 유지한다. 같은 fixture를 live 품질 gate로 확정하지 않으며, R16에서 실제 TourAPI 표본에 기반한 별도 live fixture와 `contentId` 중심 판정 계약을 승인받아 추가한다. 그전에는 fixture, Mock 문서, title, culture rule, `CONTENT_ID_OVERRIDES`, Qdrant schema를 임의로 변경하지 않는다.

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

## 6. Mock/live 평가 세트

R16부터 실행 모드에 따라 서로 다른 fixture와 정답 판정 규칙을 사용한다. `--live`가
Mock fixture를 읽거나, live fixture가 Mock 문서 제목으로 합격하는 동작은 허용하지 않는다.

| 구분 | Mock 회귀 | Live baseline |
| --- | --- | --- |
| 파일 | `rag-evaluation-v1.json` | `rag-evaluation-live-v1.json` |
| case 수 | 35개 | 15개 |
| 최소 case 수 | 30개 | 15개 |
| 정답 식별자 | 정규화한 canonical title | 숫자형 TourAPI `contentId` exact match |
| title 용도 | 정답 판정 | 사람이 읽는 진단·locale별 관측값 |
| 외부 의존성 | 없음 | 승인된 실행에서 OpenRouter·Qdrant·MySQL |
| 현재 gate | 승인된 Mock 회귀 기준 | R17 실측 전 baseline |

기존 `rag-evaluation-v1.json`과 `vectorStore.js`의 12개 Mock 문서는 변경하지 않는다.
Mock의 title 정규화는 별칭 통합이 아니라 Unicode·대소문자·공백·문장부호 차이만 줄인다.

Live case의 `expected.outcome`은 다음 세 값 중 하나다.

| outcome | 의미 | Hit@K·MRR 포함 여부 |
| --- | --- | --- |
| `relevant` | 기대 `contentIds` 중 하나가 검색돼야 함 | 포함 |
| `empty` | 원천을 감사해 적합 장소가 없다고 확정 | 빈 결과 정확도에 포함 |
| `coverage_gap` | 알려진 장소가 있지만 분류·번역·원천 공백으로 현재 검색 품질을 채점할 수 없음 | 제외, 별도 지표로 노출 |

`coverage_gap`은 `UNCLASSIFIED_CULTURE`, `MISSING_TRANSLATION`,
`SOURCE_DATA_INCOMPLETE` 중 근거를 반드시 기록한다. 예를 들어 `contentId=129784`는
지역 기반 검색에서는 오죽헌으로 사용할 수 있지만 현재 `cultures=[]`이므로
`강릉 × 문학` case에서는 `UNCLASSIFIED_CULTURE`로 기록한다. 평가 통과를 위해 문화
규칙이나 `CONTENT_ID_OVERRIDES`를 자동으로 보정하지 않는다. 다만 실제 국문 상세과
MySQL 표본으로 근대사 장소임을 확인한 `1684836`과 `2607311`은 사용자 승인 후
`근대 문화유산` override로 등록했다. 일반 박물관 분류 규칙은 완화하지 않았다.

Live의 `titlesByLocale`은 같은 장소의 관측 표시명이다. `오죽헌`,
`강릉 오죽헌·시립박물관`, 번역 title이 서로 달라도 `contentId`가 같으면 같은 장소다.
반대로 title이 같아도 `contentId`가 다르면 정답으로 인정하지 않는다.
한 case에 기대 `contentIds`가 여러 개면 `titlesByContentId`로 각 ID의 locale title을
따로 연결해야 하며, 감사 결과도 ID별 snapshot 일치 여부를 분리해 표시한다.

Live fixture의 각 case는 `evidence.source`, `evidence.verification`,
`evidence.observedAt`을 가진다. 2026-08-24에 실제 TourAPI 국문 상세를 로컬 MySQL에
적재해 13개 ID·title·culture를 감사했고 모든 case를 `mysql_verified`로 전환했다.
따라서 `qualityGate.evidenceVerified=true`지만 현재 gate 상태가 `baseline`이므로
`qualityGate.contractReady=false`, `qualityGate.ready=false`이며 production 품질
합격으로 표현하지 않는다.
`qualityGate.status=approved`로 바꾸려면 0~1 사이의 Hit@K와 MRR 기준도 함께 확정해야 한다.
`contractReady`는 계약·근거 준비 상태이고, 실행 결과까지 포함한 `ready`는 전체 case가
오류 없이 현재 threshold를 통과해야만 `true`가 된다.

### 6.1 지표와 합격 의미

아래 값은 기존 Mock 회귀의 기준이다.

| 지표 | 기준 |
| --- | --- |
| Hit@8 | `0.80` 이상 |
| MRR@8 | `0.50` 이상 |
| routing 정확도 | `1.00` |
| hard filter 준수율 | `1.00` |
| 기대 빈 결과 정확도 | `1.00` |
| MySQL 신뢰 원본 비율 | Mock에서는 미적용 |

제한 실행은 smoke 용도이므로 `complete=false`, `passed=false`로 기록한다. 전체 35건을
실행해야 **Mock 회귀** 합격으로 판정한다. 이 결과를 live 품질 합격으로 표현하지 않는다.
Live baseline은 routing 정확도, hard filter 준수율, MySQL 신뢰 원본 비율만 `1.00`으로
필수로 강제한다. 세 필드는 삭제하거나 `1.00`보다 낮출 수 없다. Hit@8과 MRR@8은 R17
첫 실측에서 보고하되 아직 hard gate로 사용하지 않는다.
따라서 live 결과의 `passed=true`는 현재 baseline 구조 검증을 통과했다는 의미이며,
`qualityGate.ready=false`인 동안 production 검색 품질 승인을 뜻하지 않는다.

Live에는 다음 진단을 추가한다.

- `coverageGapCount`, `coverageGapRate`, `coverageGapReasons`
- culture 기대 case 중 `UNCLASSIFIED_CULTURE`를 제외한 `classificationCoverageRate`
- 실제 Hit@K·MRR 채점이 가능한 `scorableCaseRate`
- locale title과 무관한 `matchedBy=contentId`
- MySQL의 `summary.title`과 `translations.{locale}.detail.title`을 대조한 locale별 누락·관측 진단
- Qdrant 결과가 MySQL 원본으로 재검증됐는지 보는 `trustedSourceRate`

지연시간 p50·p95와 임베딩 입력 토큰은 기록하되 R17에서 hard gate 여부를 결정한다.

제한 smoke는 품질 합격 판정과 별개로 처리한다. 실행 case 중 운영 오류가 하나라도 있으면
프로세스는 실패 코드로 종료하고, 오류 없이 제한된 case를 마친 경우에만 성공 종료한다.

최소 점수 후보는 `0`, `0.2`, `0.3`, `0.35`, `0.4`, `0.5`를 같은 검색 결과에 적용한
Hit@8·MRR@8 sweep으로 비교한다. raw vector와 API 키는 결과에 기록하지 않는다.

## 7. 실행

Backend 디렉터리에서 실행한다.

```powershell
# 외부 호출 없이 Mock 문서로 평가기와 고정 세트를 회귀 검증
npm run rag:evaluate

# 명시적 live 실행에서 누락 ID만 TourAPI 국문 상세로 적재하고 현재 문화 규칙을 동기화
npm run rag:seed-live-fixture -- --live

# 외부 API 없이 live fixture의 contentId·문화·locale title 근거를 로컬 MySQL과 대조
npm run rag:audit-live-fixture

# 실제 설정 후 처음 3건만 연결 smoke test
npm run rag:evaluate -- --live --limit=3

# 승인된 전체 live 평가
npm run rag:evaluate -- --live
```

seed 실행에는 `DB_*`와 `TOUR_API_KEY`가 필요하다. live 평가에는 여기에 OpenRouter와
Qdrant 설정이 추가로 필요하다.

```dotenv
DB_HOST=...
DB_USER=...
DB_NAME=...
OPENROUTER_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=... # Qdrant Cloud 등 인증이 필요한 배포에서만 사용
QDRANT_COLLECTION=culturepath_places_v1
```

키는 `backend/.env`에만 저장한다. 기본 테스트 부트스트랩은 실제 키를 비우고 네트워크를
차단한다. CLI 오류는 알려진 오류 코드만 출력하며 URL·인증 헤더·키를 출력하지 않는다.

## 8. 현재 검증 상태와 남은 위험

- 35개 고정 case의 Mock 회귀는 외부 호출 없이 통과하도록 구현했다.
- Qdrant client의 지역·문화·콘텐츠 유형 AND 필터와 Top-K 상한을 자동 테스트한다.
- 중복·잘못된 ID·MySQL 누락·원본 필터 불일치를 제거하는 경로를 자동 테스트한다.
- 로컬 MySQL과 Qdrant 환경·연결 검증은 완료됐다. Qdrant 로컬 배포는
  `QDRANT_API_KEY` 없이 `QDRANT_URL`만으로 live 평가할 수 있다.
- 2026-08-26 OpenRouter 실임베딩 1건은 키나 벡터를 출력하지 않고 성공했으며,
  응답 모델 `parasail-bge-m3`, 1024차원, 입력 12토큰을 확인했다.
- 실제 장소 Qdrant 인덱싱과 live 의미 검색 평가는 아직 실행하지 않았다. 현재 로컬
  `.env`에는 Backend가 읽는 `QDRANT_URL`이 없어 이를 설정한 뒤 제한 인덱싱부터 진행한다.
- 기존 fixture를 그대로 사용했던 과거 live 결과는 실제 MySQL 데이터의 title·culture 차이 때문에 품질과 무관한 실패가 섞일 수 있으므로 공식 live 합격/실패로 해석하지 않는다.
- R16은 Mock과 live fixture 로딩·검증·판정을 분리했고 live title은 정답 판정에 사용하지 않는다.
- Live baseline은 15개 case와 13개 고유 TourAPI `contentId`를 갖는다. 실제 감사 결과 12개는 relevance, 3개는 명시적인 `UNCLASSIFIED_CULTURE` 공백이다.
- 영어→일본어→중국어 장소 캐시와 코스 이미지 migration을 로컬 MySQL에 적용했고 신규 컬럼 5개를 최소권한 계정으로 확인했다.
- `rag:seed-live-fixture -- --live`는 누락된 12개 ID만 적재한 뒤 재실행에서 13개를 모두 건너뛰고, 두 근대사 박물관 캐시만 승인된 override로 재분류했다.
- 2026-08-24 공식 MySQL 감사는 13/13 발견, issue 0, pending evidence 0, `readyForApproval=true`를 반환했다.
- 감사 명령은 누락 ID, relevance case의 문화 누락, 기존 coverage gap 해소를 서로 다른 진단으로 표시한다. 누락을 Mock이나 가상 장소로 채우지 않는다.
- 감사 CLI는 자신이 만든 MySQL pool을 성공·오류 경로 모두에서 닫아 JSON 출력 후 프로세스가 종료되도록 한다.
- seed 명령은 `--live` 없이는 외부 호출과 DB 쓰기를 거부하며, 이미 존재하는 ID를 재호출하지 않는다.
- Qdrant 결과를 정답으로 다시 등록하거나 fixture를 현재 검색 결과에 맞춰 바꿔 평가를 통과시키지 않는다.
- `QDRANT_SCORE_THRESHOLD` 최종값과 live 지연시간 기준은 전체 live 평가 후 확정한다.
