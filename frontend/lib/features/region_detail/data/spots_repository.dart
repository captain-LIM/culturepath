import '../../../core/network/api_client.dart';
import 'spot_model.dart';

class SpotsRepository {
  final ApiClient _client;

  SpotsRepository({ApiClient? client}) : _client = client ?? apiClient;

  // 백엔드가 문화 필터 결과를 페이지 단위로 내려준다(X-Has-More/X-Next-Page).
  // 화면은 "이 문화에 맞는 관광지 전부"를 보여줘야 하므로, 다음 페이지가
  // 있는 동안 계속 이어붙인다. 페이지당 최대치(50)를 요청해 페이지 수를
  // 줄이고, 안전장치로 백엔드 MAX_CULTURE_PAGE와 같은 최대 페이지 수를 둔다.
  static const _maxCulturePages = 5;
  static const _numOfRows = 50;

  Future<List<SpotItem>> getSpotsByRegion(String areaCode, {String? culture}) async {
    final items = <SpotItem>[];
    var pageNo = 1;

    while (true) {
      final res = await _client.get(
        '/regions/$areaCode/spots',
        params: {
          'culture': ?culture,
          'pageNo': pageNo,
          'numOfRows': _numOfRows,
        },
      );
      final list = res.data as List<dynamic>;
      items.addAll(list.map((e) => SpotItem.fromJson(e as Map<String, dynamic>)));

      final hasMore = res.headers.value('x-has-more') == 'true';
      if (!hasMore || pageNo >= _maxCulturePages) break;
      pageNo += 1;
    }

    return items;
  }
}
