const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const {
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  getPublicCourses, forkCourse, getFeed, getRanking, toggleLike,
  completeCourse,
} = require('../controllers/coursesController');

router.get('/public',  optionalAuth, getPublicCourses);
router.get('/feed',    optionalAuth, getFeed);
router.get('/ranking', optionalAuth, getRanking);
router.get('/:id',     optionalAuth, getCourse);

router.use(authMiddleware);
router.post('/',          createCourse);
router.get('/',           getCourses);
router.put('/:id',        updateCourse);
router.delete('/:id',     deleteCourse);
router.post('/:id/fork',  forkCourse);
router.post('/:id/like',  toggleLike);
router.post('/:id/complete', completeCourse);

module.exports = router;
