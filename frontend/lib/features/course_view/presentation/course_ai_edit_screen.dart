import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../ai_assistant/data/ai_repository.dart';
import '../../ai_assistant/data/course_diff.dart';
import '../../ai_assistant/data/course_transform_models.dart';
import '../../auth/data/auth_repository.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/presentation/course_builder_screen.dart';

Future<CourseItem?> showCourseAiEditScreen(
  BuildContext context,
  CourseItem course, {
  required bool isOwner,
  Future<void> Function()? onUnauthorized,
  VoidCallback? onCourseUnavailable,
}) =>
    Navigator.of(context).push<CourseItem>(
      MaterialPageRoute(
        builder: (_) => CourseAiEditScreen(
          course: course,
          isOwner: isOwner,
          onUnauthorized: onUnauthorized,
          onCourseUnavailable: onCourseUnavailable,
        ),
      ),
    );

class CourseAiEditScreen extends StatefulWidget {
  final CourseItem course;
  final bool isOwner;
  final AiRepository? aiRepository;
  final CourseRepository? courseRepository;
  final Future<void> Function()? onUnauthorized;
  final VoidCallback? onCourseUnavailable;

  const CourseAiEditScreen({
    super.key,
    required this.course,
    required this.isOwner,
    this.aiRepository,
    this.courseRepository,
    this.onUnauthorized,
    this.onCourseUnavailable,
  });

  @override
  State<CourseAiEditScreen> createState() => _CourseAiEditScreenState();
}

class _CourseAiEditScreenState extends State<CourseAiEditScreen> {
  static const _quickPromptKeys = [
    'ai_edit_quick_supported_1',
    'ai_edit_quick_supported_2',
    'ai_edit_quick_supported_3',
    'ai_edit_quick_supported_4',
  ];

  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  late final AiRepository _aiRepository;
  late final CourseRepository _courseRepository;
  CourseEditResult? _result;
  CourseDiff? _diff;
  AiTransformFailure? _failure;
  CourseItem? _forkedBase;
  String? _applyError;
  String _lastRequest = '';
  bool _loading = false;
  bool _applying = false;
  int _retryAfterSeconds = 0;
  Timer? _cooldownTimer;

  @override
  void initState() {
    super.initState();
    _aiRepository = widget.aiRepository ?? AiRepository();
    _courseRepository = widget.courseRepository ?? CourseRepository();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _cooldownTimer?.cancel();
    _retryAfterSeconds = seconds > 0 ? seconds : 1;
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_retryAfterSeconds <= 1) {
        timer.cancel();
        setState(() => _retryAfterSeconds = 0);
      } else {
        setState(() => _retryAfterSeconds -= 1);
      }
    });
  }

  Future<void> _submit(String rawRequest) async {
    final request = rawRequest.trim();
    if (request.isEmpty ||
        request.length > 500 ||
        _loading ||
        _retryAfterSeconds > 0) {
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _failure = null;
      _applyError = null;
      _result = null;
      _diff = null;
      _lastRequest = request;
    });
    try {
      final result = await _aiRepository.editCourse(widget.course, request);
      if (!mounted) return;
      setState(() {
        _result = result;
        _diff = computeCourseDiff(widget.course, result.course);
      });
    } on AiTransformFailure catch (failure) {
      if (!mounted) return;
      setState(() => _failure = failure);
      if (failure.type == AiTransformFailureType.rateLimited) {
        _startCooldown(failure.retryAfterSeconds ?? 60);
      } else if (failure.type == AiTransformFailureType.unauthorized) {
        final callback = widget.onUnauthorized;
        if (callback != null) {
          await callback();
        } else {
          await AuthRepository().clearExpiredSession();
          if (mounted) context.go('/login');
        }
      } else if (failure.type == AiTransformFailureType.forbidden ||
          failure.type == AiTransformFailureType.notFound) {
        final callback = widget.onCourseUnavailable;
        if (callback != null) {
          callback();
        } else if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() => _failure = const AiTransformFailure(
              AiTransformFailureType.unknown,
            ));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _prepareAnotherRequest() {
    setState(() {
      _result = null;
      _diff = null;
      _failure = null;
      _applyError = null;
    });
    _focusNode.requestFocus();
  }

  CourseItem _editableFork(CourseItem proposed, CourseItem forked) => CourseItem(
        id: forked.id,
        title: proposed.title,
        description: proposed.description,
        tracks: proposed.tracks,
        isPublic: false,
        forkedFrom: forked.forkedFrom,
        authorId: forked.authorId,
        isOwner: true,
      );

  Future<void> _openBuilder() async {
    final result = _result;
    final diff = _diff;
    if (result == null || diff == null || diff.isUnchanged || _applying) return;
    setState(() {
      _applying = true;
      _applyError = null;
    });
    try {
      late final CourseItem editable;
      late final CourseItem originalForBuilder;
      if (widget.isOwner) {
        editable = result.course;
        originalForBuilder = widget.course;
      } else {
        final forked = _forkedBase ??
            await _courseRepository.forkCourse(widget.course.id!);
        _forkedBase = forked;
        editable = _editableFork(result.course, forked);
        originalForBuilder = forked;
      }
      if (!mounted) return;
      final saved = await Navigator.of(context).push<CourseItem>(
        MaterialPageRoute(
          builder: (_) => CourseBuilderScreen(
            initialCourse: editable,
            aiOriginalCourse: originalForBuilder,
            courseRepository: _courseRepository,
          ),
        ),
      );
      if (saved != null && mounted) Navigator.of(context).pop(saved);
    } catch (_) {
      if (mounted) setState(() => _applyError = 'ai_edit_apply_failed'.tr());
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  String _failureMessage(AiTransformFailure failure) {
    return switch (failure.type) {
      AiTransformFailureType.invalidRequest => 'ai_edit_error_invalid'.tr(),
      AiTransformFailureType.unauthorized => 'ai_edit_error_unauthorized'.tr(),
      AiTransformFailureType.forbidden => 'ai_edit_error_forbidden'.tr(),
      AiTransformFailureType.notFound => 'ai_edit_error_not_found'.tr(),
      AiTransformFailureType.rateLimited => 'ai_edit_error_rate_limited'.tr(
          namedArgs: {
            'seconds': _retryAfterSeconds.toString(),
          },
        ),
      AiTransformFailureType.serviceUnavailable =>
        'ai_edit_error_service'.tr(),
      AiTransformFailureType.network => 'ai_edit_error_network'.tr(),
      AiTransformFailureType.unknown => 'ai_edit_error_generic'.tr(),
    };
  }

  String _statusAnnouncement() {
    if (_loading) return 'ai_edit_loading'.tr();
    if (_failure != null) return _failureMessage(_failure!);
    if (_applyError != null) return _applyError!;
    if (_diff != null) {
      return _diff!.isUnchanged
          ? 'ai_edit_unchanged_title'.tr()
          : 'ai_edit_changed_title'.tr();
    }
    return 'ai_edit_intro_title'.tr();
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    return PopScope(
      canPop: !_applying,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text(
            'ai_course_edit'.tr(),
          ),
        ),
        body: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                children: [
                  _buildIntro(),
                  const SizedBox(height: 20),
                  if (_loading) _buildLoading(),
                  if (!_loading && _failure != null) _buildFailure(_failure!),
                  if (!_loading && _result != null && _diff != null)
                    _buildResult(_result!, _diff!),
                  if (_applyError != null) ...[
                    const SizedBox(height: 12),
                    _StatusCard(
                      icon: Icons.error_outline,
                      color: Colors.red.shade700,
                      title: _applyError!,
                    ),
                  ],
                ],
              ),
              Positioned(
                left: 0,
                top: 0,
                child: IgnorePointer(
                  child: Semantics(
                    key: const ValueKey('ai-live-status'),
                    container: true,
                    liveRegion: true,
                    label: _statusAnnouncement(),
                    child: const SizedBox(width: 1, height: 1),
                  ),
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: _buildInput(),
      ),
    );
  }

  Widget _buildIntro() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ai_edit_intro_title'.tr(),
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'ai_edit_intro_body'.tr(),
            style: TextStyle(
              color: Colors.grey.shade700,
              fontSize: 14,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _quickPromptKeys.map((key) {
              final prompt = key.tr();
              return ActionChip(
                avatar: const Icon(Icons.edit_note, size: 16),
                label: Text(prompt),
                onPressed: _loading || _retryAfterSeconds > 0
                    ? null
                    : () {
                        _controller.text = prompt;
                        _submit(prompt);
                      },
              );
            }).toList(),
          ),
        ],
      );

  Widget _buildLoading() => _StatusCard(
        key: const ValueKey('ai-loading'),
        icon: Icons.edit_note,
        color: AppColors.accent,
        title: 'ai_edit_loading'.tr(),
        body: 'ai_edit_loading_body'.tr(),
        loading: true,
      );

  Widget _buildFailure(AiTransformFailure failure) => _StatusCard(
        key: const ValueKey('ai-failure'),
        icon: failure.type == AiTransformFailureType.rateLimited
            ? Icons.timer_outlined
            : Icons.error_outline,
        color: Colors.red.shade700,
        title: _failureMessage(failure),
        body: failure.canRetry ? 'ai_edit_retry_body'.tr() : null,
        action: failure.canRetry
            ? OutlinedButton.icon(
                key: const ValueKey('ai-retry-button'),
                onPressed: _retryAfterSeconds > 0 || _lastRequest.isEmpty
                    ? null
                    : () => _submit(_lastRequest),
                icon: const Icon(Icons.refresh),
                label: Text('retry'.tr()),
              )
            : null,
      );

  Widget _buildResult(CourseEditResult result, CourseDiff diff) {
    final unchanged = diff.isUnchanged;
    return Column(
      key: ValueKey(unchanged ? 'ai-unchanged' : 'ai-changed'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StatusCard(
          icon: unchanged ? Icons.info_outline : Icons.check_circle_outline,
          color: unchanged ? Colors.orange.shade800 : Colors.green.shade700,
          title: unchanged
              ? 'ai_edit_unchanged_title'.tr()
              : 'ai_edit_changed_title'.tr(),
          body: result.summary,
          badge: result.mock ? 'ai_edit_mock_notice'.tr() : null,
        ),
        if (result.warnings.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildWarnings(result.warnings),
        ],
        if (!unchanged) ...[
          const SizedBox(height: 24),
          _sectionTitle('ai_edit_diff_title'.tr()),
          const SizedBox(height: 10),
          if (diff.titleChanged)
            _buildTextChange(
              'ai_edit_title_changed'.tr(),
              diff.originalTitle!,
              diff.modifiedTitle!,
            ),
          if (diff.descriptionChanged)
            _buildTextChange(
              'ai_edit_description_changed'.tr(),
              diff.originalDescription!,
              diff.modifiedDescription!,
            ),
          ...diff.placeChanges.map(_buildPlaceChange),
          if (diff.unchangedPlaceCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'ai_edit_unchanged_places'.tr(namedArgs: {
                  'count': diff.unchangedPlaceCount.toString(),
                }),
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ),
        ],
        if (result.sources.isNotEmpty) ...[
          const SizedBox(height: 16),
          _buildSources(result.sources),
        ],
        const SizedBox(height: 24),
        _buildResultActions(unchanged),
      ],
    );
  }

  Widget _buildResultActions(bool unchanged) => LayoutBuilder(
        builder: (context, constraints) {
          final anotherRequest = OutlinedButton(
            onPressed: _applying ? null : _prepareAnotherRequest,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text('ai_edit_another_request'.tr()),
          );
          if (unchanged) {
            return SizedBox(width: double.infinity, child: anotherRequest);
          }

          final apply = FilledButton.icon(
            key: const ValueKey('ai-apply-button'),
            onPressed: _applying ? null : _openBuilder,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size.fromHeight(52),
            ),
            icon: _applying
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : Icon(widget.isOwner ? Icons.edit_outlined : Icons.call_split),
            label: Text(
              widget.isOwner
                  ? 'ai_edit_open_builder'.tr()
                  : _forkedBase == null
                      ? 'ai_edit_fork_and_open'.tr()
                      : 'ai_edit_continue_fork'.tr(),
              textAlign: TextAlign.center,
            ),
          );
          final useStack =
              MediaQuery.textScalerOf(context).scale(14) >= 21 ||
                  constraints.maxWidth < 330;
          if (useStack) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                anotherRequest,
                const SizedBox(height: 10),
                apply,
              ],
            );
          }
          return Row(
            children: [
              Expanded(child: anotherRequest),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: apply),
            ],
          );
        },
      );

  Widget _buildWarnings(List<String> warnings) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.orange.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.orange.shade200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.orange.shade800),
                const SizedBox(width: 8),
                Text(
                  'ai_edit_warning_title'.tr(),
                  style: TextStyle(
                    color: Colors.orange.shade900,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...warnings.map((warning) => Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('• $warning', style: const TextStyle(height: 1.4)),
                )),
          ],
        ),
      );

  Widget _buildTextChange(String label, String before, String after) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(before.isEmpty ? 'ai_edit_empty_text'.tr() : before,
                style: TextStyle(
                  color: Colors.red.shade700,
                  decoration: TextDecoration.lineThrough,
                )),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 4),
              child: Icon(Icons.arrow_downward, size: 16),
            ),
            Text(after.isEmpty ? 'ai_edit_empty_text'.tr() : after,
                style: TextStyle(
                  color: Colors.green.shade800,
                  fontWeight: FontWeight.w600,
                )),
          ],
        ),
      );

  Widget _buildPlaceChange(CoursePlaceChange change) {
    final (icon, color, label) = switch (change.type) {
      CoursePlaceChangeType.added => (
          Icons.add_circle_outline,
          Colors.green.shade700,
          'ai_diff_added'.tr(namedArgs: {'day': '${change.toDay}'}),
        ),
      CoursePlaceChangeType.removed => (
          Icons.remove_circle_outline,
          Colors.red.shade700,
          'ai_diff_removed'.tr(namedArgs: {'day': '${change.fromDay}'}),
        ),
      CoursePlaceChangeType.moved => (
          Icons.swap_vert,
          Colors.blue.shade700,
          'ai_diff_moved'.tr(namedArgs: {
            'from': '${change.fromDay}',
            'to': '${change.toDay}',
          }),
        ),
      CoursePlaceChangeType.reordered => (
          Icons.reorder,
          Colors.purple.shade700,
          'ai_diff_reordered'.tr(namedArgs: {
            'day': '${change.toDay}',
            'from': '${(change.fromIndex ?? 0) + 1}',
            'to': '${(change.toIndex ?? 0) + 1}',
          }),
        ),
    };
    return Semantics(
      label: '${change.place.title}, $label',
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    change.place.title,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(label, style: TextStyle(color: color, fontSize: 12)),
                ],
              ),
            ),
            if (change.place.category.isNotEmpty)
              Chip(
                visualDensity: VisualDensity.compact,
                label: Text(
                  change.place.category,
                  style: const TextStyle(fontSize: 11),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSources(List<AiTransformSource> sources) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: ExpansionTile(
          leading: const Icon(Icons.fact_check_outlined, color: AppColors.primary),
          title: Text(
            'ai_edit_sources_title'.tr(),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Text('ai_edit_sources_body'.tr()),
          children: sources
              .map((source) => ListTile(
                    dense: true,
                    leading: const Icon(Icons.place_outlined),
                    title: Text(source.title),
                  ))
              .toList(),
        ),
      );

  Widget _sectionTitle(String title) => Text(
        title,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 17,
          fontWeight: FontWeight.bold,
        ),
      );

  Widget _buildInput() => Material(
        elevation: 8,
        color: Colors.white,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('ai-request-field'),
                    controller: _controller,
                    focusNode: _focusNode,
                    enabled: !_loading && !_applying,
                    minLines: 1,
                    maxLines: 3,
                    maxLength: 500,
                    textInputAction: TextInputAction.newline,
                    decoration: InputDecoration(
                      hintText: 'ai_edit_hint'.tr(),
                      filled: true,
                      fillColor: AppColors.background,
                      counterText: '',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  key: const ValueKey('ai-send-button'),
                  tooltip: 'ai_edit_send'.tr(),
                  onPressed: _loading ||
                          _applying ||
                          _retryAfterSeconds > 0
                      ? null
                      : () => _submit(_controller.text),
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    minimumSize: const Size(48, 48),
                  ),
                  icon: const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      );
}

class _StatusCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String? body;
  final String? badge;
  final Widget? action;
  final bool loading;

  const _StatusCard({
    super.key,
    required this.icon,
    required this.color,
    required this.title,
    this.body,
    this.badge,
    this.action,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (loading)
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(color: color, strokeWidth: 2),
                  )
                else
                  Icon(icon, color: color),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      color: color,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (badge != null)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text(badge!, style: const TextStyle(fontSize: 11)),
                  ),
              ],
            ),
            if (body != null) ...[
              const SizedBox(height: 10),
              Text(body!, style: const TextStyle(height: 1.5)),
            ],
            if (action != null) ...[
              const SizedBox(height: 12),
              action!,
            ],
          ],
        ),
      );
}
