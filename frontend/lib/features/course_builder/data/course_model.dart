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

class CourseItem {
  final int? id;
  final String title;
  final String description;
  final List<CourseTrack> tracks;

  const CourseItem({
    this.id,
    required this.title,
    required this.description,
    required this.tracks,
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

  CourseItem copyWith({String? title, String? description, List<CourseTrack>? tracks}) =>
      CourseItem(
        id: id,
        title: title ?? this.title,
        description: description ?? this.description,
        tracks: tracks ?? this.tracks,
      );

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        'title': title,
        'description': description,
        'tracks': tracks.map((t) => t.toJson()).toList(),
      };

  factory CourseItem.fromJson(Map<String, dynamic> json) => CourseItem(
        id: json['id'] as int?,
        title: json['title'] as String,
        description: (json['description'] as String?) ?? '',
        tracks: (json['tracks'] as List)
            .map((t) => CourseTrack.fromJson(t as Map<String, dynamic>))
            .toList(),
      );

  int get totalPlaces => tracks.fold(0, (sum, t) => sum + t.places.length);
}
