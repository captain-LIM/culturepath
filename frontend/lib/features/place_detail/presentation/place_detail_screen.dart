import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/i18n/category_localization.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/place_network_image.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../data/place_detail_model.dart';
import '../data/place_detail_repository.dart';

class _DetailLoadResult {
  final PlaceDetailItem? value;
  final Object? error;

  const _DetailLoadResult({this.value, this.error});
}

class _RelatedLoadResult {
  final List<PlaceItem>? value;
  final Object? error;

  const _RelatedLoadResult({this.value, this.error});
}

class PlaceDetailScreen extends StatefulWidget {
  final String contentId;
  final PlaceItem? initialPlace;
  final PlaceDetailRepository? repository;
  final ValueChanged<PlaceItem>? onAdd;

  const PlaceDetailScreen({
    super.key,
    required this.contentId,
    this.initialPlace,
    this.repository,
    this.onAdd,
  });

  @override
  State<PlaceDetailScreen> createState() => _PlaceDetailScreenState();
}

class _PlaceDetailScreenState extends State<PlaceDetailScreen> {
  late final PlaceDetailRepository _repository;
  late Future<_DetailLoadResult> _detailFuture;
  late Future<_RelatedLoadResult> _relatedFuture;
  int _galleryIndex = 0;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? PlaceDetailRepository();
    _detailFuture = _loadDetail();
    _relatedFuture = _loadRelated();
  }

  Future<_DetailLoadResult> _loadDetail() async {
    try {
      return _DetailLoadResult(
        value: await _repository.getPlaceDetail(widget.contentId),
      );
    } catch (error) {
      return _DetailLoadResult(error: error);
    }
  }

  Future<_RelatedLoadResult> _loadRelated() async {
    try {
      return _RelatedLoadResult(
        value: await _repository.getRelatedPlaces(widget.contentId),
      );
    } catch (error) {
      return _RelatedLoadResult(error: error);
    }
  }

  void _retryDetail() {
    setState(() {
      _galleryIndex = 0;
      _detailFuture = _loadDetail();
    });
  }

  void _retryRelated() {
    setState(() {
      _relatedFuture = _loadRelated();
    });
  }

  void _addPlace(PlaceItem place) {
    final callback = widget.onAdd;
    if (callback != null) {
      callback(place);
      return;
    }
    if (Navigator.of(context).canPop()) {
      context.pop(place);
      return;
    }
    final course = CourseItem(
      title: '',
      description: '',
      tracks: [
        CourseTrack(trackNumber: 1, places: [place]),
        const CourseTrack(trackNumber: 2, places: []),
        const CourseTrack(trackNumber: 3, places: []),
      ],
    );
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CourseBuilderScreen(initialCourse: course),
      ),
    );
  }

  Future<void> _openRelated(PlaceItem place) async {
    final selected = await context.push<PlaceItem>(
      '/places/${place.contentId}',
      extra: place,
    );
    if (selected != null && mounted) _addPlace(selected);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(widget.initialPlace?.title ?? 'place_detail_title_fallback'.tr()),
      ),
      body: FutureBuilder<_DetailLoadResult>(
        future: _detailFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return _LoadingState(initialPlace: widget.initialPlace);
          }
          final result = snapshot.data;
          if (result == null || result.error != null || result.value == null) {
            return _FailureState(
              message: 'place_detail_load_failed'.tr(),
              onRetry: _retryDetail,
            );
          }
          return _buildDetail(result.value!);
        },
      ),
    );
  }

  Widget _buildDetail(PlaceDetailItem detail) {
    final gallery = _galleryImages(detail);

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _buildGallery(detail, gallery)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          sliver: SliverList.list(
            children: [
              Text(
                localizedCategory(detail.category),
                style: const TextStyle(
                  color: AppColors.accent,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                detail.title,
                style: const TextStyle(
                  color: AppColors.primary,
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 16),
              if (detail.hasTranslatedInfo == false)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'place_detail_no_translation_notice'.tr(),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ),
                ),
              if (detail.address.isNotEmpty)
                _DetailRow(Icons.place_outlined, 'place_detail_address'.tr(), detail.address),
              if (detail.openTime.isNotEmpty)
                _DetailRow(Icons.schedule_outlined, 'place_detail_open_time'.tr(), detail.openTime),
              if ((detail.restDate ?? '').isNotEmpty)
                _DetailRow(Icons.event_busy_outlined, 'place_detail_rest_date'.tr(), detail.restDate!),
              if (detail.tel.isNotEmpty)
                _DetailRow(Icons.phone_outlined, 'place_detail_tel'.tr(), detail.tel),
              if ((detail.parking ?? '').isNotEmpty)
                _DetailRow(Icons.local_parking_outlined, 'place_detail_parking'.tr(), detail.parking!),
              if ((detail.homepage ?? '').isNotEmpty)
                _DetailRow(Icons.language_outlined, 'place_detail_homepage'.tr(), detail.homepage!),
              if ((detail.overview ?? '').isNotEmpty) ...[
                const SizedBox(height: 22),
                _SectionTitle('place_detail_overview_title'.tr()),
                const SizedBox(height: 10),
                Text(
                  detail.overview!,
                  style: TextStyle(
                    color: Colors.grey.shade800,
                    height: 1.65,
                    fontSize: 14,
                  ),
                ),
              ],
              const SizedBox(height: 26),
              _SectionTitle('place_detail_related_title'.tr()),
              const SizedBox(height: 4),
              Text(
                'place_detail_related_subtitle'.tr(),
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
              ),
              const SizedBox(height: 12),
              _buildRelatedPlaces(),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _addPlace(
                    detail.toPlaceItem(
                      areaCode: widget.initialPlace?.areaCode,
                      displayRegion: widget.initialPlace?.region,
                    ),
                  ),
                  icon: const Icon(Icons.add, size: 18),
                  label: Text('place_detail_add_button'.tr()),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                  ),
                ),
              ),
              const SizedBox(height: 28),
            ],
          ),
        ),
      ],
    );
  }

  List<PlaceImageItem> _galleryImages(PlaceDetailItem detail) {
    final safeDetailImages = detail.images
        .where(
          (image) => selectSafePlaceImageUrl(
            image.thumbnailUrl,
            image.imageUrl,
          ) != null,
        )
        .take(10)
        .toList(growable: false);
    if (safeDetailImages.isNotEmpty) return safeDetailImages;

    final fallbacks = [
      PlaceImageItem(
        imageUrl: detail.imageUrl,
        thumbnailUrl: detail.thumbnailUrl,
      ),
      PlaceImageItem(
        imageUrl: widget.initialPlace?.imageUrl,
        thumbnailUrl: widget.initialPlace?.thumbnailUrl,
      ),
    ];
    for (final fallback in fallbacks) {
      if (selectSafePlaceImageUrl(
            fallback.thumbnailUrl,
            fallback.imageUrl,
          ) !=
          null) {
        return [fallback];
      }
    }
    return const [PlaceImageItem()];
  }

  Widget _buildGallery(PlaceDetailItem detail, List<PlaceImageItem> images) {
    final activeIndex = _galleryIndex < images.length
        ? _galleryIndex
        : images.length - 1;
    final active = images[activeIndex];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 260,
          child: PageView.builder(
            itemCount: images.length,
            onPageChanged: (index) => setState(() => _galleryIndex = index),
            itemBuilder: (_, index) => PlaceNetworkImage(
              placeTitle: detail.title,
              thumbnailUrl: images[index].thumbnailUrl,
              imageUrl: images[index].imageUrl,
              category: detail.category,
              semanticLabel: images[index].imageUrl == null &&
                      images[index].thumbnailUrl == null
                  ? 'place_photo_none'.tr(namedArgs: {'title': detail.title})
                  : 'place_photo_available_indexed'.tr(namedArgs: {
                      'title': detail.title,
                      'index': '${index + 1}',
                      'count': '${images.length}',
                    }),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: [
              Text(
                '${activeIndex + 1}/${images.length}',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
              ),
              const Spacer(),
              Flexible(
                child: Text(
                  [
                    'place_detail_image_credit'.tr(),
                    if ((active.copyrightType ?? '').isNotEmpty)
                      'place_detail_copyright_type'.tr(namedArgs: {'type': active.copyrightType!}),
                  ].join(' · '),
                  textAlign: TextAlign.end,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 10),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRelatedPlaces() {
    return FutureBuilder<_RelatedLoadResult>(
      future: _relatedFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const SizedBox(
            height: 128,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final result = snapshot.data;
        if (result == null || result.error != null) {
          return _InlineFailure(onRetry: _retryRelated);
        }
        final places = result.value ?? const <PlaceItem>[];
        if (places.isEmpty) {
          return Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'place_detail_related_empty'.tr(),
              textAlign: TextAlign.center,
            ),
          );
        }
        return SizedBox(
          height: 176,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: places.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, index) {
              final place = places[index];
              return SizedBox(
                width: 148,
                child: Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _openRelated(place),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          height: 96,
                          child: PlaceNetworkImage(
                            placeTitle: place.title,
                            thumbnailUrl: place.thumbnailUrl,
                            imageUrl: place.imageUrl,
                            category: place.category,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(10),
                          child: Text(
                            place.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _LoadingState extends StatelessWidget {
  final PlaceItem? initialPlace;

  const _LoadingState({this.initialPlace});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 220,
          child: PlaceNetworkImage(
            placeTitle: initialPlace?.title ?? 'place_detail_generic'.tr(),
            thumbnailUrl: initialPlace?.thumbnailUrl,
            imageUrl: initialPlace?.imageUrl,
            category: initialPlace?.category,
          ),
        ),
        const Expanded(child: Center(child: CircularProgressIndicator())),
      ],
    );
  }
}

class _FailureState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _FailureState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 42),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: Text('retry'.tr())),
          ],
        ),
      ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  final VoidCallback onRetry;

  const _InlineFailure({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(child: Text('place_detail_related_load_failed'.tr())),
          TextButton(onPressed: onRetry, child: Text('retry'.tr())),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;

  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      );
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.accent),
          const SizedBox(width: 10),
          SizedBox(
            width: 58,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
