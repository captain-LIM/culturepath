import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';
import '../../../course_builder/data/course_repository.dart';

class FeedCourseCard extends StatefulWidget {
  final CourseItem course;
  final VoidCallback onTap;
  final String? eyebrow;
  final bool showLike;

  const FeedCourseCard({
    super.key,
    required this.course,
    required this.onTap,
    this.eyebrow,
    this.showLike = true,
  });

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
    if (widget.course.id == null) return;
    final repository = CourseRepository();
    final loggedIn = await repository.isLoggedIn();
    if (!mounted) return;
    if (!loggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('로그인 후 좋아요를 누를 수 있습니다.')),
      );
      return;
    }

    setState(() {
      _liked = !_liked;
      _likeCount += _liked ? 1 : -1;
      _liking = true;
    });
    try {
      final result = await repository.toggleLike(widget.course.id!);
      if (mounted) {
        setState(() {
          _liked = result['liked'] as bool;
          _likeCount = result['likeCount'] as int;
        });
      }
    } catch (_) {
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
    final course = widget.course;
    final days = course.tracks.where((track) => track.places.isNotEmpty).length;
    return Semantics(
      button: true,
      label: course.title,
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(AppRadius.surface),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadius.surface),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(width: 3, height: 76, color: AppColors.accent),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.eyebrow != null) ...[
                      Text(
                        widget.eyebrow!,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                    ],
                    Text(
                      course.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (course.description.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        course.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xxs,
                      children: [
                        _Metadata(icon: Icons.calendar_today_outlined, label: 'Day $days'),
                        _Metadata(icon: Icons.place_outlined, label: '${course.totalPlaces}곳'),
                        if (course.authorId != null)
                          _Metadata(icon: Icons.person_outline, label: course.authorId!),
                      ],
                    ),
                  ],
                ),
              ),
              if (widget.showLike)
                Semantics(
                  button: true,
                  toggled: _liked,
                  child: IconButton(
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    onPressed: _liking ? null : _toggleLike,
                    icon: Icon(
                      _liked ? Icons.favorite : Icons.favorite_border,
                      color: _liked ? AppColors.danger : AppColors.muted,
                    ),
                    tooltip: '$_likeCount',
                  ),
                )
              else
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.sm),
                  child: Icon(Icons.arrow_forward, size: 20, color: AppColors.muted),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Metadata extends StatelessWidget {
  final IconData icon;
  final String label;

  const _Metadata({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.muted),
          const SizedBox(width: AppSpacing.xxs),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      );
}
