import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/data/place_item.dart';
import '../../course_builder/presentation/course_builder_screen.dart';
import '../data/chat_model.dart';
import '../data/ai_repository.dart';
import 'widgets/chat_bubble.dart';

// ─── 상태 관리 ──────────────────────────────────────────────────────────────

class _ChatNotifier extends StateNotifier<List<ChatMessage>> {
  final AiRepository _repository;

  _ChatNotifier(this._repository)
      : super([
          ChatMessage(
            role: 'assistant',
            content: tr('ai_welcome'),
            timestamp: DateTime.now(),
          ),
        ]);

  bool _loading = false;
  bool get loading => _loading;

  Future<void> send(String content) async {
    if (_loading || content.trim().isEmpty) return;

    await _request(content.trim(), appendUser: true);
  }

  Future<void> retry(String content) async {
    if (_loading || content.trim().isEmpty) return;
    await _request(content.trim(), appendUser: false);
  }

  Future<void> _request(String content, {required bool appendUser}) async {
    final retained = state.where((message) => message.retryContent == null).toList();

    state = [
      ...retained,
      if (appendUser)
        ChatMessage(role: 'user', content: content, timestamp: DateTime.now()),
      ChatMessage(role: 'assistant', content: '', timestamp: DateTime.now(), isLoading: true),
    ];
    _loading = true;

    try {
      final reply = await _repository.chat(state);
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          role: 'assistant',
          content: reply.content,
          timestamp: DateTime.now(),
          sources: reply.sources,
          suggestedCourse: reply.suggestedCourse,
        ),
      ];
    } on AiChatFailure catch (failure) {
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          role: 'assistant',
          content: _failureMessage(failure),
          timestamp: DateTime.now(),
          retryContent: content,
        ),
      ];
    } catch (_) {
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          role: 'assistant',
          content: tr('ai_error'),
          timestamp: DateTime.now(),
          retryContent: content,
        ),
      ];
    } finally {
      _loading = false;
    }
  }

  String _failureMessage(AiChatFailure failure) {
    switch (failure.type) {
      case AiChatFailureType.unauthorized:
        return tr('ai_error_login');
      case AiChatFailureType.rateLimited:
        final seconds = failure.retryAfterSeconds;
        return seconds == null
            ? tr('ai_error_rate_limited')
            : tr('ai_error_rate_limited_seconds', namedArgs: {'seconds': '$seconds'});
      case AiChatFailureType.serviceUnavailable:
        return tr('ai_error_service');
      case AiChatFailureType.network:
        return tr('ai_error_network');
      case AiChatFailureType.invalidResponse:
      case AiChatFailureType.unknown:
        return tr('ai_error');
    }
  }

  Future<void> clear() async {
    await _repository.closeSession();
    state = [
      ChatMessage(
        role: 'assistant',
        content: tr('ai_welcome'),
        timestamp: DateTime.now(),
      ),
    ];
  }
}

final _chatProvider = StateNotifierProvider.autoDispose
    .family<_ChatNotifier, List<ChatMessage>, AiRepository>(
  (ref, repository) => _ChatNotifier(repository),
);

// ─── 빠른 질문 목록 ──────────────────────────────────────────────────────────

List<String> _quickPrompts() => [
  tr('ai_quick_1'),
  tr('ai_quick_2'),
  tr('ai_quick_3'),
  tr('ai_quick_4'),
  tr('ai_quick_5'),
];

// ─── 화면 ────────────────────────────────────────────────────────────────────

class AiAssistantScreen extends ConsumerStatefulWidget {
  final AiRepository? repository;
  final int? courseId;

  const AiAssistantScreen({super.key, this.repository, this.courseId});

  @override
  ConsumerState<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends ConsumerState<AiAssistantScreen> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  late final AiRepository _repository;
  CourseItem? _courseOriginal;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? AiRepository(courseId: widget.courseId);
    _loadCourseOriginal();
  }

  Future<void> _loadCourseOriginal() async {
    final courseId = widget.courseId;
    if (courseId == null) return;
    try {
      final course = await CourseRepository().getCourse(courseId);
      if (mounted) setState(() => _courseOriginal = course);
    } catch (_) {
      // Backend가 실제 대화 요청에서도 코스 권한과 존재 여부를 다시 검증한다.
    }
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send(String text) {
    if (text.trim().isEmpty) return;
    ref.read(_chatProvider(_repository).notifier).send(text.trim());
    _inputCtrl.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent + 200,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _openSuggestedCourse(Map<String, dynamic> json) async {
    try {
      final suggested = CourseItem.fromJson(json);
      await _openCourseBuilder(suggested);
    } on FormatException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ai_error'.tr())),
      );
    } on TypeError {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ai_error'.tr())),
      );
    }
  }

  Future<void> _openSourceInCourse(ChatSource source) async {
    final place = PlaceItem(
      contentId: source.contentId,
      title: source.title,
      address: source.address,
      tel: '',
      openTime: '',
      category: source.category.isEmpty ? '기타' : source.category,
      region: source.region.isEmpty ? null : source.region,
    );
    final original = _courseOriginal;
    late final CourseItem draft;
    if (original == null) {
      draft = CourseItem(
        title: '${source.region} ${source.category} 코스'.trim(),
        description: '',
        tracks: [CourseTrack(trackNumber: 1, places: [place])],
      );
    } else {
      final alreadyIncluded = original.tracks.any(
        (track) => track.places.any((item) => item.contentId == source.contentId),
      );
      if (alreadyIncluded) {
        await _openCourseBuilder(original);
        return;
      }
      final tracks = original.tracks
          .map((track) => CourseTrack(
                trackNumber: track.trackNumber,
                places: [...track.places],
              ))
          .toList(growable: false);
      tracks[0] = tracks[0].copyWith(places: [...tracks[0].places, place]);
      draft = original.copyWith(tracks: tracks);
    }
    await _openCourseBuilder(draft);
  }

  Future<void> _openCourseBuilder(CourseItem draft) async {
    final saved = await Navigator.of(context, rootNavigator: true).push<CourseItem>(
      MaterialPageRoute(
        builder: (_) => CourseBuilderScreen(
          initialCourse: draft,
          aiOriginalCourse: _courseOriginal,
        ),
      ),
    );
    if (saved?.id != null) {
      await _repository.markCourseSaved(saved!.id!);
      if (mounted) setState(() => _courseOriginal = saved);
    }
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    final provider = _chatProvider(_repository);
    final messages = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    final loading = messages.any((message) => message.isLoading);

    // 새 메시지 오면 스크롤
    ref.listen(provider, (_, next) => _scrollToBottom());

    final showQuickPrompts = messages.length == 1; // 환영 메시지만 있을 때

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        automaticallyImplyLeading: widget.courseId != null,
        leading: widget.courseId == null
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back, color: AppColors.primary),
                onPressed: () => Navigator.of(context).pop(),
              ),
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text('AI', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.accent)),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ai_title'.tr(),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary)),
                Text('ai_subtitle'.tr(),
                    style: const TextStyle(fontSize: 10, color: Colors.grey)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.grey),
            tooltip: 'ai_reset'.tr(),
            onPressed: notifier.clear,
          ),
        ],
      ),
      body: Column(
        children: [
          if (widget.courseId != null)
            Container(
              key: const ValueKey('ai-course-context'),
              width: double.infinity,
              color: AppColors.accent.withValues(alpha: 0.08),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.route_outlined, color: AppColors.accent, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${'ai_course_edit'.tr()} · ${_courseOriginal?.title ?? '...'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.symmetric(vertical: 16),
              itemCount: messages.length + (showQuickPrompts ? 1 : 0),
              itemBuilder: (_, i) {
                if (showQuickPrompts && i == messages.length) {
                  return _QuickPromptChips(
                    prompts: _quickPrompts(),
                    onTap: _send,
                  );
                }
                final msg = messages[i];
                return ChatBubble(
                  message: msg,
                  onAddToCourse: msg.suggestedCourse == null
                      ? null
                      : () => _openSuggestedCourse(msg.suggestedCourse!),
                  onOpenSource: (source) =>
                      context.push('/places/${source.contentId}'),
                  onAddSourceToCourse: _openSourceInCourse,
                  onRetry: msg.retryContent == null
                      ? null
                      : () => notifier.retry(msg.retryContent!),
                  originalCourse: _courseOriginal,
                );
              },
            ),
          ),
          _InputBar(
            controller: _inputCtrl,
            onSend: _send,
            enabled: !loading,
          ),
        ],
      ),
    );
  }
}

// ─── 빠른 질문 칩 ────────────────────────────────────────────────────────────

class _QuickPromptChips extends StatelessWidget {
  final List<String> prompts;
  final void Function(String) onTap;

  const _QuickPromptChips({required this.prompts, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ai_quick_prompts'.tr(),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500, fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: prompts.map((p) => GestureDetector(
              onTap: () => onTap(p),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
                child: Text(p,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.primary,
                      fontWeight: FontWeight.w500,
                    )),
              ),
            )).toList(),
          ),
        ],
      ),
    );
  }
}

// ─── 입력 바 ──────────────────────────────────────────────────────────────────

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final void Function(String) onSend;
  final bool enabled;

  const _InputBar({
    required this.controller,
    required this.onSend,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: EdgeInsets.fromLTRB(16, 10, 16, MediaQuery.of(context).viewInsets.bottom + 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              enabled: enabled,
              onSubmitted: enabled ? onSend : null,
              textInputAction: TextInputAction.send,
              maxLines: null,
              maxLength: AiRepository.maxChatMessageLength,
              decoration: InputDecoration(
                hintText: 'ai_input_hint'.tr(),
                hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                filled: true,
                fillColor: AppColors.background,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('ai-chat-send'),
              onTap: enabled ? () => onSend(controller.text) : null,
              customBorder: const CircleBorder(),
              child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: enabled ? AppColors.primary : Colors.grey.shade300,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
            ),
          ),
        ],
      ),
    );
  }
}
