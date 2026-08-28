import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/ai_assistant/presentation/ai_assistant_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/home/data/culture_model.dart';
import '../../features/culture_detail/data/region_model.dart';
import '../../features/culture_detail/presentation/culture_detail_screen.dart';
import '../../features/region_detail/presentation/region_detail_screen.dart';
import '../../features/place_detail/presentation/place_detail_screen.dart';
import '../../features/course_builder/data/place_item.dart';
import '../../features/course_builder/data/course_model.dart';
import '../../features/course_builder/data/course_repository.dart';
import '../../features/course_builder/presentation/course_builder_screen.dart';
import '../../features/course_view/presentation/course_view_screen.dart';
import '../../features/explore/presentation/explore_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../shared/widgets/main_shell.dart';

final appRouter = GoRouter(
  initialLocation: '/home',
  redirect: (context, state) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    if (token != null && state.matchedLocation == '/login') return '/home';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/ai-assistant',
      builder: (context, state) => AiAssistantScreen(
        courseId: int.tryParse(state.uri.queryParameters['courseId'] ?? ''),
      ),
    ),
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
    GoRoute(
      path: '/places/:id',
      builder: (context, state) {
        final id = state.pathParameters['id'] ?? '';
        if (!RegExp(r'^\d+$').hasMatch(id)) return const _ErrorScreen();
        return PlaceDetailScreen(
          contentId: id,
          initialPlace: state.extra as PlaceItem?,
        );
      },
    ),
    GoRoute(
      path: '/courses/:id',
      builder: (context, state) {
        final id = int.tryParse(state.pathParameters['id'] ?? '');
        if (id == null) return const _ErrorScreen();
        return _CourseDeepLinkScreen(courseId: id);
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
          GoRoute(path: '/ai', builder: (context, state) => const AiAssistantScreen()),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
        ]),
      ],
    ),
  ],
);

class _CourseDeepLinkScreen extends ConsumerWidget {
  final int courseId;
  const _CourseDeepLinkScreen({required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courseAsync = ref.watch(_deepLinkCourseProvider(courseId));
    return courseAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('course_deep_link_error'.tr(namedArgs: {'error': '$e'}))),
      ),
      data: (course) => CourseViewScreen(course: course),
    );
  }
}

final _deepLinkCourseProvider = FutureProvider.autoDispose.family<CourseItem, int>(
  (ref, id) => CourseRepository().getCourse(id),
);

class _ErrorScreen extends StatelessWidget {
  const _ErrorScreen();
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('invalid_link'.tr())),
      );
}
