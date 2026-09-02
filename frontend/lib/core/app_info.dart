/// 스토어 제출·법적 고지에 쓰이는 앱 메타 정보.
///
/// Railway production deployment serves the public legal pages below.
class AppInfo {
  const AppInfo._();

  /// 개인정보처리방침 공개 URL. Play Console '앱 콘텐츠 > 개인정보처리방침'에도 동일하게 입력한다.
  static const privacyPolicyUrl =
      'https://culturepath-backend-production.up.railway.app/privacy-policy';

  /// 이용약관 공개 URL.
  static const termsOfServiceUrl =
      'https://culturepath-backend-production.up.railway.app/terms';

  /// 사용자 문의·AI 답변 신고를 받는 이메일. Play Console 개발자 연락처와 맞추는 것을 권장.
  static const supportEmail = 'culturepath.support@gmail.com';
}
