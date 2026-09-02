const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { getMyProfile, getMyCompletions, deleteCompletion, getMyLikedCourses } = require('../controllers/coursesController');
const { deleteMyAccount } = require('../controllers/usersController');

router.use(authMiddleware);
router.delete('/me', deleteMyAccount);
router.get('/me/profile', getMyProfile);
router.get('/me/completions', getMyCompletions);
router.delete('/me/completions/:id', deleteCompletion);
router.get('/me/likes', getMyLikedCourses);

module.exports = router;
