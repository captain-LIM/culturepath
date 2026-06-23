import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/home/data/culture_model.dart';
import '../data/region_model.dart';
import '../data/regions_repository.dart';
import 'widgets/region_card.dart';

final regionsProvider =
    FutureProvider.family<List<RegionItem>, int>((ref, cultureId) {
  return RegionsRepository().getRegionsByCulture(cultureId);
});

class CultureDetailScreen extends ConsumerWidget {
  final CultureCategory culture;

  const CultureDetailScreen({super.key, required this.culture});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final regionsAsync = ref.watch(regionsProvider(culture.id));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          _buildSliverAppBar(context),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                '${culture.name} 여행으로 유명한 지역',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          regionsAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
            ),
            error: (e, _) => SliverToBoxAdapter(
              child: Center(child: Text('지역 정보를 불러올 수 없습니다.\n$e', textAlign: TextAlign.center)),
            ),
            data: (regions) => SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => RegionCard(
                  region: regions[index],
                  rank: index + 1,
                  onTap: () => context.push(
                    '/regions/${regions[index].areaCode}/spots',
                    extra: {'region': regions[index], 'culture': culture},
                  ),
                ),
                childCount: regions.length,
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  SliverAppBar _buildSliverAppBar(BuildContext context) {
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: culture.color,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => context.pop(),
      ),
      flexibleSpace: FlexibleSpaceBar(
        title: Text(
          culture.name,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        background: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [culture.color, culture.color.withValues(alpha: 0.7)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Center(
            child: Text(culture.emoji, style: const TextStyle(fontSize: 64)),
          ),
        ),
      ),
    );
  }
}
