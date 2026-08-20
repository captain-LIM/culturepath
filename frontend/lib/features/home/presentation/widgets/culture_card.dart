import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../data/culture_model.dart';

class CultureCard extends StatelessWidget {
  final CultureCategory culture;
  final VoidCallback onTap;

  const CultureCard({super.key, required this.culture, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = 'culture_${culture.id}_name'.tr();
    return Semantics(
      button: true,
      label: name,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.surface),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.sm),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadius.surface),
          ),
          child: Row(
            children: [
              ExcludeSemantics(
                child: Container(
                  width: 44,
                  height: 56,
                  decoration: BoxDecoration(
                    color: culture.color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(AppRadius.surface),
                  ),
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: Container(
                      width: 24,
                      height: 3,
                      margin: const EdgeInsets.all(AppSpacing.xs),
                      color: culture.color,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  name,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
