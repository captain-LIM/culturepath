import 'package:culturepath/features/ai_assistant/data/course_diff.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:flutter_test/flutter_test.dart';

PlaceItem place(String id, [String? title]) => PlaceItem(
      contentId: id,
      title: title ?? '장소 $id',
      address: '',
      tel: '',
      openTime: '',
      category: '문학',
    );

CourseItem course({
  String title = '코스',
  String description = '',
  required List<List<PlaceItem>> days,
}) =>
    CourseItem(
      id: 1,
      title: title,
      description: description,
      tracks: [
        for (var index = 0; index < days.length; index += 1)
          CourseTrack(trackNumber: index + 1, places: days[index]),
      ],
    );

void main() {
  test('detects additions, removals, moves, and relative reordering', () {
    final original = course(days: [
      [place('1'), place('2'), place('3')],
      [place('4')],
    ]);
    final modified = course(days: [
      [place('3'), place('2'), place('5')],
      [place('1')],
    ]);

    final diff = computeCourseDiff(original, modified);
    expect(
      diff.placeChanges.map((change) => (change.place.contentId, change.type)),
      containsAll([
        ('3', CoursePlaceChangeType.reordered),
        ('2', CoursePlaceChangeType.reordered),
        ('5', CoursePlaceChangeType.added),
        ('1', CoursePlaceChangeType.moved),
        ('4', CoursePlaceChangeType.removed),
      ]),
    );
    expect(diff.isUnchanged, isFalse);
  });

  test('does not report reorder when an earlier place is only removed', () {
    final original = course(days: [
      [place('1'), place('2'), place('3')],
    ]);
    final modified = course(days: [
      [place('2'), place('3')],
    ]);

    final diff = computeCourseDiff(original, modified);
    expect(diff.placeChanges, hasLength(1));
    expect(diff.placeChanges.single.type, CoursePlaceChangeType.removed);
    expect(diff.placeChanges.single.place.contentId, '1');
    expect(diff.unchangedPlaceCount, 2);
  });

  test('detects title and description changes independently', () {
    final original = course(
      title: '원본',
      description: '설명 전',
      days: [
        [place('1')],
      ],
    );
    final modified = course(
      title: '변경',
      description: '설명 후',
      days: [
        [place('1')],
      ],
    );

    final diff = computeCourseDiff(original, modified);
    expect(diff.titleChanged, isTrue);
    expect(diff.descriptionChanged, isTrue);
    expect(diff.placeChanges, isEmpty);
  });

  test('treats an identical normalized course as unchanged', () {
    final original = course(days: [
      [place('1')],
      [],
      [],
    ]);
    final modified = course(days: [
      [place('1')],
      [],
      [],
    ]);

    expect(computeCourseDiff(original, modified).isUnchanged, isTrue);
  });
}
