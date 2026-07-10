import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/course_repository.dart';
import '../../course_view/presentation/course_view_screen.dart';
import '../../explore/presentation/widgets/feed_course_card.dart';

class CourseSearchDelegate extends SearchDelegate<void> {
  List<CourseItem>? _allCourses;

  @override
  String get searchFieldLabel => '제목, 지역, 작성자 검색';

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
    if (query.trim().isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search, size: 48, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text('검색어를 입력해 주세요',
                style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
          ],
        ),
      );
    }

    return FutureBuilder<List<CourseItem>>(
      future: _loadCourses(),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(
              child: Text('불러오기 실패',
                  style: TextStyle(color: Colors.grey.shade500)));
        }

        final results = _filter(snap.data ?? []);

        if (results.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.search_off, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('"$query" 검색 결과가 없습니다.',
                    style:
                        TextStyle(color: Colors.grey.shade400, fontSize: 14)),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: results.length,
          itemBuilder: (_, i) => FeedCourseCard(
            course: results[i],
            onTap: () {
              close(context, null);
              Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => CourseViewScreen(course: results[i])),
              );
            },
          ),
        );
      },
    );
  }

  Future<List<CourseItem>> _loadCourses() async {
    _allCourses ??= await CourseRepository().getPublicCourses();
    return _allCourses!;
  }

  List<CourseItem> _filter(List<CourseItem> courses) {
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
