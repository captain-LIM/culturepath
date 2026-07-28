import 'package:shared_preferences/shared_preferences.dart';

class CacheService {
  static const _dataPrefix = 'cache_data_';
  static const _tsPrefix = 'cache_ts_';

  static Future<void> set(String key, String json) async {
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.setString('$_dataPrefix$key', json),
      prefs.setInt('$_tsPrefix$key', DateTime.now().millisecondsSinceEpoch),
    ]);
  }

  /// TTL 내 유효한 캐시 반환. 만료됐으면 null.
  static Future<String?> get(String key, {Duration ttl = const Duration(minutes: 5)}) async {
    final prefs = await SharedPreferences.getInstance();
    final ts = prefs.getInt('$_tsPrefix$key');
    if (ts == null) return null;
    if (DateTime.now().millisecondsSinceEpoch - ts > ttl.inMilliseconds) return null;
    return prefs.getString('$_dataPrefix$key');
  }

  /// TTL 무관하게 마지막으로 저장된 데이터 반환 (오프라인 폴백용).
  static Future<String?> getStale(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_dataPrefix$key');
  }
}
