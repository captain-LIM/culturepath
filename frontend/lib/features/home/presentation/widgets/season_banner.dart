import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';

class SeasonBanner extends StatelessWidget {
  const SeasonBanner({super.key});

  String _seasonKey() {
    final month = DateTime.now().month;
    if (month >= 3 && month <= 5) return 'season_spring';
    if (month >= 6 && month <= 8) return 'season_summer';
    if (month >= 9 && month <= 11) return 'season_autumn';
    return 'season_winter';
  }

  String get _seasonEmoji {
    final month = DateTime.now().month;
    if (month >= 3 && month <= 5) return '🌸';
    if (month >= 6 && month <= 8) return '🌊';
    if (month >= 9 && month <= 11) return '🍂';
    return '❄️';
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, Color(0xFF3D4060)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.accentGold.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$_seasonEmoji ${_seasonKey().tr()} ${'banner_recommend'.tr()}',
                    style: const TextStyle(color: AppColors.accentGold, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'banner_desc'.tr(),
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, height: 1.4),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () {},
                  child: Row(
                    children: [
                      Text('banner_cta'.tr(), style: const TextStyle(color: AppColors.accentGold, fontSize: 13, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 4),
                      const Icon(Icons.arrow_forward_ios, color: AppColors.accentGold, size: 12),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Text('📖', style: TextStyle(fontSize: 56)),
        ],
      ),
    );
  }
}
