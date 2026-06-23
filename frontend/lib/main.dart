import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: CulturePathApp()));
}

class CulturePathApp extends StatelessWidget {
  const CulturePathApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '문화여행',
      theme: AppTheme.light,
      routerConfig: appRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}
