import 'dart:convert';

import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/auth/data/auth_repository.dart';
import 'package:culturepath/features/profile/data/profile_model.dart';
import 'package:culturepath/features/profile/presentation/profile_screen.dart';
import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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

class _DeletionApiClient extends ApiClient {
  String? path;
  Map<String, dynamic>? data;

  _DeletionApiClient()
    : super(
        dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
        tokenLoader: () async => 'token',
      );

  @override
  Future<Response<dynamic>> delete(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    this.path = path;
    this.data = data;
    return Response<dynamic>(
      statusCode: 204,
      requestOptions: RequestOptions(path: path),
    );
  }
}

const _profile = UserProfile(
  userId: '12',
  nickname: '여행자',
  email: 'traveler@example.com',
  stats: ProfileStats(completedCount: 0, createdCount: 0, likedCount: 0),
  recentCompletions: [],
  badges: {},
  createdCourses: [],
);

Future<void> _pumpProfile(
  WidgetTester tester, {
  required AuthRepository repository,
}) async {
  final router = GoRouter(
    initialLocation: '/profile',
    routes: [
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
      GoRoute(
        path: '/login',
        builder: (_, _) => const Scaffold(body: Text('로그인 화면')),
      ),
    ],
  );

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
          overrides: [
            authStateProvider.overrideWith((ref) async => true),
            authRepositoryProvider.overrideWithValue(repository),
            profileProvider.overrideWith((ref) async => _profile),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
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
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets('confirmed account deletion clears the session and opens login', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'auth_token': 'active-token',
      'cache_data_user_12_courses': 'cached',
      'cache_ts_user_12_courses': 1,
    });
    final client = _DeletionApiClient();
    var signedOut = false;
    final repository = AuthRepository(
      client: client,
      googleSignOut: () async {
        signedOut = true;
      },
    );
    await _pumpProfile(tester, repository: repository);

    final deleteButton = find.byKey(const Key('account-delete-button'));
    await tester.scrollUntilVisible(
      deleteButton,
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(deleteButton);
    await tester.pumpAndSettle();

    expect(
      find.text(
        '공개·비공개 코스를 포함한 계정 관련 데이터가 모두 삭제됩니다. 다른 사용자가 복제한 코스는 유지되며 원작자만 ‘탈퇴한 사용자’로 표시됩니다.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('계속'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('account-delete-confirmation-field')),
      '탈퇴',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('account-delete-final-button')));
    await tester.pumpAndSettle();

    expect(client.path, '/users/me');
    expect(client.data, {'confirmation': 'DELETE'});
    expect(signedOut, isTrue);
    expect(find.text('로그인 화면'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_token'), isNull);
    expect(prefs.getString('cache_data_user_12_courses'), isNull);
  });
}
