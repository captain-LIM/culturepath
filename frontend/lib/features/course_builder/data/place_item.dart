class PlaceItem {
  final String contentId;
  final String title;
  final String address;
  final String tel;
  final String openTime;
  final String category;
  final String? areaCode;
  final String? region;

  const PlaceItem({
    required this.contentId,
    required this.title,
    required this.address,
    required this.tel,
    required this.openTime,
    required this.category,
    this.areaCode,
    this.region,
  });

  factory PlaceItem.fromJson(Map<String, dynamic> json) => PlaceItem(
        contentId: json['contentId'] as String,
        title: json['title'] as String,
        address: json['address'] as String,
        tel: (json['tel'] as String?) ?? '',
        openTime: (json['openTime'] as String?) ?? '',
        category: json['category'] as String,
        areaCode: json['areaCode'] as String?,
        region: json['region'] as String?,
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
      };
}
