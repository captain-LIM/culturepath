import '../../../core/network/api_client.dart';
import 'spot_model.dart';

class SpotsRepository {
  Future<List<SpotItem>> getSpotsByRegion(String areaCode, {String? culture}) async {
    final res = await apiClient.get(
      '/regions/$areaCode/spots',
      params: culture != null ? {'culture': culture} : null,
    );
    final list = res.data as List<dynamic>;
    return list.map((e) => SpotItem.fromJson(e as Map<String, dynamic>)).toList();
  }
}
