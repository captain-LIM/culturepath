import '../../../core/network/api_client.dart';
import 'chat_model.dart';

class AiRepository {
  Future<String> chat(List<ChatMessage> history) async {
    final messages = history
        .where((m) => !m.isLoading)
        .map((m) => m.toApiJson())
        .toList();

    final res = await apiClient.post('/ai/chat', {'messages': messages});
    return res.data['content'] as String;
  }
}
