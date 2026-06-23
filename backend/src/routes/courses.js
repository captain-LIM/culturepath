const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const {
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  getPublicCourses, forkCourse,
} = require('../controllers/coursesController');

// 인증 불필요
router.get('/public', getPublicCourses);

// 인증 필요
router.use(authMiddleware);
router.post('/', createCourse);
router.get('/', getCourses);
router.get('/:id', getCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);
router.post('/:id/fork', forkCourse);

module.exports = router;
