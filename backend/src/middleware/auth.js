const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '인증 토큰이 없습니다.' });
  }

  const token = header.split(' ')[1];
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE id = ? LIMIT 1',
      [user.id],
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error?.name !== 'JsonWebTokenError' && error?.name !== 'TokenExpiredError') {
      console.error('인증 사용자 확인 실패:', {
        errorName: error?.name || 'Error',
        code: error?.code || null,
      });
      return res.status(500).json({ message: '인증 상태를 확인하지 못했습니다.' });
    }
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}

module.exports = authMiddleware;
