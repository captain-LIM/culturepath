import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

String? selectSafePlaceImageUrl(String? thumbnailUrl, String? imageUrl) {
  for (final candidate in [thumbnailUrl, imageUrl]) {
    final value = candidate?.trim();
    if (value == null || value.isEmpty) continue;
    final uri = Uri.tryParse(value);
    if (uri != null && uri.scheme == 'https' && uri.host.isNotEmpty) {
      return value;
    }
  }
  return null;
}

class PlaceNetworkImage extends StatelessWidget {
  final String? thumbnailUrl;
  final String? imageUrl;
  final String placeTitle;
  final BoxFit fit;
  final BorderRadius? borderRadius;

  const PlaceNetworkImage({
    super.key,
    required this.placeTitle,
    this.thumbnailUrl,
    this.imageUrl,
    this.fit = BoxFit.cover,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final selectedUrl = selectSafePlaceImageUrl(thumbnailUrl, imageUrl);
    return Semantics(
      image: true,
      label: selectedUrl == null
          ? '$placeTitle 사진 없음'
          : '$placeTitle 관광지 사진',
      child: ExcludeSemantics(
        child: ClipRRect(
          borderRadius: borderRadius ?? BorderRadius.zero,
          child: LayoutBuilder(
            builder: (context, constraints) {
              if (selectedUrl == null) {
                return _PlaceImagePlaceholder(placeTitle: placeTitle);
              }
              final fallbackWidth = MediaQuery.sizeOf(context).width;
              final logicalWidth = constraints.hasBoundedWidth &&
                      constraints.maxWidth > 0
                  ? constraints.maxWidth
                  : fallbackWidth;
              final decodedWidth = (logicalWidth *
                      MediaQuery.devicePixelRatioOf(context))
                  .ceil()
                  .clamp(1, 1600)
                  .toInt();
              final logicalHeight = constraints.hasBoundedHeight &&
                      constraints.maxHeight > 0
                  ? constraints.maxHeight
                  : logicalWidth;
              final decodedHeight = (logicalHeight *
                      MediaQuery.devicePixelRatioOf(context))
                  .ceil()
                  .clamp(1, 1600)
                  .toInt();
              return CachedNetworkImage(
                imageUrl: selectedUrl,
                fit: fit,
                width: double.infinity,
                height: double.infinity,
                memCacheWidth: decodedWidth,
                memCacheHeight: decodedHeight,
                maxWidthDiskCache: 1600,
                maxHeightDiskCache: 1600,
                fadeInDuration: const Duration(milliseconds: 180),
                placeholder: (_, _) => _PlaceImagePlaceholder(
                  placeTitle: placeTitle,
                  loading: true,
                ),
                errorWidget: (_, _, _) =>
                    _PlaceImagePlaceholder(placeTitle: placeTitle),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _PlaceImagePlaceholder extends StatelessWidget {
  final String placeTitle;
  final bool loading;

  const _PlaceImagePlaceholder({
    required this.placeTitle,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.primary.withValues(alpha: 0.08),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                const SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(
                  Icons.photo_outlined,
                  size: 32,
                  color: AppColors.primary.withValues(alpha: 0.42),
                ),
              const SizedBox(height: 8),
              Text(
                loading
                    ? '$placeTitle 사진을 불러오는 중'
                    : '$placeTitle 사진 없음',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.primary.withValues(alpha: 0.62),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
