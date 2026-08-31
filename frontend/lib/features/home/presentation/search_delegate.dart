import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/i18n/category_localization.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/place_network_image.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_builder/data/place_item.dart';
import '../../course_view/presentation/course_view_screen.dart';
import '../../explore/presentation/widgets/feed_course_card.dart';

typedef CourseSearchLoader = Future<List<CourseItem>> Function();
typedef PlaceSearchLoader = Future<List<PlaceItem>> Function(String query);

// 검색창 안내문구가 "지역, 문화 검색"인데도, 예전에는 캐시된 공개 코스의
// 제목·설명·작성자·코스에 담긴 장소만 훑었다 — 그 지역/문화를 다루는
// 공개 코스가 우연히 있어야만 뭐라도 나왔고, 정작 검색어와 일치하는
// 관광지 자체는 절대 나오지 않았다. place_search_sheet.dart(코스 만들기 중
// 장소 추가)가 이미 같은 /places/search 엔드포인트로 실제 관광지를 잘
// 찾아오고 있었으므로, 그 검증된 경로를 검색 화면에도 그대로 연결했다.
// (지역명은 TourAPI 관광지 제목에 흔히 접두어로 들어있고, 문화 키워드도
// 실제 상호명에 포함되는 경우가 많아 키워드 검색만으로 상당수 커버된다.)
const int _minPlaceQueryLength = 2;

class CourseSearchDelegate extends SearchDelegate<void> {
  List<CourseItem>? _allCourses;
  final CourseSearchLoader? courseLoader;
  final PlaceSearchLoader? placeLoader;

  CourseSearchDelegate({this.courseLoader, this.placeLoader});

  // buildSuggestions/buildResults는 위젯 트리가 재빌드될 때마다 다시
  // 호출될 수 있어, 매번 새 Future를 만들면 같은 검색어에도 요청이
  // 계속 중복 발생한다. 마지막으로 요청한 검색어와 그 Future를 캐시해
  // 검색어가 실제로 바뀔 때만 새로 요청한다.
  String? _placesQuery;
  Future<List<PlaceItem>>? _placesFuture;

  @override
  String get searchFieldLabel => tr('search_field_label');

  @override
  TextStyle get searchFieldStyle =>
      const TextStyle(fontSize: 14, color: AppColors.primary);

  @override
  ThemeData appBarTheme(BuildContext context) {
    return Theme.of(context).copyWith(
      scaffoldBackgroundColor: AppColors.background,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: AppColors.primary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: InputBorder.none,
        hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
      ),
    );
  }

  @override
  List<Widget> buildActions(BuildContext context) => [
        if (query.isNotEmpty)
          IconButton(
            icon: const Icon(Icons.clear),
            onPressed: () => query = '',
          ),
      ];

  @override
  Widget buildLeading(BuildContext context) => IconButton(
        icon: const Icon(Icons.arrow_back),
        onPressed: () => close(context, null),
      );

  @override
  Widget buildResults(BuildContext context) => _buildSearchResults(context);

  @override
  Widget buildSuggestions(BuildContext context) => _buildSearchResults(context);

  Widget _buildSearchResults(BuildContext context) {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search, size: 48, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text('search_enter_query'.tr(),
                style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
          ],
        ),
      );
    }

    return FutureBuilder<List<Object>>(
      future: Future.wait([_loadPlaces(trimmed), _loadCourses()]),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(
              child: Text('search_load_failed'.tr(),
                  style: TextStyle(color: Colors.grey.shade500)));
        }

        final places = snap.data![0] as List<PlaceItem>;
        final courses = _filterCourses(snap.data![1] as List<CourseItem>);

        if (places.isEmpty && courses.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.search_off, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('search_no_results'.tr(namedArgs: {'query': query}),
                    style:
                        TextStyle(color: Colors.grey.shade400, fontSize: 14)),
              ],
            ),
          );
        }

        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            if (places.isNotEmpty) ...[
              _SectionHeader('search_section_places'.tr()),
              for (final place in places)
                _PlaceResultTile(
                  place: place,
                  onTap: () {
                    // GoRouter 조회는 실제로 탭했을 때만 해야 한다 — build
                    // 시점에 미리 조회해두면, 홈 화면 검색처럼 GoRouter
                    // 트리 밖(단순 Navigator)에서 이 델리게이트를 띄우는
                    // 경우에도 관광지 결과가 하나라도 있으면 무조건
                    // 예외가 났다.
                    final router = GoRouter.of(context);
                    close(context, null);
                    router.push('/places/${place.contentId}', extra: place);
                  },
                ),
            ],
            if (courses.isNotEmpty) ...[
              _SectionHeader('search_section_courses'.tr()),
              for (final course in courses)
                FeedCourseCard(
                  course: course,
                  onTap: () {
                    final rootNavigator =
                        Navigator.of(context, rootNavigator: true);
                    close(context, null);
                    rootNavigator.push(
                      MaterialPageRoute(
                          builder: (_) => CourseViewScreen(course: course)),
                    );
                  },
                ),
            ],
          ],
        );
      },
    );
  }

  Future<List<PlaceItem>> _loadPlaces(String trimmedQuery) {
    if (trimmedQuery.length < _minPlaceQueryLength) return Future.value(const []);
    if (_placesQuery == trimmedQuery && _placesFuture != null) return _placesFuture!;
    _placesQuery = trimmedQuery;
    _placesFuture = (placeLoader ?? CourseRepository().searchPlaces)(trimmedQuery);
    return _placesFuture!;
  }

  Future<List<CourseItem>> _loadCourses() async {
    _allCourses ??= await (courseLoader?.call() ?? CourseRepository().getPublicCourses());
    return _allCourses!;
  }

  List<CourseItem> _filterCourses(List<CourseItem> courses) {
    final q = query.trim().toLowerCase();
    return courses.where((c) {
      if (c.title.toLowerCase().contains(q)) return true;
      if (c.description.toLowerCase().contains(q)) return true;
      if ((c.authorId ?? '').toLowerCase().contains(q)) return true;
      for (final track in c.tracks) {
        for (final place in track.places) {
          if ((place.region ?? '').toLowerCase().contains(q)) return true;
          if (place.title.toLowerCase().contains(q)) return true;
        }
      }
      return false;
    }).toList();
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;

  const _SectionHeader(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.bold,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

class _PlaceResultTile extends StatelessWidget {
  final PlaceItem place;
  final VoidCallback onTap;

  const _PlaceResultTile({required this.place, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      leading: SizedBox(
        width: 44,
        height: 44,
        child: PlaceNetworkImage(
          placeTitle: place.title,
          thumbnailUrl: place.thumbnailUrl,
          imageUrl: place.imageUrl,
          category: place.category,
          borderRadius: BorderRadius.circular(10),
        ),
      ),
      title: Text(
        place.title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primary),
      ),
      subtitle: Text(
        '${place.region != null ? "[${place.region}] " : ""}${localizedCategory(place.category)} · ${place.address}',
        style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
    );
  }
}
