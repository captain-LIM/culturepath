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
  final ApiClient _apiClient;
  final Future<void> Function(String key, String json) _cacheWriter;

  CourseRepository({
    ApiClient? client,
    Future<void> Function(String key, String json)? cacheWriter,
  })  : _apiClient = client ?? apiClient,
        _cacheWriter = cacheWriter ?? CacheService.set;

  Future<List<PlaceItem>> searchPlaces(String query) async {
    final params = query.isNotEmpty ? {'q': query} : null;
    final res = await _apiClient.get('/places/search', params: params);
    return (res.data as List)
        .map((j) => PlaceItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<List<CourseItem>> getPublicCourses() async {
    const key = 'public_courses';
    try {
      final res = await _apiClient.get('/courses/public');
      final courses = _decodeCourses(res.data);
      await _writeCourseCache(key, res.data);
      return courses;
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
    return (await getFeedSnapshot(sort: sort)).courses;
  }

  Future<CourseListSnapshot> getFeedSnapshot({String sort = 'recent'}) async {
    final key = 'feed_$sort';
    try {
      final res = await _apiClient.get('/courses/feed', params: {'sort': sort});
      final courses = _decodeCourses(res.data);
      await _writeCourseCache(key, res.data);
      return CourseListSnapshot(courses: courses, isStale: false);
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached != null) {
        return CourseListSnapshot(
          courses: _decodeCourses(jsonDecode(cached)),
          isStale: true,
        );
      }
      rethrow;
    }
  }

  Future<List<CourseItem>> getRanking() async {
    return (await getRankingSnapshot()).courses;
  }

  Future<CourseListSnapshot> getRankingSnapshot() async {
    const key = 'ranking';
    try {
      final res = await _apiClient.get('/courses/ranking');
      final courses = _decodeCourses(res.data);
      await _writeCourseCache(key, res.data);
      return CourseListSnapshot(courses: courses, isStale: false);
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached != null) {
        return CourseListSnapshot(
          courses: _decodeCourses(jsonDecode(cached)),
          isStale: true,
        );
      }
      rethrow;
    }
  }

  // 좋아요 토글 — { liked: bool, likeCount: int } 반환
  Future<Map<String, dynamic>> toggleLike(int courseId) async {
    final res = await _apiClient.post('/courses/$courseId/like', {});
    await _invalidateCourseLists();
    return res.data as Map<String, dynamic>;
  }

  Future<CourseItem> createCourse(CourseItem course) async {
    final fingerprint = jsonEncode(course.toJson());
    final key = await _pendingMutationKey('create', fingerprint);
    final res = await _apiClient.post(
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
    final payload = course.toJson();
    payload.remove('revision');
    if (course.revision != null) payload['expectedRevision'] = course.revision;
    final res = await _apiClient.put('/courses/${course.id}', payload);
    await _invalidateCourseLists();
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> deleteCourse(int courseId) async {
    await _apiClient.delete('/courses/$courseId');
    await _invalidateCourseLists();
  }

  Future<CourseItem> forkCourse(int courseId) async {
    final scope = 'fork_$courseId';
    final key = await _pendingMutationKey(scope, courseId.toString());
    final res = await _apiClient.post(
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
    return (await getMyCoursesSnapshot()).courses;
  }

  Future<CourseListSnapshot> getMyCoursesSnapshot() async {
    const key = 'my_courses';
    try {
      final res = await _apiClient.get('/courses');
      final courses = _decodeCourses(res.data);
      await _writeCourseCache(key, res.data);
      return CourseListSnapshot(
        courses: courses,
        isStale: false,
      );
    } catch (error) {
      if (!_canUseStaleCache(error)) rethrow;
      final cached = await CacheService.getStale(key);
      if (cached == null) rethrow;
      return CourseListSnapshot(
        courses: _decodeCourses(jsonDecode(cached)),
        isStale: true,
      );
    }
  }

  Future<int> saveGuestCourse(CourseItem course) async {
    final list = await getGuestCourses();
    list.add(course);
    await _writeGuestCourses(list);
    return list.length - 1;
  }

  Future<void> replaceGuestCourseAt(
    int index,
    CourseItem course, {
    CourseItem? expected,
  }) async {
    final list = await getGuestCourses();
    final target = _resolveGuestIndex(list, index, expected);
    list[target] = course;
    await _writeGuestCourses(list);
  }

  Future<void> deleteGuestCourseAt(
    int index, {
    CourseItem? expected,
  }) async {
    final list = await getGuestCourses();
    final target = _resolveGuestIndex(list, index, expected);
    list.removeAt(target);
    await _writeGuestCourses(list);
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
    final res = await _apiClient.get('/courses/$id');
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<CourseItem>> getMyLikedCourses() async {
    final res = await _apiClient.get('/users/me/likes');
    return (res.data as List)
        .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }

  List<CourseItem> _decodeCourses(Object? data) => (data as List)
      .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
      .toList();

  Future<void> _writeGuestCourses(List<CourseItem> courses) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _guestKey,
      jsonEncode(courses.map((course) => course.toJson()).toList()),
    );
  }

  Future<void> _writeCourseCache(String key, Object? data) async {
    try {
      await _cacheWriter(key, jsonEncode(data));
    } catch (_) {
      // A successful server response stays authoritative when local cache fails.
    }
  }

  int _resolveGuestIndex(
    List<CourseItem> courses,
    int preferredIndex,
    CourseItem? expected,
  ) {
    if (expected == null) {
      if (preferredIndex < 0 || preferredIndex >= courses.length) {
        throw RangeError.index(preferredIndex, courses, 'index');
      }
      return preferredIndex;
    }

    final fingerprint = jsonEncode(expected.toJson());
    if (preferredIndex >= 0 &&
        preferredIndex < courses.length &&
        jsonEncode(courses[preferredIndex].toJson()) == fingerprint) {
      return preferredIndex;
    }
    final recovered = <int>[
      for (var index = 0; index < courses.length; index++)
        if (jsonEncode(courses[index].toJson()) == fingerprint) index,
    ];
    if (recovered.isEmpty) {
      throw StateError('편집하려던 게스트 코스가 변경되었거나 삭제되었습니다.');
    }
    if (recovered.length > 1) {
      throw StateError('Ambiguous guest course identity; refusing unsafe mutation.');
    }
    return recovered.single;
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

class CourseListSnapshot {
  final List<CourseItem> courses;
  final bool isStale;

  const CourseListSnapshot({required this.courses, required this.isStale});
}
