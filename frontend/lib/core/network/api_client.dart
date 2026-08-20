import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 현재 앱 언어 코드. main.dart에서 locale이 바뀔 때마다 갱신되며,
/// ApiClient가 BuildContext 없이도 요청에 Accept-Language를 실어 보낼 수 있게 한다.
String appLocaleCode = 'ko';

class ApiClient {
  static const defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  final Dio _dio;
  final Future<String?> Function() _tokenLoader;

  ApiClient({
    Dio? dio,
    String baseUrl = defaultBaseUrl,
    Future<String?> Function()? tokenLoader,
  })  : _dio = dio ?? Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        )),
        _tokenLoader = tokenLoader ?? _loadStoredToken {
    final uri = Uri.tryParse(_dio.options.baseUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw ArgumentError.value(_dio.options.baseUrl, 'baseUrl', '유효한 API 주소가 필요합니다.');
    }
    if (kReleaseMode && uri.scheme != 'https') {
      throw StateError('Release 빌드는 HTTPS API_BASE_URL이 필요합니다.');
    }
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokenLoader();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        options.headers['Accept-Language'] = appLocaleCode;
        handler.next(options);
      },
      onError: (error, handler) {
        debugPrint(
          '[ApiClient] ${error.requestOptions.method} ${error.requestOptions.path} '
          '=> ${error.response?.statusCode} ${error.response?.data ?? error.message}',
        );
        handler.next(error);
      },
    ));
  }

  static Future<String?> _loadStoredToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<Response> post(
    String path,
    Map<String, dynamic> data, {
    Map<String, dynamic>? headers,
  }) =>
      _dio.post(
        path,
        data: data,
        options: headers == null ? null : Options(headers: headers),
      );

  Future<Response> put(String path, Map<String, dynamic> data) =>
      _dio.put(path, data: data);

  Future<Response> delete(String path) => _dio.delete(path);

  Future<Response> get(String path, {Map<String, dynamic>? params}) =>
      _dio.get(path, queryParameters: params);
}

final apiClient = ApiClient();
