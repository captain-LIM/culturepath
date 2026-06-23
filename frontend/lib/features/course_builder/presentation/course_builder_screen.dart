import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../data/course_model.dart';
import '../data/course_repository.dart';
import '../data/place_item.dart';
import 'widgets/course_place_card.dart';
import 'widgets/track_timeline.dart';
import 'widgets/place_search_sheet.dart';

class _CourseBuilderNotifier extends StateNotifier<CourseItem> {
  _CourseBuilderNotifier(CourseItem? initial) : super(initial ?? CourseItem.empty());

  void updateTitle(String v) => state = state.copyWith(title: v);
  void updateDescription(String v) => state = state.copyWith(description: v);

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
    if (newIdx > oldIdx) newIdx--;
    final tracks = List<CourseTrack>.from(state.tracks);
    final places = List<PlaceItem>.from(tracks[trackIdx].places);
    places.insert(newIdx, places.removeAt(oldIdx));
    tracks[trackIdx] = tracks[trackIdx].copyWith(places: places);
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

  const CourseBuilderScreen({super.key, this.initialCourse});

  @override
  ConsumerState<CourseBuilderScreen> createState() => _CourseBuilderScreenState();
}

class _CourseBuilderScreenState extends ConsumerState<CourseBuilderScreen> {
  int _activeTrack = 0;
  bool _saving = false;
  late final TextEditingController _titleCtrl;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.initialCourse?.title ?? '');
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  CourseItem? get _providerKey => widget.initialCourse;

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
        const SnackBar(content: Text('코스 제목을 입력해주세요.')),
      );
      return;
    }
    if (course.totalPlaces == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('장소를 최소 1개 이상 추가해주세요.')),
      );
      return;
    }

    setState(() => _saving = true);
    final repo = CourseRepository();
    try {
      final loggedIn = await repo.isLoggedIn();
      if (loggedIn) {
        await repo.createCourse(course);
      } else {
        await repo.saveGuestCourse(course);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(loggedIn ? '코스가 저장되었습니다.' : '임시 저장되었습니다. (게스트)'),
            backgroundColor: AppColors.primary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    } catch (_) {
      await repo.saveGuestCourse(course);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('오프라인 저장되었습니다.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final course = ref.watch(courseBuilderProvider(_providerKey));
    final notifier = ref.read(courseBuilderProvider(_providerKey).notifier);
    final isFork = course.forkedFrom != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: widget.initialCourse != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back, color: AppColors.primary),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
        title: TextField(
          controller: _titleCtrl,
          onChanged: notifier.updateTitle,
          decoration: InputDecoration(
            hintText: isFork ? '포크한 코스 제목' : '코스 제목을 입력하세요',
            hintStyle: const TextStyle(color: Colors.grey, fontSize: 15),
            border: InputBorder.none,
          ),
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppColors.primary,
          ),
        ),
        actions: [
          _saving
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : TextButton(
                  onPressed: _saveCourse,
                  child: const Text(
                    '저장',
                    style: TextStyle(color: AppColors.accent, fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isFork)
            _ForkBanner(originalTitle: course.forkedFrom!.title, authorId: course.forkedFrom!.authorId),
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
                  'Track ${_activeTrack + 1}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
                const Spacer(),
                Text(
                  '${course.tracks[_activeTrack].places.length}곳',
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
                    onReorder: (o, n) => notifier.reorder(_activeTrack, o, n),
                    itemBuilder: (_, i) {
                      final place = course.tracks[_activeTrack].places[i];
                      return CoursePlaceCard(
                        key: ValueKey('${place.contentId}_$i'),
                        place: place,
                        index: i,
                        onRemove: () => notifier.removePlace(_activeTrack, i),
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
        label: const Text('장소 추가', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
            'Track ${_activeTrack + 1}에 장소를 추가하세요',
            style: TextStyle(fontSize: 15, color: Colors.grey.shade500),
          ),
          const SizedBox(height: 6),
          Text(
            '아래 버튼을 눌러 코스를 구성해보세요',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
          ),
        ],
      ),
    );
  }
}

class _ForkBanner extends StatelessWidget {
  final String originalTitle;
  final String authorId;

  const _ForkBanner({required this.originalTitle, required this.authorId});

  @override
  Widget build(BuildContext context) {
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
              '포크됨: "$originalTitle"  by $authorId',
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
