import '../../../core/network/api_client.dart';
import 'region_model.dart';

class RegionsRepository {
  Future<List<RegionItem>> getRegionsByCulture(int cultureId) async {
    final res = await apiClient.get('/cultures/$cultureId/regions');
    final list = res.data as List<dynamic>;
    return list.map((e) => RegionItem.fromJson(e as Map<String, dynamic>)).toList();
  }
}
