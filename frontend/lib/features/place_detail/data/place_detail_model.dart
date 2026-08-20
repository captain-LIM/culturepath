import '../../course_builder/data/place_item.dart';

class PlaceImageItem {
  final String? imageUrl;
  final String? thumbnailUrl;
  final String? name;
  final String? copyrightType;
  final String? serialNumber;

  const PlaceImageItem({
    this.imageUrl,
    this.thumbnailUrl,
    this.name,
    this.copyrightType,
    this.serialNumber,
  });

  factory PlaceImageItem.fromJson(Map<String, dynamic> json) => PlaceImageItem(
        imageUrl: json['imageUrl'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
        name: json['name'] as String?,
        copyrightType: json['copyrightType'] as String?,
        serialNumber: json['serialNumber'] as String?,
      );
}

class PlaceDetailItem {
  final String contentId;
  final String title;
  final String address;
  final String tel;
  final String openTime;
  final String category;
  final String? region;
  final String? overview;
  final String? restDate;
  final String? homepage;
  final String? parking;
  final String? imageUrl;
  final String? thumbnailUrl;
  final double? latitude;
  final double? longitude;
  final List<PlaceImageItem> images;
  final bool? hasTranslatedInfo;

  const PlaceDetailItem({
    required this.contentId,
    required this.title,
    required this.address,
    required this.tel,
    required this.openTime,
    required this.category,
    required this.images,
    this.region,
    this.overview,
    this.restDate,
    this.homepage,
    this.parking,
    this.imageUrl,
    this.thumbnailUrl,
    this.latitude,
    this.longitude,
    this.hasTranslatedInfo,
  });

  factory PlaceDetailItem.fromJson(Map<String, dynamic> json) => PlaceDetailItem(
        contentId: json['contentId'] as String,
        title: json['title'] as String,
        address: (json['address'] as String?) ?? '',
        tel: (json['tel'] as String?) ?? '',
        openTime: (json['openTime'] as String?) ?? '',
        category: (json['category'] as String?) ?? '기타',
        region: json['region'] as String?,
        overview: json['overview'] as String?,
        restDate: json['restDate'] as String?,
        homepage: json['homepage'] as String?,
        parking: json['parking'] as String?,
        imageUrl: json['imageUrl'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        hasTranslatedInfo: json['hasTranslatedInfo'] as bool?,
        images: ((json['images'] as List<dynamic>?) ?? const [])
            .map((item) => PlaceImageItem.fromJson(
                  item as Map<String, dynamic>,
                ))
            .take(10)
            .toList(growable: false),
      );

  PlaceItem toPlaceItem({String? areaCode, String? displayRegion}) => PlaceItem(
        contentId: contentId,
        title: title,
        address: address,
        tel: tel,
        openTime: openTime,
        category: category,
        areaCode: areaCode,
        region: displayRegion ?? region,
        latitude: latitude,
        longitude: longitude,
        imageUrl: imageUrl,
        thumbnailUrl: thumbnailUrl,
      );
}
