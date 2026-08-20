import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/i18n/category_localization.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/place_item.dart';

enum _PlaceAction { moveUp, moveDown, remove }

class CoursePlaceCard extends StatelessWidget {
  final PlaceItem place;
  final int index;
  final VoidCallback onRemove;
  final VoidCallback? onMoveUp;
  final VoidCallback? onMoveDown;
  final ValueChanged<int> onMoveToDay;
  final int dayCount;
  final int activeDay;

  const CoursePlaceCard({
    super.key,
    required this.place,
    required this.index,
    required this.onRemove,
    required this.onMoveToDay,
    required this.dayCount,
    required this.activeDay,
    this.onMoveUp,
    this.onMoveDown,
  });

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xxs),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(bottom: BorderSide(color: AppColors.line)),
        ),
        child: Row(
          children: [
            ExcludeSemantics(
              child: SizedBox(
                width: 32,
                child: Text(
                  '${index + 1}'.padLeft(2, '0'),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppColors.accent),
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(place.title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    [localizedCategory(place.category), if (place.region?.isNotEmpty == true) place.region!].join(' · '),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            PopupMenuButton<Object>(
              tooltip: '${place.title}, ${'course_place_actions'.tr()}',
              constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
              onSelected: (value) {
                if (value == _PlaceAction.moveUp) onMoveUp?.call();
                if (value == _PlaceAction.moveDown) onMoveDown?.call();
                if (value == _PlaceAction.remove) onRemove();
                if (value is int) onMoveToDay(value);
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: _PlaceAction.moveUp,
                  enabled: onMoveUp != null,
                  child: Text('course_place_move_up'.tr()),
                ),
                PopupMenuItem(
                  value: _PlaceAction.moveDown,
                  enabled: onMoveDown != null,
                  child: Text('course_place_move_down'.tr()),
                ),
                for (var day = 0; day < dayCount; day++)
                  if (day != activeDay)
                    PopupMenuItem(
                      value: day,
                      child: Text(
                        'course_place_move_day'.tr(
                          namedArgs: {'day': '${day + 1}'},
                        ),
                      ),
                    ),
                const PopupMenuDivider(),
                PopupMenuItem(
                  value: _PlaceAction.remove,
                  child: Text('course_place_remove'.tr()),
                ),
              ],
              icon: const Icon(Icons.more_horiz, color: AppColors.muted),
            ),
          ],
        ),
      );
}
