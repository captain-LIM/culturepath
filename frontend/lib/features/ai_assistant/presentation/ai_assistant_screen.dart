import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../data/chat_model.dart';
import '../data/ai_repository.dart';
import 'widgets/chat_bubble.dart';

// ─── 상태 관리 ──────────────────────────────────────────────────────────────

class _ChatNotifier extends StateNotifier<List<ChatMessage>> {
  _ChatNotifier()
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

    state = [
      ...state,
      ChatMessage(role: 'user', content: content.trim(), timestamp: DateTime.now()),
      ChatMessage(role: 'assistant', content: '', timestamp: DateTime.now(), isLoading: true),
    ];
    _loading = true;

    try {
      final reply = await AiRepository().chat(state);
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(role: 'assistant', content: reply, timestamp: DateTime.now()),
      ];
    } catch (_) {
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          role: 'assistant',
          content: tr('ai_error'),
          timestamp: DateTime.now(),
        ),
      ];
    } finally {
      _loading = false;
    }
  }

  void clear() {
    state = [
      ChatMessage(
        role: 'assistant',
        content: tr('ai_welcome'),
        timestamp: DateTime.now(),
      ),
    ];
  }
}

final _chatProvider =
    StateNotifierProvider.autoDispose<_ChatNotifier, List<ChatMessage>>(
  (ref) => _ChatNotifier(),
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
  const AiAssistantScreen({super.key});

  @override
  ConsumerState<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends ConsumerState<AiAssistantScreen> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send(String text) {
    if (text.trim().isEmpty) return;
    ref.read(_chatProvider.notifier).send(text.trim());
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

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    final messages = ref.watch(_chatProvider);
    final notifier = ref.read(_chatProvider.notifier);

    // 새 메시지 오면 스크롤
    ref.listen(_chatProvider, (_, __) => _scrollToBottom());

    final showQuickPrompts = messages.length == 1; // 환영 메시지만 있을 때

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
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
            onPressed: () {
              notifier.clear();
            },
          ),
        ],
      ),
      body: Column(
        children: [
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
                return ChatBubble(message: messages[i]);
              },
            ),
          ),
          _InputBar(
            controller: _inputCtrl,
            onSend: _send,
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

  const _InputBar({required this.controller, required this.onSend});

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
              onSubmitted: onSend,
              textInputAction: TextInputAction.send,
              maxLines: null,
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
          GestureDetector(
            onTap: () => onSend(controller.text),
            child: Container(
              width: 42,
              height: 42,
              decoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}
