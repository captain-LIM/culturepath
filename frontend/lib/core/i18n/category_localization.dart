import 'package:easy_localization/easy_localization.dart';

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
