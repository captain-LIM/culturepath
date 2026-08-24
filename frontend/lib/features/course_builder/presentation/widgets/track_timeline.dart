import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/course_model.dart';

class TrackTimeline extends StatelessWidget {
  final List<CourseTrack> tracks;
  final int activeTrack;
  final void Function(int) onTrackTap;

  const TrackTimeline({
    super.key,
    required this.tracks,
    required this.activeTrack,
    required this.onTrackTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: List.generate(tracks.length, (i) => _buildTrackTab(i)),
          ),
          const SizedBox(height: 12),
          _buildActiveTrackPreview(context),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _buildTrackTab(int index) {
    final isActive = index == activeTrack;
    final track = tracks[index];
    return Expanded(
      child: GestureDetector(
        onTap: () => onTrackTap(index),
        child: Container(
          margin: EdgeInsets.only(right: index < tracks.length - 1 ? 8 : 0),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isActive ? AppColors.primary : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              Text(
                'Day ${index + 1}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isActive ? Colors.white : Colors.grey.shade500,
                ),
              ),
              Text(
                'place_count'.tr(namedArgs: {'n': '${track.places.length}'}),
                style: TextStyle(
                  fontSize: 10,
                  color: isActive ? Colors.white70 : Colors.grey.shade400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveTrackPreview(BuildContext context) {
    final track = tracks[activeTrack];

    // 비어있을 때의 안내는 아래 본문의 빈 상태 일러스트에서 이미 보여주므로
    // 여기서는 중복 안내 없이 자리만 비워둔다.
    if (track.places.isEmpty) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: MediaQuery.textScalerOf(context).scale(32).clamp(32, 56).toDouble(),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: track.places.length,
        itemBuilder: (context, i) {
          final place = track.places[i];
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  place.title,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              if (i < track.places.length - 1)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Icon(
                    Icons.arrow_forward_ios,
                    size: 10,
                    color: Colors.grey.shade400,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
