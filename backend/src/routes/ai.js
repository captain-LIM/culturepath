const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');
const {
  chat,
  deleteChatSession,
  deleteUserChatSessions,
  markChatCourseSaved,
  transformCourse,
} = require('../controllers/aiController');

router.use(authMiddleware);
const aiGenerationRateLimit = createRateLimit({
  windowMs: process.env.AI_RATE_LIMIT_WINDOW_MS,
  max: process.env.AI_RATE_LIMIT_MAX_REQUESTS,
});
router.post('/chat', aiGenerationRateLimit, chat);
router.post('/chat/sessions/:sessionId/course-saved', markChatCourseSaved);
router.delete('/chat/sessions', deleteUserChatSessions);
router.delete('/chat/sessions/:sessionId', deleteChatSession);
router.post('/transform', aiGenerationRateLimit, transformCourse);
router.post('/edit-course', aiGenerationRateLimit, transformCourse); // 이전 Flutter 빌드 호환 별칭

module.exports = router;
