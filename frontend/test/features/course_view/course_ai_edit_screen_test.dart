import 'dart:convert';

import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/ai_assistant/data/ai_repository.dart';
import 'package:culturepath/features/ai_assistant/data/course_transform_models.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/course_repository.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:culturepath/features/course_builder/presentation/course_builder_screen.dart';
import 'package:culturepath/features/course_view/presentation/course_ai_edit_screen.dart';
import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _UncachedRootBundleAssetLoader extends AssetLoader {
  const _UncachedRootBundleAssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async {
    final localeName = locale.toString().replaceAll('_', '-');
    final contents = await rootBundle.loadString(
      '$path/$localeName.json',
      cache: false,
    );
    return (jsonDecode(contents) as Map).cast<String, dynamic>();
  }
}

class _UnusedClient extends ApiClient {
  _UnusedClient()
      : super(
          dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
          tokenLoader: () async => null,
        );
}

class _FakeAiRepository extends AiRepository {
  final List<Object> replies;
  int calls = 0;

  _FakeAiRepository(this.replies) : super(client: _UnusedClient());

  @override
  Future<CourseEditResult> editCourse(
    CourseItem course,
    String userRequest,
  ) async {
    final index = calls < replies.length ? calls : replies.length - 1;
    final reply = replies[index];
    calls += 1;
    if (reply is CourseEditResult) return reply;
    throw reply;
  }
}

class _FakeCourseRepository extends CourseRepository {
  final CourseItem forkedCourse;
  int forkFailuresRemaining;
  int forkCalls = 0;
  int updateCalls = 0;

  _FakeCourseRepository({
    required this.forkedCourse,
    this.forkFailuresRemaining = 0,
  });

  @override
  Future<CourseItem> forkCourse(int courseId) async {
    forkCalls += 1;
    if (forkFailuresRemaining > 0) {
      forkFailuresRemaining -= 1;
      throw StateError('fork failed');
    }
    return forkedCourse;
  }

  @override
  Future<bool> isLoggedIn() async => true;

  @override
  Future<CourseItem> updateCourse(CourseItem course) async {
    updateCalls += 1;
    return course;
  }
}

class _BuilderHost extends StatefulWidget {
  final CourseItem initialCourse;
  final CourseItem originalCourse;
  final CourseRepository courseRepository;

  const _BuilderHost({
    required this.initialCourse,
    required this.originalCourse,
    required this.courseRepository,
  });

  @override
  State<_BuilderHost> createState() => _BuilderHostState();
}

class _BuilderHostState extends State<_BuilderHost> {
  CourseItem? saved;

  Future<void> _open() async {
    final result = await Navigator.of(context).push<CourseItem>(
      MaterialPageRoute(
        builder: (_) => ProviderScope(
          child: CourseBuilderScreen(
            initialCourse: widget.initialCourse,
            aiOriginalCourse: widget.originalCourse,
            courseRepository: widget.courseRepository,
          ),
        ),
      ),
    );
    if (mounted) setState(() => saved = result);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Text(saved == null ? 'not-saved' : 'saved-${saved!.id}'),
            ElevatedButton(
              key: const ValueKey('open-builder'),
              onPressed: _open,
              child: const Text('open'),
            ),
          ],
        ),
      );
}

PlaceItem place(String id) => PlaceItem(
      contentId: id,
      title: '장소 $id',
      address: '',
      tel: '',
      openTime: '',
      category: '문학',
    );

CourseItem course(
  List<PlaceItem> places, {
  int id = 1,
  String title = '원본 코스',
  bool isOwner = true,
  ForkedFromInfo? forkedFrom,
}) =>
    CourseItem(
      id: id,
      title: title,
      description: '',
      tracks: [
        CourseTrack(trackNumber: 1, places: places),
        const CourseTrack(trackNumber: 2, places: []),
        const CourseTrack(trackNumber: 3, places: []),
      ],
      isOwner: isOwner,
      forkedFrom: forkedFrom,
    );

CourseEditResult result(
  CourseItem proposal, {
  List<String> warnings = const [],
}) =>
    CourseEditResult(
      course: proposal,
      summary: warnings.isEmpty ? '변경했어요.' : '원본을 유지했어요.',
      explanation: warnings.isEmpty ? '변경했어요.' : '원본을 유지했어요.',
      sources: const [],
      warnings: warnings,
      usage: const AiTransformUsage(
        model: 'test-model',
        inputTokens: 1,
        outputTokens: 1,
      ),
      mock: true,
    );

Future<void> waitForWidget(
  WidgetTester tester,
  Finder finder,
) async {
  for (var attempt = 0; attempt < 100; attempt += 1) {
    await tester.pump();
    if (finder.evaluate().isNotEmpty) {
      await tester.pumpAndSettle();
      return;
    }
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
  }
  throw TestFailure('Timed out waiting for $finder');
}

Future<void> pumpScreen(
  WidgetTester tester, {
  required CourseItem original,
  required _FakeAiRepository aiRepository,
  bool isOwner = true,
  CourseRepository? courseRepository,
  Future<void> Function()? onUnauthorized,
  VoidCallback? onCourseUnavailable,
}) async {
  final screenKey = UniqueKey();
  await tester.pumpWidget(
    EasyLocalization(
      supportedLocales: const [Locale('ko')],
      path: 'assets/translations',
      assetLoader: const _UncachedRootBundleAssetLoader(),
      fallbackLocale: const Locale('ko'),
      startLocale: const Locale('ko'),
      saveLocale: false,
      child: Builder(
        builder: (context) => ProviderScope(
          child: MaterialApp(
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
            home: CourseAiEditScreen(
              key: screenKey,
              course: original,
              isOwner: isOwner,
              aiRepository: aiRepository,
              courseRepository: courseRepository,
              onUnauthorized: onUnauthorized,
              onCourseUnavailable: onCourseUnavailable,
            ),
          ),
        ),
      ),
    ),
  );
  await waitForWidget(
    tester,
    find.byKey(const ValueKey('ai-request-field')),
  );
}

Future<void> submitRequest(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const ValueKey('ai-request-field')),
    '마지막 장소 빼줘',
  );
  await tester.ensureVisible(
    find.byKey(const ValueKey('ai-send-button')),
  );
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('ai-send-button')));
  await tester.pumpAndSettle();
}

Future<void> scrollAiContentUntilVisible(
  WidgetTester tester,
  Finder finder,
) async {
  final scrollable = find.descendant(
    of: find.byType(ListView),
    matching: find.byType(Scrollable),
  );
  await tester.scrollUntilVisible(
    finder,
    240,
    scrollable: scrollable,
  );
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('shows semantic changes and an explicit builder action',
      (tester) async {
    final original = course([place('1'), place('2')]);
    final proposal = course([place('1')]);
    await pumpScreen(
      tester,
      original: original,
      aiRepository: _FakeAiRepository([result(proposal)]),
    );

    await tester.enterText(
      find.byKey(const ValueKey('ai-request-field')),
      '마지막 장소 빼줘',
    );
    await tester.tap(find.byKey(const ValueKey('ai-send-button')));
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const ValueKey('ai-changed')), findsOneWidget);
    expect(find.text('변경안 편집하기'), findsOneWidget);
    expect(find.textContaining('Day 1에서 삭제'), findsOneWidget);
  });

  testWidgets('keeps warnings visible and hides apply for an unchanged result',
      (tester) async {
    final original = course([place('1')]);
    await pumpScreen(
      tester,
      original: original,
      aiRepository: _FakeAiRepository([
        result(original, warnings: ['실내 여부를 검증할 수 없습니다.']),
      ]),
    );

    await submitRequest(tester);

    expect(find.byKey(const ValueKey('ai-unchanged')), findsOneWidget);
    expect(
      find.textContaining('실내 여부를 검증할 수 없습니다.'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('ai-apply-button')), findsNothing);
  });

  testWidgets('blocks every submission path during Retry-After cooldown',
      (tester) async {
    final original = course([place('1'), place('2')]);
    final repository = _FakeAiRepository([
      const AiTransformFailure(
        AiTransformFailureType.rateLimited,
        retryAfterSeconds: 2,
      ),
      result(course([place('1')])),
    ]);
    await pumpScreen(
      tester,
      original: original,
      aiRepository: repository,
    );

    await tester.enterText(
      find.byKey(const ValueKey('ai-request-field')),
      '마지막 장소 빼줘',
    );
    await tester.tap(find.byKey(const ValueKey('ai-send-button')));
    await tester.pump();
    await tester.pump();

    expect(repository.calls, 1);
    expect(
      tester.widget<IconButton>(
        find.byKey(const ValueKey('ai-send-button')),
      ).onPressed,
      isNull,
    );
    expect(
      tester.widget<ActionChip>(find.byType(ActionChip).first).onPressed,
      isNull,
    );
    expect(
      tester.widget<OutlinedButton>(
        find.byKey(const ValueKey('ai-retry-button')),
      ).onPressed,
      isNull,
    );

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.byKey(const ValueKey('ai-retry-button')));
    await tester.pumpAndSettle();

    expect(repository.calls, 2);
    expect(find.byKey(const ValueKey('ai-changed')), findsOneWidget);
  });

  testWidgets('routes terminal auth and course errors through callbacks',
      (tester) async {
    var unauthorizedCalls = 0;
    final original = course([place('1')]);
    await pumpScreen(
      tester,
      original: original,
      aiRepository: _FakeAiRepository([
        const AiTransformFailure(AiTransformFailureType.unauthorized),
      ]),
      onUnauthorized: () async {
        unauthorizedCalls += 1;
      },
    );
    await submitRequest(tester);
    expect(unauthorizedCalls, 1);

    var unavailableCalls = 0;
    await pumpScreen(
      tester,
      original: original,
      aiRepository: _FakeAiRepository([
        const AiTransformFailure(AiTransformFailureType.notFound),
      ]),
      onCourseUnavailable: () => unavailableCalls += 1,
    );
    await submitRequest(tester);
    expect(unavailableCalls, 1);

    await pumpScreen(
      tester,
      original: original,
      aiRepository: _FakeAiRepository([
        const AiTransformFailure(AiTransformFailureType.forbidden),
      ]),
      onCourseUnavailable: () => unavailableCalls += 1,
    );
    await submitRequest(tester);
    expect(unavailableCalls, 2);
  });

  testWidgets('keeps proposal after Fork failure and reuses a successful Fork',
      (tester) async {
    final original = course([place('1'), place('2')], isOwner: false);
    final proposal = course(
      [place('1')],
      isOwner: false,
      title: 'AI 변경안',
    );
    final forked = course(
      [place('1'), place('2')],
      id: 9,
      title: '복제된 원본',
      forkedFrom: const ForkedFromInfo(
        courseId: 1,
        title: '원본 코스',
        authorId: 'owner',
      ),
    );
    final courseRepository = _FakeCourseRepository(
      forkedCourse: forked,
      forkFailuresRemaining: 1,
    );
    await pumpScreen(
      tester,
      original: original,
      isOwner: false,
      aiRepository: _FakeAiRepository([result(proposal)]),
      courseRepository: courseRepository,
    );
    await submitRequest(tester);

    await scrollAiContentUntilVisible(
      tester,
      find.byKey(const ValueKey('ai-apply-button')),
    );
    await tester.tap(find.byKey(const ValueKey('ai-apply-button')));
    await tester.pumpAndSettle();
    expect(courseRepository.forkCalls, 1);
    expect(find.byKey(const ValueKey('ai-changed')), findsOneWidget);
    expect(find.text('내 코스로 복제하지 못했습니다. 다시 시도해주세요.'),
        findsOneWidget);

    await scrollAiContentUntilVisible(
      tester,
      find.byKey(const ValueKey('ai-apply-button')),
    );
    await tester.tap(find.byKey(const ValueKey('ai-apply-button')));
    await tester.pumpAndSettle();
    expect(courseRepository.forkCalls, 2);
    expect(find.byKey(const ValueKey('ai-draft-banner')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('ai-restore-original')));
    await tester.pump();
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller?.text,
      '복제된 원본',
    );

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();
    await scrollAiContentUntilVisible(
      tester,
      find.byKey(const ValueKey('ai-apply-button')),
    );
    await tester.tap(find.byKey(const ValueKey('ai-apply-button')));
    await tester.pumpAndSettle();
    expect(courseRepository.forkCalls, 2);
  });

  testWidgets('CourseBuilder returns the saved CourseItem to its caller',
      (tester) async {
    final initial = course([place('1')], id: 21, title: 'AI 변경안');
    final repository = _FakeCourseRepository(forkedCourse: initial);
    await tester.pumpWidget(
      EasyLocalization(
        supportedLocales: const [Locale('ko')],
        path: 'assets/translations',
        assetLoader: const _UncachedRootBundleAssetLoader(),
        fallbackLocale: const Locale('ko'),
        startLocale: const Locale('ko'),
        saveLocale: false,
        child: Builder(
          builder: (context) => MaterialApp(
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
            home: _BuilderHost(
              initialCourse: initial,
              originalCourse: course([place('1')], id: 21),
              courseRepository: repository,
            ),
          ),
        ),
      ),
    );
    await waitForWidget(
      tester,
      find.byKey(const ValueKey('open-builder')),
    );

    await tester.tap(find.byKey(const ValueKey('open-builder')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('course-save-button')));
    await tester.pumpAndSettle();

    expect(repository.updateCalls, 1);
    expect(find.text('saved-21'), findsOneWidget);
  });

  for (final width in [360.0, 390.0, 430.0]) {
    testWidgets(
      'changed result fits ${width.toInt()}dp at 200% text with keyboard',
      (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          tester.platformDispatcher.clearTextScaleFactorTestValue();
        });
        final original = course([place('1'), place('2')]);
        await pumpScreen(
          tester,
          original: original,
          aiRepository: _FakeAiRepository([
            result(course([place('1')], title: 'AI 변경안')),
          ]),
        );

        await submitRequest(tester);
        await tester.showKeyboard(
          find.byKey(const ValueKey('ai-request-field')),
        );
        tester.view.viewInsets = const FakeViewPadding(bottom: 300);
        addTearDown(tester.view.resetViewInsets);
        await tester.pump();

        expect(find.byKey(const ValueKey('ai-changed')), findsOneWidget);
        expect(
          find.byKey(const ValueKey('ai-send-button')).hitTestable(),
          findsOneWidget,
        );
        await tester.ensureVisible(
          find.byKey(const ValueKey('ai-apply-button')),
        );
        await tester.pump();
        expect(
          find.byKey(const ValueKey('ai-apply-button')).hitTestable(),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
