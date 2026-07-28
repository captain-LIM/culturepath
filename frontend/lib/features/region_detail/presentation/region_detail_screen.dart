import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/course_builder/data/course_model.dart';
import '../../../features/course_builder/data/place_item.dart';
import '../../../features/course_builder/presentation/course_builder_screen.dart';
import '../../../features/home/data/culture_model.dart';
import '../data/region_model.dart';
import '../data/spot_model.dart';
import '../data/spots_repository.dart';
import 'widgets/spot_card.dart';

final spotsProvider = FutureProvider.family<List<SpotItem>, ({String areaCode, String? culture})>(
  (ref, args) {
    ref.keepAlive();
    return SpotsRepository().getSpotsByRegion(args.areaCode, culture: args.culture);
  },
);

class RegionDetailScreen extends ConsumerStatefulWidget {
  final RegionItem region;
  final CultureCategory culture;

  const RegionDetailScreen({super.key, required this.region, required this.culture});

  @override
  ConsumerState<RegionDetailScreen> createState() => _RegionDetailScreenState();
}

class _RegionDetailScreenState extends ConsumerState<RegionDetailScreen> {
  final List<SpotItem> _basket = [];
  final Set<String> _basketIds = {};

  void _toggle(SpotItem spot) {
    setState(() {
      if (_basketIds.contains(spot.contentId)) {
        _basketIds.remove(spot.contentId);
        _basket.removeWhere((s) => s.contentId == spot.contentId);
      } else {
        _basketIds.add(spot.contentId);
        _basket.add(spot);
      }
    });
  }

  PlaceItem _toPlaceItem(SpotItem spot) => PlaceItem(
        contentId: spot.contentId,
        title: spot.title,
        address: spot.address,
        tel: spot.tel,
        openTime: spot.openTime,
        category: spot.category,
        areaCode: widget.region.areaCode,
        region: widget.region.name,
      );

  void _openCourseBuilder() {
    final places = _basket.map(_toPlaceItem).toList();
    final initialCourse = CourseItem(
      title: '',
      description: '',
      tracks: [
        CourseTrack(trackNumber: 1, places: places),
        const CourseTrack(trackNumber: 2, places: []),
        const CourseTrack(trackNumber: 3, places: []),
      ],
    );
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CourseBuilderScreen(initialCourse: initialCourse),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final spotsAsync = ref.watch(
      spotsProvider((areaCode: widget.region.areaCode, culture: widget.culture.name)),
    );
    final hasBasket = _basket.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              _buildSliverAppBar(),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${widget.region.name} × ${widget.culture.name}',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.region.description,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              spotsAsync.when(
                loading: () => const SliverToBoxAdapter(
                  child: SizedBox(
                    height: 200,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
                error: (e, _) => SliverToBoxAdapter(
                  child: Center(
                    child: Text(
                      '관광지 정보를 불러올 수 없습니다.\n$e',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                data: (spots) => spots.isEmpty
                    ? const SliverToBoxAdapter(
                        child: Center(
                          child: Padding(
                            padding: EdgeInsets.all(40),
                            child: Text('추천 관광지가 없습니다.'),
                          ),
                        ),
                      )
                    : SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => SpotCard(
                            spot: spots[index],
                            isSelected: _basketIds.contains(spots[index].contentId),
                            onAdd: () => _toggle(spots[index]),
                          ),
                          childCount: spots.length,
                        ),
                      ),
              ),
              // 하단 바가 콘텐츠를 가리지 않도록 여백 추가
              SliverToBoxAdapter(child: SizedBox(height: hasBasket ? 96 : 32)),
            ],
          ),
          // 하단 바
          AnimatedPositioned(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            bottom: hasBasket ? 16 : -80,
            left: 16,
            right: 16,
            child: _BasketBar(
              count: _basket.length,
              onBuild: _openCourseBuilder,
            ),
          ),
        ],
      ),
    );
  }

  SliverAppBar _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 120,
      pinned: true,
      backgroundColor: widget.culture.color,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => Navigator.of(context).pop(),
      ),
      flexibleSpace: FlexibleSpaceBar(
        title: Text(
          widget.region.name,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        background: Container(color: widget.culture.color),
      ),
    );
  }
}

class _BasketBar extends StatelessWidget {
  final int count;
  final VoidCallback onBuild;

  const _BasketBar({required this.count, required this.onBuild});

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      borderRadius: BorderRadius.circular(16),
      color: AppColors.primary,
      child: InkWell(
        onTap: onBuild,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'spot_selected'.tr(namedArgs: {'n': '$count'}),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'build_course'.tr(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.arrow_forward, color: Colors.white, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
