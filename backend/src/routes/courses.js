const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const {
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  getPublicCourses, forkCourse, getFeed, getRanking, toggleLike,
  completeCourse,
} = require('../controllers/coursesController');

// 인증 없이 접근 가능
router.get('/public', getPublicCourses);
router.get('/feed', getFeed);
router.get('/ranking', getRanking);

// 인증 필요
router.use(authMiddleware);
router.post('/', createCourse);
router.get('/', getCourses);
router.get('/:id', getCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);
router.post('/:id/fork', forkCourse);
router.post('/:id/like', toggleLike);
router.post('/:id/complete', completeCourse);

module.exports = router;
