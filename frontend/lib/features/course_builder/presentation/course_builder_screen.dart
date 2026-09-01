import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../data/course_model.dart';
import '../data/course_repository.dart';
import '../data/my_courses_provider.dart';
import '../data/place_item.dart';
import 'widgets/course_place_card.dart';
import 'widgets/track_timeline.dart';
import 'widgets/place_search_sheet.dart';

class _CourseBuilderNotifier extends StateNotifier<CourseItem> {
  _CourseBuilderNotifier(CourseItem? initial) : super(initial ?? CourseItem.empty());

  void updateTitle(String v) => state = state.copyWith(title: v);
  void updateDescription(String v) => state = state.copyWith(description: v);
  void replace(CourseItem course) => state = course;

  void addPlace(int trackIdx, PlaceItem place) {
    final tracks = List<CourseTrack>.from(state.tracks);
    tracks[trackIdx] = tracks[trackIdx].copyWith(
      places: [...tracks[trackIdx].places, place],
    );
    state = state.copyWith(tracks: tracks);
  }

  void removePlace(int trackIdx, int placeIdx) {
    final tracks = List<CourseTrack>.from(state.tracks);
    final places = List<PlaceItem>.from(tracks[trackIdx].places)..removeAt(placeIdx);
    tracks[trackIdx] = tracks[trackIdx].copyWith(places: places);
    state = state.copyWith(tracks: tracks);
  }

  void reorder(int trackIdx, int oldIdx, int newIdx) {
    final tracks = List<CourseTrack>.from(state.tracks);
    final places = List<PlaceItem>.from(tracks[trackIdx].places);
    places.insert(newIdx, places.removeAt(oldIdx));
    tracks[trackIdx] = tracks[trackIdx].copyWith(places: places);
    state = state.copyWith(tracks: tracks);
  }

  void movePlace(int fromTrack, int placeIndex, int toTrack) {
    if (fromTrack == toTrack) return;
    final tracks = List<CourseTrack>.from(state.tracks);
    final source = List<PlaceItem>.from(tracks[fromTrack].places);
    final target = List<PlaceItem>.from(tracks[toTrack].places);
    target.add(source.removeAt(placeIndex));
    tracks[fromTrack] = tracks[fromTrack].copyWith(places: source);
    tracks[toTrack] = tracks[toTrack].copyWith(places: target);
    state = state.copyWith(tracks: tracks);
  }
}

// family key로 CourseItem?을 사용: null=새 코스, 값=포크/편집
final courseBuilderProvider = StateNotifierProvider.autoDispose
    .family<_CourseBuilderNotifier, CourseItem, CourseItem?>(
  (ref, initial) => _CourseBuilderNotifier(initial),
);

class CourseBuilderScreen extends ConsumerStatefulWidget {
  final CourseItem? initialCourse;
  final CourseItem? aiOriginalCourse;
  final CourseRepository? courseRepository;
  final int? guestCourseIndex;

  const CourseBuilderScreen({
    super.key,
    this.initialCourse,
    this.aiOriginalCourse,
    this.courseRepository,
    this.guestCourseIndex,
  });

  @override
  ConsumerState<CourseBuilderScreen> createState() => _CourseBuilderScreenState();
}

class _CourseBuilderScreenState extends ConsumerState<CourseBuilderScreen> {
  int _activeTrack = 0;
  bool _saving = false;
  String? _lastGuestSave;
  int? _savedGuestIndex;
  CourseItem? _savedGuestSnapshot;
  late final TextEditingController _titleCtrl;
  late final TextEditingController _descriptionCtrl;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.initialCourse?.title ?? '');
    _descriptionCtrl = TextEditingController(text: widget.initialCourse?.description ?? '');
    _savedGuestIndex = widget.guestCourseIndex;
    _savedGuestSnapshot = widget.guestCourseIndex == null ? null : widget.initialCourse;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  CourseItem? get _providerKey => widget.initialCourse;

  bool _canSaveOffline(Object error) =>
      error is DioException &&
      error.type == DioExceptionType.connectionTimeout;

  bool _isSaveOutcomeUncertain(Object error) =>
      error is DioException &&
      (error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.sendTimeout ||
          error.type == DioExceptionType.receiveTimeout);

  bool _isSaveConflict(Object error) =>
      error is DioException && error.response?.statusCode == 409;

  void _openAddPlaceSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => PlaceSearchSheet(
        onPlaceSelected: (place) {
          ref.read(courseBuilderProvider(_providerKey).notifier).addPlace(_activeTrack, place);
        },
      ),
    );
  }

  Future<void> _saveCourse() async {
    final course = ref.read(courseBuilderProvider(_providerKey));
    if (course.title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('course_title_required'.tr())),
      );
      return;
    }
    if (course.totalPlaces == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('place_required'.tr())),
      );
      return;
    }

    setState(() => _saving = true);
    final repo = widget.courseRepository ?? CourseRepository();
    final notifier = ref.read(courseBuilderProvider(_providerKey).notifier);
    try {
      final loggedIn = await repo.isLoggedIn();
      final saveLocally = widget.guestCourseIndex != null || !loggedIn;
      late final CourseItem savedCourse;
      if (!saveLocally) {
        if (course.id != null) {
          savedCourse = await repo.updateCourse(course);
        } else {
          savedCourse = await repo.createCourse(course);
        }
        notifier.replace(savedCourse);
      } else {
        final fingerprint = jsonEncode(course.toJson());
        if (_lastGuestSave == fingerprint) return;
        if (_savedGuestIndex != null) {
          await repo.replaceGuestCourseAt(
            _savedGuestIndex!,
            course,
            expected: _savedGuestSnapshot,
          );
        } else {
          _savedGuestIndex = await repo.saveGuestCourse(course);
        }
        _savedGuestSnapshot = course;
        _lastGuestSave = fingerprint;
      }
      ref.invalidate(myCoursesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(saveLocally ? 'course_saved_guest'.tr() : 'course_saved'.tr()),
            backgroundColor: AppColors.primary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
        if (!saveLocally && Navigator.of(context).canPop()) {
          Navigator.of(context).pop(savedCourse);
        } else if (widget.guestCourseIndex != null && Navigator.of(context).canPop()) {
          Navigator.of(context).pop(course);
        }
      }
    } catch (error) {
      if (_canSaveOffline(error)) {
        final fingerprint = jsonEncode(course.toJson());
        if (_lastGuestSave != fingerprint) {
          if (_savedGuestIndex != null) {
            await repo.replaceGuestCourseAt(
              _savedGuestIndex!,
              course,
              expected: _savedGuestSnapshot,
            );
          } else {
            _savedGuestIndex = await repo.saveGuestCourse(course);
          }
          _savedGuestSnapshot = course;
          _lastGuestSave = fingerprint;
          ref.invalidate(myCoursesProvider);
        }
      }
      if (mounted) {
        final messageKey = _canSaveOffline(error)
            ? 'course_saved_offline'
            : _isSaveConflict(error)
                ? 'course_save_conflict'
                : _isSaveOutcomeUncertain(error)
                    ? 'course_save_uncertain'
                    : 'course_save_failed';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(messageKey.tr()),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _restoreAiOriginal() {
    final original = widget.aiOriginalCourse;
    if (original == null) return;
    ref.read(courseBuilderProvider(_providerKey).notifier).replace(original);
    _titleCtrl.text = original.title;
    _descriptionCtrl.text = original.description;
    setState(() => _activeTrack = 0);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('ai_edit_original_restored'.tr())),
    );
  }

  @override
  Widget build(BuildContext context) {
    EasyLocalization.of(context);
    final course = ref.watch(courseBuilderProvider(_providerKey));
    final notifier = ref.read(courseBuilderProvider(_providerKey).notifier);
    final isFork = course.forkedFrom != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        leading: widget.initialCourse != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back, color: AppColors.primary),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
        title: Text(widget.initialCourse == null ? 'nav_create'.tr() : 'edit_course'.tr()),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.initialCourse == null)
            const _AiAssistantEntryCard(),
          if (isFork)
            _ForkBanner(
              originalTitle: course.forkedFrom!.title,
              authorId: course.forkedFrom!.authorId,
              authorDeleted: course.forkedFrom!.authorDeleted,
            ),
          if (widget.aiOriginalCourse != null)
            Material(
              key: const ValueKey('ai-draft-banner'),
              color: AppColors.accent.withValues(alpha: 0.08),
              child: ListTile(
                dense: true,
                leading: const Icon(Icons.edit_note, color: AppColors.accent),
                title: Text(
                  'ai_edit_draft_notice'.tr(),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                trailing: TextButton(
                  key: const ValueKey('ai-restore-original'),
                  onPressed: _saving ? null : _restoreAiOriginal,
                  child: Text('ai_edit_restore_original'.tr()),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xs,
            ),
            child: Column(
              children: [
                TextField(
                  controller: _titleCtrl,
                  onChanged: notifier.updateTitle,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: isFork ? 'course_title_hint_fork'.tr() : 'course_title_hint'.tr(),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                TextField(
                  controller: _descriptionCtrl,
                  onChanged: notifier.updateDescription,
                  minLines: 1,
                  maxLines: 3,
                  decoration: InputDecoration(labelText: 'course_description_hint'.tr()),
                ),
              ],
            ),
          ),
          TrackTimeline(
            tracks: course.tracks,
            activeTrack: _activeTrack,
            onTrackTap: (i) => setState(() => _activeTrack = i),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Text(
                  'Day ${_activeTrack + 1}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
                const Spacer(),
                Text(
                  'place_count'.tr(namedArgs: {'n': course.tracks[_activeTrack].places.length.toString()}),
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: course.tracks[_activeTrack].places.isEmpty
                ? _buildEmptyTrack()
                : ReorderableListView.builder(
                    padding: const EdgeInsets.only(bottom: 100),
                    itemCount: course.tracks[_activeTrack].places.length,
                    onReorder: (o, n) =>
                        notifier.reorder(_activeTrack, o, n),
                    itemBuilder: (_, i) {
                      final place = course.tracks[_activeTrack].places[i];
                      return CoursePlaceCard(
                        key: ValueKey('${place.contentId}_$i'),
                        place: place,
                        index: i,
                        onRemove: () => notifier.removePlace(_activeTrack, i),
                        onMoveUp: i == 0
                            ? null
                            : () => notifier.reorder(_activeTrack, i, i - 1),
                        onMoveDown: i == course.tracks[_activeTrack].places.length - 1
                            ? null
                            : () => notifier.reorder(_activeTrack, i, i + 1),
                        onMoveToDay: (day) {
                          notifier.movePlace(_activeTrack, i, day);
                          setState(() => _activeTrack = day);
                        },
                        dayCount: course.tracks.length,
                        activeDay: _activeTrack,
                      );
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddPlaceSheet,
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text('add_place'.tr(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.xs,
            AppSpacing.lg,
            AppSpacing.sm,
          ),
          decoration: const BoxDecoration(
            color: AppColors.background,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: ElevatedButton(
            key: const ValueKey('course-save-button'),
            onPressed: _saving ? null : _saveCourse,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text('save'.tr()),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyTrack() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.map_outlined, size: 56, color: Colors.grey.shade300),
          const SizedBox(height: 12),
          Text(
            'track_empty_hint'.tr(namedArgs: {'n': (_activeTrack + 1).toString()}),
            style: TextStyle(fontSize: 15, color: Colors.grey.shade500),
          ),
          const SizedBox(height: 6),
          Text(
            'track_empty_sub'.tr(),
            style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
          ),
        ],
      ),
    );
  }
}

class _AiAssistantEntryCard extends StatelessWidget {
  const _AiAssistantEntryCard();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        0,
      ),
      child: Material(
        color: AppColors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          key: const ValueKey('open-ai-assistant'),
          onTap: () => context.go('/ai'),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(minHeight: 72),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.accent.withValues(alpha: 0.24)),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'AI',
                    style: TextStyle(
                      color: AppColors.accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'ai_entry_title'.tr(),
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'ai_entry_description'.tr(),
                        style: TextStyle(
                          color: Colors.grey.shade700,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.primary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ForkBanner extends StatelessWidget {
  final String originalTitle;
  final String? authorId;
  final bool authorDeleted;

  const _ForkBanner({
    required this.originalTitle,
    required this.authorId,
    required this.authorDeleted,
  });

  @override
  Widget build(BuildContext context) {
    final author = authorDeleted
        ? 'deleted_user'.tr()
        : (authorId ?? 'unknown_author'.tr());
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: AppColors.accentGold.withValues(alpha: 0.12),
      child: Row(
        children: [
          const Icon(Icons.call_split, size: 16, color: AppColors.accentGold),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'forked_from'.tr(namedArgs: {'title': originalTitle, 'author': author}),
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.accentGold,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
