import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/i18n/category_localization.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/place_network_image.dart';
import '../../../course_builder/data/course_model.dart';
import '../../../place_detail/data/place_detail_model.dart';
import '../../../place_detail/data/place_detail_repository.dart';

final _numericContentId = RegExp(r'^\d+$');

// 추천 코스·저장된 코스의 장소 카드는 서버 없이 만들어질 때(추천 코스는
// Dart 상수로 고정 데이터, 사용자 코스는 저장 시점 스냅샷)의 title·
// address·region이 항상 국문이다. 실제 TourAPI contentId가 있는 장소는
// 상세 화면과 같은 번역 파이프라인을 그대로 태워 현재 언어로 보여준다.
//
// keepAlive를 쓰지 않는다 — LLM 기계번역은 외부 API 부하로 가끔 국문
// 그대로 실패할 수 있는데(백엔드가 그 실패는 캐시하지 않아 다음 조회에서
// 재시도하지만), keepAlive를 걸면 그 실패한 결과를 이 화면이 켜져 있는
// 동안 계속 재사용하게 된다. 코스 화면을 나갔다 다시 들어오면 자연히
// 다시 조회되므로, 지역 목록(spotsProvider)과 달리 여기선 재요청 비용이
// 문제되지 않는다.
final _courseTrackPlaceTranslationProvider =
    FutureProvider.family<PlaceDetailItem?, ({String contentId, String lang})>(
  (ref, args) async {
    try {
      return await PlaceDetailRepository().getPlaceDetail(args.contentId);
    } catch (_) {
      return null;
    }
  },
);

class CourseTrackView extends ConsumerWidget {
  final CourseTrack track;

  const CourseTrackView({super.key, required this.track});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (track.places.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(
          'track_no_places'.tr(),
          style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
        ),
      );
    }

    return Column(
      children: List.generate(track.places.length, (i) {
        final place = track.places[i];
        final isNumericId = _numericContentId.hasMatch(place.contentId);
        final translated = isNumericId && appLocaleCode != 'ko'
            ? ref.watch(_courseTrackPlaceTranslationProvider(
                (contentId: place.contentId, lang: appLocaleCode),
              )).valueOrNull
            : null;
        final displayTitle = translated?.title ?? place.title;
        final displayAddress = (translated?.address.isNotEmpty ?? false)
            ? translated!.address
            : place.address;
        final displayRegion = translated?.region ?? place.region;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 타임라인 라인 + 번호
            SizedBox(
              width: 48,
              child: Column(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: i == 0 ? AppColors.accent : AppColors.surface,
                      shape: BoxShape.circle,
                      border: Border.all(color: i == 0 ? AppColors.accent : AppColors.line),
                    ),
                    child: Center(
                      child: Text(
                        '${i + 1}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: i == 0 ? Colors.white : AppColors.muted,
                        ),
                      ),
                    ),
                  ),
                  if (i < track.places.length - 1)
                    Container(width: 1, height: 56, color: AppColors.line),
                ],
              ),
            ),
            // 장소 카드
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: i < track.places.length - 1 ? 0 : 8),
                child: InkWell(
                  onTap: () {
                    if (isNumericId) {
                      context.push('/places/${place.contentId}', extra: place);
                      return;
                    }
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('place_detail_unavailable'.tr()),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                  child: Container(
                    margin: const EdgeInsets.only(right: 16, bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      color: AppColors.surface,
                      border: Border(bottom: BorderSide(color: AppColors.line)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 72,
                          height: 72,
                          child: PlaceNetworkImage(
                            placeTitle: displayTitle,
                            thumbnailUrl: place.thumbnailUrl,
                            imageUrl: place.imageUrl,
                            borderRadius: BorderRadius.circular(AppRadius.image),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                displayTitle,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.primary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Text(
                                    localizedCategory(place.category),
                                    style: const TextStyle(fontSize: 11, color: AppColors.accent),
                                  ),
                                  if (displayRegion != null) ...[
                                    const SizedBox(width: 6),
                                    Text(
                                      displayRegion,
                                      style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                                    ),
                                  ],
                                ],
                              ),
                              if (displayAddress.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  displayAddress,
                                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}
