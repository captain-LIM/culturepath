import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/data/my_courses_provider.dart';
import '../../course_view/presentation/course_view_screen.dart';
import '../../home/presentation/search_delegate.dart';
import 'widgets/feed_course_card.dart';

final feedSortProvider = StateProvider<String>((ref) => 'recent');

final feedProvider = FutureProvider.family<CourseListSnapshot, String>(
  (ref, sort) => ref.watch(courseRepositoryProvider).getFeedSnapshot(sort: sort),
);

final rankingProvider = FutureProvider<CourseListSnapshot>(
  (ref) => ref.watch(courseRepositoryProvider).getRankingSnapshot(),
);

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _openCourse(CourseItem course, {bool isOwner = false, int? guestIndex}) {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) => CourseViewScreen(
          course: course,
          isOwner: isOwner,
          guestCourseIndex: guestIndex,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('explore_title'.tr()),
        actions: [
          IconButton(
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            onPressed: () => showSearch(
              context: context,
              delegate: CourseSearchDelegate(),
            ),
            icon: const Icon(Icons.search),
            tooltip: 'search_hint'.tr(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: MediaQuery.textScalerOf(context).scale(1) >= 1.6,
          tabAlignment: MediaQuery.textScalerOf(context).scale(1) >= 1.6
              ? TabAlignment.start
              : TabAlignment.fill,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.muted,
          dividerColor: AppColors.line,
          indicatorColor: AppColors.accent,
          indicatorWeight: 3,
          tabs: [
            Tab(text: 'tab_my_courses'.tr()),
            Tab(text: 'tab_community'.tr()),
            Tab(text: 'tab_popular'.tr()),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _MyCoursesTab(onOpen: _openCourse),
          _CommunityTab(onOpen: _openCourse),
          _PopularTab(onOpen: _openCourse),
        ],
      ),
    );
  }
}

class _MyCoursesTab extends ConsumerWidget {
  final void Function(CourseItem, {bool isOwner, int? guestIndex}) onOpen;

  const _MyCoursesTab({required this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(myCoursesProvider);
    return state.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => _ErrorState(
        message: 'my_courses_load_error'.tr(),
        onRetry: () => ref.invalidate(myCoursesProvider),
      ),
      data: (value) {
        if (value.entries.isEmpty) {
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (value.isStale)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  child: _StaleNotice(),
                ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.xxl),
                child: Text('home_my_courses_empty'.tr(), textAlign: TextAlign.center),
              ),
            ],
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.refresh(myCoursesProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            children: [
              if (value.isStale) const _StaleNotice(),
              for (final entry in value.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: FeedCourseCard(
                    course: entry.course,
                    showLike: false,
                    eyebrow: entry.source == OwnedCourseSource.guest
                        ? 'course_source_guest'.tr()
                        : 'course_source_server'.tr(),
                    onTap: () => onOpen(
                      entry.course,
                      isOwner: true,
                      guestIndex: entry.guestIndex,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _CommunityTab extends ConsumerWidget {
  final void Function(CourseItem, {bool isOwner, int? guestIndex}) onOpen;

  const _CommunityTab({required this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sort = ref.watch(feedSortProvider);
    final state = ref.watch(feedProvider(sort));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xs,
          ),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'recent', label: Text('sort_recent'.tr())),
                ButtonSegment(value: 'popular', label: Text('sort_popular'.tr())),
              ],
              selected: {sort},
              onSelectionChanged: (selection) {
                ref.read(feedSortProvider.notifier).state = selection.first;
              },
            ),
          ),
        ),
        Expanded(
          child: _PublicCourseList(
            value: state,
            emptyMessage: 'no_courses'.tr(),
            onRetry: () => ref.invalidate(feedProvider(sort)),
            onRefresh: () => ref.refresh(feedProvider(sort).future),
            onOpen: (course) => onOpen(course),
          ),
        ),
      ],
    );
  }
}

class _PopularTab extends ConsumerWidget {
  final void Function(CourseItem, {bool isOwner, int? guestIndex}) onOpen;

  const _PopularTab({required this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) => _PublicCourseList(
        value: ref.watch(rankingProvider),
        emptyMessage: 'no_courses'.tr(),
        onRetry: () => ref.invalidate(rankingProvider),
        onRefresh: () => ref.refresh(rankingProvider.future),
        onOpen: (course) => onOpen(course),
        showRank: true,
      );
}

class _PublicCourseList extends StatelessWidget {
  final AsyncValue<CourseListSnapshot> value;
  final String emptyMessage;
  final VoidCallback onRetry;
  final Future<void> Function() onRefresh;
  final ValueChanged<CourseItem> onOpen;
  final bool showRank;

  const _PublicCourseList({
    required this.value,
    required this.emptyMessage,
    required this.onRetry,
    required this.onRefresh,
    required this.onOpen,
    this.showRank = false,
  });

  @override
  Widget build(BuildContext context) => value.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _ErrorState(message: 'feed_error'.tr(), onRetry: onRetry),
        data: (snapshot) {
          if (snapshot.courses.isEmpty) {
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (snapshot.isStale)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                    child: _StaleNotice(),
                  ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.xxl),
                  child: Text(emptyMessage, textAlign: TextAlign.center),
                ),
              ],
            );
          }
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.xxl,
              ),
              itemCount: snapshot.courses.length + (snapshot.isStale ? 1 : 0),
              itemBuilder: (context, index) {
                if (snapshot.isStale && index == 0) return const _StaleNotice();
                final courseIndex = index - (snapshot.isStale ? 1 : 0);
                final course = snapshot.courses[courseIndex];
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: FeedCourseCard(
                    course: course,
                    eyebrow: showRank ? '${courseIndex + 1}' : null,
                    onTap: () => onOpen(course),
                  ),
                );
              },
            ),
          );
        },
      );
}

class _StaleNotice extends StatelessWidget {
  const _StaleNotice();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: Row(
          children: [
            const Icon(Icons.history, size: 16, color: AppColors.muted),
            const SizedBox(width: AppSpacing.xs),
            Expanded(child: Text('course_list_stale'.tr(), style: Theme.of(context).textTheme.bodySmall)),
          ],
        ),
      );
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, color: AppColors.muted, size: 36),
              const SizedBox(height: AppSpacing.sm),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.xs),
              TextButton(onPressed: onRetry, child: Text('retry'.tr())),
            ],
          ),
        ),
      );
}
