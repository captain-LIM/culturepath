import '../../../core/network/api_client.dart';
import 'profile_model.dart';

class ProfileRepository {
  Future<UserProfile> getMyProfile() async {
    final res = await apiClient.get('/users/me/profile');
    return UserProfile.fromJson(res.data as Map<String, dynamic>);
  }

  Future<CompletionRecord> completeCourse(int courseId, {String note = ''}) async {
    final res = await apiClient.post('/courses/$courseId/complete', {'note': note});
    return CompletionRecord.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<CompletionRecord>> getMyCompletions() async {
    final res = await apiClient.get('/users/me/completions');
    return (res.data as List)
        .map((j) => CompletionRecord.fromJson(j as Map<String, dynamic>))
        .toList();
  }
}
