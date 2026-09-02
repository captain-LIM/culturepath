import 'dart:convert';

import 'package:culturepath/features/ai_assistant/data/ai_repository.dart';
import 'package:culturepath/features/ai_assistant/presentation/ai_assistant_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _AssetLoader extends AssetLoader {
  const _AssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async {
    final contents = await rootBundle.loadString(
      '$path/${locale.languageCode}.json',
      cache: false,
    );
    return (jsonDecode(contents) as Map).cast<String, dynamic>();
  }
}

class _RecordingAiRepository extends AiRepository {
  String? reportedContent;
  String? reportedReason;

  @override
  Future<void> reportContent(String content, {String reason = ''}) async {
    reportedContent = content;
    reportedReason = reason;
  }
}

Widget _app(AiRepository repository) => ProviderScope(
  child: EasyLocalization(
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
        home: AiAssistantScreen(repository: repository),
      ),
    ),
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('reports an AI reply inside the app', (tester) async {
    final repository = _RecordingAiRepository();
    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    await tester.longPress(find.textContaining('안녕하세요'));
    await tester.pumpAndSettle();

    expect(find.text('이 답변 신고'), findsOneWidget);
    expect(find.byKey(const Key('ai-report-reason-field')), findsOneWidget);
    await tester.enterText(
      find.byKey(const Key('ai-report-reason-field')),
      '부적절한 표현',
    );
    await tester.tap(find.text('신고'));
    await tester.pumpAndSettle();

    expect(repository.reportedContent, contains('안녕하세요'));
    expect(repository.reportedReason, '부적절한 표현');
    expect(find.text('신고가 접수되었습니다. 검토에 활용할게요.'), findsOneWidget);
  });
}
