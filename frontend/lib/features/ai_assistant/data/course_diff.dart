import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';

enum CoursePlaceChangeType { added, removed, moved, reordered }

class CoursePlaceChange {
  final CoursePlaceChangeType type;
  final PlaceItem place;
  final int? fromDay;
  final int? toDay;
  final int? fromIndex;
  final int? toIndex;

  const CoursePlaceChange({
    required this.type,
    required this.place,
    this.fromDay,
    this.toDay,
    this.fromIndex,
    this.toIndex,
  });
}

class CourseDiff {
  final String? originalTitle;
  final String? modifiedTitle;
  final String? originalDescription;
  final String? modifiedDescription;
  final List<CoursePlaceChange> placeChanges;
  final int unchangedPlaceCount;

  const CourseDiff({
    required this.originalTitle,
    required this.modifiedTitle,
    required this.originalDescription,
    required this.modifiedDescription,
    required this.placeChanges,
    required this.unchangedPlaceCount,
  });

  bool get titleChanged => originalTitle != null;
  bool get descriptionChanged => originalDescription != null;
  bool get isUnchanged =>
      !titleChanged && !descriptionChanged && placeChanges.isEmpty;
}

class _PlacePosition {
  final int day;
  final int index;

  const _PlacePosition(this.day, this.index);
}

Map<String, _PlacePosition> _positions(CourseItem course) {
  final result = <String, _PlacePosition>{};
  for (final track in course.tracks) {
    for (var index = 0; index < track.places.length; index += 1) {
      final place = track.places[index];
      result[place.contentId] = _PlacePosition(track.trackNumber, index);
    }
  }
  return result;
}

CourseDiff computeCourseDiff(CourseItem original, CourseItem modified) {
  final before = _positions(original);
  final after = _positions(modified);
  final changes = <CoursePlaceChange>[];
  var unchanged = 0;

  final reorderedIds = <String>{};
  for (final originalTrack in original.tracks) {
    CourseTrack? modifiedTrack;
    for (final track in modified.tracks) {
      if (track.trackNumber == originalTrack.trackNumber) {
        modifiedTrack = track;
        break;
      }
    }
    if (modifiedTrack == null) continue;
    final beforeCommon = originalTrack.places
        .where((place) => after[place.contentId]?.day == originalTrack.trackNumber)
        .map((place) => place.contentId)
        .toList();
    final afterCommon = modifiedTrack.places
        .where((place) => before[place.contentId]?.day == originalTrack.trackNumber)
        .map((place) => place.contentId)
        .toList();
    for (var index = 0; index < afterCommon.length; index += 1) {
      if (index >= beforeCommon.length || beforeCommon[index] != afterCommon[index]) {
        reorderedIds.add(afterCommon[index]);
      }
    }
  }

  for (final track in modified.tracks) {
    for (var index = 0; index < track.places.length; index += 1) {
      final place = track.places[index];
      final previous = before[place.contentId];
      if (previous == null) {
        changes.add(CoursePlaceChange(
          type: CoursePlaceChangeType.added,
          place: place,
          toDay: track.trackNumber,
          toIndex: index,
        ));
      } else if (previous.day != track.trackNumber) {
        changes.add(CoursePlaceChange(
          type: CoursePlaceChangeType.moved,
          place: place,
          fromDay: previous.day,
          toDay: track.trackNumber,
          fromIndex: previous.index,
          toIndex: index,
        ));
      } else if (reorderedIds.contains(place.contentId)) {
        changes.add(CoursePlaceChange(
          type: CoursePlaceChangeType.reordered,
          place: place,
          fromDay: previous.day,
          toDay: track.trackNumber,
          fromIndex: previous.index,
          toIndex: index,
        ));
      } else {
        unchanged += 1;
      }
    }
  }

  for (final track in original.tracks) {
    for (var index = 0; index < track.places.length; index += 1) {
      final place = track.places[index];
      if (!after.containsKey(place.contentId)) {
        changes.add(CoursePlaceChange(
          type: CoursePlaceChangeType.removed,
          place: place,
          fromDay: track.trackNumber,
          fromIndex: index,
        ));
      }
    }
  }

  final titleChanged = original.title != modified.title;
  final descriptionChanged = original.description != modified.description;
  return CourseDiff(
    originalTitle: titleChanged ? original.title : null,
    modifiedTitle: titleChanged ? modified.title : null,
    originalDescription: descriptionChanged ? original.description : null,
    modifiedDescription: descriptionChanged ? modified.description : null,
    placeChanges: List.unmodifiable(changes),
    unchangedPlaceCount: unchanged,
  );
}
