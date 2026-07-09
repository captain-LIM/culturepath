const router = require('express').Router();
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const {
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  getPublicCourses, forkCourse, getFeed, getRanking, toggleLike,
  completeCourse,
} = require('../controllers/coursesController');

// 비로그인도 허용하되 로그인 시 isLikedByMe 반영
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET); } catch {}
  }
  next();
}

router.get('/public',  optionalAuth, getPublicCourses);
router.get('/feed',    optionalAuth, getFeed);
router.get('/ranking', optionalAuth, getRanking);

router.use(authMiddleware);
router.post('/',          createCourse);
router.get('/',           getCourses);
router.get('/:id',        getCourse);
router.put('/:id',        updateCourse);
router.delete('/:id',     deleteCourse);
router.post('/:id/fork',  forkCourse);
router.post('/:id/like',  toggleLike);
router.post('/:id/complete', completeCourse);

module.exports = router;
