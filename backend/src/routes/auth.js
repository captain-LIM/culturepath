const express = require('express');
const { body, validationResult } = require('express-validator');
const { register, login, migrateGuest } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

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
  [
    body('email').isEmail().withMessage('유효한 이메일을 입력해주세요.'),
    body('password').notEmpty().withMessage('비밀번호를 입력해주세요.'),
  ],
  validate,
  login
);

// 게스트 코스 → 서버 마이그레이션 (로그인 필요)
router.post('/migrate-guest', authMiddleware, migrateGuest);

module.exports = router;
