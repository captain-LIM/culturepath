import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';
import '../../../course_builder/data/course_repository.dart';

class FeedCourseCard extends StatefulWidget {
  final CourseItem course;
  final VoidCallback onTap;

  const FeedCourseCard({super.key, required this.course, required this.onTap});

  @override
  State<FeedCourseCard> createState() => _FeedCourseCardState();
}

class _FeedCourseCardState extends State<FeedCourseCard> {
  late bool _liked;
  late int _likeCount;
  bool _liking = false;

  @override
  void initState() {
    super.initState();
    _liked = widget.course.isLikedByMe;
    _likeCount = widget.course.likeCount;
  }

  Future<void> _toggleLike() async {
    final loggedIn = await CourseRepository().isLoggedIn();
    if (!loggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('로그인 후 좋아요를 누를 수 있습니다.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    // 낙관적 업데이트
    setState(() {
      _liked = !_liked;
      _likeCount += _liked ? 1 : -1;
      _liking = true;
    });

    try {
      final result = await CourseRepository().toggleLike(widget.course.id!);
      if (mounted) {
        setState(() {
          _liked = result['liked'] as bool;
          _likeCount = result['likeCount'] as int;
        });
      }
    } catch (_) {
      // 실패 시 롤백
      if (mounted) {
        setState(() {
          _liked = !_liked;
          _likeCount += _liked ? 1 : -1;
        });
      }
    } finally {
      if (mounted) setState(() => _liking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nonEmptyTracks = widget.course.tracks.where((t) => t.places.isNotEmpty).length;

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 작성자 + 날짜
              Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                    child: Text(
                      (widget.course.authorId ?? '?')[0].toUpperCase(),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    widget.course.authorId ?? '알 수 없음',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary,
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.chevron_right, size: 18, color: Colors.grey.shade400),
                ],
              ),
              const SizedBox(height: 10),
              // 제목
              Text(
                widget.course.title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
              if (widget.course.description.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  widget.course.description,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 12),
              // 통계 바
              Row(
                children: [
                  _StatChip(Icons.route_outlined, '트랙 $nonEmptyTracks'),
                  const SizedBox(width: 8),
                  _StatChip(Icons.place_outlined, '${widget.course.totalPlaces}곳'),
                  const SizedBox(width: 8),
                  _StatChip(Icons.call_split, '${widget.course.forkCount}'),
                  const Spacer(),
                  // 좋아요 버튼
                  GestureDetector(
                    onTap: _liking ? null : _toggleLike,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: _liked
                            ? Colors.red.withValues(alpha: 0.1)
                            : Colors.grey.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 200),
                            child: Icon(
                              _liked ? Icons.favorite : Icons.favorite_border,
                              key: ValueKey(_liked),
                              size: 16,
                              color: _liked ? Colors.red : Colors.grey.shade500,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '$_likeCount',
                            style: TextStyle(
                              fontSize: 12,
                              color: _liked ? Colors.red : Colors.grey.shade500,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _StatChip(this.icon, this.label);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.grey.shade400),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
      ],
    );
  }
}
