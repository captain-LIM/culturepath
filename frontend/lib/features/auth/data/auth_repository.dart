import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/cache_service.dart';

final authStateProvider = FutureProvider<bool>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('auth_token') != null;
});

class AuthRepository {
  static const _serverClientId =
      '793585667481-59trfjaarlkffp2g3u2nacmac3127uh9.apps.googleusercontent.com';

  final _googleSignIn = GoogleSignIn(serverClientId: _serverClientId);
  final ApiClient _client;

  AuthRepository({ApiClient? client}) : _client = client ?? apiClient;

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
    await _googleSignIn.signOut();
    await clearExpiredSession();
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
