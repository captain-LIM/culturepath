class PlaceItem {
  final String contentId;
  final String title;
  final String address;
  final String tel;
  final String openTime;
  final String category;
  final String? areaCode;
  final String? region;
  final double? latitude;
  final double? longitude;
  final String? imageUrl;
  final String? thumbnailUrl;

  const PlaceItem({
    required this.contentId,
    required this.title,
    required this.address,
    required this.tel,
    required this.openTime,
    required this.category,
    this.areaCode,
    this.region,
    this.latitude,
    this.longitude,
    this.imageUrl,
    this.thumbnailUrl,
  });

  bool get hasCoordinates => latitude != null && longitude != null;

  factory PlaceItem.fromJson(Map<String, dynamic> json) => PlaceItem(
        contentId: json['contentId'] as String,
        title: json['title'] as String,
        address: json['address'] as String,
        tel: (json['tel'] as String?) ?? '',
        openTime: (json['openTime'] as String?) ?? '',
        category: json['category'] as String,
        areaCode: json['areaCode'] as String?,
        region: json['region'] as String?,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        imageUrl: json['imageUrl'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'contentId': contentId,
        'title': title,
        'address': address,
        'tel': tel,
        'openTime': openTime,
        'category': category,
        if (areaCode != null) 'areaCode': areaCode,
        if (region != null) 'region': region,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      };
}
