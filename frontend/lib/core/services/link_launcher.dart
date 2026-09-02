import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// 외부 링크/메일 실행 헬퍼. 실패 시 스낵바로 안내한다.
class LinkLauncher {
  const LinkLauncher._();

  /// https 링크를 외부 브라우저로 연다.
  static Future<void> openUrl(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    final ok =
        uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      _notify(context, 'open_link_failed'.tr());
    }
  }

  /// 메일 앱을 제목/본문과 함께 연다. 실패하면 대상 주소를 스낵바로 알려준다.
  static Future<void> sendEmail(
    BuildContext context, {
    required String to,
    required String subject,
    String body = '',
  }) async {
    final uri = Uri(
      scheme: 'mailto',
      path: to,
      query: _encodeQuery({
        'subject': subject,
        if (body.isNotEmpty) 'body': body,
      }),
    );
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      _notify(context, 'email_open_failed'.tr(namedArgs: {'email': to}));
    }
  }

  static String _encodeQuery(Map<String, String> params) => params.entries
      .map(
        (e) => '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}',
      )
      .join('&');

  static void _notify(BuildContext context, String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}
