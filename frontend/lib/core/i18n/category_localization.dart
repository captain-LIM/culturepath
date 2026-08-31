import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

// 백엔드 분류 로직(cultureCategoryMap.js)이 내려주는 카테고리 문자열은 언어와
// 무관하게 항상 한국어다(코스 저장·완주 배지 집계가 이 문자열에 의존하기
// 때문). 화면에 보여줄 때만 이 매핑으로 번역한다.
const Map<String, int> _categoryToCultureId = {
  '독립서점·책방': 1,
  '문학': 2,
  '음악': 3,
  '전통주·양조장': 4,
  '로컬 미식': 5,
  '공예·공방': 6,
  '근대 문화유산': 7,
  '미술·갤러리': 8,
  '영화·애니메이션': 9,
  '커피·카페': 10,
};

String localizedCategory(String category) {
  final cultureId = _categoryToCultureId[category];
  if (cultureId != null) return 'culture_${cultureId}_name'.tr();
  if (category == '기타') return 'category_other'.tr();
  return category;
}

// 사진이 없는 장소는 모두 똑같은 카메라 아이콘으로 보이면 "이미지 로딩
// 실패"처럼 읽힌다. 문화 카테고리별로 다른 아이콘을 보여주면 같은 무사진
// 상태라도 "이 장소는 이런 곳"이라는 의도된 모습으로 보인다. 매핑에 없는
// 카테고리('기타' 포함)는 기존 범용 카메라 아이콘을 그대로 쓴다.
const Map<String, IconData> _categoryToPhotoIcon = {
  '독립서점·책방': Icons.storefront_outlined,
  '문학': Icons.auto_stories_outlined,
  '음악': Icons.music_note_outlined,
  '전통주·양조장': Icons.liquor_outlined,
  '로컬 미식': Icons.restaurant_outlined,
  '공예·공방': Icons.handyman_outlined,
  '근대 문화유산': Icons.account_balance_outlined,
  '미술·갤러리': Icons.palette_outlined,
  '영화·애니메이션': Icons.movie_outlined,
  '커피·카페': Icons.local_cafe_outlined,
};

IconData categoryPhotoIcon(String? category) =>
    _categoryToPhotoIcon[category] ?? Icons.photo_outlined;
