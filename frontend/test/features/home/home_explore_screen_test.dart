import 'dart:convert';

import 'package:culturepath/core/theme/app_theme.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/my_courses_provider.dart';
import 'package:culturepath/features/course_builder/data/course_repository.dart';
import 'package:culturepath/features/explore/presentation/explore_screen.dart';
import 'package:culturepath/features/home/data/culture_model.dart';
import 'package:culturepath/features/home/presentation/home_screen.dart';
import 'package:culturepath/features/home/presentation/search_delegate.dart';
import 'package:culturepath/features/home/presentation/widgets/culture_grid.dart';
import 'package:culturepath/features/home/presentation/widgets/culture_card.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _AssetLoader extends AssetLoader {
  const _AssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async {
    final contents = await rootBundle.loadString('$path/${locale.languageCode}.json', cache: false);
    return (jsonDecode(contents) as Map).cast<String, dynamic>();
  }
}

CourseItem _course(String title) => CourseItem(
      title: title,
      description: '',
      tracks: const [CourseTrack(trackNumber: 1, places: [])],
    );

List<CultureCategory> _cultures() => List.generate(
      10,
      (index) => CultureCategory(
        id: index + 1,
        name: '문화 ${index + 1}',
        description: '',
        color: AppColors.accent,
        emoji: '',
      ),
    );

class _ShellHost extends StatelessWidget {
  const _ShellHost();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Navigator(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            builder: (_) => const HomeScreen(),
          ),
        ),
        bottomNavigationBar: const SizedBox(
          key: ValueKey('test-shell-navigation'),
          height: 72,
        ),
      );
}

class _SearchShellHost extends StatelessWidget {
  const _SearchShellHost();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Navigator(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            builder: (_) => Builder(
              builder: (branchContext) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    key: const ValueKey('open-course-search'),
                    onPressed: () => showSearch<void>(
                      context: branchContext,
                      delegate: CourseSearchDelegate(
                        courseLoader: () async => [_course('Search course')],
                      ),
                    ),
                    child: const Text('Open search'),
                  ),
                ),
              ),
            ),
          ),
        ),
        bottomNavigationBar: const SizedBox(
          key: ValueKey('test-shell-navigation'),
          height: 72,
        ),
      );
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  required List<Override> overrides,
}) async {
  await tester.pumpWidget(
    EasyLocalization(
      supportedLocales: const [Locale('ko')],
      path: 'assets/translations',
      assetLoader: const _AssetLoader(),
      fallbackLocale: const Locale('ko'),
      startLocale: const Locale('ko'),
      saveLocale: false,
      child: Builder(
        builder: (context) => ProviderScope(
          overrides: overrides,
          child: MaterialApp(
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
            home: child,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('home shows ten cultures in two columns and at most two courses', (tester) async {
    final entries = ['첫 코스', '둘째 코스', '숨겨질 코스']
        .map(
          (title) => OwnedCourseEntry(
            course: _course(title),
            source: OwnedCourseSource.guest,
            guestIndex: 0,
          ),
        )
        .toList();
    await _pump(
      tester,
      const HomeScreen(),
      overrides: [
        culturesProvider.overrideWith((ref) async => _cultures()),
        myCoursesProvider.overrideWith(
          (ref) async => MyCoursesState(entries: entries),
        ),
      ],
    );

    final grid = tester.widget<GridView>(find.byType(GridView));
    final delegate = grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
    expect(delegate.crossAxisCount, 2);
    expect(find.byType(CultureCard), findsNWidgets(10));
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.text('첫 코스'), findsOneWidget);
    expect(find.text('둘째 코스'), findsOneWidget);
    expect(find.text('숨겨질 코스'), findsNothing);
  });

  testWidgets('explore starts on My Courses and exposes three destinations', (tester) async {
    await _pump(
      tester,
      const ExploreScreen(),
      overrides: [
        myCoursesProvider.overrideWith(
          (ref) async => MyCoursesState(
            entries: [
              OwnedCourseEntry(
                course: _course('내 테스트 코스'),
                source: OwnedCourseSource.guest,
                guestIndex: 0,
              ),
            ],
          ),
        ),
        feedProvider.overrideWith(
          (ref, sort) async => const CourseListSnapshot(courses: [], isStale: false),
        ),
        rankingProvider.overrideWith(
          (ref) async => const CourseListSnapshot(courses: [], isStale: false),
        ),
      ],
    );

    expect(find.text('내 코스'), findsOneWidget);
    expect(find.text('커뮤니티'), findsOneWidget);
    expect(find.text('인기'), findsWidgets);
    expect(find.text('내 테스트 코스'), findsOneWidget);
  });

  testWidgets('empty stale my-course snapshot remains visibly marked', (tester) async {
    await _pump(
      tester,
      const HomeScreen(),
      overrides: [
        culturesProvider.overrideWith((ref) async => _cultures()),
        myCoursesProvider.overrideWith(
          (ref) async => const MyCoursesState(entries: [], isStale: true),
        ),
      ],
    );

    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.text('연결이 불안정해 마지막으로 저장된 목록을 표시합니다.'), findsOneWidget);
    expect(find.textContaining('아직 만든 코스가 없습니다.'), findsOneWidget);
  });

  testWidgets('home opens course detail above the shell navigator', (tester) async {
    await _pump(
      tester,
      const _ShellHost(),
      overrides: [
        culturesProvider.overrideWith((ref) async => _cultures()),
        myCoursesProvider.overrideWith(
          (ref) async => MyCoursesState(
            entries: [
              OwnedCourseEntry(
                course: _course('루트 상세 코스'),
                source: OwnedCourseSource.guest,
                guestIndex: 0,
              ),
            ],
          ),
        ),
      ],
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('test-shell-navigation')), findsOneWidget);

    await tester.tap(find.text('루트 상세 코스'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('test-shell-navigation')), findsNothing);
    expect(find.text('루트 상세 코스'), findsWidgets);
  });

  testWidgets('search opens course detail above the shell navigator', (tester) async {
    await _pump(
      tester,
      const _SearchShellHost(),
      overrides: const [],
    );

    await tester.tap(find.byKey(const ValueKey('open-course-search')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Search');
    await tester.pumpAndSettle();
    expect(find.text('Search course'), findsOneWidget);

    await tester.tap(find.text('Search course'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('test-shell-navigation')), findsNothing);
    expect(find.text('Search course'), findsWidgets);
  });

  for (final width in [360.0, 390.0, 430.0]) {
    testWidgets('home fits ${width.toInt()}dp at 200% text scale', (tester) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      await _pump(
        tester,
        const HomeScreen(),
        overrides: [
          culturesProvider.overrideWith((ref) async => _cultures()),
          myCoursesProvider.overrideWith(
            (ref) async => const MyCoursesState(entries: []),
          ),
        ],
      );

      expect(tester.takeException(), isNull);
    });

    testWidgets('explore fits ${width.toInt()}dp at 200% text scale', (tester) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      await _pump(
        tester,
        const ExploreScreen(),
        overrides: [
          myCoursesProvider.overrideWith(
            (ref) async => const MyCoursesState(entries: []),
          ),
          feedProvider.overrideWith(
            (ref, sort) async => const CourseListSnapshot(courses: [], isStale: false),
          ),
          rankingProvider.overrideWith(
            (ref) async => const CourseListSnapshot(courses: [], isStale: false),
          ),
        ],
      );

      expect(tester.takeException(), isNull);
    });
  }
}
