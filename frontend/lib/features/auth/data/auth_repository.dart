import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

final authStateProvider = FutureProvider<bool>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('auth_token') != null;
});

class AuthRepository {
  static const _serverClientId =
      '793585667481-59trfjaarlkffp2g3u2nacmac3127uh9.apps.googleusercontent.com';

  final _googleSignIn = GoogleSignIn(serverClientId: _serverClientId);

  Future<String> signInWithGoogle() async {
    final account = await _googleSignIn.signIn();
    if (account == null) throw Exception('로그인이 취소되었습니다.');

    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null) throw Exception('인증 토큰을 가져올 수 없습니다.');

    final res = await apiClient.post('/auth/google', {'idToken': idToken});
    final token = res.data['token'] as String;
    await _saveToken(token);
    return token;
  }

  Future<void> logout() async {
    await _googleSignIn.signOut();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token') != null;
  }

  Future<void> _saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }
}
