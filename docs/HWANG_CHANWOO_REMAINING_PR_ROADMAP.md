# [황찬우 전용] 잔여 PR 로드맵과 세션 인수인계

> **문서 소유자:** 황찬우
>
> **최종 갱신:** 2026-08-12
>
> **담당 범위:** 외부 API 연동 · RAG/AI Backend · Frontend UI/UX Design 및 API 연결
>
> **목적:** 대화 세션이 바뀌어도 완료 상태, 다음 PR 범위, 의사결정과 검증 기준을 동일하게 이어가기 위한 기준 문서

## 1. 이 문서의 지위

- 이 문서는 황찬우 담당 작업을 **PR 실행 단위**로 나눈 기준 문서다.
- `R1`~`R16`은 로드맵 ID이며 실제 GitHub PR 번호와 무관하다.
- 과거 `R5`·`R6`의 초안과 부분 구현은 기록으로 보존하되, 남은 범위는 현재 코드에 맞춰 `R11` 이후로 다시 나눴다.
- 세부 요구사항은 [황찬우 전용 실행계획](./HWANG_CHANWOO_WORK_PLAN.md), [외부 관광 API 검증 체크리스트](./API_VALIDATION_CHECKLIST.md), [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md)을 함께 읽는다.
- 문서보다 현재 코드나 공식 외부 API 명세가 더 최신이면 읽기 전용으로 차이를 확인하고 구현 전에 영향과 선택지를 사용자에게 보고한다.
- 외부 API 키, Qdrant 키, OpenRouter 키, 인증 헤더와 키가 포함된 전체 URL은 문서와 로그에 기록하지 않는다.

## 2. 세션이 바뀌었을 때 지킬 절차

새 구현 세션은 다음 순서를 따른다.

1. `git status --short --branch`, `git log`, 원격 최신 상태를 확인한다.
2. 저장소 루트의 로컬 `AGENTS.md`와 `.agents/WORKFLOW.md`를 읽는다. 이 파일들은 Git에 올라가지 않는 황찬우 전용 작업 규칙이다.
3. 이 문서와 현재 PR에 연결된 상세 계약·계획 문서를 읽는다.
4. 첫 번째 미완료 PR의 목표, 포함·제외 범위, 예상 변경 파일, 테스트와 완료 조건을 설명한다.
5. 결정 항목마다 발생 원인, 선택지의 작동 원리, 영향과 권장안을 설명한다.
6. 사용자가 결정을 내려도 바로 구현하지 않는다. 사용자가 별도 메시지로 명시적으로 `구현 시작`을 지시한 뒤 브랜치를 만들고 수정한다.
7. 구현 후 범위에 맞는 로컬 테스트와 diff 검사를 실행한다.
8. 코드 PR은 구현에 참여하지 않은 별도 리뷰 에이전트를 `gpt-5.6-sol`, reasoning effort `high`로 지정해 검토한다.
9. 리뷰 판정, 심각도별 발견 사항, 수정 결과, 테스트와 잔여 위험을 사용자에게 공개한다.
10. 커밋·푸시·PR 생성은 사용자가 별도로 요청했을 때만 수행하며 PR 제목과 본문은 한국어로 작성한다.

임수민 담당의 공개 API·DB·Flutter 계약에 영향을 주는 새 변경이 발견되면 구현을 멈추고 추가 결정을 받는다.

## 3. 현재 기준 상태

### 3.1 완료된 기반

| 로드맵 | 실제 PR | 완료 내용 |
| --- | --- | --- |
| 기반 | PR #4·#5 | 공공데이터 공통 클라이언트, TourAPI 목록·검색, `PlaceSummary`, 문화 분류와 테스트 |
| R1 | PR #6 | TourAPI 상세조회와 공개 `/places/search`·`/places/:id`, Swagger 계약 |
| R2 | PR #7 | MySQL 장소·검색 2단계 캐시, TTL·stale·fail-open·single-flight |
| R3 | PR #8 | 연관 관광지 실데이터 연결과 캐시 재사용 |
| R4 | PR #9 | DataLab 지역 통계와 문화별 지역 점수 |
| 안정화 | PR #10 | 팀원 변경 안정화, migration, 코스 생성·Fork 멱등성, RAG/AI 어댑터 기반 |
| R7 | PR #11 | Qdrant 컬렉션·payload index와 증분 인덱싱·명시적 prune 명령 |
| R8 | PR #12 | 규칙 기반 RAG 검색, strict filter, MySQL 원본 재검증과 35개 평가 fixture |
| R9 | PR #13 | OpenRouter strict JSON Schema 코스 변형과 신뢰 장소 재구성·비용 제한 |
| R10 | PR #14, 2026-08-05 | Flutter AI 변경안 전체 화면, semantic diff, 오류·적용·취소·원본 복구 흐름 |

R10 시점의 마지막 확인값은 Backend 자동 테스트 **212/212 통과**다. 이후 팀원 커밋이 추가됐으므로 새 세션은 이 값을 현재 고정값으로 믿지 말고 테스트를 다시 실행한다.

### 3.2 2026-08-12 실환경 인수인계

- 로컬 MySQL 8.4.11 설치, `schema.sql`, migration 2개와 두 번째 재실행이 성공했다.
- 최소 권한 `culturepath_app` 계정으로 Backend 실제 DB 연결이 성공했다.
- 실제 TourAPI 호출과 `places_cache`·`place_query_cache` 저장이 성공했다.
- 황찬우가 Qdrant 환경과 연결 검증을 완료했다. 다만 OpenRouter가 아직 연결되지 않았으므로 BGE-M3 실임베딩, 실제 장소 전체 인덱싱과 live 의미 검색 평가는 완료로 간주하지 않는다.
- OpenRouter는 의도적으로 뒤로 미뤘다. 그전까지 개발·시연 기본 경로는 `USE_MOCK_RAG=true`를 유지한다.
- Flutter의 지역 장소 카드는 아직 실제 관광지 이미지를 표시하지 않고, 장소 상세 화면·이미지 갤러리·연관 장소 UI도 남아 있다.
- Figma Make P0 초안은 존재하지만 최신 Flutter와 이미지 흐름을 반영한 최종 디자인·핸드오프는 아니다.

### 3.3 평가 fixture와 live 데이터 계약 충돌

- `backend/test/fixtures/rag-evaluation-v1.json`은 35개 case와 고유 기대 title 12개를 가진다.
- 같은 fixture가 Mock과 live 실행기에 함께 연결돼 있지만, 기대 title과 문화값은 `vectorStore.js`의 Mock 문서에 맞춰져 있다.
- 현재 live 평가는 기대 title을 정규화한 뒤 문자열로 비교한다. `contentId` 기반 정답이나 별칭 canonicalization은 없다.
- 실제 TourAPI의 `오죽헌`은 `강릉 오죽헌·시립박물관`처럼 다른 title로 올 수 있고, 분류 규칙에 걸리지 않으면 `cultures=[]`가 정상적으로 나올 수 있다.
- 따라서 현재 35개 fixture는 Mock 회귀에는 유효하지만, 실제 데이터의 합격 기준으로 바로 사용하면 데이터 품질 문제가 아닌 계약 차이로 실패할 수 있다.
- 이 충돌은 R14에서 확정한다. 그전에는 fixture, Mock 문서, canonical title, 문화 규칙, Qdrant schema를 임의로 바꾸지 않는다.

## 4. 전체 로드맵

### 4.1 완료·역사 항목

| ID | 상태 | 의미 |
| --- | --- | --- |
| R1 | 완료 — PR #6 | TourAPI 상세조회와 공개 장소 API |
| R2 | 완료 — PR #7 | MySQL 장소 캐시와 장애 fallback |
| R3 | 완료 — PR #8 | 연관 관광지 데이터 서비스 |
| R4 | 완료 — PR #9 | DataLab 지역 점수 |
| R5 | 역사 보존·R12로 재편 | 과거 Figma Make P0 초안. 현재 코드와 이미지 흐름을 반영해 다시 확정해야 함 |
| R6 | 부분 구현·R11/R13으로 재편 | 팀원 작업으로 문화→지역→장소→코스 흐름은 연결됐으나 이미지·상세·최종 디자인은 미완료 |
| R7 | 완료 — PR #11 | Qdrant 인덱싱 기반 |
| R8 | 완료 — PR #12 | RAG 검색·평가 기반 |
| R9 | 완료 — PR #13 | 구조화 AI 코스 변형 Backend |
| R10 | 완료 — PR #14 | AI 변경안 Flutter UX |

### 4.2 앞으로 실행할 PR 순서

| 순서 | ID | 상태 | PR 목표 | 선행 조건 |
| --- | --- | --- | --- | --- |
| 1 | R11 | **다음 작업·계획 필요** | 관광지 이미지·상세·연관 장소 수직 연결 | 기존 TourAPI 상세/캐시 계약 |
| 2 | R12 | 대기 | Figma Make P0 디자인 시스템과 최종 핸드오프 | R11의 실제 데이터·이미지 상태 |
| 3 | R13 | 대기 | Flutter 디자인 적용과 모바일 실기기 QA | R12 디자인 승인 |
| 4 | R14 | 대기 | 실제 TourAPI 기준 RAG 평가 계약 재정의 | MySQL 데이터 표본 확인 |
| 5 | R15 | OpenRouter 준비까지 대기 | OpenRouter live RAG·AI 연결과 품질/비용 검증 | R14 계약 확정, OpenRouter 키·예산 준비 |
| 6 | R16 | 대기 | 배포·비용·보안·공모전 제출 마감 | R11~R15 완료 |

이 순서는 **이미지 → 디자인 → Flutter 적용 → 평가 계약 → OpenRouter → 배포**로 고정한다. 한 번에 하나의 코드 PR만 구현한다. 문서 설계는 코드와 충돌하지 않는 범위에서 준비할 수 있지만 저장소 변경은 해당 PR 범위로 제출한다.

## 5. R11 — 관광지 이미지·상세·연관 장소 수직 연결

### 목표

TourAPI가 이미 제공하는 이미지와 상세·연관 장소 데이터를 Backend 공개 계약부터 Flutter 화면까지 실제로 보이게 한다.

### 포함 범위

- `/regions/:code/spots` 응답에 목록용 `thumbnailUrl`과 `imageUrl`을 nullable 필드로 전달
- Flutter 장소 목록 모델·Repository·카드에서 이미지 필드 파싱과 표시
- 이미지 선택 우선순위: `thumbnailUrl` → `imageUrl` → 로컬 placeholder
- 로딩·404·빈 URL·깨진 이미지의 일관된 fallback과 접근성 설명
- `/places/:id` 기반 장소 상세 화면과 `images` 갤러리
- `/places/:id/related` 연관 장소 UI와 상세 이동
- Backend 공개 계약·Swagger·Flutter 모델·테스트의 동시 갱신
- 목록 N건마다 `detailImage2`를 다시 호출하는 N+1 방지

### 제외 범위

- 이미지 업로드·자체 CDN·저작권이 불명확한 크롤링
- Figma 전체 리디자인
- OpenRouter·실임베딩·평가 fixture 변경

### 구현 전에 결정할 항목

- Flutter 네트워크 이미지 캐시 패키지 사용 여부와 버전
- 상세 화면 진입 구조와 갤러리 최대 장수
- TourAPI 원본 이미지 장애 때 사용할 프로젝트 기본 이미지
- 목록 API에 새 nullable 필드를 추가할 때 기존 팀원 화면 호환 확인

### 완료 조건

- 실제 TourAPI 이미지가 있는 장소는 목록과 상세에서 표시된다.
- 이미지가 없거나 실패해도 레이아웃과 스크롤이 깨지지 않는다.
- 상세·연관 장소 이동과 코스 담기가 기존 흐름을 유지한다.
- Backend·Flutter 자동 테스트와 네트워크 실패 회귀가 통과한다.

## 6. R12 — Figma Make P0 디자인 시스템과 최종 핸드오프

### 목표

R11 이후 실제 모바일 데이터 상태를 기준으로 P0 화면의 시각 언어와 모든 상태를 Figma Make에서 확정한다.

### 포함 범위

- 현재 Flutter 화면 감사와 서비스 계획서 재검토
- 색·타이포그래피·간격·radius·elevation·아이콘 토큰
- 홈, 문화 상세, 지역 상세, 장소 목록·상세, 코스 빌더·상세, AI 변경안
- loading, empty, error, offline/stale, disabled, long text, 이미지 없음 상태
- Android 360·390·430dp와 safe area·keyboard·bottom navigation 고려
- 재사용 컴포넌트와 Flutter 구현자가 해석할 수 있는 수치 명세
- Figma Make 입력 프롬프트, 결과 검수표, 임수민 핸드오프 문서

### 제외 범위

- Flutter 제품 코드 수정
- P2 소셜·개인화 신규 기능
- 앱 스토어 마케팅 이미지 제작

### 주의

과거 `agent/figma-p0-design-system` 초안은 참고자료일 뿐 통째로 병합하지 않는다. 실제 데이터 길이, 이미지 비율과 현재 Flutter 구조에 맞는 부분만 선별한다.

### 완료 조건

- 핵심 화면과 상태가 모바일 프레임에서 누락 없이 정의된다.
- 토큰과 컴포넌트가 화면별로 일관되고 Flutter 매핑이 가능하다.
- 구현 범위와 디자인 전용 아이디어가 구분된 핸드오프가 완성된다.

## 7. R13 — Flutter 디자인 적용과 모바일 QA

### 목표

R12 명세를 실제 Flutter 앱에 적용하고 Google Play 배포를 전제로 휴대폰에서 검증한다.

### 포함 범위

- 공통 Theme와 재사용 컴포넌트 적용
- P0 화면의 시각·상태·이미지 반응형 구현
- 접근성 label, 색 대비, 최소 터치 영역, text scale 대응
- 360·390·430dp 레이아웃과 긴 한국어·빈 데이터·느린 네트워크 확인
- Android 실제 기기 또는 대표 emulator에서 핵심 사용자 흐름 QA
- `flutter analyze`, `flutter test`, Android release 빌드 검증

### 제외 범위

- Backend 공개 계약의 불필요한 재설계
- OpenRouter live 연결
- 최종 스토어 서명·등록 작업

### 완료 조건

- 문화→지역→장소→상세→코스→AI 변경안 흐름이 휴대폰에서 깨지지 않는다.
- 디자인 명세와 구현 캡처의 차이를 검수하고 P0 차이를 해소한다.
- 자동 검사와 release 빌드가 통과한다.

## 8. R14 — 실제 TourAPI 기준 RAG 평가 계약 재정의

### 목표

Mock 회귀용 정답과 실제 TourAPI 데이터의 품질 평가를 분리해, OpenRouter 비용을 쓰기 전에 무엇을 성공으로 볼지 확정한다.

### 권장 방향

- 기존 35개 fixture는 `mock regression`으로 보존한다.
- live fixture를 별도로 만들고 가능한 경우 title보다 안정적인 `contentId`를 주 정답으로 사용한다.
- 사람이 확인한 별칭과 문화 분류 보정만 허용한다.
- `CONTENT_ID_OVERRIDES`는 검증된 contentId에 한해 최소한으로 채우고 근거를 문서화한다.
- live fixture의 지역·문화·빈 결과 케이스는 현재 MySQL 표본에 실제 존재하는 데이터로 구성한다.

### 포함 범위

- `ragEvaluationService`와 `evaluateRag.js`의 Mock/live 비교 규칙 명시
- title, alias, `contentId`, `cultures=[]`의 판정 우선순위 확정
- live fixture 버전·소유자·데이터 갱신 규칙
- OpenRouter 호출 없이 가능한 계약·단위 테스트 정리
- Qdrant schema 변경이 필요한지 검토하되 승인 없이 변경하지 않음

### 완료 조건

- Mock 회귀와 live 품질 지표가 서로 오염되지 않는다.
- 같은 장소의 TourAPI title 변경이 거짓 실패를 만들지 않는다.
- 미분류 장소를 숨기지 않고 보정 근거와 잔여 한계를 설명할 수 있다.

## 9. R15 — OpenRouter live RAG·AI 연결과 품질/비용 검증

### 목표

R14에서 확정한 계약을 사용해 실제 BGE-M3 임베딩, Qdrant 검색과 구조화 코스 변형을 최소 비용으로 검증한다.

### 선행 조건

- OpenRouter 키와 사용 한도 준비
- `baai/bge-m3`와 생성 모델의 현재 이용 가능 여부·가격 확인
- R14 live fixture와 합격 기준 승인

### 실행 순서

1. 비밀값이 로그·문서·Git에 노출되지 않는지 확인한다.
2. 실제 장소 1건 임베딩으로 차원 1024와 오류 계약을 검증한다.
3. 소수 장소 `--limit` 증분 인덱싱과 document hash skip을 확인한다.
4. 승인된 범위에서 전체 인덱싱 후 R14 live fixture를 평가한다.
5. Hit@K·MRR·hard filter·MySQL 원본 비율과 latency를 기록한다.
6. `/ai/transform` 1회 smoke 후 구조화 응답, 존재하는 `contentId`, 토큰·비용 상한을 확인한다.
7. 필요할 때만 threshold·프롬프트·모델을 조정하고 결과를 재측정한다.

### 제외 범위

- 무제한 재시도나 대량 호출
- Qdrant를 원본 DB로 사용하는 변경
- 평가 통과를 위한 Mock 문서나 실데이터 임의 조작

### 완료 조건

- 실제 검색 후보가 MySQL 원본으로 재검증되고 승인된 live 기준을 충족한다.
- AI 응답은 후보에 없는 장소를 만들지 않고 Flutter 계약에 맞는다.
- 호출량·토큰·비용과 실패 시 mock/fallback 운영 정책이 문서화된다.

## 10. R16 — 배포·비용·보안·공모전 제출 마감

### 목표

로컬 검증 결과를 배포 환경과 Google Play 대상 앱으로 옮기고 재현 가능한 데모와 운영 문서를 완성한다.

### 포함 범위

- 로컬 MySQL과 분리된 staging/production DB, 최소 권한 계정과 migration runbook
- HTTPS Backend URL, CORS, 환경변수와 비밀값 관리
- Qdrant 재인덱싱·복구 절차와 OpenRouter 예산·rate limit·장애 정책
- release에서 의도하지 않은 mock 경로 차단 또는 명시적 fallback 표시
- Android application ID·서명·권한·API 키 제한과 release 빌드
- 핵심 시나리오, 장애 시나리오, 발표용 데이터 흐름과 비용 설명
- 로그에 개인정보·키·전체 인증 URL이 남지 않는지 최종 점검

### 완료 조건

- 새 환경에서 schema→migration→Backend→Qdrant 재구축→앱 연결을 문서대로 재현할 수 있다.
- 실기기 핵심 흐름과 장애 fallback이 검증된다.
- 공모전 데모와 Google Play 제출 준비물이 정리된다.

## 11. 의존 관계

```text
완료 기반: TourAPI · MySQL 캐시 · Qdrant/RAG 코드 · AI UX
                              │
                              ▼
R11 이미지·상세·연관 장소 수직 연결
                              │
                              ▼
R12 Figma Make P0 확정 → R13 Flutter 적용·모바일 QA
                              │
                              ▼
R14 Mock/live RAG 평가 계약 재정의
                              │
                              ▼
R15 OpenRouter live 검색·AI 품질/비용 검증
                              │
                              ▼
R16 배포·보안·공모전·Google Play 마감
```

OpenRouter를 뒤로 미루는 것은 안전하다. R11~R14는 기존 TourAPI·MySQL·Qdrant 연결과 Mock RAG로 진행할 수 있다. 다만 R15 전에는 실제 의미 검색 품질과 실제 AI 코스 변형을 완료로 표현하지 않는다.

## 12. 공통 테스트·리뷰·보안 기준

- 정상, 빈 결과, 잘못된 입력, 외부 업무 오류, 타임아웃을 범위에 맞게 테스트한다.
- 기본 테스트는 실제 외부 API와 유료 서비스를 호출하지 않는다.
- live smoke는 사용자 승인 후 최소 횟수와 최소 데이터만 사용한다.
- `serviceKey`, Qdrant/OpenRouter 키와 전체 인증 URL을 출력하지 않는다.
- 공개 API나 Flutter 모델이 바뀌면 Swagger, 관련 `docs/`, Flutter 파서를 함께 갱신한다.
- 코드 PR은 `.agents/scripts/verify.cmd` 또는 범위별 명령으로 검증하고 별도 `gpt-5.6-sol high` 리뷰를 받는다.
- 팀원 변경과 겹치면 최신 diff를 먼저 읽고 호환성 영향을 설명한다.

## 13. 로드맵 갱신 규칙

1. PR이 머지되면 로드맵 ID, 실제 PR 번호, 머지 날짜와 결과를 갱신한다.
2. 테스트 개수는 참고값으로만 기록하고 새 세션에서 다시 측정한다.
3. 새 필수 작업을 기존 PR에 억지로 넣지 말고 별도 ID로 추가한다.
4. 첫 번째 미완료 항목 하나만 `다음 작업·계획 필요`로 표시한다.
5. 순서를 바꾸면 이유, 선행 조건과 뒤로 밀린 작업의 영향을 함께 기록한다.

## 14. 현재 세션 인수인계 포인트

- 현재 브랜치는 `main`이며 다음 구현 단위는 **R11 — 관광지 이미지·상세·연관 장소 수직 연결**이다.
- 사용자는 OpenRouter를 마지막 통합 단계로 미루고 이미지와 Figma/Flutter 디자인을 먼저 진행하기로 했다.
- R11 구현 전에는 이 문서의 결정 항목을 코드 기준으로 다시 제시하고 사용자의 명시적 `구현 시작`을 기다린다.
- R14 전에는 현재 35개 fixture를 live 품질 합격 기준으로 단정하거나 canonical title·문화값을 임의 보정하지 않는다.
- R15 전까지는 `USE_MOCK_RAG=true`를 기본으로 유지하고 OpenRouter live 완료를 주장하지 않는다.
- 로컬 MySQL과 Qdrant 환경 검증은 완료됐지만 배포용 DB와 실제 OpenRouter 임베딩·생성 검증은 별개다.
- 전체 검증과 독립 리뷰가 끝나도 사용자가 별도로 요청하기 전에는 커밋·푸시·PR을 생성하지 않는다.
