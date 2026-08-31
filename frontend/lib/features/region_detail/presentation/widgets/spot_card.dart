import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/i18n/category_localization.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/place_network_image.dart';
import '../../data/spot_model.dart';

class SpotCard extends StatelessWidget {
  final SpotItem spot;
  final bool isSelected;
  final VoidCallback onAdd;
  final VoidCallback onOpen;

  const SpotCard({
    super.key,
    required this.spot,
    required this.isSelected,
    required this.onAdd,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.image),
        border: Border.all(
          color: isSelected ? AppColors.accent : AppColors.line,
          width: isSelected ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            key: ValueKey('spot-open-image-${spot.contentId}'),
            onTap: onOpen,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.image)),
            child: SizedBox(
              height: 140,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  PlaceNetworkImage(
                    placeTitle: spot.title,
                    thumbnailUrl: spot.thumbnailUrl,
                    imageUrl: spot.imageUrl,
                    category: spot.category,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(AppRadius.image),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      localizedCategory(spot.category),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                InkWell(
                  key: ValueKey('spot-open-title-${spot.contentId}'),
                  onTap: onOpen,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      spot.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                _InfoRow(Icons.place_outlined, spot.address),
                if (spot.openTime.isNotEmpty) _InfoRow(Icons.access_time, spot.openTime),
                if (spot.tel.isNotEmpty) _InfoRow(Icons.phone_outlined, spot.tel),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    key: ValueKey('spot-add-${spot.contentId}'),
                    onPressed: onAdd,
                    icon: Icon(isSelected ? Icons.check : Icons.add, size: 16),
                    label: Text(isSelected ? 'spot_added'.tr() : 'spot_add'.tr()),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: isSelected ? AppColors.success : AppColors.accent,
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoRow(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 13, color: Colors.grey.shade500),
          const SizedBox(width: 5),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          ),
        ],
      ),
    );
  }
}
