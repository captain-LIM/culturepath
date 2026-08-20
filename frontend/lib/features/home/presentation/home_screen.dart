import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/my_courses_provider.dart';
import '../../course_view/presentation/course_view_screen.dart';
import 'search_delegate.dart';
import 'widgets/culture_grid.dart';
import 'widgets/season_banner.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(myCoursesProvider.future),
          child: CustomScrollView(
            key: const PageStorageKey('home-scroll'),
            slivers: [
              SliverToBoxAdapter(child: _HomeHeader()),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xl)),
              const SliverToBoxAdapter(child: SeasonBanner()),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
              _sectionTitle('home_section'.tr()),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
              const CultureGrid(),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
              _sectionTitle('home_my_courses'.tr()),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
              _MyCourseContinuation(ref: ref),
              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
            ],
          ),
        ),
      ),
    );
  }

  SliverToBoxAdapter _sectionTitle(String title) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
      );
}

class _HomeHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('app_name'.tr(), style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: AppSpacing.md),
          Semantics(
            button: true,
            label: 'search_hint'.tr(),
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadius.control),
              onTap: () => showSearch(
                context: context,
                delegate: CourseSearchDelegate(),
              ),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border.all(color: AppColors.line),
                  borderRadius: BorderRadius.circular(AppRadius.control),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search, size: 20, color: AppColors.muted),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        'search_hint'.tr(),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MyCourseContinuation extends StatelessWidget {
  final WidgetRef ref;

  const _MyCourseContinuation({required this.ref});

  @override
  Widget build(BuildContext context) {
    final courses = ref.watch(myCoursesProvider);
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        child: courses.when(
          loading: () => const _CourseStatePanel(
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => _CourseStatePanel(
            child: Column(
              children: [
                Text('my_courses_load_error'.tr(), textAlign: TextAlign.center),
                const SizedBox(height: AppSpacing.xs),
                TextButton(
                  onPressed: () => ref.invalidate(myCoursesProvider),
                  child: Text('retry'.tr()),
                ),
              ],
            ),
          ),
          data: (state) {
            if (state.entries.isEmpty) {
              return Column(
                children: [
                  if (state.isStale) const _StaleCourseNotice(),
                  _CourseStatePanel(
                    child: Text('home_my_courses_empty'.tr(), textAlign: TextAlign.center),
                  ),
                ],
              );
            }
            return Column(
              children: [
                if (state.isStale) const _StaleCourseNotice(),
                for (final entry in state.entries.take(2))
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                    child: _OwnedCourseRow(entry: entry),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CourseStatePanel extends StatelessWidget {
  final Widget child;

  const _CourseStatePanel({required this.child});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 96),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.line),
          borderRadius: BorderRadius.circular(AppRadius.surface),
        ),
        alignment: Alignment.center,
        child: child,
      );
}

class _StaleCourseNotice extends StatelessWidget {
  const _StaleCourseNotice();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: Row(
          children: [
            const Icon(Icons.history, size: 16, color: AppColors.muted),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: Text('course_list_stale'.tr(), style: Theme.of(context).textTheme.bodySmall),
            ),
          ],
        ),
      );
}

class _OwnedCourseRow extends StatelessWidget {
  final OwnedCourseEntry entry;

  const _OwnedCourseRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    final course = entry.course;
    return Semantics(
      button: true,
      label: course.title,
      child: InkWell(
        onTap: () => Navigator.of(context, rootNavigator: true).push(
          MaterialPageRoute(
            builder: (_) => CourseViewScreen(
              course: course,
              isOwner: true,
              guestCourseIndex: entry.guestIndex,
            ),
          ),
        ),
        borderRadius: BorderRadius.circular(AppRadius.surface),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadius.surface),
          ),
          child: Row(
            children: [
              Container(width: 3, height: 48, color: AppColors.accent),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.source == OwnedCourseSource.guest
                          ? 'course_source_guest'.tr()
                          : 'course_source_server'.tr(),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      course.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      'course_places_count'.tr(namedArgs: {'count': '${course.totalPlaces}'}),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward, size: 20, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
