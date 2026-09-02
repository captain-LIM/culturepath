const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');
const {
  chat,
  deleteChatSession,
  deleteUserChatSessions,
  markChatCourseSaved,
  reportAiContent,
  transformCourse,
} = require('../controllers/aiController');

router.use(authMiddleware);
const aiGenerationRateLimit = createRateLimit({
  windowMs: process.env.AI_RATE_LIMIT_WINDOW_MS,
  max: process.env.AI_RATE_LIMIT_MAX_REQUESTS,
});
const aiReportRateLimit = createRateLimit({
  windowMs: process.env.AI_REPORT_RATE_LIMIT_WINDOW_MS || 3600000,
  max: process.env.AI_REPORT_RATE_LIMIT_MAX_REQUESTS || 20,
  message: 'Too many AI content reports. Please try again later.',
});
router.post('/chat', aiGenerationRateLimit, chat);
router.post('/reports', aiReportRateLimit, reportAiContent);
router.post('/chat/sessions/:sessionId/course-saved', markChatCourseSaved);
router.delete('/chat/sessions', deleteUserChatSessions);
router.delete('/chat/sessions/:sessionId', deleteChatSession);
router.post('/transform', aiGenerationRateLimit, transformCourse);
router.post('/edit-course', aiGenerationRateLimit, transformCourse); // 이전 Flutter 빌드 호환 별칭

module.exports = router;
