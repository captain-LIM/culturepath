const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { getMyProfile, getMyCompletions, getMyLikedCourses } = require('../controllers/coursesController');

router.use(authMiddleware);
router.get('/me/profile', getMyProfile);
router.get('/me/completions', getMyCompletions);
router.get('/me/likes', getMyLikedCourses);

module.exports = router;
