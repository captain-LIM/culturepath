import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../core/i18n/category_localization.dart';
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
  final String? category;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final String? semanticLabel;

  const PlaceNetworkImage({
    super.key,
    required this.placeTitle,
    this.thumbnailUrl,
    this.imageUrl,
    this.category,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.semanticLabel,
  });

  @override
  Widget build(BuildContext context) {
    final selectedUrl = selectSafePlaceImageUrl(thumbnailUrl, imageUrl);
    return Semantics(
      image: true,
      label: semanticLabel ?? (selectedUrl == null
          ? 'place_photo_none'.tr(namedArgs: {'title': placeTitle})
          : 'place_photo_available'.tr(namedArgs: {'title': placeTitle})),
      child: ExcludeSemantics(
        child: ClipRRect(
          borderRadius: borderRadius ?? BorderRadius.zero,
          child: LayoutBuilder(
            builder: (context, constraints) {
              if (selectedUrl == null) {
                return _PlaceImagePlaceholder(
                  placeTitle: placeTitle,
                  category: category,
                );
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
                  category: category,
                  loading: true,
                ),
                errorWidget: (_, _, _) => _PlaceImagePlaceholder(
                  placeTitle: placeTitle,
                  category: category,
                ),
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
  final String? category;
  final bool loading;

  const _PlaceImagePlaceholder({
    required this.placeTitle,
    this.category,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.primary.withValues(alpha: 0.08),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact =
              constraints.hasBoundedHeight && constraints.maxHeight < 80;
          if (compact) {
            return Center(
              child: loading
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(
                      categoryPhotoIcon(category),
                      size: 24,
                      color: AppColors.primary.withValues(alpha: 0.42),
                    ),
            );
          }
          return Center(
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
                      categoryPhotoIcon(category),
                      size: 32,
                      color: AppColors.primary.withValues(alpha: 0.42),
                    ),
                  const SizedBox(height: 8),
                  Flexible(
                    child: Text(
                      loading
                          ? 'place_photo_loading'.tr(namedArgs: {'title': placeTitle})
                          : 'place_photo_none'.tr(namedArgs: {'title': placeTitle}),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.primary.withValues(alpha: 0.62),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
