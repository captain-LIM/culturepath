const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');
const { chat, transformCourse } = require('../controllers/aiController');

router.use(authMiddleware);
router.use(createRateLimit({
  windowMs: process.env.AI_RATE_LIMIT_WINDOW_MS,
  max: process.env.AI_RATE_LIMIT_MAX_REQUESTS,
}));
router.post('/chat', chat);
router.post('/transform', transformCourse);
router.post('/edit-course', transformCourse); // 이전 Flutter 빌드 호환 별칭

module.exports = router;
