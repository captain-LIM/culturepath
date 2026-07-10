import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_view/presentation/course_view_screen.dart';
import '../../home/presentation/search_delegate.dart';
import 'widgets/feed_course_card.dart';

// 피드 정렬 상태
final _feedSortProvider = StateProvider<String>((ref) => 'recent');

final feedProvider = FutureProvider.family<List<CourseItem>, String>(
  (ref, sort) => CourseRepository().getFeed(sort: sort),
);

final rankingProvider = FutureProvider<List<CourseItem>>(
  (ref) => CourseRepository().getRanking(),
);

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  void _navigateToCourse(CourseItem course) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CourseViewScreen(course: course)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: NestedScrollView(
        headerSliverBuilder: (_, __) => [
          SliverAppBar(
            pinned: true,
            floating: true,
            backgroundColor: Colors.white,
            elevation: 0,
            expandedHeight: 70,
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: GestureDetector(
                  onTap: () => showSearch(
                    context: context,
                    delegate: CourseSearchDelegate(),
                  ),
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.search,
                        color: AppColors.primary, size: 20),
                  ),
                ),
              ),
            ],
            flexibleSpace: const FlexibleSpaceBar(
              titlePadding: EdgeInsets.fromLTRB(20, 0, 20, 52),
              title: Text(
                '탐색',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ),
            bottom: TabBar(
              controller: _tabCtrl,
              labelColor: AppColors.primary,
              unselectedLabelColor: Colors.grey,
              indicatorColor: AppColors.accent,
              indicatorWeight: 2.5,
              labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              tabs: const [
                Tab(text: '피드'),
                Tab(text: '랭킹'),
              ],
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabCtrl,
          children: [
            _FeedTab(onCourseTap: _navigateToCourse),
            _RankingTab(onCourseTap: _navigateToCourse),
          ],
        ),
      ),
    );
  }
}

// ─── 피드 탭 ────────────────────────────────────────────────────────────────

class _FeedTab extends ConsumerWidget {
  final void Function(CourseItem) onCourseTap;

  const _FeedTab({required this.onCourseTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sort = ref.watch(_feedSortProvider);
    final feedAsync = ref.watch(feedProvider(sort));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              children: [
                Text('최신순', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                const SizedBox(width: 4),
                Switch(
                  value: sort == 'popular',
                  onChanged: (v) =>
                      ref.read(_feedSortProvider.notifier).state = v ? 'popular' : 'recent',
                  activeColor: AppColors.accent,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                Text('인기순', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => ref.invalidate(feedProvider(sort)),
                  icon: const Icon(Icons.refresh, size: 14),
                  label: const Text('새로고침', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(foregroundColor: Colors.grey),
                ),
              ],
            ),
          ),
        ),
        feedAsync.when(
          loading: () => const SliverToBoxAdapter(
            child: SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
          ),
          error: (e, _) => SliverToBoxAdapter(
            child: _ErrorState(
              message: '피드를 불러올 수 없습니다.\n백엔드 서버가 실행 중인지 확인하세요.',
              onRetry: () => ref.invalidate(feedProvider(sort)),
            ),
          ),
          data: (courses) => courses.isEmpty
              ? const SliverToBoxAdapter(
                  child: Center(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Text('공개된 코스가 없습니다.'),
                    ),
                  ),
                )
              : SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => FeedCourseCard(
                      key: ValueKey(courses[i].id),
                      course: courses[i],
                      onTap: () => onCourseTap(courses[i]),
                    ),
                    childCount: courses.length,
                  ),
                ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 32)),
      ],
    );
  }
}

// ─── 랭킹 탭 ────────────────────────────────────────────────────────────────

class _RankingTab extends ConsumerWidget {
  final void Function(CourseItem) onCourseTap;

  const _RankingTab({required this.onCourseTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rankingAsync = ref.watch(rankingProvider);

    return rankingAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _ErrorState(
        message: '랭킹을 불러올 수 없습니다.',
        onRetry: () => ref.invalidate(rankingProvider),
      ),
      data: (courses) => CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
              child: Row(
                children: [
                  const Icon(Icons.emoji_events, size: 18, color: AppColors.accentGold),
                  const SizedBox(width: 6),
                  const Text(
                    'TOP 코스 랭킹',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary),
                  ),
                  const SizedBox(width: 8),
                  Text('좋아요·포크 기반 점수순',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ],
              ),
            ),
          ),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (_, i) => _RankingRow(
                rank: i + 1,
                course: courses[i],
                onTap: () => onCourseTap(courses[i]),
              ),
              childCount: courses.length,
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }
}

class _RankingRow extends StatelessWidget {
  final int rank;
  final CourseItem course;
  final VoidCallback onTap;

  const _RankingRow({required this.rank, required this.course, required this.onTap});

  Color get _rankColor {
    if (rank == 1) return const Color(0xFFFFD700);
    if (rank == 2) return const Color(0xFFC0C0C0);
    if (rank == 3) return const Color(0xFFCD7F32);
    return AppColors.primary.withValues(alpha: 0.3);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // 순위 배지
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: _rankColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  '$rank',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: rank <= 3 ? _rankColor : Colors.grey.shade500,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course.title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'by ${course.authorId ?? "-"}  · 점수 ${course.score}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // 좋아요·포크 요약
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.favorite, size: 12, color: Colors.red),
                    const SizedBox(width: 3),
                    Text('${course.likeCount}',
                        style: const TextStyle(fontSize: 11, color: Colors.red)),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.call_split, size: 12, color: AppColors.accent),
                    const SizedBox(width: 3),
                    Text('${course.forkCount}',
                        style: const TextStyle(fontSize: 11, color: AppColors.accent)),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── 공통 에러 위젯 ──────────────────────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
            const SizedBox(height: 16),
            TextButton(onPressed: onRetry, child: const Text('다시 시도')),
          ],
        ),
      ),
    );
  }
}
