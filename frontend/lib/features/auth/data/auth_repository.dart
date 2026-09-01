import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/cache_service.dart';

final authStateProvider = FutureProvider<bool>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('auth_token') != null;
});

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(),
);

class AuthRepository {
  static const _serverClientId =
      '793585667481-59trfjaarlkffp2g3u2nacmac3127uh9.apps.googleusercontent.com';

  final GoogleSignIn _googleSignIn;
  final Future<void> Function()? _googleSignOutOverride;
  final ApiClient _client;

  AuthRepository({
    ApiClient? client,
    GoogleSignIn? googleSignIn,
    Future<void> Function()? googleSignOut,
  }) : _client = client ?? apiClient,
       _googleSignIn =
           googleSignIn ?? GoogleSignIn(serverClientId: _serverClientId),
       _googleSignOutOverride = googleSignOut;

  Future<String> register({
    required String email,
    required String password,
    required String nickname,
  }) async {
    final res = await _client.post('/auth/register', {
      'email': email,
      'password': password,
      'nickname': nickname,
    });
    final token = res.data['token'] as String;
    await _saveToken(token);
    return token;
  }

  Future<String> signInWithGoogle() async {
    final account = await _googleSignIn.signIn();
    if (account == null) throw Exception('GOOGLE_SIGNIN_CANCELLED');

    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null) throw Exception('GOOGLE_TOKEN_MISSING');

    final res = await _client.post('/auth/google', {'idToken': idToken});
    final token = res.data['token'] as String;
    await _saveToken(token);
    return token;
  }

  Future<void> logout() async {
    try {
      await _client.delete('/ai/chat/sessions');
    } catch (_) {
      // 서버 세션은 TTL로도 만료된다. 로그아웃 자체는 네트워크 장애로 막지 않는다.
    }
    try {
      await _signOutGoogle();
    } finally {
      await clearExpiredSession();
    }
  }

  Future<void> deleteAccount() async {
    await _client.delete('/users/me', data: const {'confirmation': 'DELETE'});
    try {
      await _signOutGoogle();
    } catch (_) {
      // The server deletion is authoritative even if local Google sign-out fails.
    } finally {
      await clearExpiredSession();
    }
  }

  Future<void> _signOutGoogle() async {
    final override = _googleSignOutOverride;
    if (override != null) {
      await override();
      return;
    }
    await _googleSignIn.signOut();
  }

  Future<void> clearExpiredSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    try {
      await CacheService.clearAll();
    } catch (_) {
      // An expired token must stay cleared even if local cache cleanup fails.
    }
  }

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }

  Future<void> _saveToken(String token) async {
    await CacheService.clearAll();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }
}
