import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../data/auth_repository.dart';
import '../../../core/theme/app_theme.dart';

final _authRepo = AuthRepository();

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _nicknameCtrl = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _errorMessage = null; });

    try {
      await _authRepo.register(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        nickname: _nicknameCtrl.text.trim(),
      );
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() { _errorMessage = '이미 사용 중인 이메일이거나 오류가 발생했습니다.'; });
    } finally {
      if (mounted) setState(() { _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                const SizedBox(height: 32),
                TextFormField(
                  controller: _nicknameCtrl,
                  decoration: const InputDecoration(labelText: '닉네임'),
                  validator: (v) => (v == null || v.isEmpty) ? '닉네임을 입력해주세요.' : null,
                ),
                const SizedBox(height: 16),
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
                  decoration: const InputDecoration(labelText: '비밀번호 (6자 이상)'),
                  validator: (v) => (v == null || v.length < 6) ? '비밀번호는 6자 이상이어야 합니다.' : null,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(_errorMessage!, style: const TextStyle(color: AppColors.accent, fontSize: 13)),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isLoading ? null : _register,
                  child: _isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('가입하기'),
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
    _nicknameCtrl.dispose();
    super.dispose();
  }
}
