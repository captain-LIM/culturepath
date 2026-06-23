import 'place_item.dart';

class CourseTrack {
  final int trackNumber;
  final List<PlaceItem> places;

  const CourseTrack({required this.trackNumber, required this.places});

  CourseTrack copyWith({List<PlaceItem>? places}) =>
      CourseTrack(trackNumber: trackNumber, places: places ?? this.places);

  Map<String, dynamic> toJson() => {
        'trackNumber': trackNumber,
        'places': places.map((p) => p.toJson()).toList(),
      };

  factory CourseTrack.fromJson(Map<String, dynamic> json) => CourseTrack(
        trackNumber: json['trackNumber'] as int,
        places: (json['places'] as List)
            .map((p) => PlaceItem.fromJson(p as Map<String, dynamic>))
            .toList(),
      );
}

class ForkedFromInfo {
  final int courseId;
  final String title;
  final String authorId;

  const ForkedFromInfo({
    required this.courseId,
    required this.title,
    required this.authorId,
  });

  factory ForkedFromInfo.fromJson(Map<String, dynamic> json) => ForkedFromInfo(
        courseId: json['courseId'] as int,
        title: json['title'] as String,
        authorId: json['authorId'] as String,
      );

  Map<String, dynamic> toJson() => {
        'courseId': courseId,
        'title': title,
        'authorId': authorId,
      };
}

class CourseItem {
  final int? id;
  final String title;
  final String description;
  final List<CourseTrack> tracks;
  final bool isPublic;
  final ForkedFromInfo? forkedFrom;
  final String? authorId;

  const CourseItem({
    this.id,
    required this.title,
    required this.description,
    required this.tracks,
    this.isPublic = false,
    this.forkedFrom,
    this.authorId,
  });

  factory CourseItem.empty() => const CourseItem(
        title: '',
        description: '',
        tracks: [
          CourseTrack(trackNumber: 1, places: []),
          CourseTrack(trackNumber: 2, places: []),
          CourseTrack(trackNumber: 3, places: []),
        ],
      );

  CourseItem copyWith({
    String? title,
    String? description,
    List<CourseTrack>? tracks,
    bool? isPublic,
    ForkedFromInfo? forkedFrom,
  }) =>
      CourseItem(
        id: id,
        title: title ?? this.title,
        description: description ?? this.description,
        tracks: tracks ?? this.tracks,
        isPublic: isPublic ?? this.isPublic,
        forkedFrom: forkedFrom ?? this.forkedFrom,
        authorId: authorId,
      );

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        'title': title,
        'description': description,
        'isPublic': isPublic,
        'tracks': tracks.map((t) => t.toJson()).toList(),
        if (forkedFrom != null) 'forkedFrom': forkedFrom!.toJson(),
      };

  factory CourseItem.fromJson(Map<String, dynamic> json) => CourseItem(
        id: json['id'] as int?,
        title: json['title'] as String,
        description: (json['description'] as String?) ?? '',
        isPublic: (json['isPublic'] as bool?) ?? false,
        tracks: (json['tracks'] as List)
            .map((t) => CourseTrack.fromJson(t as Map<String, dynamic>))
            .toList(),
        forkedFrom: json['forkedFrom'] != null
            ? ForkedFromInfo.fromJson(json['forkedFrom'] as Map<String, dynamic>)
            : null,
        authorId: json['authorId'] as String?,
      );

  int get totalPlaces => tracks.fold(0, (sum, t) => sum + t.places.length);
}
