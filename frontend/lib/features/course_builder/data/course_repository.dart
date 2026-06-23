import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
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
    final res = await apiClient.get('/courses/public');
    return (res.data as List)
        .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<CourseItem> createCourse(CourseItem course) async {
    final res = await apiClient.post('/courses', course.toJson());
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<CourseItem> updateCourse(CourseItem course) async {
    final res = await apiClient.put('/courses/${course.id}', course.toJson());
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
  }

  Future<CourseItem> forkCourse(int courseId) async {
    final res = await apiClient.post('/courses/$courseId/fork', {});
    return CourseItem.fromJson(res.data as Map<String, dynamic>);
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

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }
}
