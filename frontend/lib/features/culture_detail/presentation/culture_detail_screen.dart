import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/home/data/culture_model.dart';
import '../../../features/region_detail/presentation/region_detail_screen.dart';
import '../data/region_model.dart';
import '../data/regions_repository.dart';
import 'widgets/region_card.dart';

final regionsProvider =
    FutureProvider.family<List<RegionItem>, int>((ref, cultureId) {
  ref.keepAlive();
  return RegionsRepository().getRegionsByCulture(cultureId);
});

class CultureDetailScreen extends ConsumerWidget {
  final CultureCategory culture;

  const CultureDetailScreen({super.key, required this.culture});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    final regionsAsync = ref.watch(regionsProvider(culture.id));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            title: Text('culture_${culture.id}_name'.tr()),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.pop(),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                'culture_detail_subtitle'.tr(namedArgs: {'name': 'culture_${culture.id}_name'.tr()}),
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          regionsAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
            ),
            error: (e, _) => SliverToBoxAdapter(
              child: Center(child: Text('culture_detail_error'.tr(), textAlign: TextAlign.center)),
            ),
            data: (regions) {
              // 지역 목록이 뜨는 즉시 각 지역의 장소 데이터를 백그라운드에서 미리 로드
              for (final region in regions) {
                ref.read(spotsProvider((areaCode: region.areaCode, culture: culture.name)));
              }
              return SliverList(
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
              );
            },
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

}
