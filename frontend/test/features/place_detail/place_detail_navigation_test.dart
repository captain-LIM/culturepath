import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:culturepath/features/culture_detail/data/region_model.dart';
import 'package:culturepath/features/home/data/culture_model.dart';
import 'package:culturepath/features/place_detail/data/place_detail_model.dart';
import 'package:culturepath/features/place_detail/data/place_detail_repository.dart';
import 'package:culturepath/features/place_detail/presentation/place_detail_screen.dart';
import 'package:culturepath/features/region_detail/data/spot_model.dart';
import 'package:culturepath/features/region_detail/presentation/region_detail_screen.dart';
import 'package:culturepath/features/region_detail/presentation/widgets/spot_card.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _EmptyAssetLoader extends AssetLoader {
  const _EmptyAssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async => {};
}

Widget _localizedRouter(GoRouter router, {List<Override> overrides = const []}) {
  return EasyLocalization(
    supportedLocales: const [Locale('ko')],
    path: 'unused',
    assetLoader: const _EmptyAssetLoader(),
    startLocale: const Locale('ko'),
    saveLocale: false,
    child: Builder(
      builder: (context) => ProviderScope(
        overrides: overrides,
        child: MaterialApp.router(
          localizationsDelegates: context.localizationDelegates,
          supportedLocales: context.supportedLocales,
          locale: context.locale,
          routerConfig: router,
        ),
      ),
    ),
  );
}

class _RoutingRepository extends PlaceDetailRepository {
  final bool includeRelated;

  _RoutingRepository({this.includeRelated = false});

  @override
  Future<PlaceDetailItem> getPlaceDetail(String contentId) async =>
      PlaceDetailItem(
        contentId: contentId,
        title: contentId == '1' ? '기준 장소' : '연관 장소 2',
        address: '통영시',
        tel: '',
        openTime: '',
        category: '문학',
        images: const [],
      );

  @override
  Future<List<PlaceItem>> getRelatedPlaces(String contentId) async {
    if (!includeRelated || contentId != '1') return const [];
    return const [
      PlaceItem(
        contentId: '2',
        title: '연관 장소 2',
        address: '통영시',
        tel: '',
        openTime: '',
        category: '문학',
      ),
    ];
  }
}

class _SelectionHost extends StatefulWidget {
  const _SelectionHost();

  @override
  State<_SelectionHost> createState() => _SelectionHostState();
}

class _SelectionHostState extends State<_SelectionHost> {
  PlaceItem? selected;

  Future<void> _open() async {
    final result = await context.push<PlaceItem>(
      '/places/1',
      extra: const PlaceItem(
        contentId: '1',
        title: '기준 장소',
        address: '통영시',
        tel: '',
        openTime: '',
        category: '문학',
      ),
    );
    if (mounted) setState(() => selected = result);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Text(selected?.title ?? '선택 없음'),
            ElevatedButton(
              key: const ValueKey('open-detail'),
              onPressed: _open,
              child: const Text('상세 열기'),
            ),
          ],
        ),
      );
}

GoRouter _router(PlaceDetailRepository repository) => GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, _) => const _SelectionHost()),
        GoRoute(
          path: '/places/:id',
          builder: (_, state) => PlaceDetailScreen(
            contentId: state.pathParameters['id']!,
            initialPlace: state.extra as PlaceItem?,
            repository: repository,
          ),
        ),
      ],
    );

GoRouter _regionRouter(PlaceDetailRepository repository) => GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const RegionDetailScreen(
            region: RegionItem(
              areaCode: 'tongyeong',
              name: '통영',
              description: '문학 도시',
              spotCount: 1,
              score: 90,
            ),
            culture: CultureCategory(
              id: 2,
              name: '문학',
              description: '문학 여행',
              color: Colors.indigo,
              emoji: '책',
            ),
          ),
        ),
        GoRoute(
          path: '/places/:id',
          builder: (_, state) => PlaceDetailScreen(
            contentId: state.pathParameters['id']!,
            initialPlace: state.extra as PlaceItem?,
            repository: repository,
          ),
        ),
      ],
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('returns a detail add result to the calling basket screen',
      (tester) async {
    final router = _router(_RoutingRepository());
    addTearDown(router.dispose);
    await tester.pumpWidget(_localizedRouter(router));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('open-detail')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('이 장소를 코스에 담기'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('이 장소를 코스에 담기'));
    await tester.pumpAndSettle();

    expect(find.text('기준 장소'), findsOneWidget);
    expect(find.byKey(const ValueKey('open-detail')), findsOneWidget);
  });

  testWidgets('returns a detail selection into the actual region basket',
      (tester) async {
    final router = _regionRouter(_RoutingRepository());
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _localizedRouter(
        router,
        overrides: [
          spotsProvider.overrideWith(
            (ref, args) async => const [
              SpotItem(
                contentId: '1',
                title: '기준 장소',
                address: '통영시',
                tel: '',
                openTime: '',
                category: '문학',
              ),
            ],
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('spot-open-image-1')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('이 장소를 코스에 담기'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('이 장소를 코스에 담기'));
    await tester.pumpAndSettle();

    final card = tester.widget<SpotCard>(find.byType(SpotCard));
    expect(card.isSelected, isTrue);
  });

  testWidgets('propagates a related detail selection through nested routes',
      (tester) async {
    final router = _router(_RoutingRepository(includeRelated: true));
    addTearDown(router.dispose);
    await tester.pumpWidget(_localizedRouter(router));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('open-detail')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('연관 장소 2'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('연관 장소 2').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('이 장소를 코스에 담기'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('이 장소를 코스에 담기'));
    await tester.pumpAndSettle();

    expect(find.text('연관 장소 2'), findsOneWidget);
    expect(find.byKey(const ValueKey('open-detail')), findsOneWidget);
  });
}
