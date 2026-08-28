# CulturePath Flutter 앱

한국의 문화 취향에서 지역·관광지를 발견하고 여행 코스를 만들며, 검증된 관광정보 기반
AI 상담과 기존 코스 다듬기를 제공하는 Android 중심 Flutter 클라이언트다.

## 현행 화면 구조

하단 root 목적지는 다음 5개다.

1. 홈
2. 탐색
3. 만들기
4. AI
5. 내정보

문화 선택 → 추천 지역 → 관광지 목록·상세 → 코스 담기·편집 흐름과 AI 여행 도우미를
Backend API에 연결한다. 일반 AI 탭은 여행 상담 문맥으로 열리고, 코스 상세의
`AI로 다듬기`는 같은 화면에 `courseId`를 전달한다.

## 실행 준비

- Flutter SDK와 Android 개발 환경
- 실행 중인 CulturePath Backend
- 지도 기능 검증 시 Android 앱에 제한된 Google Maps 키

TourAPI·OpenRouter·MySQL 인증정보는 Flutter에 넣지 않는다. Flutter는 CulturePath
Backend만 호출하고 외부 서비스 키는 서버 환경변수로 관리한다.

## 개발 실행

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Android 에뮬레이터에서 로컬 PC의 Backend를 볼 때 기본 주소는
`http://10.0.2.2:3000`이다. 실기기는 같은 네트워크에서 접근 가능한 Backend 주소를
명시해야 한다.

## 검증

```powershell
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com
```

release 빌드는 HTTPS `API_BASE_URL`만 허용한다. 실제 배포 주소는 예시 주소가 아니라
배포된 Backend HTTPS 주소로 교체한다.

## 현행 계약

- [서비스 계획서](../docs/문화여행_따라가방_서비스_계획서.md)
- [황찬우 현행 잔여 작업 로드맵](../docs/HWANG_CHANWOO_REMAINING_PR_ROADMAP.md)
- [AI 여행 챗봇 계약](../docs/AI_CHAT_CONTRACT.md)
- [AI 코스 다듬기 계약](../docs/AI_TRANSFORM_CONTRACT.md)
- [관광지 이미지 UI 계약](../docs/PLACE_MEDIA_UI_CONTRACT.md)

다국어 관광 데이터와 지도 고도화는 팀 역할 문서의 담당 경계를 따르며, 외부 API 키나
인증 URL을 문서·로그·커밋에 포함하지 않는다.
