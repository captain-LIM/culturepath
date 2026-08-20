import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';

class CourseTrackView extends StatelessWidget {
  final CourseTrack track;

  const CourseTrackView({super.key, required this.track});

  @override
  Widget build(BuildContext context) {
    if (track.places.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(
          '이 트랙에는 장소가 없습니다.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
        ),
      );
    }

    return Column(
      children: List.generate(track.places.length, (i) {
        final place = track.places[i];
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 타임라인 라인 + 번호
            SizedBox(
              width: 48,
              child: Column(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: i == 0 ? AppColors.accent : AppColors.surface,
                      shape: BoxShape.circle,
                      border: Border.all(color: i == 0 ? AppColors.accent : AppColors.line),
                    ),
                    child: Center(
                      child: Text(
                        '${i + 1}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: i == 0 ? Colors.white : AppColors.muted,
                        ),
                      ),
                    ),
                  ),
                  if (i < track.places.length - 1)
                    Container(width: 1, height: 56, color: AppColors.line),
                ],
              ),
            ),
            // 장소 카드
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: i < track.places.length - 1 ? 0 : 8),
                child: Container(
                  margin: const EdgeInsets.only(right: 16, bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    border: Border(bottom: BorderSide(color: AppColors.line)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        place.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            place.category,
                            style: const TextStyle(fontSize: 11, color: AppColors.accent),
                          ),
                          if (place.region != null) ...[
                            const SizedBox(width: 6),
                            Text(
                              place.region!,
                              style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                            ),
                          ],
                        ],
                      ),
                      if (place.address.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          place.address,
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}
