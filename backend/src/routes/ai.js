const router = require('express').Router();
const { chat, editCourse } = require('../controllers/aiController');

router.post('/chat', chat);
router.post('/edit-course', editCourse);

module.exports = router;
