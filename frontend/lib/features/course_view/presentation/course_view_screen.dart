import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../../auth/data/auth_repository.dart';
import '../../completion/presentation/completion_sheet.dart';
import 'course_ai_edit_screen.dart';
import 'course_map_screen.dart';
import 'widgets/fork_badge.dart';
import 'widgets/course_track_view.dart';

final _courseDetailProvider = FutureProvider.autoDispose.family<CourseItem, int>(
  (ref, id) => CourseRepository().getCourse(id),
);

class CourseViewScreen extends ConsumerStatefulWidget {
  final CourseItem course;
  final bool isOwner;

  const CourseViewScreen({super.key, required this.course, this.isOwner = false});

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
      final forkedLocally = _course.copyWith(
        title: '${_course.title} ${'fork_suffix'.tr()}',
        forkedFrom: ForkedFromInfo(
          courseId: _course.id ?? 0,
          title: _course.title,
          authorId: _course.authorId ?? 'unknown_author'.tr(),
        ),
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
      builder: (_) => ProviderScope(child: CourseBuilderScreen(initialCourse: forked)),
    ));
  }

  Future<void> _shareCourse() async {
    try {
      final course = _course;
      final activeDays = course.tracks.where((t) => t.places.isNotEmpty).length;
      final buffer = StringBuffer()
        ..writeln('📍 ${course.title}')
        ..writeln('$activeDays일 코스 · 총 ${course.totalPlaces}곳');
      if (course.description.isNotEmpty) {
        buffer
          ..writeln()
          ..writeln(course.description);
      }
      if (course.id != null) {
        buffer
          ..writeln()
          ..write('따라가방 앱에서 보기: culturepath://app/courses/${course.id}');
      }
      await Share.share(buffer.toString().trim(), subject: course.title);
    } catch (e) {
      debugPrint('Share error: $e');
      // 네이티브 공유 실패 시 클립보드 폴백
      final course = _course;
      final activeDays = course.tracks.where((t) => t.places.isNotEmpty).length;
      final fallback = StringBuffer()
        ..writeln('📍 ${course.title}')
        ..writeln('$activeDays일 코스 · 총 ${course.totalPlaces}곳');
      if (course.description.isNotEmpty) {
        fallback..writeln()..writeln(course.description);
      }
      if (course.id != null) {
        fallback..writeln()..write('따라가방 앱에서 보기: culturepath://app/courses/${course.id}');
      }
      await Clipboard.setData(ClipboardData(text: fallback.toString().trim()));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('링크가 클립보드에 복사되었습니다. 카카오톡에 붙여넣기 하세요!'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _handleEdit() async {
    final saved = await Navigator.of(context).push<CourseItem>(MaterialPageRoute(
      builder: (_) => ProviderScope(child: CourseBuilderScreen(initialCourse: _course)),
    ));
    if (saved != null && mounted) Navigator.of(context).pop();
  }

  Future<void> _handleAiEdit() async {
    if (_course.id == null) {
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
    if (saved != null && mounted) Navigator.of(context).pop();
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
    if (_course.id == null) return;

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
    if (courseId != null) {
      ref.listen<AsyncValue<CourseItem>>(_courseDetailProvider(courseId), (previous, next) {
        next.whenData((updated) {
          if (mounted) setState(() => _course = updated);
        });
      });
    }
    final course = _course;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          course.title,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.map_outlined, color: Colors.white),
            tooltip: 'course_map'.tr(),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => CourseMapScreen(course: course)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined, color: Colors.white),
            tooltip: 'share_course'.tr(),
            onPressed: () => _shareCourse(),
          ),
          if (widget.isOwner || course.isOwner)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: Colors.white),
              tooltip: 'edit_course'.tr(),
              onPressed: _handleEdit,
            ),
          IconButton(
            icon: const Text('✨', style: TextStyle(fontSize: 18)),
            tooltip: 'ai_course_edit'.tr(),
            onPressed: _handleAiEdit,
          ),
          TextButton.icon(
            onPressed: _completed ? null : _handleComplete,
            icon: Icon(
              _completed ? Icons.emoji_events : Icons.emoji_events_outlined,
              color: _completed ? AppColors.accentGold : Colors.white70,
              size: 18,
            ),
            label: Text(
              _completed ? 'completed_badge'.tr() : 'complete_course'.tr(),
              style: TextStyle(
                color: _completed ? AppColors.accentGold : Colors.white70,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          indicatorColor: AppColors.accentGold,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
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
          Expanded(
            child: TabBarView(
              controller: _tabCtrl,
              children: course.tracks
                  .map((t) => SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(0, 16, 0, 100),
                        child: CourseTrackView(track: t),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
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
