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
        title: '${widget.course.title} (포크)',
        forkedFrom: ForkedFromInfo(
          courseId: widget.course.id ?? 0,
          title: widget.course.title,
          authorId: widget.course.authorId ?? '알 수 없음',
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('포크 실패: $e')));
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
        const SnackBar(
          content: Text('로그인 후 완주 인증을 할 수 있습니다.'),
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
          content: const Text('완주 인증이 기록되었습니다! 🎖️'),
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
      body: NestedScrollView(
        headerSliverBuilder: (_, __) => [
          SliverAppBar(
            expandedHeight: 140,
            pinned: true,
            backgroundColor: AppColors.primary,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => Navigator.of(context).pop(),
            ),
            actions: [
              // 완주 인증 버튼
              TextButton.icon(
                onPressed: _completed ? null : _handleComplete,
                icon: Icon(
                  _completed ? Icons.emoji_events : Icons.emoji_events_outlined,
                  color: _completed ? AppColors.accentGold : Colors.white70,
                  size: 18,
                ),
                label: Text(
                  _completed ? '완주됨' : '완주 인증',
                  style: TextStyle(
                    color: _completed ? AppColors.accentGold : Colors.white70,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              title: Text(
                course.title,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.8)],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 48),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (course.authorId != null)
                        Text('by ${course.authorId}',
                            style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ),
            bottom: TabBar(
              controller: _tabCtrl,
              indicatorColor: AppColors.accentGold,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white54,
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              tabs: course.tracks
                  .map((t) => Tab(text: 'Track ${t.trackNumber} (${t.places.length}곳)'))
                  .toList(),
            ),
          ),
        ],
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (course.description.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(course.description,
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5)),
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
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _forking ? null : _handleFork,
        backgroundColor: AppColors.accent,
        icon: _forking
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : const Icon(Icons.call_split, color: Colors.white),
        label: Text(
          _forking ? '포크 중...' : '이 코스 포크하기',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
