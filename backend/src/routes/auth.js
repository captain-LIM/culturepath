const express = require('express');
const { body, validationResult } = require('express-validator');
const { register, login, migrateGuest, googleAuth } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// 로그인은 브루트포스, 회원가입은 대량 가입 스팸이 목표다. 둘 다 아직 인증된
// 사용자가 없는 요청이라 rateLimit 미들웨어가 req.ip 기준으로 IP당 제한한다.
const loginRateLimit = createRateLimit({
  windowMs: process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
  max: process.env.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
  message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
});
const registerRateLimit = createRateLimit({
  windowMs: process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
  max: process.env.AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
  message: '회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
});

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// 회원가입
router.post(
  '/register',
  registerRateLimit,
  [
    body('email').isEmail().withMessage('유효한 이메일을 입력해주세요.'),
    body('password').isLength({ min: 6 }).withMessage('비밀번호는 6자 이상이어야 합니다.'),
    body('nickname').notEmpty().withMessage('닉네임을 입력해주세요.'),
  ],
  validate,
  register
);

// 로그인
router.post(
  '/login',
  loginRateLimit,
  [
    body('email').isEmail().withMessage('유효한 이메일을 입력해주세요.'),
    body('password').notEmpty().withMessage('비밀번호를 입력해주세요.'),
  ],
  validate,
  login
);

// 구글 로그인 — idToken을 구글이 직접 검증하므로 브루트포스 대상이 아니다.
router.post('/google', googleAuth);

// 게스트 코스 → 서버 마이그레이션 (로그인 필요)
router.post('/migrate-guest', authMiddleware, migrateGuest);

module.exports = router;
