import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/course_repository.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:culturepath/features/course_builder/data/my_courses_provider.dart';
import 'package:culturepath/features/auth/data/auth_repository.dart';
import 'package:culturepath/features/course_view/presentation/course_view_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _CourseApiClient extends ApiClient {
  bool fail = false;

  _CourseApiClient()
      : super(
          dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
          tokenLoader: () async => null,
        );

  @override
  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? params,
  }) async {
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.connectionError,
      );
    }
    return Response<dynamic>(
      data: [_course('서버 코스').toJson()],
      statusCode: 200,
      requestOptions: RequestOptions(path: path),
    );
  }
}

class _SwitchingCourseRepository extends CourseRepository {
  @override
  Future<List<CourseItem>> getGuestCourses() async => [_course('게스트 코스')];

  @override
  Future<CourseListSnapshot> getMyCoursesSnapshot() async => CourseListSnapshot(
        courses: [_course('서버 코스')],
        isStale: false,
      );
}

CourseItem _course(String title) => CourseItem(
      title: title,
      description: '설명',
      tracks: [
        CourseTrack(
          trackNumber: 1,
          places: [
            PlaceItem(
              contentId: '1',
              title: '오죽헌',
              address: '강릉',
              tel: '',
              openTime: '',
              category: '문학',
              imageUrl: 'https://example.com/image.jpg',
              thumbnailUrl: 'https://example.com/thumb.jpg',
            ),
          ],
        ),
      ],
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('guest course edit replaces the existing item instead of duplicating it', () async {
    final repository = CourseRepository(client: _CourseApiClient());
    await repository.saveGuestCourse(_course('첫 제목'));

    await repository.replaceGuestCourseAt(0, _course('수정한 제목'));

    final saved = await repository.getGuestCourses();
    expect(saved, hasLength(1));
    expect(saved.single.title, '수정한 제목');
    expect(saved.single.tracks.single.places.single.imageUrl, 'https://example.com/image.jpg');
    expect(saved.single.tracks.single.places.single.thumbnailUrl, 'https://example.com/thumb.jpg');
  });

  test('guest course deletion removes only the selected course', () async {
    final repository = CourseRepository(client: _CourseApiClient());
    await repository.saveGuestCourse(_course('첫 코스'));
    await repository.saveGuestCourse(_course('둘째 코스'));

    await repository.deleteGuestCourseAt(0);

    final saved = await repository.getGuestCourses();
    expect(saved.map((course) => course.title), ['둘째 코스']);
  });

  test('stale guest index is recovered by matching the original course', () async {
    final repository = CourseRepository(client: _CourseApiClient());
    final first = _course('첫 코스');
    final target = _course('수정할 코스');
    await repository.saveGuestCourse(first);
    await repository.saveGuestCourse(target);
    await repository.deleteGuestCourseAt(0, expected: first);

    await repository.replaceGuestCourseAt(
      1,
      _course('안전하게 수정됨'),
      expected: target,
    );

    final saved = await repository.getGuestCourses();
    expect(saved, hasLength(1));
    expect(saved.single.title, '안전하게 수정됨');
  });

  test('ambiguous duplicate guest courses are never replaced by stale index', () async {
    final repository = CourseRepository(client: _CourseApiClient());
    final duplicate = _course('same course');
    final middle = _course('middle course');
    await repository.saveGuestCourse(duplicate);
    await repository.saveGuestCourse(middle);
    await repository.saveGuestCourse(duplicate);
    await repository.deleteGuestCourseAt(1, expected: middle);

    await expectLater(
      repository.replaceGuestCourseAt(
        2,
        _course('unsafe replacement'),
        expected: duplicate,
      ),
      throwsStateError,
    );

    final saved = await repository.getGuestCourses();
    expect(saved.map((course) => course.title), ['same course', 'same course']);
  });

  test('ambiguous duplicate guest courses are never deleted by stale index', () async {
    final repository = CourseRepository(client: _CourseApiClient());
    final duplicate = _course('same course');
    final middle = _course('middle course');
    await repository.saveGuestCourse(duplicate);
    await repository.saveGuestCourse(middle);
    await repository.saveGuestCourse(duplicate);
    await repository.deleteGuestCourseAt(1, expected: middle);

    await expectLater(
      repository.deleteGuestCourseAt(2, expected: duplicate),
      throwsStateError,
    );

    final saved = await repository.getGuestCourses();
    expect(saved.map((course) => course.title), ['same course', 'same course']);
  });

  test('legacy guest course with a server id never refreshes from server', () {
    final legacyGuest = CourseItem(
      id: 42,
      title: 'legacy local fork',
      description: 'local edits',
      tracks: const [CourseTrack(trackNumber: 1, places: [])],
    );

    expect(shouldRefreshCourseDetail(legacyGuest, 0), isFalse);
    expect(shouldRefreshCourseDetail(legacyGuest, null), isTrue);
  });

  test('my course snapshot marks fallback cache as stale', () async {
    final client = _CourseApiClient();
    final repository = CourseRepository(client: client);
    final fresh = await repository.getMyCoursesSnapshot();
    client.fail = true;

    final stale = await repository.getMyCoursesSnapshot();

    expect(fresh.isStale, isFalse);
    expect(stale.isStale, isTrue);
    expect(stale.courses.single.title, '서버 코스');
  });

  test('a cache write failure does not discard a successful server response', () async {
    final repository = CourseRepository(
      client: _CourseApiClient(),
      cacheWriter: (_, __) async => throw StateError('disk unavailable'),
    );

    final snapshot = await repository.getMyCoursesSnapshot();

    expect(snapshot.isStale, isFalse);
    expect(snapshot.courses.single.title, '서버 코스');
  });

  test('local fork removes the server id and keeps provenance', () {
    final original = CourseItem(
      id: 42,
      title: '공개 코스',
      description: '원본',
      tracks: const [CourseTrack(trackNumber: 1, places: [])],
      authorId: 'creator',
    );

    final fork = original.createLocalFork(
      titleSuffix: '복사본',
      unknownAuthor: '알 수 없음',
    );

    expect(fork.id, isNull);
    expect(fork.forkedFrom?.courseId, 42);
    expect(fork.forkedFrom?.authorId, 'creator');
    expect(fork.isOwner, isTrue);
  });

  test('my courses reload when authentication state changes', () async {
    var loggedIn = false;
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWith((ref) async => loggedIn),
        courseRepositoryProvider.overrideWithValue(_SwitchingCourseRepository()),
      ],
    );
    addTearDown(container.dispose);

    final guest = await container.read(myCoursesProvider.future);
    loggedIn = true;
    container.invalidate(authStateProvider);
    await container.read(authStateProvider.future);
    final server = await container.read(myCoursesProvider.future);

    expect(guest.entries.single.course.title, '게스트 코스');
    expect(server.entries.single.course.title, '서버 코스');
  });
}
