import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/ai_assistant/data/ai_repository.dart';
import 'package:culturepath/features/ai_assistant/data/chat_model.dart';
import 'package:culturepath/features/ai_assistant/data/course_transform_models.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeApiClient extends ApiClient {
  final Object responseOrError;
  Map<String, dynamic>? lastPostData;
  String? lastPostPath;
  String? lastDeletePath;

  _FakeApiClient(this.responseOrError)
    : super(
        dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
        tokenLoader: () async => null,
      );

  @override
  Future<Response<dynamic>> post(
    String path,
    Map<String, dynamic> data, {
    Map<String, dynamic>? headers,
  }) async {
    lastPostPath = path;
    lastPostData = data;
    if (responseOrError is Exception) throw responseOrError;
    return Response<dynamic>(
      data: responseOrError,
      statusCode: 200,
      requestOptions: RequestOptions(path: path),
    );
  }

  @override
  Future<Response<dynamic>> delete(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    lastDeletePath = path;
    return Response<dynamic>(
      statusCode: 204,
      requestOptions: RequestOptions(path: path),
    );
  }
}

CourseItem originalCourse() => CourseItem(
  id: 1,
  title: '원본',
  description: '',
  tracks: [
    CourseTrack(
      trackNumber: 1,
      places: [
        const PlaceItem(
          contentId: '100',
          title: '장소',
          address: '',
          tel: '',
          openTime: '',
          category: '문학',
        ),
      ],
    ),
  ],
);

Map<String, dynamic> responseBody() => {
  'course': originalCourse().toJson(),
  'summary': '원본을 유지했습니다.',
  'explanation': '원본을 유지했습니다.',
  'sources': [
    {'contentId': '100', 'title': '장소'},
  ],
  'warnings': ['검증할 수 없습니다.'],
  'usage': {'model': 'test-model', 'inputTokens': 12, 'outputTokens': 3},
  'mock': true,
};

void main() {
  const sessionId = '123e4567-e89b-42d3-a456-426614174000';

  test('parses chat content and trusted place sources', () async {
    final repository = AiRepository(
      client: _FakeApiClient({
        'sessionId': sessionId,
        'action': 'discover_places',
        'content': '검증된 장소를 안내합니다.',
        'sources': [
          {
            'contentId': '129784',
            'title': '강릉 오죽헌·시립박물관',
            'address': '강원특별자치도 강릉시',
            'category': '문학',
            'region': '강릉',
          },
        ],
        'suggestedCourse': null,
      }),
    );

    final reply = await repository.chat([
      ChatMessage(
        role: 'user',
        content: '강릉 문학 장소 알려줘',
        timestamp: DateTime(2026),
      ),
    ]);

    expect(reply.content, '검증된 장소를 안내합니다.');
    expect(reply.sessionId, sessionId);
    expect(reply.action, 'discover_places');
    expect(reply.sources.single.contentId, '129784');
    expect(reply.sources.single.title, '강릉 오죽헌·시립박물관');
    expect(reply.suggestedCourse, isNull);
  });

  test('rejects chat sources without a numeric TourAPI content id', () async {
    final repository = AiRepository(
      client: _FakeApiClient({
        'sessionId': sessionId,
        'action': 'discover_places',
        'content': '응답',
        'sources': [
          {'contentId': 'external-1', 'title': '외부 장소'},
        ],
        'suggestedCourse': null,
      }),
    );

    await expectLater(
      repository.chat([
        ChatMessage(role: 'user', content: '장소 알려줘', timestamp: DateTime(2026)),
      ]),
      throwsA(
        isA<AiChatFailure>().having(
          (failure) => failure.type,
          'type',
          AiChatFailureType.invalidResponse,
        ),
      ),
    );
  });

  test('maps chat rate limits and preserves Retry-After', () async {
    final request = RequestOptions(path: '/ai/chat');
    final repository = AiRepository(
      client: _FakeApiClient(
        DioException(
          requestOptions: request,
          response: Response<dynamic>(
            requestOptions: request,
            statusCode: 429,
            headers: Headers.fromMap({
              'retry-after': ['12'],
            }),
          ),
          type: DioExceptionType.badResponse,
        ),
      ),
    );

    await expectLater(
      repository.chat([
        ChatMessage(role: 'user', content: '장소 알려줘', timestamp: DateTime(2026)),
      ]),
      throwsA(
        isA<AiChatFailure>()
            .having(
              (failure) => failure.type,
              'type',
              AiChatFailureType.rateLimited,
            )
            .having((failure) => failure.retryAfterSeconds, 'retryAfter', 12),
      ),
    );
  });

  test(
    'bounds chat history to the server contract and keeps the latest question',
    () async {
      final client = _FakeApiClient({
        'sessionId': sessionId,
        'action': 'discover_places',
        'content': '응답',
        'sources': <dynamic>[],
        'suggestedCourse': null,
      });
      final repository = AiRepository(client: client);
      final history = List.generate(
        26,
        (index) => ChatMessage(
          role: index.isEven ? 'assistant' : 'user',
          content: index == 25
              ? '최신 질문'
              : '${index.toString().padLeft(2, '0')}:${List.filled(500, '가').join()}',
          timestamp: DateTime(2026),
        ),
      );

      await repository.chat(history);

      final messages = client.lastPostData!['messages'] as List;
      expect(messages.length, lessThanOrEqualTo(AiRepository.maxChatMessages));
      expect(
        messages.fold<int>(
          0,
          (sum, item) => sum + ((item as Map)['content'] as String).length,
        ),
        lessThanOrEqualTo(AiRepository.maxChatTotalLength),
      );
      expect((messages.last as Map)['content'], '최신 질문');
      expect(client.lastPostData!['entryContext'], {'type': 'general'});
    },
  );

  test('reuses the server session and sends course entry context', () async {
    final client = _FakeApiClient({
      'sessionId': sessionId,
      'action': 'edit_course',
      'content': '변경안을 준비했습니다.',
      'sources': <dynamic>[],
      'suggestedCourse': null,
    });
    final repository = AiRepository(client: client, courseId: 42);
    final history = [
      ChatMessage(
        role: 'user',
        content: '마지막 장소를 빼줘',
        timestamp: DateTime(2026),
      ),
    ];

    await repository.chat(history);
    await repository.chat(history);

    expect(repository.sessionId, sessionId);
    expect(client.lastPostData!['sessionId'], sessionId);
    expect(client.lastPostData!['entryContext'], {
      'type': 'course',
      'courseId': 42,
    });
  });

  test(
    'updates course context after save and explicitly closes a reset session',
    () async {
      final client = _FakeApiClient({
        'sessionId': sessionId,
        'action': 'create_course_draft',
        'content': '초안을 준비했습니다.',
        'sources': <dynamic>[],
        'suggestedCourse': null,
      });
      final repository = AiRepository(client: client);
      final history = [
        ChatMessage(
          role: 'user',
          content: '코스 만들어줘',
          timestamp: DateTime(2026),
        ),
      ];

      await repository.chat(history);
      await repository.markCourseSaved(77);

      expect(repository.courseId, 77);
      expect(client.lastPostPath, '/ai/chat/sessions/$sessionId/course-saved');
      expect(client.lastPostData, {'courseId': 77});

      await repository.closeSession();
      expect(client.lastDeletePath, '/ai/chat/sessions/$sessionId');
      expect(repository.sessionId, isNull);
    },
  );

  test('parses the complete transform response contract', () async {
    final repository = AiRepository(client: _FakeApiClient(responseBody()));
    final result = await repository.editCourse(originalCourse(), '요청');

    expect(result.summary, '원본을 유지했습니다.');
    expect(result.warnings, ['검증할 수 없습니다.']);
    expect(result.sources.single.contentId, '100');
    expect(result.usage.model, 'test-model');
    expect(result.usage.inputTokens, 12);
    expect(result.mock, isTrue);
  });

  test('maps rate limits and preserves Retry-After', () async {
    final request = RequestOptions(path: '/ai/transform');
    final error = DioException(
      requestOptions: request,
      response: Response<dynamic>(
        requestOptions: request,
        statusCode: 429,
        headers: Headers.fromMap({
          'retry-after': ['27'],
        }),
      ),
      type: DioExceptionType.badResponse,
    );
    final repository = AiRepository(client: _FakeApiClient(error));

    await expectLater(
      repository.editCourse(originalCourse(), '요청'),
      throwsA(
        isA<AiTransformFailure>()
            .having(
              (failure) => failure.type,
              'type',
              AiTransformFailureType.rateLimited,
            )
            .having((failure) => failure.retryAfterSeconds, 'retryAfter', 27),
      ),
    );
  });
}
