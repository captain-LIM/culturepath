import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'course_model.dart';
import 'course_repository.dart';
import '../../auth/data/auth_repository.dart';

enum OwnedCourseSource { server, guest }

class OwnedCourseEntry {
  final CourseItem course;
  final OwnedCourseSource source;
  final int? guestIndex;

  const OwnedCourseEntry({
    required this.course,
    required this.source,
    this.guestIndex,
  });
}

class MyCoursesState {
  final List<OwnedCourseEntry> entries;
  final bool isStale;

  const MyCoursesState({required this.entries, this.isStale = false});
}

final courseRepositoryProvider = Provider<CourseRepository>(
  (ref) => CourseRepository(),
);

final myCoursesProvider = FutureProvider<MyCoursesState>((ref) async {
  final repository = ref.watch(courseRepositoryProvider);
  final loggedIn = await ref.watch(authStateProvider.future);
  if (loggedIn) {
    final snapshot = await repository.getMyCoursesSnapshot();
    return MyCoursesState(
      isStale: snapshot.isStale,
      entries: [
        for (final course in snapshot.courses)
          OwnedCourseEntry(
            course: course,
            source: OwnedCourseSource.server,
          ),
      ],
    );
  }

  final courses = await repository.getGuestCourses();
  return MyCoursesState(
    entries: [
      for (var index = 0; index < courses.length; index++)
        OwnedCourseEntry(
          course: courses[index],
          source: OwnedCourseSource.guest,
          guestIndex: index,
        ),
    ],
  );
});
