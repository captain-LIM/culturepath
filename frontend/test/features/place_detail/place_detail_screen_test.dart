import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:culturepath/features/place_detail/data/place_detail_model.dart';
import 'package:culturepath/features/place_detail/data/place_detail_repository.dart';
import 'package:culturepath/features/place_detail/presentation/place_detail_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _EmptyAssetLoader extends AssetLoader {
  const _EmptyAssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async => {};
}

class _FakePlaceDetailRepository extends PlaceDetailRepository {
  final PlaceDetailItem detail;
  final Future<PlaceDetailItem>? detailFuture;
  final Object? relatedError;

  _FakePlaceDetailRepository({
    required this.detail,
    this.detailFuture,
    this.relatedError,
  });

  @override
  Future<PlaceDetailItem> getPlaceDetail(String contentId) =>
      detailFuture ?? Future.value(detail);

  @override
  Future<List<PlaceItem>> getRelatedPlaces(String contentId) async {
    if (relatedError != null) throw relatedError!;
    return const [];
  }
}

PlaceDetailItem detail() => const PlaceDetailItem(
      contentId: '1',
      title: '박경리기념관',
      address: '통영시',
      tel: '',
      openTime: '09:00~18:00',
      category: '문학',
      overview: '작가의 삶과 작품을 소개합니다.',
      imageUrl: 'http://example.com/not-allowed.jpg',
      images: [],
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('captures an early related failure while detail is still loading',
      (tester) async {
    final detailCompleter = Completer<PlaceDetailItem>();
    await tester.pumpWidget(
      MaterialApp(
        home: PlaceDetailScreen(
          contentId: '1',
          repository: _FakePlaceDetailRepository(
            detail: detail(),
            detailFuture: detailCompleter.future,
            relatedError: Exception('related failed early'),
          ),
          onAdd: (_) {},
        ),
      ),
    );

    await tester.pump();
    expect(tester.takeException(), isNull);

    detailCompleter.complete(detail());
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('연관 장소를 불러오지 못했습니다.'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('연관 장소를 불러오지 못했습니다.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('keeps the place detail visible when related places fail',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: PlaceDetailScreen(
          contentId: '1',
          repository: _FakePlaceDetailRepository(
            detail: detail(),
            relatedError: Exception('related unavailable'),
          ),
          onAdd: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('박경리기념관'), findsOneWidget);
    expect(find.text('작가의 삶과 작품을 소개합니다.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('연관 장소를 불러오지 못했습니다.'),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('연관 장소를 불러오지 못했습니다.'), findsOneWidget);
  });

  testWidgets('returns the complete place through the detail add action',
      (tester) async {
    PlaceItem? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: PlaceDetailScreen(
          contentId: '1',
          repository: _FakePlaceDetailRepository(detail: detail()),
          onAdd: (place) => selected = place,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('이 장소를 코스에 담기'),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.text('이 장소를 코스에 담기'));

    expect(selected?.contentId, '1');
    expect(selected?.title, '박경리기념관');
  });

  testWidgets('falls back to the list image when detail images are unavailable',
      (tester) async {
    const listPlace = PlaceItem(
      contentId: '1',
      title: '박경리기념관',
      address: '통영시',
      tel: '',
      openTime: '',
      category: '문학',
      imageUrl: 'https://example.com/list.jpg',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: PlaceDetailScreen(
          contentId: '1',
          initialPlace: listPlace,
          repository: _FakePlaceDetailRepository(detail: detail()),
          onAdd: (_) {},
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));

    final image = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage).first,
    );
    expect(image.imageUrl, 'https://example.com/list.jpg');
  });

  testWidgets('starts a course builder when the standalone detail has no caller',
      (tester) async {
    await tester.pumpWidget(
      EasyLocalization(
        supportedLocales: const [Locale('ko')],
        path: 'unused',
        assetLoader: const _EmptyAssetLoader(),
        startLocale: const Locale('ko'),
        saveLocale: false,
        child: Builder(
          builder: (context) => ProviderScope(
            child: MaterialApp(
              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,
              home: PlaceDetailScreen(
                contentId: '1',
                repository: _FakePlaceDetailRepository(detail: detail()),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('이 장소를 코스에 담기'),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.text('이 장소를 코스에 담기'));
    await tester.pumpAndSettle();

    expect(find.text('Day 1'), findsWidgets);
    expect(find.text('박경리기념관'), findsOneWidget);
  });
}
