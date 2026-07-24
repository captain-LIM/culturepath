import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../data/culture_model.dart';

class CultureCard extends StatelessWidget {
  final CultureCategory culture;
  final VoidCallback onTap;

  const CultureCard({super.key, required this.culture, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: culture.color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: culture.color.withValues(alpha: 0.3),
              blurRadius: 6,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(culture.emoji, style: const TextStyle(fontSize: 20)),
            const SizedBox(height: 4),
            Text(
              'culture_${culture.id}_name'.tr(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
                height: 1.3,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
