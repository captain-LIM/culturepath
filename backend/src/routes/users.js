const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { getMyProfile, getMyCompletions } = require('../controllers/coursesController');

router.use(authMiddleware);
router.get('/me/profile', getMyProfile);
router.get('/me/completions', getMyCompletions);

module.exports = router;
