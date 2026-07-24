import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../profile/data/profile_repository.dart';

Future<bool> showCompletionSheet(BuildContext context, {required int courseId, required String courseTitle}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CompletionSheet(courseId: courseId, courseTitle: courseTitle),
  );
  return result ?? false;
}

class _CompletionSheet extends StatefulWidget {
  final int courseId;
  final String courseTitle;

  const _CompletionSheet({required this.courseId, required this.courseTitle});

  @override
  State<_CompletionSheet> createState() => _CompletionSheetState();
}

class _CompletionSheetState extends State<_CompletionSheet>
    with SingleTickerProviderStateMixin {
  late final AnimationController _stampCtrl;
  late final Animation<double> _stampScale;
  late final Animation<double> _stampOpacity;
  final _noteCtrl = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _stampCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _stampScale = CurvedAnimation(parent: _stampCtrl, curve: Curves.elasticOut);
    _stampOpacity = Tween(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _stampCtrl, curve: const Interval(0.0, 0.3)),
    );
    // 약간 딜레이 후 도장 애니메이션
    Future.delayed(const Duration(milliseconds: 150), () {
      if (mounted) _stampCtrl.forward();
    });
  }

  @override
  void dispose() {
    _stampCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      await ProfileRepository().completeCourse(widget.courseId, note: _noteCtrl.text);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        final msg = e.toString().contains('409') ? 'already_completed'.tr() : 'save_failed'.tr();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        Navigator.pop(context, false);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 핸들
          Container(width: 36, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 24),

          // 도장 애니메이션
          AnimatedBuilder(
            animation: _stampCtrl,
            builder: (_, child) => Opacity(
              opacity: _stampOpacity.value,
              child: Transform.scale(
                scale: _stampScale.value,
                child: child,
              ),
            ),
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.accentGold, width: 4),
                color: AppColors.accentGold.withValues(alpha: 0.08),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.emoji_events, color: AppColors.accentGold, size: 36),
                  const SizedBox(height: 2),
                  Text('completion_stamp'.tr(), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.accentGold)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          Text(
            widget.courseTitle,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary),
          ),
          const SizedBox(height: 4),
          Text('completion_message'.tr(), style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          const SizedBox(height: 20),

          // 소감 입력
          TextField(
            controller: _noteCtrl,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'completion_note_hint'.tr(),
              hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
              filled: true,
              fillColor: AppColors.background,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.all(14),
            ),
          ),
          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentGold,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : Text('save_completion'.tr(), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}
