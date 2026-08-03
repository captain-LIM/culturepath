import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class CacheService {
  static const _dataPrefix = 'cache_data_';
  static const _tsPrefix = 'cache_ts_';

  static String _scope(SharedPreferences prefs) {
    final token = prefs.getString('auth_token');
    if (token == null) return 'guest';
    try {
      final parts = token.split('.');
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final id = payload['id'] ?? payload['userId'] ?? payload['sub'];
      if (id != null) return 'user_$id';
    } catch (_) {
      // The token is still handled by the server; this is only a cache namespace.
    }
    return 'authenticated';
  }

  static String _key(SharedPreferences prefs, String prefix, String key) =>
      '$prefix${_scope(prefs)}_$key';

  static Future<void> set(String key, String json) async {
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.setString(_key(prefs, _dataPrefix, key), json),
      prefs.setInt(
        _key(prefs, _tsPrefix, key),
        DateTime.now().millisecondsSinceEpoch,
      ),
    ]);
  }

  /// TTL 내 유효한 캐시 반환. 만료됐으면 null.
  static Future<String?> get(String key, {Duration ttl = const Duration(minutes: 5)}) async {
    final prefs = await SharedPreferences.getInstance();
    final ts = prefs.getInt(_key(prefs, _tsPrefix, key));
    if (ts == null) return null;
    if (DateTime.now().millisecondsSinceEpoch - ts > ttl.inMilliseconds) return null;
    return prefs.getString(_key(prefs, _dataPrefix, key));
  }

  /// TTL 무관하게 마지막으로 저장된 데이터 반환 (오프라인 폴백용).
  static Future<String?> getStale(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key(prefs, _dataPrefix, key));
  }

  static Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where(
          (key) => key.startsWith(_dataPrefix) || key.startsWith(_tsPrefix),
        );
    await Future.wait(keys.map(prefs.remove));
  }
}
