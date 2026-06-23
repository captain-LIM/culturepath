import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/auth_repository.dart';
import '../../../core/theme/app_theme.dart';

final _authRepo = AuthRepository();

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _errorMessage = null; });

    try {
      await _authRepo.login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() { _errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.'; });
    } finally {
      if (mounted) setState(() { _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 60),
                Text('문화여행', style: Theme.of(context).textTheme.displayLarge),
                const SizedBox(height: 4),
                Text(
                  '취향으로 떠나는 나만의 코스',
                  style: TextStyle(color: AppColors.primary.withValues(alpha: 0.6), fontSize: 14),
                ),
                const SizedBox(height: 48),
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: '이메일'),
                  validator: (v) => (v == null || !v.contains('@')) ? '유효한 이메일을 입력해주세요.' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: '비밀번호'),
                  validator: (v) => (v == null || v.length < 6) ? '비밀번호는 6자 이상이어야 합니다.' : null,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(_errorMessage!, style: const TextStyle(color: AppColors.accent, fontSize: 13)),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isLoading ? null : _login,
                  child: _isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('로그인'),
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/register'),
                    child: const Text('아직 계정이 없으신가요? 회원가입'),
                  ),
                ),
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/home'),
                    child: Text('게스트로 둘러보기', style: TextStyle(color: AppColors.primary.withValues(alpha: 0.5))),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }
}
