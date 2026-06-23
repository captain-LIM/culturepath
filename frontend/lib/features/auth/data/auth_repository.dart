import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

class AuthRepository {
  // 회원가입
  Future<String> register({
    required String email,
    required String password,
    required String nickname,
  }) async {
    final res = await apiClient.post('/auth/register', {
      'email': email,
      'password': password,
      'nickname': nickname,
    });
    final token = res.data['token'] as String;
    await _saveToken(token);
    return token;
  }

  // 로그인
  Future<String> login({
    required String email,
    required String password,
  }) async {
    final res = await apiClient.post('/auth/login', {
      'email': email,
      'password': password,
    });
    final token = res.data['token'] as String;
    await _saveToken(token);
    return token;
  }

  // 게스트 코스 서버 이관
  Future<int> migrateGuest(List<Map<String, dynamic>> guestCourses) async {
    final res = await apiClient.post('/auth/migrate-guest', {
      'guestCourses': guestCourses,
    });
    return res.data['migratedCount'] as int;
  }

  // 로그아웃
  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }

  // 게스트 코스 로컬 저장
  Future<void> saveGuestCourse(Map<String, dynamic> course) async {
    final prefs = await SharedPreferences.getInstance();
    final courses = prefs.getStringList('guest_courses') ?? [];
    courses.add(course.toString());
    await prefs.setStringList('guest_courses', courses);
  }

  Future<void> _saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }
}
