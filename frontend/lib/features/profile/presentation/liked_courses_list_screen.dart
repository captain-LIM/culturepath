import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_view/presentation/course_view_screen.dart';

final _likedCoursesProvider = FutureProvider.autoDispose<List<CourseItem>>(
  (ref) => CourseRepository().getMyLikedCourses(),
);

class LikedCoursesListScreen extends ConsumerWidget {
  const LikedCoursesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_likedCoursesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('stat_liked'.tr()),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.primary,
        elevation: 0,
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text('course_load_failed'.tr(), style: TextStyle(color: Colors.grey.shade500)),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.invalidate(_likedCoursesProvider),
                child: Text('retry'.tr()),
              ),
            ],
          ),
        ),
        data: (courses) => courses.isEmpty
            ? Center(
                child: Text(
                  'no_liked_courses'.tr(),
                  style: TextStyle(color: Colors.grey.shade500),
                ),
              )
            : RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(_likedCoursesProvider);
                  await ref.read(_likedCoursesProvider.future);
                },
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: courses.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (ctx, i) => _CourseTile(course: courses[i]),
                ),
              ),
      ),
    );
  }
}

class _CourseTile extends StatefulWidget {
  final CourseItem course;
  const _CourseTile({required this.course});

  @override
  State<_CourseTile> createState() => _CourseTileState();
}

class _CourseTileState extends State<_CourseTile> {
  bool _loading = false;

  Future<void> _open() async {
    setState(() => _loading = true);
    if (mounted) {
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => CourseViewScreen(course: widget.course)),
      );
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final course = widget.course;
    final placeCount = course.tracks.fold<int>(0, (s, t) => s + t.places.length);

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: _loading ? null : _open,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      course.title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.person_outline, size: 12, color: Colors.grey.shade400),
                        const SizedBox(width: 3),
                        Text(
                          course.authorId ?? 'unknown_author'.tr(),
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                        ),
                        const SizedBox(width: 10),
                        Icon(Icons.place_outlined, size: 12, color: Colors.grey.shade400),
                        const SizedBox(width: 3),
                        Text(
                          'place_count'.tr(namedArgs: {'n': '$placeCount'}),
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (_loading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.favorite, size: 14, color: Colors.red.shade400),
                    const SizedBox(width: 3),
                    Text(
                      '${course.likeCount}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                    ),
                    const SizedBox(width: 4),
                    Icon(Icons.arrow_forward_ios, size: 12, color: Colors.grey.shade300),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
