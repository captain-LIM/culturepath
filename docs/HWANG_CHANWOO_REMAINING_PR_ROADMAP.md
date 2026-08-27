# [황찬우 전용] 현행 잔여 작업과 PR 로드맵

> **기준 시점:** 2026-08-26
>
> **현재 작업 브랜치:** `feat/r17-live-rag-chatbot`
>
> **최신 결정:** R17을 Qdrant 기반 live RAG에서 MySQL·TourAPI 기반 AI 구조로 전환
> **용도:** 새 세션이 가장 먼저 읽는 황찬우 담당 현행 문서

R17의 통합 대화 화면, 구조화 세션, LLM 의도 해석, 지역 특성 태그, 코스 초안과
기존 장소 편집의 상세 결정은
[R17 AI 여행 도우미 최종 의사결정 기록](./R17_AI_ASSISTANT_DECISION_RECORD.md)을 따른다.

## 1. 현재 완료 상태

- R11 문화 장소 재분류·오탐 제거·근거 기반 정렬 완료
- R12 TourAPI 목록 이미지·상세 갤러리·연관 장소 연결 완료
- R14 Manus 프로토타입과 디자인 검수 완료
- R15 승인 디자인의 Flutter 반영과 CI 검증 완료
- R16 Mock/live RAG 평가 계약 분리와 MySQL fixture 감사 완료
- R16.1 문화별 복수 검색어, 안전한 교차 분류, 지역 경계와 Backend 페이지 계약 완료
- R16.2 Flutter 장소 목록의 다음 50개 추가 로딩·중복 제거·재시도 완료
- R16.3 공개 코스 장소 사용 횟수 집계와 Backend 응답 계약 완료
- 로컬 MySQL 8.4.11 연결·migration·실데이터 캐시 검증 완료
- Qdrant 연결과 OpenRouter BGE-M3 1건·1024차원 응답 확인은 과거 기술 검증으로 완료

TourAPI 제한 표본은 14개 문화×지역 조합 중 비어 있지 않은 결과가 `7개 → 12개`로
개선됐다. 강릉·전주 책방은 검색 로직만으로 채울 수 없는 TourAPI 원천 데이터 공백이
확인됐다.

2026-08-26 제품 결정으로 Qdrant·BGE-M3는 제출 전 운영 경로에서 제외한다. 따라서 과거
벡터 검색 구현과 검증 결과는 이력으로만 남으며, 실제 Qdrant 인덱싱·Hit@K·MRR 평가는
더 이상 R17 완료 조건이 아니다.

## 2. 황찬우의 남은 PR 순서

| 우선순위 | PR | 상태 | 핵심 결과 |
| --- | --- | --- | --- |
| 1 | R17 AI 구조 전환·여행 챗봇 | 현재 작업 | MySQL→TourAPI 후보 resolver, 검증 장소 설명, Qdrant 의존 제거 |
| 2 | R17 코스 다듬기 축소 | R17 내부 분리 커밋 | 현재 코스 장소의 삭제·Day 이동·명시적 순서 변경만 허용 |
| 3 | 장소 사용 횟수 UI | 별도 결정 | `공개 코스 N개에 담김` 표시, 정렬 변경은 별도 판단 |
| 4 | R18 배포·실기기·Google Play 준비 | 마지막 통합 | 운영 Backend/DB/비밀값, Android release, 장애·비용 검증 |

시간이 촉박해 R17은 한 PR로 진행할 수 있지만, 변경 목적별 커밋은 분리한다. 카카오·네이버
상업시설 보완과 추가 디자인 손질은 현재 우선순위에서 보류한다.

## 3. R17 — AI 구조 전환과 여행 챗봇

### 목표 흐름

```text
사용자 질문
→ Backend 지역·문화 추출
→ MySQL 캐시 조회
→ 후보 부족·갱신 필요 시 TourAPI 조회
→ 공식 코드 우선 + 모호 문화 복수 검색어
→ 엄격한 지역·문화 재검증
→ 검증된 후보만 LLM에 전달
→ 자연어 답변 + Backend 생성 장소 카드
```

### 구현 범위

1. LLM strict Schema와 Backend allowlist 검증을 결합한 다중 턴 의도 해석
2. 짧은 수명의 구조화 세션과 일반·코스 진입 문맥
3. 황찬우가 관리하는 검토된 지역 특성 태그
4. `places_cache`·`place_query_cache`를 우선 사용하는 후보 resolver
5. 부족하거나 갱신이 필요한 경우에만 TourAPI 보완 호출
6. 공식 `lclsSystm1~3`로 정확히 찾을 수 있는 문화는 코드 기반 우선
7. 공식 코드가 모호한 문화는 복수 검색어로 넓힌 뒤 엄격한 분류로 재검증
8. LLM에는 검증된 후보만 전달하고 `sources`는 Backend가 직접 구성
9. 검증 후보 기반 코스 초안·사용자 확인·저장 후 세션 지속
10. Flutter 통합 AI 화면, 장소 카드, 미리보기, 로딩·빈 결과·오류·재시도
11. Qdrant·embedding의 활성 경로·환경변수·스크립트·평가 의존 정리

### 완료 조건

- 캐시 hit에서는 TourAPI를 호출하지 않는다.
- 캐시 부족 때만 제한된 TourAPI 호출로 후보를 보완한다.
- 후보가 없으면 가짜 장소로 채우지 않는다.
- AI 본문이 후보 밖 장소를 언급해도 클릭·저장 가능한 카드가 되지 않는다.
- `sources`의 모든 장소가 숫자형 TourAPI `contentId`와 MySQL/TourAPI 원본을 가진다.
- Qdrant·BGE-M3 없이 챗봇의 탐색 흐름이 동작한다.
- 긴 대화도 서버의 20개·8,000자 제한 안에서 최신 이력만 전송한다.
- OpenRouter rate limit, timeout, 비용 상한과 장애 상태가 문서·테스트에 반영된다.

## 4. R17 — 기존 장소 전용 코스 다듬기

### 지원

- 현재 코스의 기존 장소 삭제
- 기존 장소의 Day 이동
- 사용자가 대상을 명시한 순서 변경
- 변경 전/후 미리보기, 취소, 원본 복구
- Backend의 소유권·허용 `contentId`·Day·순서·중복·개수 검증

### 제외

- 신규 장소 자동 검색·추가·교체
- Qdrant·embedding·TourAPI 후보 검색
- 거리·이동시간 없이 수행하는 `알아서 최적 동선` 요청
- 검증 데이터가 없는 날씨·식이·접근성 조건 추측
- 사용자 승인 전 DB 변경

장소가 더 필요한 사용자는 AI 여행 챗봇에서 추천 카드를 보고 직접 코스에 담는다.
제목·설명은 장소 편집 범위에서 자동 변경하지 않고 원본을 유지한다.

## 5. R18 — 배포·실기기·Google Play 준비

### Backend와 데이터

- 로컬과 분리된 staging/production MySQL 및 최소권한 계정
- `schema.sql`과 모든 migration의 신규 구축·기존 DB 재실행·복구 runbook
- HTTPS Backend, CORS, 환경변수와 비밀값 관리
- TourAPI 캐시 TTL·stale·fail-open과 신규 후보 resolver 운영 점검
- OpenRouter 예산 한도, rate limit, timeout과 장애 안내
- release 환경에서 의도하지 않은 mock 모드 차단

### Android와 통합 검증

- API base URL과 Google Maps 키의 release 제한
- Android application ID, 서명, 권한, release APK/AAB
- 실제 기기 safe area, IME, 위치 권한, TalkBack, 이미지 메모리·스크롤
- Backend·TourAPI·MySQL·OpenRouter 각각의 장애 시 사용자 상태
- 개인정보, 키, 인증 URL, 민감 로그 최종 점검
- 공모전 데모와 Google Play 설명·스크린샷·개인정보처리방침 준비

## 6. 완료 계약 — R16.2·R16.3

### 장소 목록 추가 로딩

Flutter는 첫 50개 뒤에 Backend가 제공하는 다음 페이지를 이어 붙이며 `contentId` 중복
제거·추가 로딩 실패 재시도·마지막 페이지 상태를 분리한다. Backend 최대 5페이지 계약을
유지한다.

### 공개 코스 장소 사용 횟수

같은 장소가 한 코스에 여러 번 있어도 한 번만 세고 공개 코스만 집계한다.
`publicCourseCount`는 정상 미사용 `0`, 집계 장애 `null`이다. 현재 Backend 응답까지만
구현했으며 Flutter 표시와 이 값에 의한 정렬은 별도 결정이다. 세부 계약은
[공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md)을 따른다.

## 7. 보류·담당 제외

| 항목 | 상태와 이유 |
| --- | --- |
| 카카오·네이버 상업시설 보완 | 이용약관, 영구 저장, 지도 교차 표시 정책 확인 후 별도 검토 |
| 추가 FE 디자인 손질 | 황찬우 요청으로 R17·R18보다 뒤로 보류 |
| 다국어 관광 데이터 | 임수민 담당; 황찬우는 AI의 canonical `contentId` 호환성만 확인 |
| 지도 고도화·GPS UX | 임수민 담당; 황찬우는 머지 후 통합 회귀만 확인 |
| 의미 검색 재도입 | 구조화 필터로 해결되지 않는 실제 사용 사례가 확인된 뒤 제출 후 검토 |

## 8. 작업 시작 규칙

새 세션은 이 문서와 작업 관련 현행 계약만 먼저 읽는다. 완료 이력은
[`archive`](./archive/README.md), 폐기된 설계는 [`decay`](./decay/README.md)를 필요할 때만
연다.

코드 PR은 다음 순서를 지킨다.

```text
최신 main 확인
→ PR 목표·포함·제외 범위 설명
→ 황찬우 의사결정
→ 명시적인 구현 시작 지시
→ 구현·자동 테스트
→ 별도 gpt-5.6-sol high 리뷰
→ 황찬우 요청 후 커밋·푸시·한국어 PR
```

## 9. 항상 참고할 현행 계약

- [서비스 계획서](./문화여행_따라가방_서비스_계획서.md)
- [팀 역할 및 협업 기준](./TEAM_ROLES.md)
- [AI 기능 개편 계약](./AI_MYSQL_TOURAPI_LLM_TARGET_ARCHITECTURE.md)
- [R17 AI 여행 도우미 최종 의사결정 기록](./R17_AI_ASSISTANT_DECISION_RECORD.md)
- [AI 여행 챗봇 계약](./AI_CHAT_CONTRACT.md)
- [AI 코스 다듬기 계약](./AI_TRANSFORM_CONTRACT.md)
- [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md)
- [장소 캐시 계약](./PLACE_CACHE_CONTRACT.md)
- [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md)
- [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md)
