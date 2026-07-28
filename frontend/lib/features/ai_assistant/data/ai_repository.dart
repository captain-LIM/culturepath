import '../../../core/network/api_client.dart';
import '../../course_builder/data/course_model.dart';
import 'chat_model.dart';

class CourseEditResult {
  final CourseItem course;
  final String explanation;
  final bool mock;
  const CourseEditResult({required this.course, required this.explanation, required this.mock});
}

class AiRepository {
  Future<({String content, Map<String, dynamic>? suggestedCourse})> chat(
      List<ChatMessage> history) async {
    final messages = history
        .where((m) => !m.isLoading)
        .map((m) => m.toApiJson())
        .toList();

    final res = await apiClient.post('/ai/chat', {'messages': messages});
    return (
      content: res.data['content'] as String,
      suggestedCourse: res.data['suggestedCourse'] as Map<String, dynamic>?,
    );
  }

  Future<CourseEditResult> editCourse(CourseItem course, String userRequest) async {
    final res = await apiClient.post('/ai/edit-course', {
      'course': course.toJson(),
      'userRequest': userRequest,
    });
    return CourseEditResult(
      course: CourseItem.fromJson(res.data['course'] as Map<String, dynamic>),
      explanation: res.data['explanation'] as String,
      mock: (res.data['mock'] as bool?) ?? false,
    );
  }
}
