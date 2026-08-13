import 'package:culturepath/core/network/api_client.dart';
import 'package:culturepath/features/place_detail/data/place_detail_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingApiClient extends ApiClient {
  final Map<String, dynamic> responses;
  final List<String> paths = [];

  _RecordingApiClient(this.responses)
      : super(
          dio: Dio(BaseOptions(baseUrl: 'https://api.example.test')),
          tokenLoader: () async => null,
        );

  @override
  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? params,
  }) async {
    paths.add(path);
    return Response<dynamic>(
      data: responses[path],
      statusCode: 200,
      requestOptions: RequestOptions(path: path),
    );
  }
}

Map<String, dynamic> detailJson({int imageCount = 1}) => {
      'contentId': '2390314',
      'title': '경복궁',
      'address': '서울특별시 종로구',
      'tel': '',
      'openTime': '09:00~18:00',
      'category': '근대 문화유산',
      'overview': '궁궐 소개',
      'imageUrl': 'https://example.com/main.jpg',
      'thumbnailUrl': 'https://example.com/main-thumb.jpg',
      'images': List.generate(
        imageCount,
        (index) => {
          'imageUrl': 'https://example.com/$index.jpg',
          'thumbnailUrl': null,
          'name': null,
          'copyrightType': 'Type3',
          'serialNumber': '$index',
        },
      ),
    };

void main() {
  test('loads detail and related places through the public place routes', () async {
    final client = _RecordingApiClient({
      '/places/2390314': detailJson(),
      '/places/2390314/related': [
        {
          'contentId': '2',
          'title': '연관 장소',
          'address': '',
          'tel': '',
          'openTime': '',
          'category': '문학',
          'imageUrl': null,
          'thumbnailUrl': null,
        },
      ],
    });
    final repository = PlaceDetailRepository(client: client);

    final detail = await repository.getPlaceDetail('2390314');
    final related = await repository.getRelatedPlaces('2390314');

    expect(detail.title, '경복궁');
    expect(detail.images.single.copyrightType, 'Type3');
    expect(related.single.title, '연관 장소');
    expect(client.paths, [
      '/places/2390314',
      '/places/2390314/related',
    ]);
  });
}
