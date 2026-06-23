import 'package:flutter/material.dart';

class CultureCategory {
  final int id;
  final String name;
  final String description;
  final Color color;
  final String emoji;

  const CultureCategory({
    required this.id,
    required this.name,
    required this.description,
    required this.color,
    required this.emoji,
  });

  factory CultureCategory.fromJson(Map<String, dynamic> json) {
    final hex = (json['color'] as String).replaceAll('#', '');
    return CultureCategory(
      id: json['id'] as int,
      name: json['name'] as String,
      description: json['description'] as String,
      color: Color(int.parse('FF$hex', radix: 16)),
      emoji: json['emoji'] as String,
    );
  }
}
