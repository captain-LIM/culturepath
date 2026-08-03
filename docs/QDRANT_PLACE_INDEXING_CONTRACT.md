# Qdrant 장소 인덱싱 계약

> 기준일: 2026-08-03
>
> 소유자: 황찬우
>
> 범위: R7 — MySQL `places_cache`에서 Qdrant 장소 컬렉션을 재생성할 수 있는 최소 비용 인덱싱 파이프라인

## 1. 경계

- MySQL `places_cache`가 장소 원본이다.
- Qdrant는 삭제돼도 이 명령으로 복구 가능한 검색 인덱스다.
- 인덱싱 명령은 TourAPI를 직접 호출하지 않는다.
- 기본 테스트와 `--dry-run`은 OpenRouter와 Qdrant를 호출하지 않는다.
- R7은 적재 계약까지만 다룬다. 검색 Top-K, 점수 임계값과 필터 완화 평가는 R8 범위다.

## 2. 임베딩·컬렉션 계약

| 항목 | 값 |
| --- | --- |
| 임베딩 모델 | `baai/bge-m3` |
| 벡터 차원 | `1024` |
| distance | `Cosine` |
| 컬렉션 | `culturepath_places_v1` |
| 기본 batch | `32` |
| 기본 MySQL page | `200` |

모델이나 차원을 바꾸면 기존 컬렉션을 제자리에서 재사용하지 않는다. 새 이름의
`culturepath_places_v2`를 만들고 전체 인덱싱·R8 평가 후 애플리케이션 설정을
전환한다. 기존 컬렉션의 크기나 distance가 현재 계약과 다르면 명령은 쓰기를
시작하지 않고 `QDRANT_COLLECTION_INCOMPATIBLE`로 종료한다.

## 3. 장소 문서

장소당 point 하나를 사용한다. 문서는 존재하는 필드만 다음 순서로 결합한다.

```text
장소명: 박경리기념관
문화: 문학
지역: 통영
주소: 경남 통영시 산양읍
소개: 박경리 작가의 작품 세계를 소개하는 공간입니다.
운영시간: 09:00~18:00
휴무일: 월요일
```

- 목록 캐시만 있으면 제목·문화·지역·주소만으로 인덱싱한다.
- 상세 캐시가 추가되면 소개·운영시간·휴무일이 문서에 포함된다.
- 결측값을 추측해서 채우지 않는다.
- 제어문자와 중복 공백을 제거하고 상류 TourAPI 정규화가 제거한 HTML을 다시 넣지 않는다.
- `contentId`를 프로젝트 namespace의 결정적 UUID로 바꿔 Qdrant point ID로 사용한다.
- 검색 문서와 필터 필드의 SHA-256을 `documentHash`로 저장한다.

## 4. Payload

```json
{
  "contentId": "2390314",
  "title": "박경리기념관",
  "content": "장소명: 박경리기념관\n문화: 문학...",
  "address": "경남 통영시 산양읍",
  "cultures": ["문학"],
  "category": "문학",
  "areaCode": "tongyeong",
  "regionName": "통영",
  "lDongRegnCd": "48",
  "lDongSignguCd": "220",
  "contentTypeId": "14",
  "tel": "055-000-0000",
  "openTime": "09:00~18:00",
  "restDate": "월요일",
  "source": "TOUR_API",
  "sourceUpdatedAt": "20260801093000",
  "documentVersion": "culturepath-place-v1",
  "documentHash": "sha256...",
  "embeddingModel": "baai/bge-m3",
  "indexNamespace": "culturepath-place",
  "indexedAt": "2026-08-03T00:00:00.000Z"
}
```

Qdrant keyword payload index는 실제 필터 후보인 다음 필드만 만든다.

- `cultures`
- `regionName`
- `areaCode`
- `lDongRegnCd`
- `lDongSignguCd`
- `contentTypeId`
- `indexNamespace` (`--prune` 안전 범위)

지역 이름과 slug는 `regionCatalog.js`의 검증된 법정동 코드 매핑으로 만든다.
광역 코드만으로 여러 큐레이션 지역이 겹치면 임의의 지역 slug를 부여하지 않는다.

## 5. 증분 인덱싱과 재개

1. MySQL을 `content_id` 오름차순 cursor로 읽는다.
2. 현재 장소 문서와 `documentHash`를 만든다.
3. 같은 point의 기존 hash를 Qdrant에서 조회한다.
4. hash가 같으면 임베딩과 upsert를 생략한다.
5. 신규·변경 문서만 OpenRouter에서 batch 임베딩한다.
6. Qdrant `wait=true` batch upsert가 성공한 뒤 다음 batch로 진행한다.

중간 batch에서 실패하면 이미 완료된 batch는 남는다. 같은 명령을 다시 실행하면
완료된 point는 hash 비교에서 제외되므로 처음부터 재임베딩하지 않는다.

삭제는 기본 동작이 아니다. `--prune`은 `--limit`·`--dry-run`과 함께 사용할 수
없고, MySQL 전체 조회가 성공했으며 원본이 한 건 이상일 때만
`indexNamespace=culturepath-place`인 누락 point를 삭제한다.

## 6. 실행

Backend 디렉터리에서 실행한다.

```powershell
# 외부 호출 없이 MySQL 문서 생성 가능 여부만 확인
npm run rag:index -- --dry-run --limit=20

# 최대 20건으로 실제 증분 인덱싱
npm run rag:index -- --limit=20

# MySQL 전체 장소 증분 인덱싱
npm run rag:index

# 전체 성공 후 MySQL에 없는 기존 장소까지 정리
npm run rag:index -- --prune
```

지원 옵션은 `npm run rag:index -- --help`로 확인한다. 출력에는 컬렉션, 모델,
읽은 건수, 임베딩·스킵·삭제 건수와 입력 토큰만 포함하며 키와 전체 접속 URL은
출력하지 않는다.

## 7. 환경변수

비밀값은 `backend/.env`에만 저장한다.

```dotenv
OPENROUTER_API_KEY=...
OPENROUTER_EMBEDDING_MODEL=baai/bge-m3
OPENROUTER_EMBEDDING_DIMENSIONS=1024
QDRANT_URL=...
QDRANT_API_KEY=...
QDRANT_COLLECTION=culturepath_places_v1
RAG_INDEX_BATCH_SIZE=32
RAG_INDEX_PAGE_SIZE=200
```

`backend/.env.example`에는 변수명과 비밀이 아닌 기본값만 기록한다.
`USE_MOCK_RAG`는 앱의 AI 요청 경로를 제어하며, 명시적으로 실행하는
`npm run rag:index` 운영 명령의 외부 쓰기를 대신 차단하지 않는다. 외부 호출 없이
확인하려면 반드시 `--dry-run`을 사용한다.

## 8. 검증 상태와 남은 위험

- 기본 검증은 fake MySQL repository와 가짜 OpenRouter·Qdrant HTTP 응답만 사용한다.
- 실제 키·네트워크·Docker·MySQL은 자동 테스트에서 사용하지 않는다.
- 실제 Qdrant Cloud smoke test는 구현·리뷰 후 황찬우의 별도 승인으로 임시
  컬렉션과 최대 3개 fixture 장소만 사용한다.
- 운영 컬렉션 적재 전에는 실제 MySQL 8에 장소 캐시가 존재하는지 확인해야 한다.
- 검색 적합성, 점수 임계값, 결과 부족 시 필터 완화는 R8 평가 결과로 확정한다.
