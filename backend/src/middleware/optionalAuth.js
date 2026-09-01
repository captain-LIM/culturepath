const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const user = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
      const [rows] = await pool.query(
        'SELECT id FROM users WHERE id = ? LIMIT 1',
        [user.id],
      );
      if (rows.length > 0) req.user = user;
    } catch {
      // Public resources remain accessible when authentication cannot be established.
    }
  }
  return next();
}

module.exports = optionalAuth;
