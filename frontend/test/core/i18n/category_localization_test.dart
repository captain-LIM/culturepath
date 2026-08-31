import 'package:culturepath/core/i18n/category_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps every fixed culture category to a distinct icon', () {
    const categories = [
      '독립서점·책방',
      '문학',
      '음악',
      '전통주·양조장',
      '로컬 미식',
      '공예·공방',
      '근대 문화유산',
      '미술·갤러리',
      '영화·애니메이션',
      '커피·카페',
    ];

    final icons = categories.map(categoryPhotoIcon).toSet();

    // 10개 카테고리가 서로 다른 아이콘을 받아야 무사진 카드들이
    // 시각적으로 구분된다.
    expect(icons, hasLength(categories.length));
    expect(icons, isNot(contains(Icons.photo_outlined)));
  });

  test('falls back to the generic camera icon for unknown or missing category', () {
    expect(categoryPhotoIcon('기타'), Icons.photo_outlined);
    expect(categoryPhotoIcon(null), Icons.photo_outlined);
    expect(categoryPhotoIcon('알 수 없는 카테고리'), Icons.photo_outlined);
  });
}
