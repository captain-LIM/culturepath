import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/place_item.dart';

class CoursePlaceCard extends StatelessWidget {
  final PlaceItem place;
  final int index;
  final VoidCallback onRemove;

  const CoursePlaceCard({
    super.key,
    required this.place,
    required this.index,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '${index + 1}',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
        ),
        title: Text(
          place.title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.primary,
          ),
        ),
        subtitle: Row(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                place.category,
                style: const TextStyle(
                  fontSize: 10,
                  color: AppColors.accent,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            if (place.region != null) ...[
              const SizedBox(width: 6),
              Text(
                place.region!,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
            ],
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.drag_handle, color: Colors.grey.shade400, size: 20),
            const SizedBox(width: 4),
            GestureDetector(
              onTap: onRemove,
              child: Icon(Icons.close, color: Colors.grey.shade400, size: 18),
            ),
          ],
        ),
      ),
    );
  }
}
