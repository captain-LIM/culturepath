// 코스 인메모리 저장소 — DB 연동 후 교체
let courseStore = [];
let idCounter = 1;

// POST /courses
async function createCourse(req, res) {
  const userId = req.user.id;
  const { title, description, tracks } = req.body;

  if (!title) return res.status(400).json({ message: '코스 제목을 입력해주세요.' });

  const course = {
    id: idCounter++,
    userId,
    title,
    description: description || '',
    tracks: tracks || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  courseStore.push(course);
  return res.status(201).json(course);
}

// GET /courses
async function getCourses(req, res) {
  const userCourses = courseStore.filter(c => c.userId === req.user.id);
  return res.json(userCourses);
}

// GET /courses/:id
async function getCourse(req, res) {
  const course = courseStore.find(c => c.id === parseInt(req.params.id));
  if (!course) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
  return res.json(course);
}

// PUT /courses/:id
async function updateCourse(req, res) {
  const idx = courseStore.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

  const { title, description, tracks } = req.body;
  courseStore[idx] = {
    ...courseStore[idx],
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(tracks !== undefined && { tracks }),
    updatedAt: new Date().toISOString(),
  };
  return res.json(courseStore[idx]);
}

// DELETE /courses/:id
async function deleteCourse(req, res) {
  const idx = courseStore.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
  courseStore.splice(idx, 1);
  return res.status(204).send();
}

module.exports = { createCourse, getCourses, getCourse, updateCourse, deleteCourse };
