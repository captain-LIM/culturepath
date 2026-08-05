import '../../course_builder/data/course_model.dart';

class AiTransformSource {
  final String contentId;
  final String title;

  const AiTransformSource({required this.contentId, required this.title});

  factory AiTransformSource.fromJson(Map<String, dynamic> json) =>
      AiTransformSource(
        contentId: json['contentId'] as String,
        title: json['title'] as String,
      );
}

class AiTransformUsage {
  final String model;
  final int inputTokens;
  final int outputTokens;

  const AiTransformUsage({
    required this.model,
    required this.inputTokens,
    required this.outputTokens,
  });

  factory AiTransformUsage.fromJson(Map<String, dynamic> json) =>
      AiTransformUsage(
        model: json['model'] as String,
        inputTokens: (json['inputTokens'] as num).toInt(),
        outputTokens: (json['outputTokens'] as num).toInt(),
      );
}

class CourseEditResult {
  final CourseItem course;
  final String summary;
  final String explanation;
  final List<AiTransformSource> sources;
  final List<String> warnings;
  final AiTransformUsage usage;
  final bool mock;

  const CourseEditResult({
    required this.course,
    required this.summary,
    required this.explanation,
    required this.sources,
    required this.warnings,
    required this.usage,
    required this.mock,
  });

  factory CourseEditResult.fromJson(Map<String, dynamic> json) =>
      CourseEditResult(
        course: CourseItem.fromJson(json['course'] as Map<String, dynamic>),
        summary: json['summary'] as String,
        explanation: (json['explanation'] as String?) ?? json['summary'] as String,
        sources: ((json['sources'] as List?) ?? const [])
            .map((item) => AiTransformSource.fromJson(item as Map<String, dynamic>))
            .toList(growable: false),
        warnings: ((json['warnings'] as List?) ?? const [])
            .map((item) => item as String)
            .toList(growable: false),
        usage: AiTransformUsage.fromJson(json['usage'] as Map<String, dynamic>),
        mock: (json['mock'] as bool?) ?? false,
      );
}

enum AiTransformFailureType {
  invalidRequest,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  serviceUnavailable,
  network,
  unknown,
}

class AiTransformFailure implements Exception {
  final AiTransformFailureType type;
  final int? retryAfterSeconds;

  const AiTransformFailure(this.type, {this.retryAfterSeconds});

  bool get canRetry => switch (type) {
        AiTransformFailureType.rateLimited ||
        AiTransformFailureType.serviceUnavailable ||
        AiTransformFailureType.network ||
        AiTransformFailureType.unknown => true,
        _ => false,
      };
}
