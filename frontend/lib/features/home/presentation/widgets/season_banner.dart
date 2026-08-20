import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../course_view/presentation/course_view_screen.dart';
import '../../data/recommended_course_data.dart';

class SeasonBanner extends StatelessWidget {
  const SeasonBanner({super.key});

  String _seasonKey(int month) {
    if (month >= 3 && month <= 5) return 'season_spring';
    if (month >= 6 && month <= 8) return 'season_summer';
    if (month >= 9 && month <= 11) return 'season_autumn';
    return 'season_winter';
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    final season = _seasonKey(DateTime.now().month).tr();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Semantics(
        button: true,
        label: '$season ${'banner_recommend'.tr()}',
        child: InkWell(
          onTap: () => Navigator.of(context, rootNavigator: true).push(
            MaterialPageRoute(
              builder: (_) => CourseViewScreen(course: getSeasonalRecommendedCourse()),
            ),
          ),
          borderRadius: BorderRadius.circular(AppRadius.surface),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border.all(color: AppColors.line),
              borderRadius: BorderRadius.circular(AppRadius.surface),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 4, height: 104, color: AppColors.accentGold),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$season · ${'banner_recommend'.tr()}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text('banner_desc'.tr(), style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          Text(
                            'banner_cta'.tr(),
                            style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.accent),
                          ),
                          const SizedBox(width: AppSpacing.xxs),
                          const Icon(Icons.arrow_forward, size: 18, color: AppColors.accent),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
