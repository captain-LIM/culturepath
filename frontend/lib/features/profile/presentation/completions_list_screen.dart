import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_view/presentation/course_view_screen.dart';
import '../data/profile_model.dart';
import '../data/profile_repository.dart';

final _completionsProvider = FutureProvider.autoDispose<List<CompletionRecord>>(
  (ref) => ProfileRepository().getMyCompletions(),
);

class CompletionsListScreen extends ConsumerWidget {
  const CompletionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    final async = ref.watch(_completionsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'completed_courses'.tr(),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text('profile_error'.tr(), style: TextStyle(color: Colors.grey.shade500)),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.invalidate(_completionsProvider),
                child: Text('retry'.tr()),
              ),
            ],
          ),
        ),
        data: (completions) => completions.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.emoji_events_outlined, size: 48, color: Colors.grey.shade300),
                    const SizedBox(height: 12),
                    Text(
                      'no_completions'.tr(),
                      style: TextStyle(fontSize: 14, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              )
            : RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(_completionsProvider);
                  await ref.read(_completionsProvider.future);
                },
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  itemCount: completions.length,
                  itemBuilder: (_, i) => _CompletionTile(
                    record: completions[i],
                    onDeleted: () => ref.invalidate(_completionsProvider),
                  ),
                ),
              ),
      ),
    );
  }
}

class _CompletionTile extends StatefulWidget {
  final CompletionRecord record;
  final VoidCallback onDeleted;
  const _CompletionTile({required this.record, required this.onDeleted});

  @override
  State<_CompletionTile> createState() => _CompletionTileState();
}

class _CompletionTileState extends State<_CompletionTile> {
  bool _loading = false;
  bool _deleting = false;

  Future<void> _openCourse() async {
    if (_loading || _deleting) return;
    setState(() => _loading = true);
    try {
      final course = await CourseRepository().getCourse(widget.record.courseId);
      if (mounted) {
        Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(
          builder: (_) => CourseViewScreen(course: course),
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('course_load_failed'.tr()),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmDelete() async {
    if (_loading || _deleting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('delete_completion'.tr()),
        content: Text('delete_completion_confirm'.tr()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('cancel'.tr())),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('delete'.tr(), style: const TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ProfileRepository().deleteCompletion(widget.record.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('completion_deleted'.tr()),
            behavior: SnackBarBehavior.floating,
          ),
        );
        widget.onDeleted();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('delete_failed'.tr()),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rec = widget.record;
    final dateStr =
        '${rec.completedAt.year}.${rec.completedAt.month.toString().padLeft(2, '0')}.${rec.completedAt.day.toString().padLeft(2, '0')}';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: _openCourse,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 4, 14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.accentGold.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.emoji_events, color: AppColors.accentGold, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rec.courseTitle,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Text(dateStr, style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                          if (rec.culture != null) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.accentGold.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                rec.culture!,
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: AppColors.accentGold,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (rec.note.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(
                            '"${rec.note}"',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade500,
                              fontStyle: FontStyle.italic,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                  ),
                ),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                    ),
                  )
                else if (_deleting)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red),
                    ),
                  )
                else
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.chevron_right, color: Colors.grey.shade400),
                      IconButton(
                        icon: Icon(Icons.delete_outline, color: Colors.grey.shade400, size: 20),
                        tooltip: 'delete_completion'.tr(),
                        onPressed: _confirmDelete,
                        splashRadius: 20,
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
