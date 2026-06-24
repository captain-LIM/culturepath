import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/home/data/culture_model.dart';
import '../../features/culture_detail/data/region_model.dart';
import '../../features/culture_detail/presentation/culture_detail_screen.dart';
import '../../features/region_detail/presentation/region_detail_screen.dart';
import '../../features/course_builder/presentation/course_builder_screen.dart';
import '../../features/explore/presentation/explore_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../shared/widgets/main_shell.dart';

class _PlaceholderScreen extends StatelessWidget {
  final String label;
  const _PlaceholderScreen(this.label);
  @override
  Widget build(BuildContext context) =>
      Scaffold(body: Center(child: Text(label, style: const TextStyle(fontSize: 18))));
}

final appRouter = GoRouter(
  initialLocation: '/home',
  redirect: (context, state) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final isAuthRoute = state.matchedLocation == '/login' ||
        state.matchedLocation == '/register';
    if (token != null && isAuthRoute) return '/home';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
    GoRoute(
      path: '/cultures/:id',
      builder: (context, state) {
        final culture = state.extra as CultureCategory;
        return CultureDetailScreen(culture: culture);
      },
    ),
    GoRoute(
      path: '/regions/:code/spots',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>;
        return RegionDetailScreen(
          region: extra['region'] as RegionItem,
          culture: extra['culture'] as CultureCategory,
        );
      },
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => MainShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(routes: [
          GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/explore', builder: (context, state) => const ExploreScreen()),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/create', builder: (context, state) => const CourseBuilderScreen()),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
        ]),
      ],
    ),
  ],
);
