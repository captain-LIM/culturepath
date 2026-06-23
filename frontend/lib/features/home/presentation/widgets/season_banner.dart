import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';

class SeasonBanner extends StatelessWidget {
  const SeasonBanner({super.key});

  String get _seasonLabel {
    final month = DateTime.now().month;
    if (month >= 3 && month <= 5) return '봄 여행';
    if (month >= 6 && month <= 8) return '여름 여행';
    if (month >= 9 && month <= 11) return '가을 여행';
    return '겨울 여행';
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
                    '$_seasonEmoji $_seasonLabel 추천',
                    style: const TextStyle(color: AppColors.accentGold, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  '책방 골목에서 시작하는\n나만의 문화 코스',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, height: 1.4),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () {},
                  child: Row(
                    children: [
                      const Text('코스 보기', style: TextStyle(color: AppColors.accentGold, fontSize: 13, fontWeight: FontWeight.w600)),
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
