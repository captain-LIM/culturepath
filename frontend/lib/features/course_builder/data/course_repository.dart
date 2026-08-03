import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/cache_service.dart';
import 'place_item.dart';
import 'course_model.dart';

class CourseRepository {
  static const _guestKey = 'guest_courses';

  Future<List<PlaceItem>> searchPlaces(String query) async {
    final params = query.isNotEmpty ? {'q': query} : null;
    final res = await apiClient.get('/places/search', params: params);
    return (res.data as List)
        .map((j) => PlaceItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<List<CourseItem>> getPublicCourses() async {
    const key = 'public_courses';
    try {
      final res = await apiClient.get('/courses/public');
      await CacheService.set(key, jsonEncode(res.data));
      return (res.data as List)
          .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
          .toList();
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached != null) {
        return (jsonDecode(cached) as List)
            .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
            .toList();
      }
      rethrow;
    }
  }

  Future<List<CourseItem>> getFeed({String sort = 'recent'}) async {
    final key = 'feed_$sort';
    try {
      final res = await apiClient.get('/courses/feed', params: {'sort': sort});
      await CacheService.set(key, jsonEncode(res.data));
      return (res.data as List)
          .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
          .toList();
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached != null) {
        return (jsonDecode(cached) as List)
            .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
            .toList();
      }
      rethrow;
    }
  }

  Future<List<CourseItem>> getRanking() async {
    const key = 'ranking';
    try {
      final res = await apiClient.get('/courses/ranking');
      await CacheService.set(key, jsonEncode(res.data));
      return (res.data as List)
          .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
          .toList();
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached != null) {
        return (jsonDecode(cached) as List)
            .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
            .toList();
      }
      rethrow;
    }
  }

  // 좋아요 토글 — { liked: bool, likeCount: int } 반환
  Future<Map<String, dynamic>> toggleLike(int courseId) async {
    final res = await apiClient.post('/courses/$courseId/like', {});
    await _invalidateCourseLists();
    return res.data as Map<String, dynamic>;
  }

  Future<CourseItem> createCourse(CourseItem course) async {
    final fingerprint = jsonEncode(course.toJson());
    final key = await _pendingMutationKey('create', fingerprint);
    final res = await apiClient.post(
      '/courses',
      course.toJson(),
      headers: {'Idempotency-Key': key},
    );
    final saved = CourseItem.fromJson(res.data as Map<String, dynamic>);
    await _clearPendingMutationKey('create', key);
    await _invalidateCourseLists();
    return saved;
  }

  Future<CourseItem> updateCourse(CourseItem course) async {
    final res = await apiClient.put('/courses/${course.id}', course.toJson());
    await _invalidateCourseLists();
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> deleteCourse(int courseId) async {
    await apiClient.delete('/courses/$courseId');
    await _invalidateCourseLists();
  }

  Future<CourseItem> forkCourse(int courseId) async {
    final scope = 'fork_$courseId';
    final key = await _pendingMutationKey(scope, String(courseId));
    final res = await apiClient.post(
      '/courses/$courseId/fork',
      {},
      headers: {'Idempotency-Key': key},
    );
    final saved = CourseItem.fromJson(res.data as Map<String, dynamic>);
    await _clearPendingMutationKey(scope, key);
    await _invalidateCourseLists();
    return saved;
  }

  Future<List<CourseItem>> getMyCourses() async {
    final res = await apiClient.get('/courses');
    return (res.data as List)
        .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveGuestCourse(CourseItem course) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_guestKey);
    final list = raw != null
        ? (jsonDecode(raw) as List)
            .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
            .toList()
        : <CourseItem>[];
    list.add(course);
    await prefs.setString(_guestKey, jsonEncode(list.map((c) => c.toJson()).toList()));
  }

  Future<List<CourseItem>> getGuestCourses() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_guestKey);
    if (raw == null) return [];
    return (jsonDecode(raw) as List)
        .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<CourseItem> getCourse(int id) async {
    final res = await apiClient.get('/courses/$id');
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<CourseItem>> getMyLikedCourses() async {
    final res = await apiClient.get('/users/me/likes');
    return (res.data as List)
        .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }

  bool _canUseStaleCache(Object error) {
    if (error is! DioException) return false;
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return true;
    }
    final status = error.response?.statusCode;
    return status != null && status >= 500;
  }

  Future<String> _pendingMutationKey(String scope, String fingerprint) async {
    final prefs = await SharedPreferences.getInstance();
    final fingerprintKey = 'pending_${scope}_fingerprint';
    final idempotencyKey = 'pending_${scope}_idempotency_key';
    if (prefs.getString(fingerprintKey) == fingerprint) {
      final existing = prefs.getString(idempotencyKey);
      if (existing != null) return existing;
    }

    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    final key = base64UrlEncode(bytes).replaceAll('=', '');
    await prefs.setString(fingerprintKey, fingerprint);
    await prefs.setString(idempotencyKey, key);
    return key;
  }

  Future<void> _clearPendingMutationKey(String scope, String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final idempotencyKey = 'pending_${scope}_idempotency_key';
      if (prefs.getString(idempotencyKey) != key) return;
      await prefs.remove('pending_${scope}_fingerprint');
      await prefs.remove(idempotencyKey);
    } catch (_) {
      // The server response is authoritative; cleanup must not turn success into failure.
    }
  }

  Future<void> _invalidateCourseLists() async {
    try {
      await CacheService.clearAll();
    } catch (_) {
      // The server mutation already succeeded; cache cleanup is best-effort.
    }
  }
}
