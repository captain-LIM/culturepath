import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../ai_assistant/data/ai_repository.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';
import '../../course_builder/presentation/course_builder_screen.dart';

enum _Diff { kept, added, removed }

class _DiffItem {
  final PlaceItem place;
  final _Diff status;
  const _DiffItem(this.place, this.status);
}

Future<void> showCourseAiEditSheet(BuildContext context, CourseItem course) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CourseAiEditSheet(course: course),
  );
}

class _CourseAiEditSheet extends StatefulWidget {
  final CourseItem course;
  const _CourseAiEditSheet({required this.course});

  @override
  State<_CourseAiEditSheet> createState() => _CourseAiEditSheetState();
}

class _CourseAiEditSheetState extends State<_CourseAiEditSheet> {
  final _ctrl = TextEditingController();
  bool _loading = false;
  CourseItem? _modified;
  String? _explanation;
  bool _isMock = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit(String text) async {
    if (text.trim().isEmpty || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
      _modified = null;
    });
    try {
      final result = await AiRepository().editCourse(widget.course, text.trim());
      if (mounted) {
        setState(() {
          _modified = result.course;
          _explanation = result.explanation;
          _isMock = result.mock;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<_DiffItem> _computeDiff(CourseTrack original, CourseTrack modified) {
    final origIds = {for (final p in original.places) p.contentId};
    final modIds = {for (final p in modified.places) p.contentId};
    return [
      ...modified.places.map((p) =>
          _DiffItem(p, origIds.contains(p.contentId) ? _Diff.kept : _Diff.added)),
      ...original.places
          .where((p) => !modIds.contains(p.contentId))
          .map((p) => _DiffItem(p, _Diff.removed)),
    ];
  }

  void _applyAndEdit() {
    if (_modified == null) return;
    final modified = _modified!;
    Navigator.of(context).pop();
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ProviderScope(child: CourseBuilderScreen(initialCourse: modified)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 0),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Center(child: Text('✨', style: TextStyle(fontSize: 14))),
                ),
                const SizedBox(width: 10),
                Text(
                  'ai_course_edit'.tr(),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: Colors.grey),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          const Divider(height: 12),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!_loading && _modified == null) _buildQuickChips(),
                  if (_loading) _buildLoadingState(),
                  if (_error != null) _buildErrorState(),
                  if (_modified != null) _buildResultState(),
                ],
              ),
            ),
          ),
          if (!_loading && _modified == null) _buildInputBar(bottomInset),
        ],
      ),
    );
  }

  Widget _buildQuickChips() {
    final prompts = [
      'ai_edit_quick_1'.tr(),
      'ai_edit_quick_2'.tr(),
      'ai_edit_quick_3'.tr(),
      'ai_edit_quick_4'.tr(),
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: prompts.map((p) => GestureDetector(
          onTap: () { _ctrl.text = p; _submit(p); },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Text(p, style: const TextStyle(fontSize: 12, color: AppColors.primary)),
          ),
        )).toList(),
      ),
    );
  }

  Widget _buildLoadingState() {
    return Padding(
      padding: const EdgeInsets.only(top: 40),
      child: Center(
        child: Column(
          children: [
            const CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2.5),
            const SizedBox(height: 14),
            Text(
              'ai_edit_loading'.tr(),
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Text(
        'ai_edit_error'.tr(namedArgs: {'error': _error!}),
        style: TextStyle(fontSize: 13, color: Colors.red.shade800),
      ),
    );
  }

  Widget _buildResultState() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 설명 카드
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.accent.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('💬', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  if (_isMock)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade100,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'ai_edit_mock_notice'.tr(),
                        style: TextStyle(fontSize: 10, color: Colors.orange.shade800),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _explanation ?? '',
                style: const TextStyle(fontSize: 13, height: 1.5, color: AppColors.primary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Diff 뷰 per Day
        ...List.generate(_modified!.tracks.length, (i) {
          final origTrack = i < widget.course.tracks.length
              ? widget.course.tracks[i]
              : CourseTrack(trackNumber: i + 1, places: []);
          final modTrack = _modified!.tracks[i];
          final diff = _computeDiff(origTrack, modTrack);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  'Day ${modTrack.trackNumber}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
              ...diff.map(_buildDiffRow),
              const SizedBox(height: 12),
            ],
          );
        }),
        // 액션 버튼
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() { _modified = null; _error = null; }),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.primary),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text('ai_edit_retry'.tr(),
                    style: const TextStyle(color: AppColors.primary, fontSize: 13)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _applyAndEdit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(
                  'ai_edit_apply'.tr(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildDiffRow(_DiffItem item) {
    final Color bg;
    final Color textColor;
    final Color dotColor;
    final bool strikethrough;
    final String prefix;

    switch (item.status) {
      case _Diff.added:
        bg = Colors.green.shade50;
        textColor = Colors.green.shade800;
        dotColor = Colors.green;
        strikethrough = false;
        prefix = '+ ';
      case _Diff.removed:
        bg = Colors.red.shade50;
        textColor = Colors.red.shade700;
        dotColor = Colors.red.shade400;
        strikethrough = true;
        prefix = '− ';
      case _Diff.kept:
        bg = Colors.transparent;
        textColor = Colors.grey.shade700;
        dotColor = Colors.grey.shade400;
        strikethrough = false;
        prefix = '  ';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$prefix${item.place.title}',
              style: TextStyle(
                fontSize: 13,
                color: textColor,
                decoration: strikethrough ? TextDecoration.lineThrough : null,
                fontWeight: item.status == _Diff.added ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ),
          if (item.place.category.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: dotColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                item.place.category,
                style: TextStyle(fontSize: 10, color: dotColor),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildInputBar(double bottomInset) {
    return Container(
      color: Colors.white,
      padding: EdgeInsets.fromLTRB(16, 8, 16, bottomInset + 16),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              onSubmitted: _submit,
              textInputAction: TextInputAction.send,
              decoration: InputDecoration(
                hintText: 'ai_edit_hint'.tr(),
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
            onTap: () => _submit(_ctrl.text),
            child: Container(
              width: 42,
              height: 42,
              decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}
