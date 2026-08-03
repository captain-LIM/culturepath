const jwt = require('jsonwebtoken');

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
    } catch {
      // Public resources remain accessible when an expired or malformed token is sent.
    }
  }
  next();
}

module.exports = optionalAuth;
