import 'package:cached_network_image/cached_network_image.dart';
import 'package:culturepath/shared/widgets/place_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('selects an HTTPS thumbnail before the original image', () {
    expect(
      selectSafePlaceImageUrl(
        'https://example.com/thumb.jpg',
        'https://example.com/original.jpg',
      ),
      'https://example.com/thumb.jpg',
    );
  });

  test('rejects cleartext and malformed image URLs', () {
    expect(
      selectSafePlaceImageUrl(
        'http://example.com/thumb.jpg',
        'javascript:alert(1)',
      ),
      isNull,
    );
  });

  testWidgets('renders a semantic local fallback when no safe image exists',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 200,
            height: 120,
            child: PlaceNetworkImage(
              placeTitle: '경복궁',
              imageUrl: 'http://example.com/image.jpg',
            ),
          ),
        ),
      ),
    );

    expect(find.text('경복궁 사진 없음'), findsOneWidget);
    expect(find.bySemanticsLabel('경복궁 사진 없음'), findsOneWidget);
  });

  testWidgets('includes the place title in the network loading placeholder',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 200,
            height: 120,
            child: PlaceNetworkImage(
              placeTitle: '경복궁',
              imageUrl: 'https://example.com/image.jpg',
            ),
          ),
        ),
      ),
    );

    final finder = find.byType(CachedNetworkImage);
    final image = tester.widget<CachedNetworkImage>(finder);
    expect(image.memCacheWidth, lessThanOrEqualTo(1600));
    expect(image.memCacheHeight, lessThanOrEqualTo(1600));
    expect(image.maxWidthDiskCache, 1600);
    expect(image.maxHeightDiskCache, 1600);
    final placeholder = image.placeholder!(
      tester.element(finder),
      image.imageUrl,
    );
    await tester.pumpWidget(MaterialApp(home: placeholder));

    expect(find.text('경복궁 사진을 불러오는 중'), findsOneWidget);
  });
}
