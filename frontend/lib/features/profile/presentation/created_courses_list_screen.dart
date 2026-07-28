import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../../course_view/presentation/course_view_screen.dart';

final _myCoursesProvider = FutureProvider.autoDispose<List<CourseItem>>(
  (ref) => CourseRepository().getMyCourses(),
);

class CreatedCoursesListScreen extends ConsumerWidget {
  const CreatedCoursesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    final async = ref.watch(_myCoursesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'created_courses'.tr(),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text('profile_error'.tr(), style: TextStyle(color: Colors.grey.shade500)),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.invalidate(_myCoursesProvider),
                child: Text('retry'.tr()),
              ),
            ],
          ),
        ),
        data: (courses) => courses.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.map_outlined, size: 48, color: Colors.grey.shade300),
                    const SizedBox(height: 12),
                    Text(
                      'no_created_courses'.tr(),
                      style: TextStyle(fontSize: 14, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 12),
                itemCount: courses.length,
                itemBuilder: (_, i) => _CourseTile(
                  course: courses[i],
                  onChanged: () => ref.invalidate(_myCoursesProvider),
                ),
              ),
      ),
    );
  }
}

class _CourseTile extends StatefulWidget {
  final CourseItem course;
  final VoidCallback onChanged;

  const _CourseTile({required this.course, required this.onChanged});

  @override
  State<_CourseTile> createState() => _CourseTileState();
}

class _CourseTileState extends State<_CourseTile> {
  bool _deleting = false;

  Future<void> _edit() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CourseBuilderScreen(initialCourse: widget.course),
      ),
    );
    widget.onChanged();
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('delete_course'.tr()),
        content: Text('delete_confirm'.tr(namedArgs: {'title': widget.course.title})),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: Text('cancel'.tr()),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: Text('delete'.tr()),
          ),
        ],
      ),
    );

    if (confirm != true || widget.course.id == null) return;
    setState(() => _deleting = true);
    try {
      await CourseRepository().deleteCourse(widget.course.id!);
      widget.onChanged();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('delete_failed'.tr()), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.course;
    final visibility = c.isPublic ? 'public'.tr() : 'private'.tr();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
      ),
      child: Row(
        children: [
          Expanded(
            child: Material(
              color: Colors.transparent,
              borderRadius: const BorderRadius.horizontal(left: Radius.circular(12)),
              child: InkWell(
                borderRadius: const BorderRadius.horizontal(left: Radius.circular(12)),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => CourseViewScreen(course: c, isOwner: true)),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 0, 14),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.map_outlined, color: AppColors.primary, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              c.title,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.primary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'course_place_info'.tr(namedArgs: {
                                'n': c.totalPlaces.toString(),
                                'visibility': visibility,
                              }),
                              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_deleting)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red.shade300),
              ),
            )
          else ...[
            IconButton(
              icon: Icon(Icons.edit_outlined, color: AppColors.primary.withValues(alpha: 0.6), size: 20),
              onPressed: _edit,
              tooltip: 'edit_course'.tr(),
            ),
            IconButton(
              icon: Icon(Icons.delete_outline, color: Colors.red.shade300, size: 20),
              onPressed: _delete,
            ),
          ],
        ],
      ),
    );
  }
}
