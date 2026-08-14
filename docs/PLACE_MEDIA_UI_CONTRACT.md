# 관광지 이미지·상세·연관 장소 UI 계약

> **담당자:** 황찬우
>
> **로드맵:** R12
>
> **목적:** TourAPI 장소 목록·상세·연관 장소를 Flutter 화면까지 비용과 오류를 통제하며 연결한다.

## 1. 목록 이미지 계약

`GET /regions/:code/spots`는 모든 장소에 다음 nullable 필드를 포함한다.

```json
{
  "imageUrl": "https://example.com/original.jpg|null",
  "thumbnailUrl": "https://example.com/thumbnail.jpg|null"
}
```

- 값은 `areaBasedList2` 또는 `searchKeyword2` 목록의 `firstimage`, `firstimage2`에서 온다.
- 목록 카드마다 `detailImage2`를 추가 호출하지 않는다.
- Flutter 표시 우선순위는 `thumbnailUrl → imageUrl → 로컬 placeholder`다.
- HTTP, 깨진 URL, 빈 URL과 로딩 실패는 동일한 로컬 placeholder로 안전하게 대체한다.
- Android 전체에 cleartext HTTP를 허용하는 설정은 추가하지 않는다.

## 2. 네트워크 이미지 캐시

- Flutter는 `cached_network_image`를 사용한다.
- 메모리 디코드 폭·높이는 실제 위젯 크기와 기기 픽셀 비율을 기준으로 계산하되 각각 최대 1,600px로 제한하고, 디스크 캐시 리사이즈 폭·높이도 1,600px로 제한한다.
- 로딩 중에는 작은 진행 표시와 장소명을 보여준다.
- 실패하거나 안전한 HTTPS URL이 없으면 잉크·종이 색상의 로컬 placeholder를 표시한다.
- 화면의 의미 있는 대체 설명은 장소명을 포함한다.
- 자체 이미지 업로드, 이미지 프록시, CDN과 크롤링은 R12 범위가 아니다.

## 3. 장소 상세 계약

- 공개 경로: `GET /places/:id`
- Flutter 경로: `/places/:id`
- TourAPI 숫자형 `contentId`를 canonical 식별자로 유지한다.
- 상세 갤러리는 Backend 조회·공개 응답·Flutter 파싱 모두 최대 10장이다.
- 상세 이미지가 없으면 목록 대표 이미지를 사용하고, 그것도 없으면 placeholder를 사용한다.
- 주소·전화·운영시간·휴무일·주차·홈페이지·개요는 값이 있을 때만 표시한다.
- 갤러리 하단에 `이미지·관광정보: 한국관광공사 TourAPI`를 표시한다.
- `copyrightType`은 원본 코드 그대로 보존하며 확인되지 않은 저작자명을 만들지 않는다.

## 4. 연관 장소와 오류 격리

- 공개 경로: `GET /places/:id/related`
- 최대 5개를 차량 이동 기반 **연관 방문 장소**로 표시한다.
- 상세와 연관 장소 요청은 독립적으로 시작한다.
- 상세가 실패하면 상세 화면 전체에 재시도를 제공한다.
- 연관 장소만 실패하면 기본 상세는 유지하고 연관 영역에만 재시도를 제공한다.
- 빈 연관 결과는 오류가 아니라 `확인된 연관 방문 장소가 없습니다.`로 표시한다.
- 연관 카드를 누르면 해당 `contentId`의 상세로 이동한다.

## 5. 코스 담기 계약

- 지역 카드의 사진·제목은 상세 진입, 기존 담기 버튼은 즉시 담기로 역할을 분리한다.
- 지역 화면에서 상세의 담기 버튼을 누르면 선택 장소가 기존 지역 장바구니로 돌아온다.
- 딥링크 또는 독립 상세에서 담으면 해당 장소로 새 코스 빌더를 시작한다.
- `contentId`, title, 주소, 카테고리, 좌표와 지역 문맥을 유지한다.
- 이미지 필드는 화면 표시용이며 기존 코스 저장 API·DB 스키마를 변경하지 않는다.

## 6. 검증 경계

- 기본 테스트는 실제 TourAPI나 이미지 호스트를 호출하지 않는다.
- Backend는 nullable 이미지 필드와 상세 갤러리 10장 상한을 검증한다.
- Flutter는 모델 파싱, HTTPS 우선순위, HTTP 차단, placeholder, 상세/연관 오류 격리와 담기를 검증한다.
- 실제 smoke는 사용자 승인 시 목록 1건, 상세 1건, 대표 이미지 접근 1건만 수행하고 키와 전체 인증 URL을 출력하지 않는다.

## 7. 2026-08-13 live image smoke

- 통영 법정동 목록 20건 조회 성공, 이미지가 있는 실제 장소 확인
- 표본: `contentId=131091`, `갈도`
- 목록 대표 이미지는 HTTPS이며 호스트는 `tong.visitkorea.or.kr`
- 표본의 `detailImage2` 추가 이미지는 0건이어서 목록 대표 이미지 fallback 계약을 확인
- 이미지 호스트는 `HEAD`를 `405`로 거부했지만 범위 제한 `GET`은 `206 image/jpg`로 성공
- 자동 재시도는 사용하지 않았고 인증키와 전체 URL은 출력·기록하지 않음

따라서 Android 전역 cleartext 허용 없이 HTTPS 이미지를 표시할 수 있으며, 추가 갤러리가 없는 실제 장소에는 목록 대표 이미지를 사용해야 한다.
