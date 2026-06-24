// 코스 인메모리 저장소 — DB 연동 후 교체
let idCounter = 4;

const SEED_PLACES = {
  gn002: { contentId: 'gn002', title: '안목해변 커피거리', address: '강릉시 창해로14번길', tel: '', openTime: '상시', category: '커피·카페', areaCode: 'gangneung', region: '강릉' },
  gn003: { contentId: 'gn003', title: '오죽헌', address: '강릉시 율곡로 3139번길 24', tel: '033-660-3301', openTime: '09:00~18:00', category: '문학', areaCode: 'gangneung', region: '강릉' },
  gn005: { contentId: 'gn005', title: '책방 나다', address: '강릉시 경강로 2121', tel: '', openTime: '12:00~20:00', category: '독립서점', areaCode: 'gangneung', region: '강릉' },
  jj001: { contentId: 'jj001', title: '전주 한옥마을', address: '전주시 완산구 기린대로 99', tel: '063-282-1330', openTime: '상시', category: '문화유산', areaCode: 'jeonju', region: '전주' },
  jj002: { contentId: 'jj002', title: '경암책방', address: '전주시 완산구 최명희길 29', tel: '063-284-3397', openTime: '10:00~19:00', category: '독립서점', areaCode: 'jeonju', region: '전주' },
  jj003: { contentId: 'jj003', title: '전주 막걸리 골목', address: '전주시 완산구 전라감영5길', tel: '', openTime: '11:00~22:00', category: '전통주', areaCode: 'jeonju', region: '전주' },
  ty001: { contentId: 'ty001', title: '박경리기념관', address: '통영시 산양읍 산양중앙로 173', tel: '055-650-2541', openTime: '09:00~18:00', category: '문학', areaCode: 'tongyeong', region: '통영' },
  ty002: { contentId: 'ty002', title: '통영국제음악당', address: '통영시 도천동 문화마당로 1', tel: '055-650-0800', openTime: '공연 시간표 참고', category: '음악', areaCode: 'tongyeong', region: '통영' },
  ty004: { contentId: 'ty004', title: '통영 중앙시장', address: '통영시 중앙로 51', tel: '', openTime: '06:00~21:00', category: '로컬 미식', areaCode: 'tongyeong', region: '통영' },
};

const p = (id) => SEED_PLACES[id];

let courseStore = [
  {
    id: 1, userId: 'editor_kim', authorId: 'editor_kim',
    title: '강릉 감성 책방 & 카페 코스',
    description: '안목해변 커피향과 골목 책방이 어우러진 강릉 감성 여행',
    isPublic: true, forkedFrom: null,
    tracks: [
      { trackNumber: 1, places: [p('gn005'), p('gn002')] },
      { trackNumber: 2, places: [p('gn003')] },
      { trackNumber: 3, places: [] },
    ],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 2, userId: 'editor_lee', authorId: 'editor_lee',
    title: '전주 한옥마을 전통 문화 코스',
    description: '한옥마을 책방부터 막걸리 골목까지, 전주의 진짜 맛',
    isPublic: true, forkedFrom: null,
    tracks: [
      { trackNumber: 1, places: [p('jj001'), p('jj002')] },
      { trackNumber: 2, places: [p('jj003')] },
      { trackNumber: 3, places: [] },
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 3, userId: 'editor_park', authorId: 'editor_park',
    title: '통영 문학·음악 기행',
    description: '박경리·윤이상의 도시 통영을 깊이 여행하는 코스',
    isPublic: true, forkedFrom: null,
    tracks: [
      { trackNumber: 1, places: [p('ty001'), p('ty002')] },
      { trackNumber: 2, places: [p('ty004')] },
      { trackNumber: 3, places: [] },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// 좋아요 저장소: { courseId -> Set<userId> }
const likeStore = {
  1: new Set(['user_a', 'user_b', 'user_c', 'user_d', 'user_e', 'user_f', 'user_g', 'user_h', 'user_i', 'user_j', 'user_k', 'user_l']),
  2: new Set(['user_a', 'user_b', 'user_c', 'user_d', 'user_e', 'user_f', 'user_g', 'user_h']),
  3: new Set(['user_a', 'user_b', 'user_c', 'user_d', 'user_e', 'user_f', 'user_g', 'user_h', 'user_i', 'user_j', 'user_k', 'user_l', 'user_m', 'user_n', 'user_o']),
};

// 코스 DTO: likeCount, forkCount, isLikedByMe 추가
function enrichCourse(course, userId = null) {
  const likes = likeStore[course.id] || new Set();
  const forkCount = courseStore.filter(c => c.forkedFrom && c.forkedFrom.courseId === course.id).length;
  return {
    ...course,
    likeCount: likes.size,
    forkCount,
    isLikedByMe: userId ? likes.has(String(userId)) : false,
    score: likes.size * 2 + forkCount,
  };
}

// GET /courses/public
async function getPublicCourses(req, res) {
  const userId = req.user?.id ?? null;
  const public_ = courseStore.filter(c => c.isPublic).map(c => enrichCourse(c, userId));
  return res.json(public_);
}

// GET /feed?sort=recent|popular
async function getFeed(req, res) {
  const sort = req.query.sort || 'recent';
  const userId = req.user?.id ?? null;

  let courses = courseStore
    .filter(c => c.isPublic)
    .map(c => enrichCourse(c, userId));

  if (sort === 'popular') {
    courses = courses.sort((a, b) => b.score - a.score);
  } else {
    courses = courses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return res.json(courses);
}

// GET /ranking
async function getRanking(req, res) {
  const courses = courseStore
    .filter(c => c.isPublic)
    .map(c => enrichCourse(c))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return res.json(courses);
}

// POST /courses/:id/like (인증 필요)
async function toggleLike(req, res) {
  const courseId = parseInt(req.params.id);
  const userId = String(req.user.id);

  const course = courseStore.find(c => c.id === courseId);
  if (!course) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

  if (!likeStore[courseId]) likeStore[courseId] = new Set();

  if (likeStore[courseId].has(userId)) {
    likeStore[courseId].delete(userId);
    return res.json({ liked: false, likeCount: likeStore[courseId].size });
  } else {
    likeStore[courseId].add(userId);
    return res.json({ liked: true, likeCount: likeStore[courseId].size });
  }
}

// POST /courses
async function createCourse(req, res) {
  const userId = req.user.id;
  const { title, description, tracks, isPublic } = req.body;
  if (!title) return res.status(400).json({ message: '코스 제목을 입력해주세요.' });

  const course = {
    id: idCounter++, userId, authorId: userId,
    title, description: description || '',
    isPublic: isPublic || false, forkedFrom: null,
    tracks: tracks || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  courseStore.push(course);
  return res.status(201).json(enrichCourse(course, userId));
}

async function getCourses(req, res) {
  const userId = req.user.id;
  return res.json(courseStore.filter(c => c.userId === userId).map(c => enrichCourse(c, userId)));
}

async function getCourse(req, res) {
  const course = courseStore.find(c => c.id === parseInt(req.params.id));
  if (!course) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
  return res.json(enrichCourse(course, req.user?.id));
}

async function updateCourse(req, res) {
  const idx = courseStore.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

  const { title, description, tracks, isPublic } = req.body;
  courseStore[idx] = {
    ...courseStore[idx],
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(tracks !== undefined && { tracks }),
    ...(isPublic !== undefined && { isPublic }),
    updatedAt: new Date().toISOString(),
  };
  return res.json(enrichCourse(courseStore[idx], req.user?.id));
}

async function deleteCourse(req, res) {
  const idx = courseStore.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
  courseStore.splice(idx, 1);
  return res.status(204).send();
}

async function forkCourse(req, res) {
  const original = courseStore.find(c => c.id === parseInt(req.params.id));
  if (!original) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

  const forked = {
    id: idCounter++, userId: req.user.id, authorId: req.user.id,
    title: `${original.title} (포크)`,
    description: original.description,
    isPublic: false,
    forkedFrom: { courseId: original.id, title: original.title, authorId: original.authorId },
    tracks: JSON.parse(JSON.stringify(original.tracks)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  courseStore.push(forked);
  return res.status(201).json(enrichCourse(forked, req.user.id));
}

module.exports = {
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  getPublicCourses, forkCourse, getFeed, getRanking, toggleLike,
};
