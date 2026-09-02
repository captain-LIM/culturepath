import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../course_builder/data/course_model.dart';
import 'chat_model.dart';
import 'course_transform_models.dart';

class AiRepository {
  static const maxChatMessages = 20;
  static const maxChatMessageLength = 2000;
  static const maxChatTotalLength = 8000;
  static const maxReportContentLength = 10000;
  static const maxReportReasonLength = 500;

  final ApiClient _client;
  int? _courseId;
  String? _sessionId;

  AiRepository({ApiClient? client, int? courseId})
    : _client = client ?? apiClient,
      _courseId = courseId;

  int? get courseId => _courseId;
  String? get sessionId => _sessionId;

  Future<ChatReply> chat(List<ChatMessage> history) async {
    try {
      final messages = _boundedChatMessages(history);
      final res = await _client.post('/ai/chat', {
        'messages': messages,
        if (_sessionId != null) 'sessionId': _sessionId,
        'entryContext': {
          'type': courseId == null ? 'general' : 'course',
          if (courseId != null) 'courseId': courseId,
        },
      });
      final data = res.data;
      if (data is! Map<String, dynamic> ||
          data['content'] is! String ||
          (data['content'] as String).trim().isEmpty ||
          data['sources'] is! List ||
          data['sessionId'] is! String ||
          data['action'] is! String) {
        throw const AiChatFailure(AiChatFailureType.invalidResponse);
      }
      final responseSessionId = (data['sessionId'] as String).trim();
      final action = (data['action'] as String).trim();
      if (!RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            caseSensitive: false,
          ).hasMatch(responseSessionId) ||
          action.isEmpty ||
          (_sessionId != null && _sessionId != responseSessionId)) {
        throw const AiChatFailure(AiChatFailureType.invalidResponse);
      }
      final sources = (data['sources'] as List)
          .map((item) {
            if (item is! Map) {
              throw const FormatException('Invalid chat source');
            }
            return ChatSource.fromJson(item.cast<String, dynamic>());
          })
          .toList(growable: false);
      final suggested = data['suggestedCourse'];
      if (suggested != null && suggested is! Map) {
        throw const AiChatFailure(AiChatFailureType.invalidResponse);
      }
      final suggestedMap = suggested == null
          ? null
          : (suggested as Map).cast<String, dynamic>();
      if (suggestedMap != null) CourseItem.fromJson(suggestedMap);
      _sessionId = responseSessionId;
      return ChatReply(
        sessionId: responseSessionId,
        action: action,
        content: (data['content'] as String).trim(),
        sources: sources,
        suggestedCourse: suggestedMap,
      );
    } on DioException catch (error) {
      throw _mapChatFailure(error);
    } on AiChatFailure {
      rethrow;
    } on FormatException {
      throw const AiChatFailure(AiChatFailureType.invalidResponse);
    } on TypeError {
      throw const AiChatFailure(AiChatFailureType.invalidResponse);
    }
  }

  Future<void> closeSession() async {
    final id = _sessionId;
    _sessionId = null;
    if (id == null) return;
    try {
      await _client.delete('/ai/chat/sessions/$id');
    } on DioException {
      // 서버 세션은 TTL로도 만료된다. 로컬 초기화는 네트워크 실패와 무관하게 진행한다.
    }
  }

  Future<void> markCourseSaved(int savedCourseId) async {
    _courseId = savedCourseId;
    final id = _sessionId;
    if (id == null) return;
    try {
      await _client.post('/ai/chat/sessions/$id/course-saved', {
        'courseId': savedCourseId,
      });
    } on DioException {
      // 저장 자체는 이미 완료됐다. 동기화 실패는 다음 대화에서 코스를 다시 읽어 복구한다.
    }
  }

  Future<void> reportContent(String content, {String reason = ''}) async {
    final normalizedContent = content.trim();
    final normalizedReason = reason.trim();
    if (normalizedContent.isEmpty ||
        normalizedContent.length > maxReportContentLength) {
      throw ArgumentError.value(content, 'content', 'Invalid report content');
    }
    if (normalizedReason.length > maxReportReasonLength) {
      throw ArgumentError.value(reason, 'reason', 'Report reason is too long');
    }

    final response = await _client.post('/ai/reports', {
      if (_sessionId != null) 'sessionId': _sessionId,
      'content': normalizedContent,
      if (normalizedReason.isNotEmpty) 'reason': normalizedReason,
    });
    final data = response.data;
    if (data is! Map ||
        data['id'] is! num ||
        (data['id'] as num).toInt() <= 0 ||
        data['status'] != 'received') {
      throw const FormatException('Invalid AI report response');
    }
  }

  List<Map<String, dynamic>> _boundedChatMessages(List<ChatMessage> history) {
    final selected = <Map<String, dynamic>>[];
    var totalLength = 0;
    final candidates = history.where(
      (message) => !message.isLoading && message.retryContent == null,
    );

    for (final message in candidates.toList().reversed) {
      final trimmed = message.content.trim();
      if (trimmed.isEmpty) continue;
      final content = trimmed.length > maxChatMessageLength
          ? trimmed.substring(0, maxChatMessageLength)
          : trimmed;
      if (selected.length >= maxChatMessages ||
          totalLength + content.length > maxChatTotalLength) {
        break;
      }
      selected.add({'role': message.role, 'content': content});
      totalLength += content.length;
    }

    return selected.reversed.toList(growable: false);
  }

  AiChatFailure _mapChatFailure(DioException error) {
    final status = error.response?.statusCode;
    if (status == 401) {
      return const AiChatFailure(AiChatFailureType.unauthorized);
    }
    if (status == 429) {
      final value = error.response?.headers.value('retry-after');
      return AiChatFailure(
        AiChatFailureType.rateLimited,
        retryAfterSeconds: int.tryParse(value ?? ''),
      );
    }
    if (status == 502 || status == 503 || status == 504) {
      return const AiChatFailure(AiChatFailureType.serviceUnavailable);
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const AiChatFailure(AiChatFailureType.network);
    }
    return const AiChatFailure(AiChatFailureType.unknown);
  }

  Future<CourseEditResult> editCourse(
    CourseItem course,
    String userRequest,
  ) async {
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
      return const AiTransformFailure(
        AiTransformFailureType.serviceUnavailable,
      );
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
