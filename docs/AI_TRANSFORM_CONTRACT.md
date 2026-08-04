# AI 코스 변형 계약

> 운영 주의: 현재 AI 호출 제한기는 단일 Node 프로세스의 메모리를 사용한다.
> Backend를 여러 인스턴스로 확장하기 전에는 Redis 같은 공유 저장소 기반 제한기로
> 교체해야 전 인스턴스를 합산한 사용자별 제한이 보장된다.

## 목적

`POST /ai/transform`은 현재 코스를 사용자의 자연어 조건에 맞게 재구성하되, 검증되지 않은 장소를 만들거나 원본 코스를 즉시 덮어쓰지 않는 미리보기 API다.

## 운영 경계

- JWT 인증이 필요하다.
- 기본 호출 제한은 사용자별 60초에 3회이며 환경변수로 조정한다.
- 기본 `USE_MOCK_RAG=true`에서는 외부 네트워크와 비용이 발생하지 않는다.
- 실제 모드는 OpenRouter에서 질의 임베딩과 구조화된 변경안을 만들고 Qdrant에서 후보 장소를 검색한다.
- MySQL과 TourAPI 장소가 원본이며 Qdrant는 검색 인덱스다.
- 저장된 코스와 Qdrant 후보의 `contentId`는 응답에 사용하기 전에 `places_cache`에서
  다시 조회한다. 캐시에 없는 장소는 변형 대상에서 제외하거나 요청을 거부하며,
  Qdrant payload의 제목·주소·분류를 원본으로 신뢰하지 않는다.
- Qdrant 후보 중 숫자형 TourAPI `contentId`가 있는 장소만 새 일정에 추가할 수 있다.
- 사용자가 적용하기 전에는 코스 DB를 변경하지 않는다.
- 타인의 공개 코스를 적용할 때 Flutter는 먼저 Fork API를 호출하고 Fork된 코스에 변경안을 반영한다.
- 생성 요청은 스트리밍하지 않으며 애플리케이션에서 같은 요청을 자동 재호출하지 않는다. OpenRouter의 동일 모델 provider failover만 사용한다.

## 요청

```json
{
  "courseId": 42,
  "request": "비 오는 날 부모님과 갈 수 있는 코스로 바꿔줘",
  "constraints": {
    "days": 1,
    "weather": "rain",
    "companions": ["parents"],
    "mobility": "low",
    "dietary": [],
    "startRegion": "통영"
  }
}
```

제한은 다음과 같다.

- 요청 문장: 1~500자
- Day: 최대 7개
- Day별 장소: 최대 20개
- 전체 장소: 최대 50개
- `constraints`는 문서에 정의된 필드만 허용

Backend는 `courseId`로 DB의 제목·설명·Day·장소를 다시 조회한다. 클라이언트가 보낸 장소 객체를 신뢰하지 않는다. 비공개 코스는 소유자만 변형할 수 있고 공개 코스는 로그인 사용자가 미리 본 뒤 적용 시 자신의 계정으로 Fork한다.

이전 Flutter 빌드의 `POST /ai/edit-course`, `userRequest`, `course.id`는 호환 별칭으로 유지하지만 코스 본문은 변형 컨텍스트로 신뢰하지 않는다.

## 응답

```json
{
  "course": {},
  "summary": "야외 장소를 실내 문화시설로 교체했습니다.",
  "explanation": "야외 장소를 실내 문화시설로 교체했습니다.",
  "sources": [
    { "contentId": "123456", "title": "박경리기념관" }
  ],
  "warnings": [],
  "usage": {
    "model": "provider/model",
    "inputTokens": 0,
    "outputTokens": 0
  },
  "mock": false
}
```

LLM은 장소의 전체 객체를 결정하지 않는다. LLM은 허용된 `contentId` 배열만 선택하며, Backend가 현재 코스와 Qdrant 후보의 신뢰된 장소 객체로 최종 응답을 재구성한다.

## 구조화 생성 계약

- 기본 생성 모델: `google/gemini-2.5-flash-lite`
- 최대 출력: 기본 1,600토큰, 운영 상한 4,096토큰
- 출력 방식: non-streaming
- OpenRouter `response_format.type`: `json_schema`
- Schema 모드: `strict: true`
- provider 정책: `require_parameters: true`
- 모델 수준 fallback: 사용하지 않음
- 애플리케이션 수준 자동 재시도: 사용하지 않음

모델 내부 출력은 `status`, `summary`, `title`, `description`, `tracks`, `warnings`만 허용한다.
`status`는 실제 변경이 있으면 `changed`, 원본과 완전히 같으면 `unchanged`여야 한다. 공개
API 응답에는 내부 `status`를 새 필드로 노출하지 않아 기존 Flutter 계약을 유지한다.

허용하는 연산은 장소 삭제, 순서 변경, Day 이동과 MySQL에서 재검증한 RAG 후보 추가다.
교체는 기존 장소 삭제와 후보 추가로 표현한다. 결과의 Day는 1부터 연속이어야 하고 Day별
장소는 1~20개, 전체 장소는 최대 50개이며 중복 `contentId`를 허용하지 않는다.

우천·실내·이동성·동행·식이처럼 현재 원본에 검증 필드가 없는 핵심 조건은 사실처럼
추측하지 않는다. Backend가 이런 조건을 먼저 감지하면 Qdrant와 OpenRouter를 호출하지
않고 원본 코스를 그대로 반환하며 `warnings`에 사유를 기록한다. 이 정책은 Mock과 실제
모드에 동일하게 적용한다. 모델 장애, 잘못된 Schema와 허용되지 않은 장소 ID는 성공
응답으로 감추지 않고 오류로 처리한다.

## Qdrant payload 계약

컬렉션의 각 장소 point는 다음 payload를 사용한다.

```json
{
  "contentId": "123456",
  "title": "박경리기념관",
  "content": "장소명: 박경리기념관\n문화: 문학\n지역: 통영...",
  "address": "통영시 산양읍",
  "areaCode": "tongyeong",
  "regionName": "통영",
  "lDongRegnCd": "48",
  "lDongSignguCd": "220",
  "cultures": ["문학"],
  "category": "문학",
  "tel": "",
  "openTime": "09:00~18:00",
  "documentVersion": "culturepath-place-v1",
  "documentHash": "sha256...",
  "embeddingModel": "baai/bge-m3"
}
```

- 문화 필터 필드: `cultures`
- 지역 필터 필드: `regionName`
- 컬렉션 기본명: `culturepath_places_v1`
- 임베딩 모델: `baai/bge-m3`
- 벡터 차원과 distance: `1024`, `Cosine`
- 생성·갱신·삭제 계약은 [Qdrant 장소 인덱싱 계약](./QDRANT_PLACE_INDEXING_CONTRACT.md)을 따른다.
- 검색 Top-K·strict filter·MySQL 원본 재검증과 품질 기준은 [RAG 검색·필터·평가 계약](./RAG_SEARCH_EVALUATION_CONTRACT.md)을 따른다.

## 환경변수와 검증 상태

변수명은 `backend/.env.example`을 따른다. 키 원문은 문서, 로그, 오류 응답에 남기지 않는다.

현재 자동 테스트는 주입된 가짜 HTTP 응답으로 OpenRouter strict JSON Schema 요청, 출력 토큰 상한, batch 임베딩, Qdrant 컬렉션·payload index·증분 upsert·명시적 prune, 지역·문화·콘텐츠 유형 strict filter, MySQL 원본 재검증, 인증키 비노출, 입력 제한, 호출 제한, unchanged 안전 응답과 허용되지 않은 장소 ID 거부를 검증한다. 35개 고정 평가 세트의 Mock 회귀는 외부 호출 없이 실행한다. 실제 Qdrant 컬렉션 생성·인덱싱과 유료 OpenRouter 호출은 아직 수행하지 않았으므로 운영 전 제한된 smoke와 live 평가가 필요하다.
