class RegionItem {
  final String areaCode;
  final String name;
  final String description;
  final int spotCount;
  final int score;

  const RegionItem({
    required this.areaCode,
    required this.name,
    required this.description,
    required this.spotCount,
    required this.score,
  });

  factory RegionItem.fromJson(Map<String, dynamic> json) => RegionItem(
        areaCode: json['areaCode'] as String,
        name: json['name'] as String,
        description: json['description'] as String,
        spotCount: json['spotCount'] as int,
        score: json['score'] as int,
      );
}
