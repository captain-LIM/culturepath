import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';

class ForkBadge extends StatelessWidget {
  final ForkedFromInfo forkedFrom;

  const ForkBadge({super.key, required this.forkedFrom});

  @override
  Widget build(BuildContext context) {
    final author = forkedFrom.authorDeleted
        ? 'deleted_user'.tr()
        : forkedFrom.authorId;
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
                Text(
                  'forked_course_notice'.tr(),
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.accentGold,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'forked_from'.tr(
                    namedArgs: {'title': forkedFrom.title, 'author': author},
                  ),
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
