# [황찬우 전용] R14 Manus 프로토타입 최종 결과와 R15 인계

> **문서 소유자:** 황찬우
>
> **상태:** 조건부 승인 — R15 Flutter 디자인 적용 착수 가능
>
> **완료일:** 2026-08-19
>
> **기록일:** 2026-08-20
>
> **연결 문서:** [R14 P0 디자인 명세](./R14_FIGMA_P0_DESIGN_SPEC.md) · [R14 디자인 검수표](./R14_DESIGN_REVIEW_CHECKLIST.md) · [관광지 이미지 UI 계약](./PLACE_MEDIA_UI_CONTRACT.md)

## 1. 최종 판정

R14는 Manus에서 독립형 Android 모바일 프로토타입을 만들고, 화면·상태·접근성·반응형을 두 차례 검수한 결과를 기준으로 **조건부 승인**한다. 확인된 `FAIL`은 0개이며 R15가 구현 과정에서 검증해야만 하는 항목은 `NOT_TESTED`로 넘긴다.

이 판정은 React 프로토타입을 제품 코드로 채택한다는 뜻이 아니다. R15는 이 결과를 시각·상호작용 명세로 사용하고 기존 Flutter 라우팅, Riverpod 상태, Backend API 계약과 저장 흐름을 보존해 다시 구현한다.

### 저장소 밖 최종 산출물

- 최종 패키지: `culturepath-r14-prototype-codex-final.zip`
- 패키지 내부 핵심 문서: `DESIGN_SYSTEM.md`, `SCREEN_CONTRACT.md`, `STATE_MATRIX.md`, `FIGMA_HANDOFF.md`, `R14_DUAL_DESIGN_AUDIT.md`, `R14_FINAL_CAPTURE_VALIDATION.md`
- 최종 캡처: `01_home.png`부터 `09_ai_refinement.png`까지 9개
- Manus 미리보기: `https://3000-izgdit5vs4vbm8ktrq6up-5ce1daa4.sg1.manus.computer/`

ZIP과 생성된 웹 프로젝트는 제품 소스나 장기 배포물이 아니므로 Git에 넣지 않는다. 저장소에는 재현 가능한 계약과 판정만 남긴다. Manus 링크는 만료될 수 있으므로 R15의 기준은 링크보다 최종 ZIP과 이 문서를 우선한다.

## 2. 완료 범위

| 영역 | 최종 결과 |
| --- | --- |
| 정보구조 | 홈·탐색·만들기·내정보 4개 하단 목적지와 홈·탐색 재구성을 확정했다. |
| 문화 탐색 | 문화 → 추천 지역 → 관광지 목록 → 상세 → 코스 담기 흐름을 연결했다. |
| 코스 | 소유자·게스트·공개 코스 identity, Day 1~3 편집, Fork와 원본 보존을 검증했다. |
| AI 변경안 | 조건 입력, 변경안 검토, 적용·취소·원본 복구와 실패 상태를 결정론적 fixture로 검증했다. |
| 상태 | loading·empty·error·stale·long text·이미지 없음·부분 오류·저장 실패 상태를 `/qa`에서 재현했다. |
| 반응형 | 360·390·430px에서 가로 overflow가 없고 390px text zoom 100·130·200%를 통과했다. |
| 접근성 | 44×44px 터치 영역, 48px 주요 버튼, AA 색 대비, 이미지 이름, AI live status를 검증했다. |
| 경계 | 지도 고도화와 다국어 데이터는 임수민 담당으로 유지하고 외부 API·로그인·지도·LLM은 프로토타입에 연결하지 않았다. |

## 3. 최종 토큰과 상호작용 보정

초기 명세에서 접근성 검수로 변경된 최종 값은 R15가 반드시 사용한다.

| 항목 | 최종 계약 | 근거 |
| --- | --- | --- |
| `terracotta` | `#C05534` | 흰색 텍스트 대비 `4.57:1` |
| `muted` | `#6D6E6D` | `paper` 배경 대비 `4.62:1` |
| 장소 이미지 이름 | 목록: `{장소명} 관광지 사진`; 상세: `{장소명} 관광지 사진 n/전체`; 없음: `{장소명} 사진 없음` | 장식 thumbnail은 Semantics에서 제외 |
| AI 완료 알림 | persistent status 영역, polite live announcement, atomic 완료 문구 | 적용·복구 시 focus 강제 이동 없음 |
| route 전환 | window와 주 스크롤 컨테이너를 최상단으로 초기화 | 상단 header와 4개 하단 목적지 유지 |

## 4. 검수 결과

| 분류 | PASS | FAIL | NOT_TESTED | 판정 |
| --- | ---: | ---: | ---: | --- |
| 차단 항목 | 4 | 0 | 2 | 실행 환경에서 실패 없음. Android 실기기와 Flutter 재현은 R15로 이관 |
| 필수 항목 | 30 | 0 | 4 | 실제 사진·Noto 실적용·Android IME·Figma 네이티브 구조는 후속 검수 |
| 개선 항목 | 2 | 0 | 1 | 실제 이미지 캐시·decode·scroll 성능은 R15에서 측정 |

### 최종 캡처 검증

- 환경: 로컬 production build, Microsoft Edge headless, 390×844px, DPR 1
- `pnpm check`: PASS
- `pnpm build`: PASS
- 9개 캡처의 크기, `window.scrollY=0`, 주 스크롤 `scrollTop=0`: PASS
- header: `y=0`, `height=76`, viewport 내부: PASS
- bottom navigation: `y=773`, `bottom=844`, 4개 목적지: PASS
- 캡처마다 별도의 Edge 프로세스를 사용해 compositor 상태 공유를 차단했다.

PNG별 SHA-256은 최종 패키지의 `R14_FINAL_CAPTURE_VALIDATION.md`에 기록되어 있다.

## 5. 승인 예외와 R15 이관

| 항목 | R14 결정 | R15 완료 조건 |
| --- | --- | --- |
| 실제 여행 사진 | placeholder를 R14 승인 예외로 허용 | 실제 TourAPI HTTPS 이미지를 연결하고 라이선스·없음·오류 상태를 재검수 |
| 이미지 성능 | 정책만 확정 | `cached_network_image`, thumbnail → image → placeholder, memory/disk 각 최대 1600px, 상세 최대 10장을 실제 asset으로 측정 |
| Android safe area·IME | desktop emulation까지만 확인 | 실제 Android 기기에서 status bar, gesture navigation, 키보드와 고정 CTA 가림 검수 |
| Flutter 재현 | 프로토타입 계약만 확인 | 360·390·430dp, text scale 1.3·2.0, Semantics와 overflow를 Flutter에서 검증 |
| Noto 폰트 | stack과 fallback만 정의 | Flutter asset 또는 프로젝트 폰트 정책으로 실제 렌더링 확인 |
| Figma 네이티브 파일 | Manus 결과와 `FIGMA_HANDOFF.md`를 기준으로 대체 | 필요할 때만 Auto Layout·instance·variable 원본을 후속 생성; R15 착수 차단 항목으로 보지 않음 |

## 6. R15 구현 불변 조건

- 기존 Flutter route, provider, repository, Backend API 요청·응답과 `contentId`를 보존한다.
- Manus의 React 코드와 fixture를 제품 코드로 복사하지 않는다.
- 홈은 검색 → 계절 편집 노트 → 문화 10종 → 최대 2개 내 코스 순서를 유지한다.
- 탐색은 `내 코스 / 커뮤니티 / 인기`이며 내 코스를 기본 선택으로 유지한다.
- 장소 상세 진입과 코스 담기, 코스 원본과 Fork, AI 변경안 적용과 원본 복구를 분리한다.
- 화면에 없는 날씨·가격·거리·평점·혼잡도·정밀 점수·가짜 상대 시각을 만들지 않는다.
- 지도 고도화와 다국어 관광 데이터는 임수민 담당이며 R15에서 기능을 대신 구현하지 않는다.
- OpenRouter 실연결과 RAG 평가 계약 변경은 각각 R17과 R16 범위로 유지한다.

## 7. 다음 행동

1. 이 R14 문서 PR을 `main`에 머지한다.
2. 로컬 `main`을 최신화한다.
3. 최신 `main`에서 `agent/r15-flutter-design-integration` 브랜치를 만든다.
4. R15 계획에서 Flutter 코드와 팀원 변경의 겹침을 다시 감사한 뒤 구현 승인을 받는다.
