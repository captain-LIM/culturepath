const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const { createCourse, getCourses, getCourse, updateCourse, deleteCourse } = require('../controllers/coursesController');

router.use(authMiddleware);
router.post('/', createCourse);
router.get('/', getCourses);
router.get('/:id', getCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

module.exports = router;
