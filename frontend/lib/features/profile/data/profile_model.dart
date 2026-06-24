import '../../course_builder/data/course_model.dart';

class CompletionRecord {
  final int id;
  final int courseId;
  final String courseTitle;
  final String note;
  final DateTime completedAt;

  const CompletionRecord({
    required this.id,
    required this.courseId,
    required this.courseTitle,
    required this.note,
    required this.completedAt,
  });

  factory CompletionRecord.fromJson(Map<String, dynamic> json) => CompletionRecord(
        id: json['id'] as int,
        courseId: json['courseId'] as int,
        courseTitle: json['courseTitle'] as String,
        note: (json['note'] as String?) ?? '',
        completedAt: DateTime.parse(json['completedAt'] as String),
      );
}

class ProfileStats {
  final int completedCount;
  final int createdCount;
  final int likedCount;

  const ProfileStats({
    required this.completedCount,
    required this.createdCount,
    required this.likedCount,
  });

  factory ProfileStats.fromJson(Map<String, dynamic> json) => ProfileStats(
        completedCount: (json['completedCount'] as int?) ?? 0,
        createdCount: (json['createdCount'] as int?) ?? 0,
        likedCount: (json['likedCount'] as int?) ?? 0,
      );
}

class UserProfile {
  final String userId;
  final String nickname;
  final String email;
  final ProfileStats stats;
  final List<CompletionRecord> recentCompletions;
  final List<CourseItem> createdCourses;

  const UserProfile({
    required this.userId,
    required this.nickname,
    required this.email,
    required this.stats,
    required this.recentCompletions,
    required this.createdCourses,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        userId: json['userId'] as String,
        nickname: json['nickname'] as String,
        email: (json['email'] as String?) ?? '',
        stats: ProfileStats.fromJson(json['stats'] as Map<String, dynamic>),
        recentCompletions: (json['recentCompletions'] as List)
            .map((j) => CompletionRecord.fromJson(j as Map<String, dynamic>))
            .toList(),
        createdCourses: (json['createdCourses'] as List)
            .map((j) => CourseItem.fromJson(j as Map<String, dynamic>))
            .toList(),
      );
}
