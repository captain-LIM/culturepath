import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/auth/data/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RecordingApiClient extends ApiClient {
  String? path;
  Map<String, dynamic>? data;

  _RecordingApiClient()
      : super(
          dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
          tokenLoader: () async => null,
        );

  @override
  Future<Response<dynamic>> post(
    String path,
    Map<String, dynamic> data, {
    Map<String, dynamic>? headers,
  }) async {
    this.path = path;
    this.data = data;
    return Response<dynamic>(
      data: {'token': 'registered-token'},
      statusCode: 201,
      requestOptions: RequestOptions(path: path),
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('register follows the backend contract and stores the token', () async {
    SharedPreferences.setMockInitialValues({
      'cache_data_guest_courses': 'stale',
      'cache_ts_guest_courses': 1,
    });
    final client = _RecordingApiClient();
    final repository = AuthRepository(client: client);

    final token = await repository.register(
      email: 'traveler@example.com',
      password: 'secret12',
      nickname: '여행자',
    );

    expect(token, 'registered-token');
    expect(client.path, '/auth/register');
    expect(client.data, {
      'email': 'traveler@example.com',
      'password': 'secret12',
      'nickname': '여행자',
    });
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_token'), 'registered-token');
    expect(prefs.getString('cache_data_guest_courses'), isNull);
    expect(prefs.getInt('cache_ts_guest_courses'), isNull);
  });

  test('clearExpiredSession removes an invalid token and cached data', () async {
    SharedPreferences.setMockInitialValues({
      'auth_token': 'expired-token',
      'cache_data_authenticated_courses': 'stale',
      'cache_ts_authenticated_courses': 1,
    });
    final repository = AuthRepository(client: _RecordingApiClient());

    await repository.clearExpiredSession();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_token'), isNull);
    expect(prefs.getString('cache_data_authenticated_courses'), isNull);
    expect(prefs.getInt('cache_ts_authenticated_courses'), isNull);
  });
}
