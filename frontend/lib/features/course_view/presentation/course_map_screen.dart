import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../core/theme/app_theme.dart';
import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';

class CourseMapScreen extends StatefulWidget {
  final CourseItem course;

  const CourseMapScreen({super.key, required this.course});

  @override
  State<CourseMapScreen> createState() => _CourseMapScreenState();
}

class _CourseMapScreenState extends State<CourseMapScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: widget.course.tracks.length, vsync: this);
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
        children: widget.course.tracks.map((t) => _DayMapView(track: t)).toList(),
      ),
    );
  }
}

class _DayMapView extends StatelessWidget {
  final CourseTrack track;

  const _DayMapView({required this.track});

  List<PlaceItem> get _pinnedPlaces =>
      track.places.where((p) => p.hasCoordinates).toList();

  Set<Marker> _markersFor(List<PlaceItem> pinned) => {
        for (var i = 0; i < pinned.length; i++)
          Marker(
            markerId: MarkerId(pinned[i].contentId),
            position: LatLng(pinned[i].latitude!, pinned[i].longitude!),
            infoWindow: InfoWindow(
              title: '${i + 1}. ${pinned[i].title}',
              snippet: pinned[i].address,
            ),
          ),
      };

  LatLngBounds _boundsFor(List<PlaceItem> pinned) {
    var minLat = pinned.first.latitude!;
    var maxLat = pinned.first.latitude!;
    var minLng = pinned.first.longitude!;
    var maxLng = pinned.first.longitude!;
    for (final place in pinned) {
      final lat = place.latitude!;
      final lng = place.longitude!;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
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

    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: LatLng(pinned.first.latitude!, pinned.first.longitude!),
        zoom: 12,
      ),
      markers: _markersFor(pinned),
      myLocationButtonEnabled: false,
      onMapCreated: (controller) {
        if (pinned.length > 1) {
          controller.animateCamera(CameraUpdate.newLatLngBounds(_boundsFor(pinned), 48));
        }
      },
    );
  }
}
