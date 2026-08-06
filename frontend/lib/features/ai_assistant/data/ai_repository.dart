import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../course_builder/data/course_model.dart';
import 'chat_model.dart';
import 'course_transform_models.dart';

class AiRepository {
  final ApiClient _client;

  AiRepository({ApiClient? client}) : _client = client ?? apiClient;

  Future<({String content, Map<String, dynamic>? suggestedCourse})> chat(
      List<ChatMessage> history) async {
    final messages = history
        .where((m) => !m.isLoading)
        .map((m) => m.toApiJson())
        .toList();

    final res = await _client.post('/ai/chat', {'messages': messages});
    return (
      content: res.data['content'] as String,
      suggestedCourse: res.data['suggestedCourse'] as Map<String, dynamic>?,
    );
  }

  Future<CourseEditResult> editCourse(CourseItem course, String userRequest) async {
    try {
      final res = await _client.post('/ai/transform', {
        'courseId': course.id,
        'request': userRequest,
        'constraints': <String, dynamic>{},
      });
      return CourseEditResult.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _mapFailure(error);
    } on FormatException {
      throw const AiTransformFailure(AiTransformFailureType.unknown);
    } on TypeError {
      throw const AiTransformFailure(AiTransformFailureType.unknown);
    }
  }

  AiTransformFailure _mapFailure(DioException error) {
    final status = error.response?.statusCode;
    if (status == 400) {
      return const AiTransformFailure(AiTransformFailureType.invalidRequest);
    }
    if (status == 401) {
      return const AiTransformFailure(AiTransformFailureType.unauthorized);
    }
    if (status == 403) {
      return const AiTransformFailure(AiTransformFailureType.forbidden);
    }
    if (status == 404) {
      return const AiTransformFailure(AiTransformFailureType.notFound);
    }
    if (status == 429) {
      final value = error.response?.headers.value('retry-after');
      return AiTransformFailure(
        AiTransformFailureType.rateLimited,
        retryAfterSeconds: int.tryParse(value ?? ''),
      );
    }
    if (status == 502 || status == 503 || status == 504) {
      return const AiTransformFailure(AiTransformFailureType.serviceUnavailable);
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const AiTransformFailure(AiTransformFailureType.network);
    }
    return const AiTransformFailure(AiTransformFailureType.unknown);
  }
}
