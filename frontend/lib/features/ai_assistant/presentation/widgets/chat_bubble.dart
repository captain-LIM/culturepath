import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/chat_model.dart';

class ChatBubble extends StatelessWidget {
  final ChatMessage message;
  final VoidCallback? onAddToCourse;

  const ChatBubble({super.key, required this.message, this.onAddToCourse});

  bool get _isUser => message.role == 'user';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: _isUser ? 60 : 16,
        right: _isUser ? 16 : 60,
        top: 4,
        bottom: 4,
      ),
      child: Column(
        crossAxisAlignment: _isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: _isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!_isUser) _AssistantAvatar(),
              if (!_isUser) const SizedBox(width: 8),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: _isUser ? AppColors.primary : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(_isUser ? 16 : 4),
                      bottomRight: Radius.circular(_isUser ? 4 : 16),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: message.isLoading
                      ? const _LoadingDots()
                      : Text(
                          message.content,
                          style: TextStyle(
                            fontSize: 14,
                            color: _isUser ? Colors.white : AppColors.textDark,
                            height: 1.5,
                          ),
                        ),
                ),
              ),
            ],
          ),
          if (!_isUser && message.suggestedCourse != null && onAddToCourse != null)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 6),
              child: _CourseSuggestionCard(
                courseJson: message.suggestedCourse!,
                onTap: onAddToCourse!,
              ),
            ),
        ],
      ),
    );
  }
}

class _CourseSuggestionCard extends StatelessWidget {
  final Map<String, dynamic> courseJson;
  final VoidCallback onTap;

  const _CourseSuggestionCard({required this.courseJson, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final title = courseJson['title'] as String? ?? 'ai_suggested_course_fallback'.tr();
    final tracks = courseJson['tracks'] as List? ?? [];
    final totalPlaces = tracks.fold<int>(0, (sum, t) {
      final places = (t as Map<String, dynamic>)['places'] as List? ?? [];
      return sum + places.length;
    });

    return Container(
      margin: const EdgeInsets.only(right: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('📍', style: TextStyle(fontSize: 13)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '${tracks.length}일 · $totalPlaces개 장소',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add, color: Colors.white, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    'ai_add_to_schedule'.tr(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AssistantAvatar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.15),
        shape: BoxShape.circle,
      ),
      child: const Center(
        child: Text('AI', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.accent)),
      ),
    );
  }
}

class _LoadingDots extends StatefulWidget {
  const _LoadingDots();

  @override
  State<_LoadingDots> createState() => _LoadingDotsState();
}

class _LoadingDotsState extends State<_LoadingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat();
    _anim = Tween(begin: 0.0, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, child) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final delay = i * 0.33;
            final value = ((_anim.value - delay) % 1.0 + 1.0) % 1.0;
            final opacity = (value < 0.5 ? value * 2 : (1 - value) * 2).clamp(0.3, 1.0);
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: Colors.grey.shade400.withValues(alpha: opacity),
                shape: BoxShape.circle,
              ),
            );
          }),
        );
      },
    );
  }
}
