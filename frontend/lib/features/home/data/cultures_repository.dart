import '../../../core/network/api_client.dart';
import 'culture_model.dart';

class CulturesRepository {
  Future<List<CultureCategory>> getCultures() async {
    final res = await apiClient.get('/cultures');
    final list = res.data as List<dynamic>;
    return list.map((e) => CultureCategory.fromJson(e as Map<String, dynamic>)).toList();
  }
}
