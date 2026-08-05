import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/ai_assistant/data/ai_repository.dart';
import 'package:culturepath/features/ai_assistant/data/course_transform_models.dart';
import 'package:culturepath/features/course_builder/data/course_model.dart';
import 'package:culturepath/features/course_builder/data/place_item.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeApiClient extends ApiClient {
  final Object responseOrError;

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
    if (responseOrError is Exception) throw responseOrError;
    return Response<dynamic>(
      data: responseOrError,
      statusCode: 200,
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
      'usage': {
        'model': 'test-model',
        'inputTokens': 12,
        'outputTokens': 3,
      },
      'mock': true,
    };

void main() {
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
      throwsA(isA<AiTransformFailure>()
          .having((failure) => failure.type, 'type',
              AiTransformFailureType.rateLimited)
          .having((failure) => failure.retryAfterSeconds, 'retryAfter', 27)),
    );
  });
}
