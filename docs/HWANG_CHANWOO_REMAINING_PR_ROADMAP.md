# [황찬우 전용] 잔여 PR 로드맵과 세션 인수인계

> **문서 소유자:** 황찬우
>
> **최종 갱신:** 2026-08-13
>
> **담당 범위:** 외부 API 연동 · 관광 데이터 품질 · RAG/AI Backend · Frontend UI/UX Design 및 API 연결
>
> **목적:** 세션이 바뀌어도 완료 상태, 다음 PR 범위, 결정과 검증 기준을 동일하게 이어가기 위한 기준 문서

## 1. 문서 지위와 작업 규칙

- 이 문서는 황찬우 담당 작업을 **PR 실행 단위**로 나눈 기준 문서다.
- `R1`~`R18`은 로드맵 ID이며 실제 GitHub PR 번호와 무관하다.
- 과거 R1~R10은 완료·부분 구현 이력이다. 2026-08-13 이후 잔여 작업은 최신 코드와 팀원 요청을 반영해 R11~R18로 다시 기준화했다.
- 세부 요구사항은 [황찬우 전용 실행계획](./HWANG_CHANWOO_WORK_PLAN.md), [외부 관광 API 검증 체크리스트](./API_VALIDATION_CHECKLIST.md), [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md)을 함께 읽는다.
- 외부 API 키, Google Maps 키, Qdrant/OpenRouter 키, 인증 헤더와 전체 인증 URL은 문서와 로그에 기록하지 않는다.

새 구현 세션은 다음 순서를 따른다.

1. `git status --short --branch`, 최신 `origin/main`, 최근 커밋과 팀원 diff를 확인한다.
2. 로컬 `AGENTS.md`, `.agents/WORKFLOW.md`와 이 문서를 읽는다.
3. 첫 미완료 PR의 원인, 목표, 포함·제외 범위, 예상 파일, 테스트와 완료 조건을 설명한다.
4. 결정 항목마다 선택지의 원리·영향·장단점과 권장안을 제시한다.
5. 사용자가 결정을 마쳐도 별도 메시지로 `구현 시작`을 지시하기 전에는 수정·브랜치 생성을 하지 않는다.
6. 코드 PR은 자동 검증 뒤 구현에 참여하지 않은 `gpt-5.6-sol high` 리뷰를 받는다.
7. 커밋·푸시·PR 생성은 사용자의 별도 요청 때만 수행하며 PR 제목과 본문은 한국어로 작성한다.

임수민 담당의 공개 API·DB·Flutter 계약에 영향을 주는 범위 확대가 발견되면 구현을 멈추고 추가 결정을 받는다.

## 2. 현재 기준 상태

### 2.1 완료된 기반

| 로드맵/변경 | 실제 PR·커밋 | 완료 내용 |
| --- | --- | --- |
| 기반 | PR #4·#5 | 공공데이터 클라이언트, TourAPI 목록·검색, 장소 정규화와 문화 분류 |
| R1~R4 | PR #6~#9 | 장소 상세, MySQL 캐시, 연관 장소, DataLab 지역 점수 |
| 안정화 | PR #10 | migration, 코스 생성·Fork 멱등성, RAG/AI 어댑터 기반 |
| R7~R9 | PR #11~#13 | Qdrant 인덱싱 코드, RAG 검색·평가 기반, 구조화 AI 변형 Backend |
| R10 | PR #14 | Flutter AI 변경안, semantic diff, 적용·취소·원본 복구 UX |
| 팀원 지도 기능 | `67a1943`, `8195d41`, `64fcfc2` | 코스 Day별 Google Map, 좌표 저장·응답, 최신 코스 재조회, 지도 pan 수정 |

2026-08-13 재검증 기준:

- Backend 자동 테스트 `214/214` 통과
- 최신 GitHub CI의 Backend tests와 Flutter analyze/tests 성공
- 로컬 MySQL 8.4.11 연결과 TourAPI 캐시 저장 성공
- `course_tracks.place_latitude`·`place_longitude` migration 적용·재실행 성공
- 현재 로컬 `course_tracks`가 비어 있어 좌표 백필 대상 없음
- Qdrant 환경·연결 검증 완료, OpenRouter 실임베딩·실생성은 미실행

### 2.2 팀원 요청과 현재 코드의 실제 차이

| 팀원 요청 | 코드 재검증 결과 | 해결 PR |
| --- | --- | --- |
| 문화별 관련도 낮은 관광지 제거·높은 장소 우선 | `/regions/:code/spots`가 대표 키워드 결과를 재분류하지 않고 모든 결과에 선택 culture를 덮어씀 | R11 |
| 관광지마다 사진 배경 | Flutter `SpotCard`는 아직 `이미지 준비 중`; Backend 상세 이미지와 목록 UI가 미연결 | R12 |
| 언어 선택 시 관광지도 해당 언어 | `context.setLocale()`은 앱 고정 문구만 변경; TourAPI title·주소·소개는 한국어 유지 | R13 |
| 탐색에 내가 만든 코스, 홈 빈 공간 보완 | `getMyCourses()`는 존재하지만 탐색은 피드·랭킹뿐이고 홈은 시즌 배너·문화 그리드에서 끝남 | R14·R15 |
| AI 같지 않은 디자인 | Figma Make 최종 원본·휴먼 디자인 검수 기준 미확정 | R14·R15 |
| 지도 활용 확대 | 코스 Day별 마커·pan은 완료; 지역 목록/지도 전환·마커 카드·순서선은 없음 | R14·R15 |

### 2.3 RAG fixture와 live 데이터 계약 충돌

- `rag-evaluation-v1.json`은 35개 case와 Mock 문서 기반 고유 기대 title 12개를 가진다.
- 현재 live 비교는 title 정규화 문자열을 사용하며 장소 별칭 canonicalization은 없다.
- 실제 TourAPI title과 Mock title이 다르거나 `cultures=[]`이면 같은 장소도 기존 fixture에서 실패할 수 있다.
- 기존 fixture는 Mock 회귀로 보존한다. R16 전에는 fixture, Mock title, culture rule, `CONTENT_ID_OVERRIDES`, Qdrant schema를 평가 통과 목적으로 임의 변경하지 않는다.

## 3. 앞으로 실행할 PR 순서

| 순서 | ID | 상태 | 목표 | 선행 조건 |
| --- | --- | --- | --- | --- |
| 1 | R11 | **다음 작업·계획 필요** | 문화별 관광지 관련도·정렬 품질 | 현행 TourAPI 분류·검색 계약 |
| 2 | R12 | 대기 | 관광지 이미지·상세·연관 장소 수직 연결 | R11 공개 목록 계약 |
| 3 | R13 | 대기 | 다국어 관광지 데이터 계약과 연결 | R12 장소 모델·상세 화면 |
| 4 | R14 | 대기 | Figma Make 정보구조·P0 디자인·지도 UX 확정 | R11~R13 사용자 데이터 상태 |
| 5 | R15 | 대기 | Flutter 디자인 적용·지도 고도화·모바일 QA | R14 디자인 승인 |
| 6 | R16 | 대기 | 실제 TourAPI 기준 RAG 평가 계약 재정의 | R11 분류 정책·실제 MySQL 표본 |
| 7 | R17 | OpenRouter 준비까지 대기 | OpenRouter live RAG·AI 품질/비용 검증 | R16 live fixture·예산 승인 |
| 8 | R18 | 대기 | 배포·비용·보안·Google Play·공모전 마감 | R11~R17 완료 |

실행 순서는 **관련도 → 이미지 → 다국어 → 디자인 → Flutter/지도 → RAG 평가 → OpenRouter → 배포**다. 한 번에 하나의 코드 PR만 구현한다.

## 4. R11 — 문화별 관광지 관련도·정렬 품질

### 원인과 목표

`/regions/:code/spots?culture=...`는 culture 대표 키워드로 `searchKeyword2`를 호출한 뒤 결과를 다시 검증하지 않고 `category: cultureFilter`로 덮어쓴다. 검색어를 포함했다는 사실만으로 해당 문화 장소라고 단정하지 않고, 근거가 강한 실제 장소가 먼저 나오게 만든다.

### 포함 범위

- 지역 목록과 culture 대표 키워드 결과 병합·`contentId` 중복 제거
- 선택 culture를 결과에 무조건 덮어쓰는 동작 제거
- 신뢰 순서 정의: 검증된 contentId override → 공식 중·소분류 → 제목 규칙 → 보조 검색 후보
- culture 불일치 결과 제거와 근거 기반 안정 정렬
- 후보 부족 시 검증된 `SPOT_MAP` fallback 정책
- `/regions/:code/spots`와 `/places/search`의 문화 판정 일관성
- 10개 문화별 정상·오탐·미분류·빈 결과 fixture와 회귀 테스트
- Swagger·장소 계약·품질 검증 문서 갱신

### 제외 범위

- Qdrant 의미 순위·OpenRouter 호출
- 개인화·사용자 행동 추천
- 관련도를 가장해 검증되지 않은 contentId를 override에 추가하는 행위

### 결정 필요

- 관련도 점수를 공개 API에 노출할지 내부 정렬에만 사용할지
- strict filter 뒤 최소 후보 수와 fallback 허용 범위
- R11에서 사용할 대표 지역·문화 검증 조합

### 완료 조건

- 선택 문화와 무관한 장소가 자동으로 해당 culture가 되지 않는다.
- 같은 fixture에서 강한 근거의 장소가 항상 약한 후보보다 앞선다.
- 후보 부족과 TourAPI 장애가 빈 결과 또는 검증된 fallback으로 명확히 구분된다.

## 5. R12 — 관광지 이미지·상세·연관 장소 수직 연결

### 목표와 포함 범위

- `/regions/:code/spots`에 nullable `thumbnailUrl`, `imageUrl` 전달
- Flutter `SpotItem`·`PlaceItem`·Repository의 이미지 계약
- 카드 배경 이미지, 가독성 overlay와 이미지 대체 설명
- 우선순위: `thumbnailUrl` → `imageUrl` → 로컬 placeholder
- 로딩·깨진 URL·빈 이미지·느린 네트워크 fallback과 네트워크 이미지 캐시
- `/places/:id` 장소 상세, `images` 갤러리, `/places/:id/related` 연관 장소 UI
- 목록에서 장소별 `detailImage2`를 재호출하는 N+1 방지
- Backend·Swagger·Flutter·테스트 동시 갱신

### 제외 범위

- 자체 이미지 업로드·CDN·크롤링
- 출처·이용조건이 확인되지 않은 이미지
- 전체 Figma 리디자인

### 결정 필요

- 네트워크 이미지 캐시 패키지와 갤러리 최대 장수
- 상세 화면 진입 구조
- 기본 placeholder의 브랜드 표현과 출처 표기 위치

### 완료 조건

- 이미지가 있는 실제 장소는 목록과 상세에 표시되고, 없어도 레이아웃이 깨지지 않는다.
- 상세·연관 장소 이동과 코스 담기가 기존 좌표 흐름을 보존한다.

## 6. R13 — 다국어 관광지 데이터 계약과 연결

### 원인과 목표

현재 한국어·영어·일본어·중국어 선택은 Flutter 번역 JSON에 있는 고정 UI 문구만 바꾼다. 장소 title·주소·소개·운영정보도 선택 언어로 표시하되, 공식 원문과 동일 장소 식별자를 잃지 않는 구조를 만든다.

### 권장 원칙

- 공식 다국어 관광 데이터가 있는 필드를 우선 사용한다.
- 공식 번역이 없는 필드만 명시적인 번역 공급자와 캐시를 검토한다.
- 실시간 화면 요청마다 LLM으로 번역하지 않는다.
- canonical `contentId`와 원본 한국어 데이터는 유지하고 표시 언어만 분리한다.

### 포함 범위

- Flutter locale을 Backend 요청에 전달하는 계약(`lang` 또는 표준 헤더)
- 현재 Flutter locale `ko`, `en`, `ja`, `zh`와 목표 관광 데이터 locale의 매핑
- 공식 `EngService2`, `JpnService2`, `ChsService2`, `ChtService2`의 장소 ID·지역 코드·필드 매핑 검증
- title·주소·소개·운영정보의 locale별 nullable 모델과 fallback 순서
- locale이 포함된 캐시 키 또는 별도 번역 캐시 전략
- 코스 저장값과 표시용 현지화 데이터의 경계
- 미지원 언어·번역 누락·혼합 언어·API 장애 테스트
- API 신청이나 추가 비용이 필요하면 구현 전 별도 승인

### 결정 필요

- 공식 다국어 TourAPI 추가 활용 신청 범위
- `Accept-Language`와 query `lang` 중 공개 계약
- 현재 단일 `zh`를 간체(`zh-CN`)로 매핑할지, 간체·번체(`zh-CN`·`zh-TW`)로 분리할지
- 번역 누락 시 한국어 fallback 표시 여부와 UI 표식
- OpenRouter 번역 fallback을 사용할지; 권장은 초기 제외

### 완료 조건

- 언어 변경 뒤 앱 문구뿐 아니라 지원되는 관광지 데이터도 해당 언어로 재조회된다.
- 번역이 없어도 동일 `contentId`의 한국어 원본으로 안전하게 fallback한다.
- locale별 데이터가 캐시에서 서로 덮어쓰이지 않는다.

## 7. R14 — Figma Make 정보구조·P0 디자인·지도 UX 확정

### 목표

R11~R13의 실제 데이터 상태를 기준으로 화면 구조와 시각 언어를 확정하고, Figma Make 산출물을 사람이 설계한 제품처럼 검수한다.

### 포함 범위

- 서비스 계획서와 최신 Flutter 화면 감사
- 탐색 정보구조: `내 코스 / 커뮤니티 / 인기 코스`의 역할과 로그인 상태
- 홈 하단: 최근 편집 코스, 인기 지역, 계절 추천, 저장 코스 중 실제 데이터 가능한 섹션 선정
- 지역 상세의 목록/지도 전환, 마커 선택 카드와 상세 진입
- 코스 지도의 번호 마커, Day 구분과 단순 방문 순서선
- 홈·문화·지역·장소·코스·AI의 360·390·430dp 화면과 주요 상태
- 색·타입·간격·radius·elevation·아이콘 토큰과 Flutter 수치 명세
- loading·empty·error·offline/stale·long text·이미지/번역 없음 상태
- Figma Make 프롬프트, 결과 검수표와 임수민 핸드오프

### “AI 같은 디자인” 방지 기준

- 모든 요소를 둥근 카드·pill·gradient로 만들지 않는다.
- 의미 없는 hero 문구·장식·과도한 그림자와 빈 공간을 제거한다.
- 실제 관광지 사진, 지도, 일정과 한국어 데이터가 정보 위계를 이끈다.
- 여행 노트·지도·티켓·사진 기록물의 편집 감각을 사용하되 일관된 토큰을 지킨다.
- AI 기능은 보라색 반짝이 중심 주인공이 아니라 코스 편집 보조 도구로 표현한다.
- Figma Make 결과를 그대로 승인하지 않고 반복 패턴·접근성·실제 데이터 적합성을 사람이 검수한다.

### 지도 비용 경계

- 클라이언트 마커·순서선·목록 연동은 포함한다.
- 실제 도보/차량 경로·시간 계산은 Google Routes/Directions 비용과 약관 승인 전 제외한다.

### 완료 조건

- 팀원 요청의 홈·탐색·지도 구조가 상태별로 명세된다.
- Figma 컴포넌트와 토큰을 Flutter로 모호함 없이 옮길 수 있다.

## 8. R15 — Flutter 디자인 적용·지도 고도화·모바일 QA

### 포함 범위

- R14 Theme·컴포넌트·P0 화면 적용
- 탐색의 내 코스 접근과 홈의 승인된 추가 섹션 구현
- 지역 목록/지도 전환, 마커↔관광지 카드 동기화
- 코스 번호 마커·단순 순서선·Day별 표시
- 기존 코스 지도와 최신 서버 재조회 흐름 보존
- 접근성 label·색 대비·터치 영역·text scale·긴 다국어 대응
- 360·390·430dp와 Android 실기기 QA
- Google Maps 키 누락·빈 좌표·부분 좌표·지도 실패 상태
- `flutter analyze`, `flutter test`, Android release 빌드

### 제외 범위

- 유료 경로 탐색 API
- OpenRouter live 연결
- 최종 스토어 등록

### 완료 조건

- 문화→지역→장소→상세→지도→코스→AI 변경안 흐름이 휴대폰에서 깨지지 않는다.
- Figma 명세와 실제 캡처 차이를 검수하고 P0 차이를 해소한다.

## 9. R16 — 실제 TourAPI 기준 RAG 평가 계약 재정의

### 목표와 권장 방향

- 기존 35개 fixture는 Mock regression으로 보존
- 실제 TourAPI 표본 기반 live fixture를 별도로 생성
- live 정답은 가능한 경우 title보다 안정적인 `contentId` 중심
- R11에서 확정한 문화 분류·override 근거를 재사용
- `ragEvaluationService`, `evaluateRag.js`의 Mock/live 판정 규칙 분리
- title alias, canonicalization, `cultures=[]`, 번역 title의 판정 우선순위 정의
- Qdrant schema 변경은 검토하되 승인 없이 변경하지 않음

### 완료 조건

- Mock 회귀와 live 품질 지표가 오염되지 않는다.
- 같은 장소의 title·locale 변화가 거짓 실패를 만들지 않는다.
- 미분류·번역 누락을 숨기지 않고 근거와 한계를 설명할 수 있다.

## 10. R17 — OpenRouter live RAG·AI 품질/비용 검증

### 선행 조건

- OpenRouter 키·사용 한도와 현재 모델 이용 가능 여부·가격 확인
- R16 live fixture와 합격 기준 승인

### 최소비용 실행 순서

1. 실제 장소 1건 BGE-M3 임베딩과 1024차원 확인
2. 소수 `--limit` 인덱싱과 document hash skip 검증
3. 승인된 전체 인덱싱과 R16 live 검색 평가
4. Hit@K·MRR·hard filter·MySQL 원본 비율·latency 기록
5. `/ai/transform` 최소 smoke로 JSON Schema·실제 `contentId`·토큰 상한 확인
6. 필요할 때만 threshold·프롬프트·모델 조정

### 완료 조건

- 실제 검색 후보가 MySQL 원본으로 재검증되고 승인된 live 기준을 충족한다.
- AI가 후보에 없는 장소를 만들지 않고 비용·오류·fallback 정책이 문서화된다.

## 11. R18 — 배포·비용·보안·Google Play·공모전 마감

### 포함 범위

- 로컬과 분리된 staging/production MySQL, 최소권한 계정과 migration runbook
- HTTPS Backend, CORS, 환경변수와 비밀값 관리
- Qdrant 재인덱싱·복구와 OpenRouter 예산·rate limit·장애 정책
- 다국어·이미지·Google Maps 공급자 키 제한과 이용조건·출처 확인
- release에서 의도하지 않은 mock 경로 차단 또는 명시적 fallback
- Android application ID·서명·권한·release 빌드
- 핵심/장애 시나리오, 발표용 데이터 흐름·품질·비용 설명
- 개인정보·키·전체 인증 URL 로그 최종 점검

### 완료 조건

- 새 환경에서 schema→migration→Backend→Qdrant→앱 연결을 문서대로 재현할 수 있다.
- 실기기 핵심 흐름과 장애 fallback, 공모전 데모와 Google Play 준비물이 검증된다.

## 12. 의존 관계

```text
R11 문화 관련도
  ↓
R12 이미지·상세·연관 장소
  ↓
R13 다국어 관광 데이터
  ↓
R14 Figma 정보구조·P0·지도 UX
  ↓
R15 Flutter 적용·지도·모바일 QA
  ↓
R16 Mock/live RAG 평가 계약
  ↓
R17 OpenRouter live 검색·AI
  ↓
R18 배포·보안·Google Play·공모전
```

R11~R16은 OpenRouter 없이 진행할 수 있다. R17 전에는 실제 의미 검색 품질과 실제 AI 생성을 완료로 표현하지 않는다.

## 13. 공통 검증·리뷰·보안 기준

- 기본 테스트는 외부 API·유료 서비스에 접속하지 않는다.
- live smoke는 사용자 승인 후 최소 데이터·최소 횟수로 실행한다.
- 정상·빈 결과·잘못된 입력·결측·타임아웃·상류 오류·locale 차이를 범위에 맞게 테스트한다.
- 공개 API나 Flutter 모델이 바뀌면 Swagger, 관련 docs와 Flutter 파서를 함께 갱신한다.
- 비밀값과 전체 인증 URL을 출력하지 않는다.
- 코드 PR은 범위별 자동 검증과 별도 `gpt-5.6-sol high` 리뷰를 받는다.
- 팀원 변경과 겹치면 최신 diff를 먼저 읽고 호환성 영향을 설명한다.

## 14. 현재 세션 인수인계

- 현재 브랜치는 `main`, 다음 구현 단위는 **R11 — 문화별 관광지 관련도·정렬 품질**이다.
- R11은 일반 탐색 품질이며 Qdrant/OpenRouter RAG와 구분한다.
- 다국어 관광 데이터는 새 R13 범위다. 현재 언어 선택은 앱 고정 UI 문구만 바꾼다.
- 팀원의 코스 지도·좌표 저장은 완료됐고 로컬 좌표 migration도 적용됐다. 지역 지도와 지도 UX 고도화는 R14·R15에 남아 있다.
- OpenRouter는 R17로 연기하며 그전까지 `USE_MOCK_RAG=true`를 기본으로 유지한다.
- 사용자가 명시적으로 `구현 시작`하기 전에는 R11 코드를 수정하지 않는다.
- 사용자가 별도로 요청하기 전에는 커밋·푸시·PR을 생성하지 않는다.
