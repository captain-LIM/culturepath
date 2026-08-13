import '../../../core/network/api_client.dart';
import '../../course_builder/data/place_item.dart';
import 'place_detail_model.dart';

class PlaceDetailRepository {
  final ApiClient _client;

  PlaceDetailRepository({ApiClient? client}) : _client = client ?? apiClient;

  Future<PlaceDetailItem> getPlaceDetail(String contentId) async {
    final response = await _client.get('/places/$contentId');
    return PlaceDetailItem.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<List<PlaceItem>> getRelatedPlaces(String contentId) async {
    final response = await _client.get('/places/$contentId/related');
    return (response.data as List<dynamic>)
        .map((item) => PlaceItem.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }
}
