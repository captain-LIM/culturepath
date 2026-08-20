import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../data/region_model.dart';

class RegionCard extends StatelessWidget {
  final RegionItem region;
  final int rank;
  final VoidCallback onTap;

  const RegionCard({
    super.key,
    required this.region,
    required this.rank,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Semantics(
      button: true,
      label: region.name,
        child: InkWell(
          onTap: onTap,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.line)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 40,
                  child: Text(
                    '$rank'.padLeft(2, '0'),
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(color: AppColors.accent),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(region.name, style: Theme.of(context).textTheme.titleMedium),
                      if (region.description.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.xxs),
                        Text(region.description, style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        '장소 ${region.spotCount}개',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xs),
                  child: Icon(Icons.arrow_forward, size: 20, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ),
      );
}
