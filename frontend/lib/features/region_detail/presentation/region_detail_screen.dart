import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/home/data/culture_model.dart';
import '../data/region_model.dart';
import '../data/spot_model.dart';
import '../data/spots_repository.dart';
import 'widgets/spot_card.dart';

final spotsProvider = FutureProvider.family<List<SpotItem>, ({String areaCode, String? culture})>(
  (ref, args) => SpotsRepository().getSpotsByRegion(args.areaCode, culture: args.culture),
);

class RegionDetailScreen extends ConsumerWidget {
  final RegionItem region;
  final CultureCategory culture;

  const RegionDetailScreen({super.key, required this.region, required this.culture});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spotsAsync = ref.watch(
      spotsProvider((areaCode: region.areaCode, culture: culture.name)),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          _buildSliverAppBar(context),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${region.name} × ${culture.name}',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.primary),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    region.description,
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
          spotsAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
            ),
            error: (e, _) => SliverToBoxAdapter(
              child: Center(child: Text('관광지 정보를 불러올 수 없습니다.\n$e', textAlign: TextAlign.center)),
            ),
            data: (spots) => spots.isEmpty
                ? const SliverToBoxAdapter(
                    child: Center(child: Padding(padding: EdgeInsets.all(40), child: Text('추천 관광지가 없습니다.'))),
                  )
                : SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => SpotCard(
                        spot: spots[index],
                        onAdd: () => _showAddedSnackbar(context, spots[index].title),
                      ),
                      childCount: spots.length,
                    ),
                  ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  void _showAddedSnackbar(BuildContext context, String title) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('\'$title\'을 코스에 담았습니다.'),
        backgroundColor: AppColors.primary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  SliverAppBar _buildSliverAppBar(BuildContext context) {
    return SliverAppBar(
      expandedHeight: 120,
      pinned: true,
      backgroundColor: culture.color,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => Navigator.of(context).pop(),
      ),
      flexibleSpace: FlexibleSpaceBar(
        title: Text(
          region.name,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        background: Container(
          color: culture.color,
        ),
      ),
    );
  }
}
