import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/course_builder/data/course_model.dart';
import '../../../features/course_builder/data/place_item.dart';
import '../../../features/course_builder/presentation/course_builder_screen.dart';
import '../../../features/home/data/culture_model.dart';
import '../data/region_model.dart';
import '../data/spot_model.dart';
import '../data/spots_repository.dart';
import 'widgets/spot_card.dart';

// keepAlive를 쓰지 않는다 — 이전에 이 provider가 keepAlive를 걸고 있어서,
// 백엔드 번역 로직을 아무리 고쳐도 앱을 완전히 재시작하기 전까지는 이미
// 조회했던 (지역, 문화, 언어) 조합이 그 옛날 결과 그대로 영원히 캐시돼
// 보였다(실측: 사용자가 같은 화면을 다시 들어가도 안 고쳐진 것처럼 보임).
// 이 화면을 나갔다 다시 들어오면 자연히 재조회되므로, keepAlive 없이도
// 앱 세션 안에서 반복 방문할 때만 약간의 재요청 비용이 생길 뿐이다.
final spotsProvider = FutureProvider.family<List<SpotItem>, ({String areaCode, String? culture, String lang})>(
  (ref, args) {
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
  final List<PlaceItem> _basket = [];
  final Set<String> _basketIds = {};

  void _toggle(SpotItem spot) {
    setState(() {
      if (_basketIds.contains(spot.contentId)) {
        _basketIds.remove(spot.contentId);
        _basket.removeWhere((place) => place.contentId == spot.contentId);
      } else {
        _basketIds.add(spot.contentId);
        _basket.add(_toPlaceItem(spot));
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
        latitude: spot.latitude,
        longitude: spot.longitude,
        imageUrl: spot.imageUrl,
        thumbnailUrl: spot.thumbnailUrl,
      );

  Future<void> _openPlaceDetail(SpotItem spot) async {
    final selected = await context.push<PlaceItem>(
      '/places/${spot.contentId}',
      extra: _toPlaceItem(spot),
    );
    if (selected != null && mounted && !_basketIds.contains(selected.contentId)) {
      setState(() {
        _basketIds.add(selected.contentId);
        _basket.add(selected);
      });
    }
  }

  void _openCourseBuilder() {
    final places = List<PlaceItem>.of(_basket);
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
      spotsProvider((
        areaCode: widget.region.areaCode,
        culture: widget.culture.name,
        lang: appLocaleCode,
      )),
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
                        '${widget.region.name} × ${'culture_${widget.culture.id}_name'.tr()}',
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
                      'region_spots_load_failed'.tr(namedArgs: {'error': '$e'}),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                data: (spots) => spots.isEmpty
                    ? SliverToBoxAdapter(
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(40),
                            child: Text('region_spots_empty'.tr()),
                          ),
                        ),
                      )
                    : SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => SpotCard(
                            spot: spots[index],
                            isSelected: _basketIds.contains(spots[index].contentId),
                            onAdd: () => _toggle(spots[index]),
                            onOpen: () => _openPlaceDetail(spots[index]),
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
      pinned: true,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        onPressed: () => Navigator.of(context).pop(),
      ),
      title: Text(widget.region.name),
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
      elevation: 0,
      borderRadius: BorderRadius.circular(AppRadius.control),
      color: AppColors.accent,
      child: InkWell(
        onTap: onBuild,
        borderRadius: BorderRadius.circular(AppRadius.control),
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
