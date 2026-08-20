import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/data/auth_repository.dart';
import '../data/profile_model.dart';
import '../data/profile_repository.dart';
import 'completions_list_screen.dart';
import 'created_courses_list_screen.dart';
import 'liked_courses_list_screen.dart';

final _profileProvider = FutureProvider.autoDispose<UserProfile>(
  (ref) => ProfileRepository().getMyProfile(),
);

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    final authAsync = ref.watch(authStateProvider);
    return authAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, stack) => const _GuestView(),
      data: (isLoggedIn) => isLoggedIn ? const _LoggedInView() : const _GuestView(),
    );
  }
}

// ─── 비로그인 뷰 ──────────────────────────────────────────────────────────────

class _GuestView extends StatelessWidget {
  const _GuestView();

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
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
              Text('profile_title'.tr(),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.primary)),
              const SizedBox(height: 8),
              Text('profile_guest_desc'.tr(),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5)),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => context.push('/login'),
                  child: Text('login_button'.tr()),
                ),
              ),
              const SizedBox(height: 24),
              _LanguageSelector(),
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
    EasyLocalization.of(context);
    final profileAsync = ref.watch(_profileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) {
          final unauthorized = e is DioException && e.response?.statusCode == 401;
          if (unauthorized) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.lock_clock_outlined, size: 40, color: Colors.grey.shade400),
                    const SizedBox(height: 12),
                    Text(
                      'session_expired'.tr(),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () async {
                          await AuthRepository().clearExpiredSession();
                          ref.invalidate(authStateProvider);
                          if (context.mounted) context.go('/login');
                        },
                        child: Text('login_button'.tr()),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
                const SizedBox(height: 12),
                Text('profile_error'.tr(), style: TextStyle(color: Colors.grey.shade500)),
                const SizedBox(height: 12),
                TextButton(onPressed: () => ref.invalidate(_profileProvider), child: Text('retry'.tr())),
              ],
            ),
          );
        },
        data: (profile) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(_profileProvider);
            await ref.read(_profileProvider.future);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              _buildHeader(profile, context, ref),
              _buildLanguageSelectorSliver(context),
              _buildStats(profile.stats, context),
              _sectionTitle('my_badges'.tr()),
              _buildBadgeGrid(profile.badges),
              const SliverToBoxAdapter(child: SizedBox(height: 40)),
            ],
          ),
        ),
      ),
    );
  }

  SliverToBoxAdapter _buildHeader(UserProfile profile, BuildContext context, WidgetRef ref) {
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
            IconButton(
              icon: const Icon(Icons.logout, color: AppColors.primary),
              tooltip: 'logout'.tr(),
              onPressed: () async {
                await AuthRepository().logout();
                ref.invalidate(authStateProvider);
                if (context.mounted) context.go('/login');
              },
            ),
          ],
        ),
      ),
    );
  }

  SliverToBoxAdapter _buildLanguageSelectorSliver(BuildContext context) {
    return SliverToBoxAdapter(
      child: Container(
        color: Colors.white,
        margin: const EdgeInsets.only(top: 1),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
        child: _LanguageSelector(),
      ),
    );
  }

  SliverToBoxAdapter _buildStats(ProfileStats stats, BuildContext context) {
    return SliverToBoxAdapter(
      child: Container(
        color: Colors.white,
        margin: const EdgeInsets.only(top: 1),
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Row(
          children: [
            _StatItem(
              'stat_completed'.tr(), 'stat_count'.tr(namedArgs: {'n': '${stats.completedCount}'}),
              Icons.emoji_events, AppColors.accentGold,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CompletionsListScreen()),
              ),
            ),
            _Divider(),
            _StatItem(
              'stat_created'.tr(), 'stat_count'.tr(namedArgs: {'n': '${stats.createdCount}'}),
              Icons.edit_note, AppColors.primary,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CreatedCoursesListScreen()),
              ),
            ),
            _Divider(),
            _StatItem(
              'stat_liked'.tr(), 'stat_count'.tr(namedArgs: {'n': '${stats.likedCount}'}),
              Icons.favorite, Colors.red,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LikedCoursesListScreen()),
              ),
            ),
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

  static const _allBadges = [
    (1, '독립서점·책방', '📚'), (2, '문학', '✍️'), (3, '음악', '🎵'), (4, '전통주·양조장', '🍶'),
    (5, '로컬 미식', '🍽️'), (6, '공예·공방', '🎨'), (7, '근대 문화유산', '🏛️'),
    (8, '미술·갤러리', '🖼️'), (9, '영화·애니메이션', '🎬'), (10, '커피·카페', '☕'),
  ];

  SliverToBoxAdapter _buildBadgeGrid(Map<String, int> badges) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _allBadges.map((b) {
            final count = badges[b.$2] ?? 0;
            return _BadgeChip(name: 'culture_${b.$1}_name'.tr(), emoji: b.$3, count: count);
          }).toList(),
        ),
      ),
    );
  }

}

// ─── 언어 선택기 ──────────────────────────────────────────────────────────────

class _LanguageSelector extends StatelessWidget {
  static const _langs = [
    ('ko', 'language_ko'),
    ('en', 'language_en'),
    ('ja', 'language_ja'),
    ('zh', 'language_zh'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'language_setting'.tr(),
          style: TextStyle(fontSize: 12, color: Colors.grey.shade500, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: _langs.map((l) {
            final isSelected = context.locale.languageCode == l.$1;
            return GestureDetector(
              onTap: () => context.setLocale(Locale(l.$1)),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primary : Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isSelected ? AppColors.primary : Colors.grey.shade300,
                  ),
                ),
                child: Text(
                  l.$2.tr(),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.white : Colors.grey.shade600,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _StatItem(this.label, this.value, this.icon, this.color, {this.onTap});

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.primary)),
        const SizedBox(height: 2),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            if (onTap != null) ...[
              const SizedBox(width: 2),
              Icon(Icons.arrow_forward_ios, size: 9, color: Colors.grey.shade400),
            ],
          ],
        ),
      ],
    );
    return Expanded(
      child: onTap != null ? GestureDetector(onTap: onTap, child: content) : content,
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 36, color: Colors.grey.shade200);
}

class _BadgeChip extends StatelessWidget {
  final String name;
  final String emoji;
  final int count;

  const _BadgeChip({required this.name, required this.emoji, required this.count});

  @override
  Widget build(BuildContext context) {
    final earned = count > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: earned ? AppColors.accentGold.withValues(alpha: 0.12) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: earned ? AppColors.accentGold.withValues(alpha: 0.5) : Colors.grey.shade300,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            emoji,
            style: TextStyle(fontSize: 14, color: earned ? null : const Color(0x00000000)),
          ),
          if (!earned)
            const Text('❓', style: TextStyle(fontSize: 14)),
          const SizedBox(width: 4),
          Text(
            name,
            style: TextStyle(
              fontSize: 11,
              fontWeight: earned ? FontWeight.bold : FontWeight.normal,
              color: earned ? AppColors.accentGold : Colors.grey.shade400,
            ),
          ),
          if (earned && count > 1) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: AppColors.accentGold,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

