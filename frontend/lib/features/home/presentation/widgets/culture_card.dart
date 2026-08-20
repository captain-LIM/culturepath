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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.surface),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                'assets/images/cultures/culture_${culture.id}.png',
                fit: BoxFit.cover,
              ),
              ExcludeSemantics(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withValues(alpha: 0.72)],
                      stops: const [0.4, 1.0],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: AppSpacing.xs,
                right: AppSpacing.xs,
                bottom: AppSpacing.xs,
                child: Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
