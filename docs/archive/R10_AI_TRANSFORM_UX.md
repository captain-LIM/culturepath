# [황찬우 전용] R10 AI 변경안 UX·Figma Make 명세

> 담당자: 황찬우
>
> 대상: Google Play Store 배포용 Android 스마트폰 앱
>
> 구현 기준: `POST /ai/transform`, 최대 3-Day, 사용자 확인 전 자동 저장 없음

## 1. 목표

AI가 코스를 임의로 덮어쓰는 경험이 아니라 다음 통제 흐름을 제공한다.

```text
저장된 코스 → 자연어 요청 → 변경안 또는 원본 유지 사유 → 변경 전후 확인
            → 취소 / 다른 요청 / 변경안 편집 → 코스 빌더에서 최종 저장
```

## 2. 화면 계약

- 기존 85% bottom sheet 대신 전용 전체 화면을 사용한다.
- 기준 폭은 390dp이며 360~430dp와 한글 200% 배율에서 핵심 행동이 유지돼야 한다.
- 상단에는 뒤로가기와 `AI 코스 편집`, 본문에는 소개·빠른 요청·상태·결과를 둔다.
- 자연어 입력은 하단 SafeArea에 고정하고 최대 500자, 전송 터치 영역은 최소 48dp다.
- 빠른 요청은 현재 데이터로 검증 가능한 삭제·기간 축소·순서 변경·동일 문화 후보 추가를 우선한다.
- 우천·실내·아동·이동성 요청을 막지는 않지만 근거가 없으면 원본 유지와 warning을 표시한다.

## 3. 상태 Matrix

| 상태 | 필수 표시 | 행동 |
| --- | --- | --- |
| 입력 전 | 설명, 빠른 요청, 입력창 | 요청 전송, 뒤로가기 |
| 처리 중 | 원본과 관광정보를 비교한다는 문구 | 중복 전송 차단 |
| 변경됨 | summary, semantic diff, warning, source | 다른 요청, 변경안 편집 |
| 변경 없음 | 원본 유지 제목, summary, warning | 다른 요청만 제공 |
| 400 | 요청·3-Day 제한 안내 | 입력 수정 |
| 401 | 로그인 만료 | 화면 종료 후 로그인 |
| 403·404 | 권한·코스 없음 | 이전 화면 |
| 429 | `Retry-After` 초 카운트다운 | 시간이 지난 후 수동 재시도 |
| 502·503·504 | 일시 장애와 원본 보존 | 수동 재시도 |
| 네트워크 오류 | 연결 확인 | 수동 재시도 |
| Fork 실패 | 내 코스로 저장하지 못함 | 결과를 유지한 채 재시도 |

## 4. semantic diff

Flutter가 `contentId`, `trackNumber`, 같은 Day의 상대 순서를 사용해 계산한다.

- 코스 제목 변경
- 코스 설명 변경
- 장소 추가
- 장소 삭제
- 다른 Day로 이동
- 같은 Day 안 상대 순서 변경
- 유지된 장소 수

단순 삭제로 뒤 장소의 절대 인덱스가 당겨진 것은 순서 변경으로 표시하지 않는다. 장소 교체는 근거 없이 한 쌍으로 단정하지 않고 삭제와 추가로 각각 표시하며 `summary`가 전체 이유를 설명한다.

색상만으로 상태를 구분하지 않고 추가·삭제·이동·순서 아이콘과 한국어 라벨을 함께 사용한다.

## 5. 적용·원본 보존

- AI 화면의 제안은 자동 저장되지 않는다.
- 소유자는 `변경안 편집하기`로 코스 빌더 초안을 연다.
- 타인 코스는 `내 코스로 저장하고 편집`을 누를 때만 Fork한다.
- 한 화면 세션에서 생성된 Fork를 재사용해 중복 Fork를 막는다.
- 빌더에는 `원본으로 되돌리기`를 제공하고 저장 실패 시 초안을 유지한다.
- 개별 변경 선택은 이동·재정렬 작업의 일부만 적용할 때 중복·누락이 생길 수 있어 제공하지 않는다. 사용자가 빌더에서 직접 조정한다.

## 6. 비용·로그·개인정보

- 일반 사용자에게 모델명과 토큰 수를 표시하지 않는다.
- 성공 로그는 변경 여부, warning/source 수, 모델, 입력·출력 토큰, 처리시간, Mock 여부만 기록한다.
- 로그에 프롬프트, 코스 본문, API 키, 외부 URL과 사용자 식별자를 기록하지 않는다.
- 자동 재요청을 하지 않으며 429 이후에도 사용자가 직접 재시도한다.

## 7. 실제 기기 API 주소

개발 에뮬레이터 기본값은 `http://10.0.2.2:3000`이다. 실제 기기와 Release에서는 다음처럼 HTTPS 주소를 주입한다.

```powershell
flutter run --dart-define=API_BASE_URL=https://api.example.com
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com
```

Release에서 HTTP 주소를 사용하면 앱 초기화가 실패해야 한다. API 키는 Flutter에 전달하지 않는다.

## 8. Figma Make 프롬프트

```text
Design a production-ready full-screen AI course transformation review flow for the Korean Android app “문화여행 따라가방 (CulturePath)”.

Platform and frame:
- Android portrait smartphone, base width 390dp; verify 360dp and 430dp.
- Respect status bar, SafeArea, gesture area, keyboard, Android back navigation, and 200% Korean text scaling.
- Flutter implementation; use standard app bar, scroll view, cards, chips, text field, expansion tile, and buttons.
- Minimum touch target 48x48dp. Avoid blur, glassmorphism, heavy shadows, and desktop layouts.

Brand:
- ink #2B2D42, warm paper #F7F3E9, white surface, restrained clay #C75B39.
- Noto Serif KR for the main editorial title and Noto Sans KR for body and controls.

Product truth:
- The AI never saves automatically.
- The user reviews a proposal and opens the normal course builder to save it.
- The product supports up to three Days.
- Unsupported weather, child, mobility, or dietary conditions keep the original course and show a clear data-insufficiency warning.
- Do not show raw HTTP codes, API/provider names, tokens, price, stack traces, or technical errors.

Create frames and component variants for:
1. Initial input with supported quick prompts.
2. Loading with duplicate submission disabled.
3. Changed result with summary and labeled diff rows: title, description, added, removed, moved between Days, reordered within a Day, and unchanged count.
4. Unchanged result with a prominent warning and no apply button.
5. Verified source expansion for newly added places.
6. Rate limit with countdown and disabled retry.
7. Network/service/Fork failure with safe retry.
8. Owner action “변경안 편집하기”.
9. Public-course action “내 코스로 저장하고 편집”.
10. Course Builder informational banner with “원본으로 되돌리기”.

Use icon plus Korean label for every diff status. Do not rely on red and green alone. Keep the bottom request field usable with the keyboard open. Return implementation-ready auto-layout frames, variants, TalkBack labels, reading order, and corrections found during accessibility audit.
```

## 9. 검증 완료 조건

- Backend 기본 테스트 전체 통과
- Flutter `analyze`와 전체 테스트 통과
- changed·unchanged·warning·429·Fork 실패·원본 복구 시나리오 확인
- 360·390·430dp, 200% 텍스트, 키보드 열림에서 overflow 없음
- 타인 코스의 동일 화면 세션에서 Fork가 한 번만 생성됨
- 실제 기기 Release에 HTTPS `API_BASE_URL` 주입
- 실제 Qdrant·OpenRouter live smoke는 별도 승인된 횟수로 배포 전에 수행
