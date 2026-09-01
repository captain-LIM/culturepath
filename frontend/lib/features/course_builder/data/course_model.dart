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
  final int? courseId;
  final String title;
  final String? authorId;
  final bool authorDeleted;

  const ForkedFromInfo({
    required this.courseId,
    required this.title,
    required this.authorId,
    this.authorDeleted = false,
  });

  factory ForkedFromInfo.fromJson(Map<String, dynamic> json) => ForkedFromInfo(
        courseId: (json['courseId'] as num?)?.toInt(),
        title: json['title'] as String,
        authorId: json['authorId'] as String?,
        authorDeleted: (json['authorDeleted'] as bool?) ?? false,
      );

  Map<String, dynamic> toJson() => {
        'courseId': courseId,
        'title': title,
        'authorId': authorId,
        'authorDeleted': authorDeleted,
      };
}

class CourseItem {
  final int? id;
  final int? revision;
  final String title;
  final String description;
  final List<CourseTrack> tracks;
  final bool isPublic;
  final ForkedFromInfo? forkedFrom;
  final String? authorId;
  final int likeCount;
  final int forkCount;
  final bool isLikedByMe;
  final bool isOwner;
  final int score;

  const CourseItem({
    this.id,
    this.revision,
    required this.title,
    required this.description,
    required this.tracks,
    this.isPublic = false,
    this.forkedFrom,
    this.authorId,
    this.likeCount = 0,
    this.forkCount = 0,
    this.isLikedByMe = false,
    this.isOwner = false,
    this.score = 0,
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
    int? likeCount,
    bool? isLikedByMe,
  }) =>
      CourseItem(
        id: id,
        revision: revision,
        title: title ?? this.title,
        description: description ?? this.description,
        tracks: tracks ?? this.tracks,
        isPublic: isPublic ?? this.isPublic,
        forkedFrom: forkedFrom ?? this.forkedFrom,
        authorId: authorId,
        likeCount: likeCount ?? this.likeCount,
        forkCount: forkCount,
        isLikedByMe: isLikedByMe ?? this.isLikedByMe,
        isOwner: isOwner,
        score: score,
      );

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        if (revision != null) 'revision': revision,
        'title': title,
        'description': description,
        'isPublic': isPublic,
        'tracks': tracks.map((t) => t.toJson()).toList(),
        if (forkedFrom != null) 'forkedFrom': forkedFrom!.toJson(),
      };

  factory CourseItem.fromJson(Map<String, dynamic> json) => CourseItem(
        id: json['id'] as int?,
        revision: (json['revision'] as num?)?.toInt(),
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
        likeCount: (json['likeCount'] as int?) ?? 0,
        forkCount: (json['forkCount'] as int?) ?? 0,
        isLikedByMe: (json['isLikedByMe'] as bool?) ?? false,
        isOwner: (json['isOwner'] as bool?) ?? false,
        score: (json['score'] as int?) ?? 0,
      );

  int get totalPlaces => tracks.fold(0, (sum, t) => sum + t.places.length);

  // 목록 카드의 커버 사진으로 쓸, 사진이 있는 첫 번째 장소.
  PlaceItem? get coverPlace {
    for (final track in tracks) {
      for (final place in track.places) {
        if (place.thumbnailUrl != null || place.imageUrl != null) return place;
      }
    }
    return null;
  }

  CourseItem createLocalFork({
    required String titleSuffix,
    required String unknownAuthor,
  }) =>
      CourseItem(
        title: '$title $titleSuffix',
        description: description,
        tracks: tracks,
        isPublic: false,
        forkedFrom: ForkedFromInfo(
          courseId: id ?? 0,
          title: title,
          authorId: authorId ?? unknownAuthor,
        ),
        isOwner: true,
      );
}
