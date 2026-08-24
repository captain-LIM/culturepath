import 'dart:math';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';
import 'widgets/course_map_helpers.dart';

// course_track_view.dart와 동일하게, TourAPI가 아닌 임의 ID의 장소는
// 상세 페이지가 없으므로 이동하지 않고 안내만 보여준다.
final _numericContentId = RegExp(r'^\d+$');

class CourseMapScreen extends StatefulWidget {
  final CourseItem course;

  const CourseMapScreen({super.key, required this.course});

  @override
  State<CourseMapScreen> createState() => _CourseMapScreenState();
}

class _CourseMapScreenState extends State<CourseMapScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  bool _locationEnabled = false;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: widget.course.tracks.length, vsync: this);
    _requestLocationPermission();
  }

  Future<void> _requestLocationPermission() async {
    final status = await Permission.locationWhenInUse.request();
    if (mounted) {
      setState(() => _locationEnabled = status.isGranted);
    }
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'course_map_title'.tr(),
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
        bottom: TabBar(
          controller: _tabCtrl,
          indicatorColor: AppColors.accentGold,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: widget.course.tracks.map((t) => Tab(text: 'Day ${t.trackNumber}')).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: widget.course.tracks
            .map((t) => _DayMapView(track: t, locationEnabled: _locationEnabled))
            .toList(),
      ),
    );
  }
}

double _deg2rad(double deg) => deg * (pi / 180);

double _haversineMeters(LatLng a, LatLng b) {
  const earthRadius = 6371000.0;
  final dLat = _deg2rad(b.latitude - a.latitude);
  final dLon = _deg2rad(b.longitude - a.longitude);
  final sinDLat = sin(dLat / 2);
  final sinDLon = sin(dLon / 2);
  final h = sinDLat * sinDLat +
      cos(_deg2rad(a.latitude)) * cos(_deg2rad(b.latitude)) * sinDLon * sinDLon;
  return earthRadius * 2 * atan2(sqrt(h), sqrt(1 - h));
}

String _formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()}m';
  return '${(meters / 1000).toStringAsFixed(1)}km';
}

class _DayMapView extends StatefulWidget {
  final CourseTrack track;
  final bool locationEnabled;

  const _DayMapView({required this.track, required this.locationEnabled});

  @override
  State<_DayMapView> createState() => _DayMapViewState();
}

class _DayMapViewState extends State<_DayMapView> {
  late final Future<Set<Marker>> _markersFuture;
  GoogleMapController? _controller;

  List<PlaceItem> get _pinnedPlaces =>
      widget.track.places.where((p) => p.hasCoordinates).toList();

  @override
  void initState() {
    super.initState();
    _markersFuture = _markersFor(_pinnedPlaces);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _zoomIn() => _controller?.animateCamera(CameraUpdate.zoomIn());
  void _zoomOut() => _controller?.animateCamera(CameraUpdate.zoomOut());

  void _openPlaceDetail(PlaceItem place) {
    if (!mounted) return;
    if (_numericContentId.hasMatch(place.contentId)) {
      context.push('/places/${place.contentId}', extra: place);
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('place_detail_unavailable'.tr()),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<Set<Marker>> _markersFor(List<PlaceItem> pinned) async {
    final markers = <Marker>{};
    for (var i = 0; i < pinned.length; i++) {
      final icon = await numberedMarkerIcon(i + 1, highlighted: i == 0);
      markers.add(Marker(
        markerId: MarkerId(pinned[i].contentId),
        position: LatLng(pinned[i].latitude!, pinned[i].longitude!),
        icon: icon,
        anchor: const Offset(0.5, 0.5),
        infoWindow: InfoWindow(
          title: '${i + 1}. ${pinned[i].title}',
          snippet: pinned[i].address,
          onTap: () => _openPlaceDetail(pinned[i]),
        ),
      ));
    }
    return markers;
  }

  Polyline _routeFor(List<PlaceItem> pinned) => Polyline(
        polylineId: const PolylineId('route'),
        points: [for (final p in pinned) LatLng(p.latitude!, p.longitude!)],
        color: AppColors.accent,
        width: 4,
        patterns: [PatternItem.dash(20), PatternItem.gap(10)],
      );

  List<double> _legDistances(List<PlaceItem> pinned) {
    final legs = <double>[];
    for (var i = 0; i < pinned.length - 1; i++) {
      final a = LatLng(pinned[i].latitude!, pinned[i].longitude!);
      final b = LatLng(pinned[i + 1].latitude!, pinned[i + 1].longitude!);
      legs.add(_haversineMeters(a, b));
    }
    return legs;
  }

  @override
  Widget build(BuildContext context) {
    final pinned = _pinnedPlaces;

    if (pinned.isEmpty) {
      return Center(
        child: Text(
          'course_map_no_coordinates'.tr(),
          style: TextStyle(color: Colors.grey.shade500),
        ),
      );
    }

    final legs = _legDistances(pinned);
    final total = legs.fold(0.0, (sum, d) => sum + d);

    return FutureBuilder<Set<Marker>>(
      future: _markersFuture,
      builder: (context, snapshot) {
        final markers = snapshot.data ?? const <Marker>{};
        return Stack(
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(pinned.first.latitude!, pinned.first.longitude!),
                zoom: 12,
              ),
              markers: markers,
              polylines: pinned.length > 1 ? {_routeFor(pinned)} : {},
              myLocationEnabled: widget.locationEnabled,
              myLocationButtonEnabled: widget.locationEnabled,
              zoomControlsEnabled: false,
              // 내 위치 버튼은 기본적으로 우측 상단에 붙는데, 우리가 그린
              // 확대/축소 버튼과 같은 자리라 아래로 밀어 겹치지 않게 한다.
              padding: const EdgeInsets.only(top: 96),
              gestureRecognizers: {
                Factory<EagerGestureRecognizer>(() => EagerGestureRecognizer()),
              },
              onMapCreated: (controller) {
                _controller = controller;
                if (pinned.length > 1) {
                  controller.animateCamera(CameraUpdate.newLatLngBounds(boundsForPlaces(pinned), 48));
                }
              },
            ),
            Positioned(
              right: 12,
              top: 12,
              child: SafeArea(
                bottom: false,
                child: _MapZoomControls(onZoomIn: _zoomIn, onZoomOut: _zoomOut),
              ),
            ),
            if (legs.isNotEmpty)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SafeArea(
                  top: false,
                  child: _RouteDistancePanel(pinned: pinned, legs: legs, total: total),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _MapZoomControls extends StatelessWidget {
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;

  const _MapZoomControls({required this.onZoomIn, required this.onZoomOut});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ZoomButton(icon: Icons.add, onTap: onZoomIn),
          Container(height: 1, color: AppColors.line),
          _ZoomButton(icon: Icons.remove, onTap: onZoomOut),
        ],
      ),
    );
  }
}

class _ZoomButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _ZoomButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icon, size: 20, color: AppColors.primary),
          ),
        ),
      );
}

class _RouteDistancePanel extends StatelessWidget {
  final List<PlaceItem> pinned;
  final List<double> legs;
  final double total;

  const _RouteDistancePanel({required this.pinned, required this.legs, required this.total});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.directions_walk, size: 16, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(
                'course_map_total_distance'.tr(namedArgs: {'distance': _formatDistance(total)}),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 30,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: legs.length,
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (_, i) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  '${i + 1} → ${i + 2}  ${_formatDistance(legs[i])}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade700, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'course_map_distance_note'.tr(),
            style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
          ),
        ],
      ),
    );
  }
}
