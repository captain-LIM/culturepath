import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';

class ForkBadge extends StatelessWidget {
  final ForkedFromInfo forkedFrom;

  const ForkBadge({super.key, required this.forkedFrom});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.accentGold.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.accentGold.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.call_split, size: 16, color: AppColors.accentGold),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '이 코스는 포크된 코스입니다',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.accentGold,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '원본: "${forkedFrom.title}"  by ${forkedFrom.authorId}',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.accentGold.withValues(alpha: 0.8),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
