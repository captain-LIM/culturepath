import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../../completion/presentation/completion_sheet.dart';
import 'widgets/fork_badge.dart';
import 'widgets/course_track_view.dart';

class CourseViewScreen extends ConsumerStatefulWidget {
  final CourseItem course;

  const CourseViewScreen({super.key, required this.course});

  @override
  ConsumerState<CourseViewScreen> createState() => _CourseViewScreenState();
}

class _CourseViewScreenState extends ConsumerState<CourseViewScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  bool _forking = false;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: widget.course.tracks.length, vsync: this);
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
      final forkedLocally = widget.course.copyWith(
        title: '${widget.course.title} ${'fork_suffix'.tr()}',
        forkedFrom: ForkedFromInfo(
          courseId: widget.course.id ?? 0,
          title: widget.course.title,
          authorId: widget.course.authorId ?? 'unknown_author'.tr(),
        ),
      );
      if (!mounted) return;
      _navigateToEdit(forkedLocally);
      return;
    }

    setState(() => _forking = true);
    try {
      final forked = await repo.forkCourse(widget.course.id!);
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

  Future<void> _handleComplete() async {
    if (widget.course.id == null) return;

    final loggedIn = await CourseRepository().isLoggedIn();
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
      courseId: widget.course.id!,
      courseTitle: widget.course.title,
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
    final course = widget.course;

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
              .map((t) => Tab(text: 'Track ${t.trackNumber} (${'place_count'.tr(namedArgs: {'n': t.places.length.toString()})})'))
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
