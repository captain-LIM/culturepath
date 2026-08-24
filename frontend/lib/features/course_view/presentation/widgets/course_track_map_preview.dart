import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/course_model.dart';
import '../../../course_builder/data/place_item.dart';
import '../course_map_screen.dart';
import 'course_map_helpers.dart';

// 코스 상세 화면 상단에 붙는 미리보기 지도. 조작은 막고 탭하면 전체 지도
// 화면(CourseMapScreen)으로 넘어가게 해서, 지도가 눈에 띄면서도 리스트
// 스크롤과 제스처가 충돌하지 않게 한다.
class CourseTrackMapPreview extends StatefulWidget {
  final CourseItem course;
  final CourseTrack track;

  const CourseTrackMapPreview({super.key, required this.course, required this.track});

  @override
  State<CourseTrackMapPreview> createState() => _CourseTrackMapPreviewState();
}

class _CourseTrackMapPreviewState extends State<CourseTrackMapPreview> {
  late final Future<Set<Marker>> _markersFuture;

  List<PlaceItem> get _pinnedPlaces =>
      widget.track.places.where((p) => p.hasCoordinates).toList();

  @override
  void initState() {
    super.initState();
    _markersFuture = _buildMarkers(_pinnedPlaces);
  }

  Future<Set<Marker>> _buildMarkers(List<PlaceItem> pinned) async {
    final markers = <Marker>{};
    for (var i = 0; i < pinned.length; i++) {
      final icon = await numberedMarkerIcon(i + 1, highlighted: i == 0);
      markers.add(Marker(
        markerId: MarkerId(pinned[i].contentId),
        position: LatLng(pinned[i].latitude!, pinned[i].longitude!),
        icon: icon,
        anchor: const Offset(0.5, 0.5),
      ));
    }
    return markers;
  }

  Polyline _routeFor(List<PlaceItem> pinned) => Polyline(
        polylineId: const PolylineId('preview-route'),
        points: [for (final p in pinned) LatLng(p.latitude!, p.longitude!)],
        color: AppColors.accent,
        width: 3,
        patterns: [PatternItem.dash(16), PatternItem.gap(8)],
      );

  void _openFullMap() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CourseMapScreen(course: widget.course)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pinned = _pinnedPlaces;
    if (pinned.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 180,
          child: Stack(
            fit: StackFit.expand,
            children: [
              IgnorePointer(
                child: FutureBuilder<Set<Marker>>(
                  future: _markersFuture,
                  builder: (context, snapshot) {
                    final markers = snapshot.data ?? const <Marker>{};
                    return GoogleMap(
                      initialCameraPosition: CameraPosition(
                        target: LatLng(pinned.first.latitude!, pinned.first.longitude!),
                        zoom: 13,
                      ),
                      markers: markers,
                      polylines: pinned.length > 1 ? {_routeFor(pinned)} : {},
                      zoomControlsEnabled: false,
                      zoomGesturesEnabled: false,
                      scrollGesturesEnabled: false,
                      rotateGesturesEnabled: false,
                      tiltGesturesEnabled: false,
                      myLocationButtonEnabled: false,
                      liteModeEnabled: false,
                      onMapCreated: (controller) {
                        if (pinned.length > 1) {
                          controller.animateCamera(
                            CameraUpdate.newLatLngBounds(boundsForPlaces(pinned), 32),
                          );
                        }
                      },
                    );
                  },
                ),
              ),
              Positioned.fill(
                child: Material(
                  type: MaterialType.transparency,
                  child: InkWell(
                    onTap: _openFullMap,
                    child: Container(
                      alignment: Alignment.bottomRight,
                      padding: const EdgeInsets.all(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.fullscreen, size: 14, color: Colors.white),
                            const SizedBox(width: 4),
                            Text(
                              'course_map_expand'.tr(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
