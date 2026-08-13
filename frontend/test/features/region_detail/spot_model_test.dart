import 'package:culturepath/features/region_detail/data/spot_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses nullable region card image fields', () {
    final spot = SpotItem.fromJson({
      'contentId': '1',
      'title': '장소',
      'address': '',
      'tel': '',
      'openTime': '',
      'category': '문학',
      'latitude': null,
      'longitude': null,
      'imageUrl': 'https://example.com/main.jpg',
      'thumbnailUrl': null,
    });

    expect(spot.imageUrl, 'https://example.com/main.jpg');
    expect(spot.thumbnailUrl, isNull);
  });
}
