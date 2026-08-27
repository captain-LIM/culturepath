# [황찬우 전용] 현행 잔여 작업과 PR 로드맵

> **기준 시점:** 2026-08-25
> **현재 기준 브랜치:** `main`
> **최신 반영:** PR #21 R16.1 문화 장소 검색 재현율·페이지 계약
> **용도:** 새 세션이 가장 먼저 읽는 황찬우 담당 현행 문서

## 1. 현재 완료 상태

- R11 문화 장소 재분류·오탐 제거·근거 기반 정렬 완료
- R12 TourAPI 목록 이미지·상세 갤러리·연관 장소 연결 완료
- R14 Manus 프로토타입과 디자인 검수 완료
- R15 승인 디자인의 Flutter 반영과 CI 검증 완료
- R16 Mock/live RAG 평가 계약 분리와 MySQL fixture 감사 완료
- R16.1 문화별 복수 검색어, 안전한 교차 분류, 지역 경계와 Backend 페이지 계약 완료
- R16.3 공개 코스 장소 사용 횟수 집계와 Backend 응답 계약 완료
- 로컬 MySQL 8.4.11 및 Qdrant 연결 검증 완료
- OpenRouter 실연결·실임베딩·실생성은 아직 하지 않음
- PR #21 기준 Backend 자동 테스트 `270/270` 통과, 독립 `gpt-5.6-sol high` 리뷰 `APPROVE`

TourAPI 제한 표본은 기존 14개 문화×지역 조합 중 비어 있지 않은 결과가 `7개 → 12개`로 개선됐다. 강릉·전주 책방은 검색 로직 문제가 아니라 현재 확인된 TourAPI 원천 데이터 공백으로 남아 있다.

## 2. 황찬우의 남은 PR 순서

| 우선순위 | PR | 상태 | 핵심 결과 |
| --- | --- | --- | --- |
| 1 | R16.2 Flutter 장소 추가 로딩 | 다음 작업 후보 | 첫 50개 뒤 다음 50개를 안전하게 이어 붙이는 모바일 UX |
| 2 | 장소 사용 횟수 UI | R16.2 이후 결정 | `공개 코스 N개에 담김` 표시, 정렬 변경은 별도 판단 |
| 3 | R17 OpenRouter live RAG·AI 검증 | 키·예산 준비 후 진행 | 실제 임베딩, Qdrant 검색 평가, AI 코스 변경안 smoke |
| 4 | R18 배포·실기기·Google Play 준비 | 마지막 통합 단계 | 운영 Backend/DB/비밀값, Android release, 장애·비용 검증 |

한 번에 하나의 코드 PR만 진행한다. 카카오·네이버 상업시설 보완과 추가 디자인 손질은 현재 우선순위에서 보류한다.

## 3. R16.2 — Flutter 장소 추가 로딩

### 원인

Backend는 `/regions/:code/spots`에 `pageNo`, `numOfRows`, `X-Has-More`, `X-Next-Page`를 제공하지만 Flutter `SpotsRepository`는 아직 첫 배열만 받아 화면에 표시한다. 따라서 사용자는 Backend의 다음 페이지 기능을 사용할 수 없다.

### 권장 범위

- 첫 요청과 추가 요청에 `pageNo`, `numOfRows=50` 전달
- Dio 응답 헤더에서 다음 페이지 상태 해석
- `contentId` 기준 중복 제거 후 기존 목록 뒤에 append
- 첫 로딩·추가 로딩·추가 로딩 실패·마지막 페이지 상태 분리
- 스크롤 끝 근처에서 한 번만 요청하고 중복 요청 방지
- 새로고침 시 page 1부터 다시 시작
- Backend 최대 5페이지 계약 준수
- 360·390·430dp와 긴 목록에서 스크롤·메모리 회귀 테스트

### 제외 범위

- Backend 검색·분류 규칙 변경
- 장소 인기도 또는 코스 사용 횟수 정렬
- 카카오·네이버 장소 검색
- 임수민 담당 다국어·지도 구조 변경

### 구현 전 확인

- 팀원이 같은 화면을 수정했는지 최신 `main` diff 확인
- API 응답 헤더를 Flutter Web과 Android에서 동일하게 읽을 수 있는지 확인
- 자동 추가 로딩과 명시적 `더 보기` fallback 중 현재 화면에 맞는 UX 결정

## 4. R17 — OpenRouter live RAG·AI 품질·비용 검증

### 최소비용 실행 순서

1. OpenRouter 키·결제 한도·현재 모델과 가격 확인
2. 실제 장소 1건 BGE-M3 임베딩 및 1024차원 검증
3. 소수 `--limit` 인덱싱과 document hash skip 확인
4. 승인 후 전체 장소 인덱싱과 live fixture 평가
5. Hit@K·MRR·hard filter·MySQL 원본 재검증 비율·latency 기록
6. `/ai/transform` 최소 smoke로 JSON Schema, 실제 `contentId`, 토큰 상한 확인
7. 기준 미달일 때만 threshold·프롬프트·모델 조정

### 완료 조건

- Qdrant 후보가 MySQL의 신뢰된 장소로 다시 검증됨
- Mock 35개와 live `contentId` 평가가 서로 오염되지 않음
- AI가 후보에 없는 장소를 만들지 않음
- 호출 비용, rate limit, timeout, fallback이 문서화됨

## 5. R18 — 배포·실기기·Google Play 준비

### Backend와 데이터

- 로컬과 분리된 staging/production MySQL 및 최소권한 계정
- `schema.sql`과 모든 migration의 신규 구축·기존 DB 재실행·복구 runbook
- HTTPS Backend, CORS, 환경변수와 비밀값 관리
- Qdrant 인덱스 생성·재색인·복구 절차
- OpenRouter 예산 한도, rate limit, 장애 시 fallback
- release 환경에서 의도하지 않은 mock 모드 차단

### Android와 통합 검증

- API base URL과 Google Maps 키의 release 제한
- Android application ID, 서명, 권한, release APK/AAB
- 실제 기기 safe area, IME, 위치 권한, TalkBack, 이미지 메모리·스크롤
- Backend·TourAPI·MySQL·Qdrant·OpenRouter 장애 시 사용자 상태
- 개인정보, 키, 인증 URL, 민감 로그 최종 점검
- 공모전 데모와 Google Play 설명·스크린샷·개인정보처리방침 준비

## 6. 완료 계약 — R16.3 Backend 장소 사용 횟수

같은 장소가 한 코스에 여러 번 들어가도 한 번만 세고, 공개 코스만 집계한다. 좋아요·완주·최신성 신호와 섞지 않고 `공개 코스 사용 횟수`를 독립 지표로 유지한다. 이번 PR은 `GET /regions/:code/spots`의 nullable `publicCourseCount` 응답과 집계 인덱스까지만 포함한다. Flutter 표시와 사용 횟수 기반 정렬은 제외하며, 기존 문화 관련도 순서를 유지한다. 세부 계약은 [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md)을 따른다.

## 7. 보류·담당 제외

| 항목 | 상태와 이유 |
| --- | --- |
| 카카오·네이버 상업시설 보완 | 이용약관, 영구 저장, Google Map 교차 표시 정책을 확인한 뒤 별도 검토 |
| 추가 FE 디자인 손질 | 황찬우 요청으로 R17·R18보다 뒤로 보류 |
| 다국어 관광 데이터 | 임수민 담당; 황찬우는 RAG·디자인 호환성만 확인 |
| 지도 고도화·GPS UX | 임수민 담당; 황찬우는 머지 후 통합 회귀만 확인 |

## 8. 작업 시작 규칙

새 세션은 이 문서와 작업 관련 계약 문서만 먼저 읽는다. 완료된 PR의 판단 근거가 필요할 때만 [`archive`](./archive/README.md)를 연다.

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
- [TourAPI 장소 계약](./TOUR_PLACE_CONTRACT.md)
- [장소 캐시 계약](./PLACE_CACHE_CONTRACT.md)
- [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md)
- [공개 코스 장소 사용 횟수 계약](./PLACE_USAGE_CONTRACT.md)
- [Qdrant 장소 인덱싱 계약](./QDRANT_PLACE_INDEXING_CONTRACT.md)
- [RAG 검색·필터·평가 계약](./RAG_SEARCH_EVALUATION_CONTRACT.md)
- [AI 코스 변형 계약](./AI_TRANSFORM_CONTRACT.md)
