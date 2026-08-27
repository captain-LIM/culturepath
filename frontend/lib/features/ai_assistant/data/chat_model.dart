class ChatSource {
  final String contentId;
  final String title;
  final String address;
  final String category;
  final String region;

  const ChatSource({
    required this.contentId,
    required this.title,
    required this.address,
    required this.category,
    required this.region,
  });

  factory ChatSource.fromJson(Map<String, dynamic> json) {
    final contentId = json['contentId'];
    final title = json['title'];
    if (contentId is! String || !RegExp(r'^\d+$').hasMatch(contentId) ||
        title is! String || title.trim().isEmpty) {
      throw const FormatException('Invalid chat source');
    }
    return ChatSource(
      contentId: contentId,
      title: title.trim(),
      address: (json['address'] as String? ?? '').trim(),
      category: (json['category'] as String? ?? '').trim(),
      region: (json['region'] as String? ?? '').trim(),
    );
  }
}

class ChatReply {
  final String sessionId;
  final String action;
  final String content;
  final List<ChatSource> sources;
  final Map<String, dynamic>? suggestedCourse;

  const ChatReply({
    required this.sessionId,
    required this.action,
    required this.content,
    required this.sources,
    this.suggestedCourse,
  });
}

enum AiChatFailureType {
  unauthorized,
  rateLimited,
  serviceUnavailable,
  network,
  invalidResponse,
  unknown,
}

class AiChatFailure implements Exception {
  final AiChatFailureType type;
  final int? retryAfterSeconds;

  const AiChatFailure(this.type, {this.retryAfterSeconds});
}

class ChatMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime timestamp;
  final bool isLoading;
  final Map<String, dynamic>? suggestedCourse;
  final List<ChatSource> sources;
  final String? retryContent;

  const ChatMessage({
    required this.role,
    required this.content,
    required this.timestamp,
    this.isLoading = false,
    this.suggestedCourse,
    this.sources = const [],
    this.retryContent,
  });

  Map<String, dynamic> toApiJson() => {'role': role, 'content': content};
}
