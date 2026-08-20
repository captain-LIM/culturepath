import 'package:culturepath/features/place_detail/data/place_detail_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses nullable fields and caps the public gallery at ten', () {
    final detail = PlaceDetailItem.fromJson({
      'contentId': '1',
      'title': '장소',
      'address': null,
      'tel': null,
      'openTime': null,
      'category': null,
      'images': List.generate(
        12,
        (index) => {
          'imageUrl': 'https://example.com/$index.jpg',
          'thumbnailUrl': null,
          'name': null,
          'copyrightType': null,
          'serialNumber': '$index',
        },
      ),
    });

    expect(detail.address, '');
    expect(detail.category, '기타');
    expect(detail.images, hasLength(10));
    expect(detail.images.last.serialNumber, '9');
  });

  test('preserves image and coordinates when converting to a course place', () {
    final detail = PlaceDetailItem.fromJson({
      'contentId': '1',
      'title': '장소',
      'address': '주소',
      'tel': '',
      'openTime': '',
      'category': '문학',
      'latitude': 37.5,
      'longitude': 127.0,
      'imageUrl': 'https://example.com/main.jpg',
      'thumbnailUrl': 'https://example.com/thumb.jpg',
      'images': [],
    });

    final place = detail.toPlaceItem();
    expect(place.latitude, 37.5);
    expect(place.longitude, 127.0);
    expect(place.thumbnailUrl, 'https://example.com/thumb.jpg');
  });
}
