import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/data/my_courses_provider.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../../auth/data/auth_repository.dart';
import '../../completion/presentation/completion_sheet.dart';
import 'course_ai_edit_screen.dart';
import 'widgets/fork_badge.dart';
import 'widgets/course_track_map_preview.dart';
import 'widgets/course_track_view.dart';

final courseDetailProvider = FutureProvider.autoDispose.family<CourseItem, int>(
  (ref, id) => CourseRepository().getCourse(id),
);

bool shouldRefreshCourseDetail(CourseItem course, int? guestCourseIndex) =>
    course.id != null && guestCourseIndex == null;

class CourseViewScreen extends ConsumerStatefulWidget {
  final CourseItem course;
  final bool isOwner;
  final int? guestCourseIndex;

  const CourseViewScreen({
    super.key,
    required this.course,
    this.isOwner = false,
    this.guestCourseIndex,
  });

  @override
  ConsumerState<CourseViewScreen> createState() => _CourseViewScreenState();
}

class _CourseViewScreenState extends ConsumerState<CourseViewScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  bool _forking = false;
  bool _completed = false;
  late CourseItem _course;

  @override
  void initState() {
    super.initState();
    _course = widget.course;
    _tabCtrl = TabController(length: _course.tracks.length, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleFork() async {
    final repo = CourseRepository();
    final loggedIn = await repo.isLoggedIn();

    if (!loggedIn) {
      final forkedLocally = _course.createLocalFork(
        titleSuffix: 'fork_suffix'.tr(),
        unknownAuthor: 'unknown_author'.tr(),
      );
      if (!mounted) return;
      _navigateToEdit(forkedLocally);
      return;
    }

    if (_course.id == null) {
      final forkedLocally = _course.copyWith(
        title: '${_course.title} ${'fork_suffix'.tr()}',
      );
      if (!mounted) return;
      _navigateToEdit(forkedLocally);
      return;
    }

    setState(() => _forking = true);
    try {
      final forked = await repo.forkCourse(_course.id!);
      if (mounted) _navigateToEdit(forked);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('fork_failed'.tr(namedArgs: {'error': e.toString()}))));
      }
    } finally {
      if (mounted) setState(() => _forking = false);
    }
  }

  void _navigateToEdit(CourseItem forked) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CourseBuilderScreen(initialCourse: forked),
    ));
  }

  Future<void> _shareCourse() async {
    try {
      final course = _course;
      final activeDays = course.tracks.where((t) => t.places.isNotEmpty).length;
      final buffer = StringBuffer()
        ..writeln('📍 ${course.title}')
        ..writeln('share_course_summary'.tr(namedArgs: {'days': '$activeDays', 'count': '${course.totalPlaces}'}));
      if (course.description.isNotEmpty) {
        buffer
          ..writeln()
          ..writeln(course.description);
      }
      if (course.id != null && widget.guestCourseIndex == null) {
        buffer
          ..writeln()
          ..write('share_view_in_app'.tr(namedArgs: {'app': 'app_name'.tr(), 'url': 'culturepath://app/courses/${course.id}'}));
      }
      await Share.share(buffer.toString().trim(), subject: course.title);
    } catch (e) {
      debugPrint('Share error: $e');
      // 네이티브 공유 실패 시 클립보드 폴백
      final course = _course;
      final activeDays = course.tracks.where((t) => t.places.isNotEmpty).length;
      final fallback = StringBuffer()
        ..writeln('📍 ${course.title}')
        ..writeln('share_course_summary'.tr(namedArgs: {'days': '$activeDays', 'count': '${course.totalPlaces}'}));
      if (course.description.isNotEmpty) {
        fallback..writeln()..writeln(course.description);
      }
      if (course.id != null && widget.guestCourseIndex == null) {
        fallback..writeln()..write('share_view_in_app'.tr(namedArgs: {'app': 'app_name'.tr(), 'url': 'culturepath://app/courses/${course.id}'}));
      }
      await Clipboard.setData(ClipboardData(text: fallback.toString().trim()));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('share_link_copied'.tr()),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _handleEdit() async {
    final saved = await Navigator.of(context).push<CourseItem>(MaterialPageRoute(
      builder: (_) => CourseBuilderScreen(
        initialCourse: _course,
        guestCourseIndex: widget.guestCourseIndex,
      ),
    ));
    if (mounted && saved != null) {
      ref.invalidate(myCoursesProvider);
      Navigator.of(context).pop();
    }
  }

  Future<void> _handleDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('delete_course'.tr()),
        content: Text('delete_confirm'.tr(namedArgs: {'title': _course.title})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text('cancel'.tr())),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text('delete'.tr())),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final repository = CourseRepository();
      if (widget.guestCourseIndex != null) {
        await repository.deleteGuestCourseAt(
          widget.guestCourseIndex!,
          expected: _course,
        );
      } else if (_course.id != null) {
        await repository.deleteCourse(_course.id!);
      }
      ref.invalidate(myCoursesProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('delete_failed'.tr())));
      }
    }
  }

  Future<void> _handleAiEdit() async {
    if (_course.id == null || widget.guestCourseIndex != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('save_before_ai'.tr())),
      );
      return;
    }
    if (!await CourseRepository().isLoggedIn()) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('login_required_ai'.tr())),
        );
      }
      return;
    }
    if (!mounted) return;
    final saved = await showCourseAiEditScreen(
      context,
      _course,
      isOwner: widget.isOwner || _course.isOwner,
      onUnauthorized: () async {
        await AuthRepository().clearExpiredSession();
        ref.invalidate(authStateProvider);
        if (mounted) context.go('/login');
      },
      onCourseUnavailable: () {
        if (!mounted) return;
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('ai_edit_course_unavailable'.tr())),
        );
      },
    );
    if (saved != null && mounted) {
      ref.invalidate(myCoursesProvider);
      Navigator.of(context).pop();
    }
  }

  String? _primaryCulture() {
    final counts = <String, int>{};
    for (final track in _course.tracks) {
      for (final place in track.places) {
        if (place.category.isNotEmpty) {
          counts[place.category] = (counts[place.category] ?? 0) + 1;
        }
      }
    }
    if (counts.isEmpty) return null;
    return counts.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
  }

  Future<void> _handleComplete() async {
    if (_course.id == null || widget.guestCourseIndex != null) return;

    final loggedIn = await CourseRepository().isLoggedIn();
    if (!mounted) return;
    if (!loggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('login_required_complete'.tr()),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final success = await showCompletionSheet(
      context,
      courseId: _course.id!,
      courseTitle: _course.title,
      culture: _primaryCulture(),
    );

    if (success && mounted) {
      setState(() => _completed = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('completion_saved'.tr()),
          backgroundColor: AppColors.accentGold,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final courseId = _course.id;
    if (shouldRefreshCourseDetail(_course, widget.guestCourseIndex)) {
      ref.listen<AsyncValue<CourseItem>>(courseDetailProvider(courseId!), (previous, next) {
        next.whenData((updated) {
          if (mounted) setState(() => _course = updated);
        });
      });
    }
    final course = _course;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          course.title,
          style: Theme.of(context).textTheme.titleMedium,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          if (widget.isOwner || course.isOwner)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'edit_course'.tr(),
              onPressed: _handleEdit,
            ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'share') _shareCourse();
              if (value == 'ai') _handleAiEdit();
              if (value == 'delete') _handleDelete();
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'share', child: Text('share_course'.tr())),
              PopupMenuItem(value: 'ai', child: Text('ai_course_edit'.tr())),
              if (widget.isOwner || course.isOwner)
                PopupMenuItem(value: 'delete', child: Text('delete_course'.tr())),
            ],
          ),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: AppColors.accent,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.muted,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: course.tracks
              .map((t) => Tab(text: 'Day ${t.trackNumber} (${'place_count'.tr(namedArgs: {'n': t.places.length.toString()})})'))
              .toList(),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (course.description.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(
                course.description,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5),
              ),
            ),
          if (course.authorId != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: Text(
                'by ${course.authorId}',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
            ),
          if (course.forkedFrom != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: ForkBadge(forkedFrom: course.forkedFrom!),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              0,
            ),
            child: OutlinedButton.icon(
              onPressed: _completed ||
                      course.id == null ||
                      widget.guestCourseIndex != null
                  ? null
                  : _handleComplete,
              icon: Icon(_completed ? Icons.check_circle : Icons.flag_outlined),
              label: Text(_completed ? 'completed_badge'.tr() : 'complete_course'.tr()),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabCtrl,
              children: course.tracks
                  .map((t) => SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(0, 16, 0, 100),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            CourseTrackMapPreview(course: course, track: t),
                            CourseTrackView(track: t),
                          ],
                        ),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
      floatingActionButton: widget.isOwner || course.isOwner
          ? null
          : FloatingActionButton.extended(
        onPressed: _forking ? null : _handleFork,
        backgroundColor: AppColors.accent,
        icon: _forking
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : const Icon(Icons.call_split, color: Colors.white),
        label: Text(
          _forking ? 'forking'.tr() : 'fork_course'.tr(),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
