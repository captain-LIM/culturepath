class SpotItem {
  final String contentId;
  final String title;
  final String address;
  final String tel;
  final String openTime;
  final String category;
  final double? latitude;
  final double? longitude;
  final String? imageUrl;
  final String? thumbnailUrl;

  const SpotItem({
    required this.contentId,
    required this.title,
    required this.address,
    required this.tel,
    required this.openTime,
    required this.category,
    this.latitude,
    this.longitude,
    this.imageUrl,
    this.thumbnailUrl,
  });

  factory SpotItem.fromJson(Map<String, dynamic> json) => SpotItem(
        contentId: json['contentId'] as String,
        title: json['title'] as String,
        address: json['address'] as String,
        tel: json['tel'] as String,
        openTime: json['openTime'] as String,
        category: json['category'] as String,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        imageUrl: json['imageUrl'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
      );
}
