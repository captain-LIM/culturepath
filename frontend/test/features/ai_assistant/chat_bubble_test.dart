import 'dart:convert';

import 'package:culturepath/features/ai_assistant/data/chat_model.dart';
import 'package:culturepath/features/ai_assistant/presentation/widgets/chat_bubble.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

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

Widget _localized(Widget child) => EasyLocalization(
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
          home: Scaffold(body: child),
        ),
      ),
    );

void main() {
  setUpAll(EasyLocalization.ensureInitialized);

  testWidgets(
    'shows a trusted source card and opens the selected place',
    (tester) async {
      ChatSource? opened;
      ChatSource? added;
      const source = ChatSource(
        contentId: '129784',
        title: '강릉 오죽헌·시립박물관',
        address: '강원특별자치도 강릉시',
        category: '문학',
        region: '강릉',
      );

      await tester.pumpWidget(
        _localized(
          ChatBubble(
            message: ChatMessage(
              role: 'assistant',
              content: '추천 장소입니다.',
              timestamp: DateTime(2026),
              sources: const [source],
            ),
            onOpenSource: (value) => opened = value,
            onAddSourceToCourse: (value) => added = value,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final card = find.byKey(const ValueKey('ai-chat-source-129784'));
      expect(card, findsOneWidget);
      expect(find.text('강릉 오죽헌·시립박물관'), findsOneWidget);
      expect(tester.getSize(card).height, greaterThanOrEqualTo(44));

      await tester.tap(
        find.byKey(const ValueKey('ai-chat-source-detail-129784')),
      );
      expect(opened, same(source));

      await tester.tap(
        find.byKey(const ValueKey('ai-chat-source-add-129784')),
      );
      expect(added, same(source));
    },
  );

  testWidgets('offers retry for a failed request', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      _localized(
        ChatBubble(
          message: ChatMessage(
            role: 'assistant',
            content: '네트워크 연결을 확인해 주세요.',
            timestamp: DateTime(2026),
            retryContent: '강릉 문학 장소 알려줘',
          ),
          onRetry: () => retries += 1,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('ai-chat-retry')));
    expect(retries, 1);
  });

  testWidgets('shows a 44px course draft action without applying it automatically',
      (tester) async {
    var opened = false;
    await tester.pumpWidget(
      _localized(
        ChatBubble(
          message: ChatMessage(
            role: 'assistant',
            content: '코스 초안을 준비했습니다.',
            timestamp: DateTime(2026),
            suggestedCourse: {
              'title': '통영 문학 코스',
              'tracks': [
                {
                  'trackNumber': 1,
                  'places': [
                    {'contentId': '100', 'title': '박경리기념관'},
                  ],
                },
              ],
            },
          ),
          onAddToCourse: () => opened = true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    final action = find.byKey(const ValueKey('ai-chat-open-course-draft'));
    expect(action, findsOneWidget);
    expect(tester.getSize(action).height, greaterThanOrEqualTo(44));
    expect(opened, false);

    await tester.tap(action);
    expect(opened, true);
  });
}
