import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const primary = Color(0xFF2B2D42);     // 딥 네이비 (잉크)
  static const background = Color(0xFFF7F3E9);  // 웜 크림 (종이)
  static const accent = Color(0xFFC75B39);       // 테라코타
  static const accentGold = Color(0xFFD9A441);  // 머스타드 골드
  static const textDark = Color(0xFF1E1E1E);     // 차콜
  static const surface = Color(0xFFFFFFFF);
}

class AppTheme {
  static ThemeData get light => ThemeData(
        colorScheme: ColorScheme.light(
          primary: AppColors.primary,
          secondary: AppColors.accent,
          surface: AppColors.surface,
          onPrimary: Colors.white,
          onSurface: AppColors.textDark,
        ),
        scaffoldBackgroundColor: AppColors.background,
        textTheme: GoogleFonts.notoSansKrTextTheme().copyWith(
          displayLarge: GoogleFonts.notoSerifKr(
            fontSize: 28,
            fontWeight: FontWeight.bold,
            color: AppColors.textDark,
          ),
          titleLarge: GoogleFonts.notoSerifKr(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: AppColors.textDark,
          ),
          bodyMedium: GoogleFonts.notoSansKr(
            fontSize: 14,
            color: AppColors.textDark,
          ),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: AppColors.background,
          foregroundColor: AppColors.primary,
          elevation: 0,
          titleTextStyle: GoogleFonts.notoSerifKr(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.primary,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDDD8CE)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDDD8CE)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
      );
}
