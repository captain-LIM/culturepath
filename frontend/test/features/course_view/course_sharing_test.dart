import 'dart:convert';

import 'package:culturepath/features/auth/data/auth_repository.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/course_repository.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:culturepath/features/course_builder/presentation/course_builder_screen.dart';
import 'package:culturepath/features/course_view/presentation/course_view_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _UncachedRootBundleAssetLoader extends AssetLoader {
  const _UncachedRootBundleAssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async {
    final contents = await rootBundle.loadString(
      '$path/${locale.toString().replaceAll('_', '-')}.json',
      cache: false,
    );
    return (jsonDecode(contents) as Map).cast<String, dynamic>();
  }
}

class _RecordingCourseRepository extends CourseRepository {
  CourseItem? updated;

  @override
  Future<bool> isLoggedIn() async => true;

  @override
  Future<CourseItem> updateCourse(CourseItem course) async {
    updated = course;
    return course;
  }
}

CourseItem _course({bool isPublic = true}) => CourseItem(
  id: 42,
  revision: 1,
  title: '서울 문학 산책',
  description: '책과 골목을 만나는 코스',
  tracks: const [
    CourseTrack(
      trackNumber: 1,
      places: [
        PlaceItem(
          contentId: '1',
          title: '문학관',
          address: '',
          tel: '',
          openTime: '',
          category: '문학',
        ),
      ],
    ),
  ],
  isPublic: isPublic,
  isOwner: true,
);

Widget _localized({
  required Widget child,
  List<Override> overrides = const [],
}) {
  return EasyLocalization(
    supportedLocales: const [Locale('ko')],
    path: 'assets/translations',
    assetLoader: const _UncachedRootBundleAssetLoader(),
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
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  test('공개된 서버 코스만 공유 링크를 만들 수 있다', () {
    expect(courseShareUrl(42), contains('/course-share?id=42'));
    expect(courseShareUrl(42), startsWith('https://'));
    expect(canShareCourseLink(_course(), null), isTrue);
    expect(canShareCourseLink(_course(isPublic: false), null), isFalse);
    expect(canShareCourseLink(_course(), 0), isFalse);
  });

  testWidgets('공개 코스 공유 메뉴는 카카오톡이 처리할 수 있는 HTTPS 링크를 전달한다', (tester) async {
    final course = _course();
    String? sharedText;
    await tester.pumpWidget(
      _localized(
        overrides: [
          courseDetailProvider.overrideWith((ref, id) async => course),
        ],
        child: CourseViewScreen(
          course: course,
          shareInvoker: (text, subject) async {
            sharedText = text;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('course-actions-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('코스 공유'));
    await tester.pumpAndSettle();

    expect(sharedText, contains('/course-share?id=42'));
    expect(sharedText, isNot(contains('culturepath://')));
  });

  testWidgets('비공개 서버 코스는 무효한 공유 링크를 만들지 않는다', (tester) async {
    final course = _course(isPublic: false);
    var shareCalls = 0;
    await tester.pumpWidget(
      _localized(
        overrides: [
          courseDetailProvider.overrideWith((ref, id) async => course),
        ],
        child: CourseViewScreen(
          course: course,
          shareInvoker: (text, subject) async {
            shareCalls += 1;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('course-actions-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('코스 공유'));
    await tester.pump();

    expect(shareCalls, 0);
    expect(find.text('코스를 공개로 설정하고 저장한 뒤 공유해 주세요.'), findsOneWidget);
  });

  testWidgets('공개 스위치 변경값이 코스 저장 요청에 포함된다', (tester) async {
    final repository = _RecordingCourseRepository();
    final course = _course(isPublic: false);
    await tester.pumpWidget(
      _localized(
        overrides: [authStateProvider.overrideWith((ref) async => true)],
        child: CourseBuilderScreen(
          initialCourse: course,
          courseRepository: repository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    final switchFinder = find.byKey(const ValueKey('course-public-switch'));
    await tester.ensureVisible(switchFinder);
    await tester.tap(switchFinder);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('course-save-button')));
    await tester.pumpAndSettle();

    expect(repository.updated?.isPublic, isTrue);
  });
}
