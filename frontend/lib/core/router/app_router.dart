import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';

// 홈 화면은 3단계에서 추가 예정 — 임시 placeholder
import 'package:flutter/material.dart';

class _PlaceholderHome extends StatelessWidget {
  const _PlaceholderHome();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('문화여행')),
      body: const Center(child: Text('홈 화면 — 3단계에서 구현')),
    );
  }
}

final appRouter = GoRouter(
  initialLocation: '/login',
  redirect: (context, state) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final isLoginRoute = state.matchedLocation == '/login' ||
        state.matchedLocation == '/register';
    if (token != null && isLoginRoute) return '/home';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
    GoRoute(path: '/home', builder: (context, state) => const _PlaceholderHome()),
  ],
);
