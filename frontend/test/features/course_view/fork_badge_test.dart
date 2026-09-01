import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_view/presentation/widgets/fork_badge.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _EnglishLoader extends AssetLoader {
  const _EnglishLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async => {
        'forked_course_notice': 'This course is forked',
        'forked_from': 'Forked: "{title}" by {author}',
        'unknown_author': 'Unknown',
        'deleted_user': 'Deleted user',
      };
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets(
    'localizes a deleted fork author instead of displaying stored text',
    (tester) async {
      await tester.pumpWidget(
        EasyLocalization(
          supportedLocales: const [Locale('en')],
          path: 'unused',
          assetLoader: const _EnglishLoader(),
          fallbackLocale: const Locale('en'),
          startLocale: const Locale('en'),
          saveLocale: false,
          child: Builder(
            builder: (context) => MaterialApp(
              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,
              home: const Scaffold(
                body: ForkBadge(
                  forkedFrom: ForkedFromInfo(
                    courseId: null,
                    title: 'Deleted original',
                    authorId: null,
                    authorDeleted: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Deleted user'), findsOneWidget);
      expect(find.textContaining('탈퇴한 사용자'), findsNothing);
    },
  );
}
