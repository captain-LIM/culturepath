import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_repository.dart';
import '../data/profile_model.dart';
import '../data/profile_repository.dart';

final _profileProvider = FutureProvider.autoDispose<UserProfile>(
  (ref) => ProfileRepository().getMyProfile(),
);

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<bool>(
      future: CourseRepository().isLoggedIn(),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snap.data != true) return const _GuestView();
        return const _LoggedInView();
      },
    );
  }
}

// ─── 비로그인 뷰 ──────────────────────────────────────────────────────────────

class _GuestView extends StatelessWidget {
  const _GuestView();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.person_outline, size: 40, color: AppColors.primary),
              ),
              const SizedBox(height: 20),
              const Text('내 정보',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.primary)),
              const SizedBox(height: 8),
              Text('로그인하면 완주 기록, 만든 코스,\n좋아요한 코스를 확인할 수 있어요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5)),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/login'),
                  child: const Text('로그인하기'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.pushNamed(context, '/register'),
                child: Text('회원가입', style: TextStyle(color: Colors.grey.shade600)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── 로그인 뷰 ────────────────────────────────────────────────────────────────

class _LoggedInView extends ConsumerWidget {
  const _LoggedInView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(_profileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text('프로필을 불러올 수 없습니다.', style: TextStyle(color: Colors.grey.shade500)),
              const SizedBox(height: 12),
              TextButton(onPressed: () => ref.invalidate(_profileProvider), child: const Text('다시 시도')),
            ],
          ),
        ),
        data: (profile) => CustomScrollView(
          slivers: [
            _buildHeader(profile),
            _buildStats(profile.stats),
            if (profile.recentCompletions.isNotEmpty) ...[
              _sectionTitle('완주한 코스 🎖️'),
              _buildCompletions(profile.recentCompletions),
            ],
            if (profile.createdCourses.isNotEmpty) ...[
              _sectionTitle('내가 만든 코스'),
              _buildCreatedCourses(profile.createdCourses),
            ],
            const SliverToBoxAdapter(child: SizedBox(height: 40)),
          ],
        ),
      ),
    );
  }

  SliverToBoxAdapter _buildHeader(UserProfile profile) {
    return SliverToBoxAdapter(
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(20, 60, 20, 24),
        child: Row(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
              child: Center(
                child: Text(
                  profile.nickname.isNotEmpty ? profile.nickname[0].toUpperCase() : '?',
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(profile.nickname,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.primary)),
                  const SizedBox(height: 2),
                  Text(profile.email,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  SliverToBoxAdapter _buildStats(ProfileStats stats) {
    return SliverToBoxAdapter(
      child: Container(
        color: Colors.white,
        margin: const EdgeInsets.only(top: 1),
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Row(
          children: [
            _StatItem('완주', '${stats.completedCount}개', Icons.emoji_events, AppColors.accentGold),
            _Divider(),
            _StatItem('만든 코스', '${stats.createdCount}개', Icons.edit_note, AppColors.primary),
            _Divider(),
            _StatItem('좋아요', '${stats.likedCount}개', Icons.favorite, Colors.red),
          ],
        ),
      ),
    );
  }

  SliverToBoxAdapter _sectionTitle(String title) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
        child: Text(title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary)),
      ),
    );
  }

  SliverList _buildCompletions(List<CompletionRecord> completions) {
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (_, i) => _CompletionCard(record: completions[i]),
        childCount: completions.length,
      ),
    );
  }

  SliverList _buildCreatedCourses(List<dynamic> courses) {
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (_, i) {
          final c = courses[i];
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
            ),
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
                      Text(c.title,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text('장소 ${c.totalPlaces}곳 · ${c.isPublic ? "공개" : "비공개"}',
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
        childCount: courses.length,
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatItem(this.label, this.value, this.icon, this.color);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.primary)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 36, color: Colors.grey.shade200);
}

class _CompletionCard extends StatelessWidget {
  final CompletionRecord record;

  const _CompletionCard({required this.record});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.accentGold.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.emoji_events, color: AppColors.accentGold, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.courseTitle,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                if (record.note.isNotEmpty)
                  Text(record.note,
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis)
                else
                  Text(
                    '${record.completedAt.year}.${record.completedAt.month.toString().padLeft(2, '0')}.${record.completedAt.day.toString().padLeft(2, '0')} 완주',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.accentGold.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text('완주', style: TextStyle(fontSize: 10, color: AppColors.accentGold, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
