import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';
import '../../data/chat_model.dart';

class ChatBubble extends StatelessWidget {
  final ChatMessage message;
  final VoidCallback? onAddToCourse;
  final ValueChanged<ChatSource>? onOpenSource;
  final ValueChanged<ChatSource>? onAddSourceToCourse;
  final VoidCallback? onRetry;
  final VoidCallback? onReport;
  final CourseItem? originalCourse;

  const ChatBubble({
    super.key,
    required this.message,
    this.onAddToCourse,
    this.onOpenSource,
    this.onAddSourceToCourse,
    this.onRetry,
    this.onReport,
    this.originalCourse,
  });

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
                child: GestureDetector(
                  onLongPress: onReport,
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
              ),
            ],
          ),
          if (!_isUser && message.suggestedCourse != null && onAddToCourse != null)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 6),
              child: _CourseSuggestionCard(
                courseJson: message.suggestedCourse!,
                onTap: onAddToCourse!,
                originalCourse: originalCourse,
              ),
            ),
          if (!_isUser && message.sources.isNotEmpty && onOpenSource != null)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 8, right: 16),
              child: _SourceList(
                sources: message.sources,
                onOpenSource: onOpenSource!,
                onAddSourceToCourse: onAddSourceToCourse,
              ),
            ),
          if (!_isUser && message.retryContent != null && onRetry != null)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 6),
              child: OutlinedButton.icon(
                key: const ValueKey('ai-chat-retry'),
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text('ai_retry'.tr()),
              ),
            ),
        ],
      ),
    );
  }
}

class _SourceList extends StatelessWidget {
  final List<ChatSource> sources;
  final ValueChanged<ChatSource> onOpenSource;
  final ValueChanged<ChatSource>? onAddSourceToCourse;

  const _SourceList({
    required this.sources,
    required this.onOpenSource,
    this.onAddSourceToCourse,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ai_sources_title'.tr(),
          style: TextStyle(
            color: Colors.grey.shade600,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        ...sources.map((source) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Container(
                key: ValueKey('ai-chat-source-${source.contentId}'),
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 6),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.14)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.place_outlined, color: AppColors.accent, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                source.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (source.region.isNotEmpty || source.category.isNotEmpty)
                                Text(
                                  [source.region, source.category]
                                      .where((value) => value.isNotEmpty)
                                      .join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 4,
                      children: [
                        TextButton(
                          key: ValueKey('ai-chat-source-detail-${source.contentId}'),
                          onPressed: () => onOpenSource(source),
                          child: Text('ai_view_details'.tr()),
                        ),
                        if (onAddSourceToCourse != null)
                          TextButton.icon(
                            key: ValueKey('ai-chat-source-add-${source.contentId}'),
                            onPressed: () => onAddSourceToCourse!(source),
                            icon: const Icon(Icons.add, size: 18),
                            label: Text('ai_add_to_schedule'.tr()),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            )),
      ],
    );
  }
}

class _CourseSuggestionCard extends StatelessWidget {
  final Map<String, dynamic> courseJson;
  final VoidCallback onTap;
  final CourseItem? originalCourse;

  const _CourseSuggestionCard({
    required this.courseJson,
    required this.onTap,
    this.originalCourse,
  });

  String _trackOutline(int day, List<dynamic> places) {
    final titles = places
        .take(3)
        .map((place) => (place as Map)['title'] as String? ?? '')
        .where((title) => title.isNotEmpty)
        .join(' → ');
    final more = places.length > 3 ? ' +${places.length - 3}' : '';
    return 'Day $day · $titles$more';
  }

  @override
  Widget build(BuildContext context) {
    final title = courseJson['title'] as String? ?? 'ai_suggested_course_fallback'.tr();
    final tracks = courseJson['tracks'] as List? ?? [];
    final totalPlaces = tracks.fold<int>(0, (sum, t) {
      final places = (t as Map<String, dynamic>)['places'] as List? ?? [];
      return sum + places.length;
    });

    return Container(
      key: const ValueKey('ai-chat-course-suggestion'),
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
              const Icon(Icons.route_outlined, color: AppColors.accent, size: 18),
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
          if (originalCourse != null) ...[
            const SizedBox(height: 10),
            Text(
              'ai_edit_diff_title'.tr(),
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${'ai_course_before'.tr()}: ${originalCourse!.tracks.map((track) => _trackOutline(track.trackNumber, track.places.map((place) => place.toJson()).toList())).join('\n')}',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade700, height: 1.4),
            ),
            const SizedBox(height: 3),
            Text(
              '${'ai_course_after'.tr()}: ${tracks.asMap().entries.map((entry) => _trackOutline(entry.key + 1, ((entry.value as Map)['places'] as List? ?? []))).join('\n')}',
              style: const TextStyle(fontSize: 11, color: AppColors.primary, height: 1.4),
            ),
          ],
          const SizedBox(height: 8),
          SizedBox(
            height: 44,
            child: FilledButton.icon(
              key: const ValueKey('ai-chat-open-course-draft'),
              onPressed: onTap,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: Text(
                originalCourse == null
                    ? 'ai_add_to_schedule'.tr()
                    : 'ai_edit_open_builder'.tr(),
              ),
              style: FilledButton.styleFrom(backgroundColor: AppColors.accent),
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
