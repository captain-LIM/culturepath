import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// R14에서 접근성 검수까지 마친 CulturePath 디자인 토큰이다.
class AppColors {
  static const primary = Color(0xFF2B2D42);
  static const background = Color(0xFFFFFFFF);
  static const surface = Color(0xFFFFFFFF);
  static const accent = Color(0xFFC05534);
  static const accentGold = Color(0xFFD9A441);
  static const textDark = Color(0xFF1E1E1E);
  static const muted = Color(0xFF6D6E6D);
  static const line = Color(0xFFDDD8CE);
  static const success = Color(0xFF3F6B50);
  static const danger = Color(0xFFA33D32);
}

class AppSpacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const xxxl = 40.0;
}

class AppRadius {
  static const surface = 8.0;
  static const control = 10.0;
  static const image = 12.0;
}

class AppTheme {
  static ThemeData get light {
    final bodyTheme = GoogleFonts.notoSansKrTextTheme();
    final heading = GoogleFonts.notoSansKr;

    return ThemeData(
      useMaterial3: true,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.surface,
        error: AppColors.danger,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: AppColors.textDark,
        onError: Colors.white,
        outline: AppColors.line,
      ),
      scaffoldBackgroundColor: AppColors.background,
      dividerColor: AppColors.line,
      textTheme: bodyTheme.copyWith(
        displayLarge: heading(
          fontSize: 28,
          height: 1.3,
          fontWeight: FontWeight.w900,
          color: AppColors.textDark,
        ),
        headlineMedium: heading(
          fontSize: 22,
          height: 1.35,
          fontWeight: FontWeight.w800,
          color: AppColors.textDark,
        ),
        titleLarge: heading(
          fontSize: 20,
          height: 1.4,
          fontWeight: FontWeight.w800,
          color: AppColors.textDark,
        ),
        titleMedium: bodyTheme.titleMedium?.copyWith(
          fontSize: 16,
          height: 1.45,
          fontWeight: FontWeight.w700,
          color: AppColors.textDark,
        ),
        bodyLarge: bodyTheme.bodyLarge?.copyWith(
          fontSize: 16,
          height: 1.6,
          color: AppColors.textDark,
        ),
        bodyMedium: bodyTheme.bodyMedium?.copyWith(
          fontSize: 14,
          height: 1.55,
          color: AppColors.textDark,
        ),
        bodySmall: bodyTheme.bodySmall?.copyWith(
          fontSize: 12,
          height: 1.5,
          color: AppColors.muted,
        ),
        labelLarge: bodyTheme.labelLarge?.copyWith(
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.primary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: heading(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: AppColors.primary,
        ),
      ),
      cardTheme: const CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.surface)),
          side: BorderSide(color: AppColors.line),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(44, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.control),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(44, 48),
          side: const BorderSide(color: AppColors.line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.control),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accent,
          minimumSize: const Size(44, 44),
        ),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.control)),
          borderSide: BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.control)),
          borderSide: BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.control)),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
      ),
    );
  }
}
