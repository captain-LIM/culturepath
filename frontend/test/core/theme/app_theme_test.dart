import 'package:culturepath/core/theme/app_theme.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('R14 approved accessible design tokens are preserved', () {
    expect(AppColors.accent.toARGB32(), 0xFFC05534);
    expect(AppColors.muted.toARGB32(), 0xFF6D6E6D);
    expect(AppColors.background.toARGB32(), 0xFFF7F3E9);
    expect(AppColors.line.toARGB32(), 0xFFDDD8CE);
  });
}
