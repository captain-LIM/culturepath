import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EasyLocalization.ensureInitialized();
  runApp(
    EasyLocalization(
      supportedLocales: const [
        Locale('ko'),
        Locale('en'),
        Locale('ja'),
        Locale('zh'),
      ],
      path: 'assets/translations',
      fallbackLocale: const Locale('ko'),
      child: const ProviderScope(child: CulturePathApp()),
    ),
  );
}

class CulturePathApp extends StatelessWidget {
  const CulturePathApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'app_name'.tr(),
      localizationsDelegates: context.localizationDelegates,
      supportedLocales: context.supportedLocales,
      locale: context.locale,
      theme: AppTheme.light,
      routerConfig: appRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}
