import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:culturepath/shared/widgets/place_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _AssetLoader extends AssetLoader {
  const _AssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async {
    final contents = await rootBundle.loadString('$path/${locale.languageCode}.json', cache: false);
    return (jsonDecode(contents) as Map).cast<String, dynamic>();
  }
}

Widget _wrapWithLocale(Widget child) {
  return EasyLocalization(
    supportedLocales: const [Locale('ko')],
    path: 'assets/translations',
    assetLoader: const _AssetLoader(),
    fallbackLocale: const Locale('ko'),
    startLocale: const Locale('ko'),
    saveLocale: false,
    child: Builder(
      builder: (context) => MaterialApp(
        localizationsDelegates: context.localizationDelegates,
        supportedLocales: context.supportedLocales,
        locale: context.locale,
        home: child,
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

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
      _wrapWithLocale(
        const Scaffold(
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
    await tester.pump();

    expect(find.text('경복궁 사진 없음'), findsOneWidget);
    expect(find.bySemanticsLabel('경복궁 사진 없음'), findsOneWidget);
  });

  testWidgets('uses the supplied gallery position as its semantic label',
      (tester) async {
    await tester.pumpWidget(
      _wrapWithLocale(
        const Scaffold(
          body: SizedBox(
            width: 200,
            height: 120,
            child: PlaceNetworkImage(
              placeTitle: '오죽헌',
              imageUrl: 'https://example.com/image.jpg',
              semanticLabel: '오죽헌 관광지 사진 2/3',
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.bySemanticsLabel('오죽헌 관광지 사진 2/3'), findsOneWidget);
  });

  testWidgets('includes the place title in the network loading placeholder',
      (tester) async {
    await tester.pumpWidget(
      _wrapWithLocale(
        const Scaffold(
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
    await tester.pump();

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
    await tester.pumpWidget(_wrapWithLocale(placeholder));
    await tester.pump();

    expect(find.text('경복궁 사진을 불러오는 중'), findsOneWidget);
  });

  testWidgets('fits a long fallback label inside a compact related card',
      (tester) async {
    await tester.pumpWidget(
      _wrapWithLocale(
        const Scaffold(
          body: SizedBox(
            width: 140,
            height: 96,
            child: PlaceNetworkImage(
              placeTitle: '연관 방문 장소 이름이 긴 경우',
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('연관 방문 장소 이름이 긴 경우 사진 없음'), findsOneWidget);
  });

  testWidgets('uses an icon-only fallback inside a 40 pixel search thumbnail',
      (tester) async {
    await tester.pumpWidget(
      _wrapWithLocale(
        const Scaffold(
          body: SizedBox(
            width: 40,
            height: 40,
            child: PlaceNetworkImage(placeTitle: '검색 결과'),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.photo_outlined), findsOneWidget);
    expect(find.bySemanticsLabel('검색 결과 사진 없음'), findsOneWidget);
  });

  testWidgets('fits the loading indicator inside a 40 pixel search thumbnail',
      (tester) async {
    await tester.pumpWidget(
      _wrapWithLocale(
        const Scaffold(
          body: SizedBox(
            width: 40,
            height: 40,
            child: PlaceNetworkImage(
              placeTitle: '검색 결과',
              imageUrl: 'https://example.com/image.jpg',
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final finder = find.byType(CachedNetworkImage);
    final image = tester.widget<CachedNetworkImage>(finder);
    final placeholder = image.placeholder!(
      tester.element(finder),
      image.imageUrl,
    );
    await tester.pumpWidget(
      _wrapWithLocale(
        Scaffold(
          body: SizedBox(width: 40, height: 40, child: placeholder),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
