import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../course_builder/data/place_item.dart';

// 전체 지도 화면과 코스 상세의 미리보기 지도가 함께 쓰는 헬퍼.
// 코스 상세 타임라인과 동일한 번호 원 스타일(첫 장소는 강조색 채움, 나머지는
// 테두리만)로 마커를 그려 순서를 한눈에 보이게 한다.
final Map<String, BitmapDescriptor> _numberedMarkerCache = {};

Future<BitmapDescriptor> numberedMarkerIcon(int number, {required bool highlighted}) async {
  final cacheKey = '$number-$highlighted';
  final cached = _numberedMarkerCache[cacheKey];
  if (cached != null) return cached;

  const rawSize = 108.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  const center = Offset(rawSize / 2, rawSize / 2);
  const radius = rawSize / 2 - 6;

  canvas.drawCircle(
    center,
    radius,
    Paint()..color = highlighted ? AppColors.accent : AppColors.surface,
  );
  canvas.drawCircle(
    center,
    radius,
    Paint()
      ..color = highlighted ? AppColors.accent : AppColors.line
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5,
  );

  final textPainter = TextPainter(
    text: TextSpan(
      text: '$number',
      style: TextStyle(
        fontSize: 44,
        fontWeight: FontWeight.bold,
        color: highlighted ? Colors.white : AppColors.muted,
      ),
    ),
    textDirection: ui.TextDirection.ltr,
  )..layout();
  textPainter.paint(
    canvas,
    Offset(center.dx - textPainter.width / 2, center.dy - textPainter.height / 2),
  );

  final image = await recorder.endRecording().toImage(rawSize.toInt(), rawSize.toInt());
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  final icon = BitmapDescriptor.bytes(
    bytes!.buffer.asUint8List(),
    width: 36,
    height: 36,
  );
  _numberedMarkerCache[cacheKey] = icon;
  return icon;
}

LatLngBounds boundsForPlaces(List<PlaceItem> pinned) {
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
