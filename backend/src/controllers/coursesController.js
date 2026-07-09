const pool = require('../config/db');

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function buildCourse(row, trackRows, isLikedByMe = false) {
  const byTrack = {};
  for (const t of trackRows) {
    if (!byTrack[t.track_number]) byTrack[t.track_number] = [];
    byTrack[t.track_number].push({
      contentId: t.content_id,
      title: t.place_title || '',
      address: t.place_address || '',
      category: t.place_category || '',
      region: t.place_region || null,
      tel: '',
      openTime: '',
    });
  }

  const likeCount = Number(row.like_count || 0);
  const forkCount = Number(row.fork_count || 0);
  const totalPlaces = Object.values(byTrack).reduce((sum, arr) => sum + arr.length, 0);

  return {
    id: row.id,
    userId: String(row.user_id),
    authorId: row.nickname || String(row.user_id),
    title: row.title,
    description: row.description || '',
    isPublic: Boolean(row.is_public),
    forkedFrom: row.forked_from_course_id ? {
      courseId: row.forked_from_course_id,
      title: row.forked_from_title || '',
      authorId: row.forked_from_author_id || '',
    } : null,
    tracks: [1, 2, 3].map(n => ({ trackNumber: n, places: byTrack[n] || [] })),
    likeCount,
    forkCount,
    isLikedByMe: Boolean(isLikedByMe),
    score: likeCount * 2 + forkCount,
    totalPlaces,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function queryCourses(whereClause, params, userId = null, orderBy = 'c.created_at DESC', limit = null) {
  const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
  const [courseRows] = await pool.query(
    `SELECT c.*,
       ANY_VALUE(u.nickname) AS nickname,
       COUNT(DISTINCT cl.user_id) AS like_count,
       COUNT(DISTINCT fc.id) AS fork_count,
       COUNT(DISTINCT cl.user_id) * 2 + COUNT(DISTINCT fc.id) AS score
     FROM courses c
     LEFT JOIN users u ON c.user_id = u.id
     LEFT JOIN course_likes cl ON cl.course_id = c.id
     LEFT JOIN courses fc ON fc.forked_from_course_id = c.id
     WHERE ${whereClause}
     GROUP BY c.id
     ORDER BY ${orderBy}
     ${limitClause}`,
    params
  );
  if (!courseRows.length) return [];

  const ids = courseRows.map(r => r.id);

  const [trackRows] = await pool.query(
    `SELECT * FROM course_tracks WHERE course_id IN (?)
     ORDER BY course_id, track_number, sequence`,
    [ids]
  );

  let likedSet = new Set();
  if (userId) {
    const [likedRows] = await pool.query(
      `SELECT course_id FROM course_likes WHERE user_id = ? AND course_id IN (?)`,
      [userId, ids]
    );
    likedSet = new Set(likedRows.map(r => r.course_id));
  }

  const trackMap = {};
  for (const t of trackRows) {
    if (!trackMap[t.course_id]) trackMap[t.course_id] = [];
    trackMap[t.course_id].push(t);
  }

  return courseRows.map(r => buildCourse(r, trackMap[r.id] || [], likedSet.has(r.id)));
}

async function saveTracks(conn, courseId, tracks) {
  await conn.query('DELETE FROM course_tracks WHERE course_id = ?', [courseId]);
  if (!Array.isArray(tracks)) return;
  for (const track of tracks) {
    const places = track.places || [];
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      await conn.query(
        `INSERT INTO course_tracks
           (course_id, track_number, sequence, content_id, place_title, place_address, place_category, place_region)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, track.trackNumber || 1, i + 1,
         p.contentId || null, p.title || null, p.address || null,
         p.category || null, p.region || null]
      );
    }
  }
}

// ─── 공개 코스 ────────────────────────────────────────────────────────────────

async function getPublicCourses(req, res) {
  try {
    const courses = await queryCourses('c.is_public = TRUE', [], req.user?.id ?? null);
    return res.json(courses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getFeed(req, res) {
  try {
    const sort = req.query.sort || 'recent';
    const userId = req.user?.id ?? null;
    const orderBy = sort === 'popular' ? 'score DESC, c.created_at DESC' : 'c.created_at DESC';
    const courses = await queryCourses('c.is_public = TRUE', [], userId, orderBy);
    return res.json(courses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getRanking(req, res) {
  try {
    const courses = await queryCourses('c.is_public = TRUE', [], null, 'score DESC', 10);
    return res.json(courses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

// ─── 내 코스 ──────────────────────────────────────────────────────────────────

async function createCourse(req, res) {
  const { title, description, tracks, isPublic } = req.body;
  if (!title) return res.status(400).json({ message: '코스 제목을 입력해주세요.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO courses (user_id, title, description, is_public) VALUES (?, ?, ?, ?)',
      [req.user.id, title, description || '', isPublic ? 1 : 0]
    );
    const courseId = result.insertId;
    await saveTracks(conn, courseId, tracks || []);
    await conn.commit();

    const [course] = await queryCourses('c.id = ?', [courseId], req.user.id);
    return res.status(201).json(course);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  } finally {
    conn.release();
  }
}

async function getCourses(req, res) {
  try {
    const courses = await queryCourses('c.user_id = ?', [req.user.id], req.user.id);
    return res.json(courses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getCourse(req, res) {
  try {
    const courses = await queryCourses('c.id = ?', [parseInt(req.params.id)], req.user?.id);
    if (!courses.length) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    return res.json(courses[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function updateCourse(req, res) {
  const courseId = parseInt(req.params.id);
  const { title, description, tracks, isPublic } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query('SELECT user_id FROM courses WHERE id = ?', [courseId]);
    if (!existing) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    if (existing.user_id !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });

    const updates = ['updated_at = NOW()'];
    const values = [];
    if (title !== undefined)       { updates.push('title = ?');       values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (isPublic !== undefined)    { updates.push('is_public = ?');   values.push(isPublic ? 1 : 0); }

    await conn.query(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`, [...values, courseId]);
    if (tracks !== undefined) await saveTracks(conn, courseId, tracks);
    await conn.commit();

    const [course] = await queryCourses('c.id = ?', [courseId], req.user.id);
    return res.json(course);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  } finally {
    conn.release();
  }
}

async function deleteCourse(req, res) {
  const courseId = parseInt(req.params.id);
  try {
    const [[existing]] = await pool.query('SELECT user_id FROM courses WHERE id = ?', [courseId]);
    if (!existing) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    if (existing.user_id !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });

    await pool.query('DELETE FROM courses WHERE id = ?', [courseId]);
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function forkCourse(req, res) {
  const originalId = parseInt(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[original]] = await conn.query(
      'SELECT c.*, u.nickname FROM courses c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?',
      [originalId]
    );
    if (!original) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

    const [result] = await conn.query(
      `INSERT INTO courses
         (user_id, title, description, is_public, forked_from_course_id, forked_from_title, forked_from_author_id)
       VALUES (?, ?, ?, FALSE, ?, ?, ?)`,
      [req.user.id, `${original.title} (포크)`, original.description || '',
       originalId, original.title, original.nickname || String(original.user_id)]
    );
    const newId = result.insertId;

    const [origTracks] = await conn.query(
      'SELECT * FROM course_tracks WHERE course_id = ? ORDER BY track_number, sequence',
      [originalId]
    );
    for (const t of origTracks) {
      await conn.query(
        `INSERT INTO course_tracks
           (course_id, track_number, sequence, content_id, place_title, place_address, place_category, place_region, stay_minutes, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, t.track_number, t.sequence, t.content_id, t.place_title,
         t.place_address, t.place_category, t.place_region, t.stay_minutes, t.memo]
      );
    }
    await conn.commit();

    const [course] = await queryCourses('c.id = ?', [newId], req.user.id);
    return res.status(201).json(course);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  } finally {
    conn.release();
  }
}

// ─── 좋아요 ───────────────────────────────────────────────────────────────────

async function toggleLike(req, res) {
  const courseId = parseInt(req.params.id);
  const userId = req.user.id;
  try {
    const [[exists]] = await pool.query('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!exists) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

    const [[liked]] = await pool.query(
      'SELECT 1 as v FROM course_likes WHERE course_id = ? AND user_id = ?',
      [courseId, userId]
    );
    if (liked) {
      await pool.query('DELETE FROM course_likes WHERE course_id = ? AND user_id = ?', [courseId, userId]);
    } else {
      await pool.query('INSERT INTO course_likes (course_id, user_id) VALUES (?, ?)', [courseId, userId]);
    }

    const [[{ likeCount }]] = await pool.query(
      'SELECT COUNT(*) as likeCount FROM course_likes WHERE course_id = ?', [courseId]
    );
    return res.json({ liked: !liked, likeCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

// ─── 완주 인증 ────────────────────────────────────────────────────────────────

async function completeCourse(req, res) {
  const courseId = parseInt(req.params.id);
  const userId = req.user.id;
  const { note } = req.body;
  try {
    const [[course]] = await pool.query('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

    const [[existing]] = await pool.query(
      'SELECT id FROM course_completions WHERE course_id = ? AND user_id = ?', [courseId, userId]
    );
    if (existing) return res.status(409).json({ message: '이미 완주 인증한 코스입니다.' });

    const [result] = await pool.query(
      'INSERT INTO course_completions (course_id, user_id, note) VALUES (?, ?, ?)',
      [courseId, userId, note || '']
    );

    const [[completion]] = await pool.query(
      `SELECT cc.id, cc.course_id, c.title as courseTitle, cc.note, cc.completed_at as completedAt
       FROM course_completions cc
       LEFT JOIN courses c ON cc.course_id = c.id
       WHERE cc.id = ?`,
      [result.insertId]
    );
    return res.status(201).json(completion);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getMyCompletions(req, res) {
  try {
    const [completions] = await pool.query(
      `SELECT cc.id, cc.course_id, c.title as courseTitle, cc.note, cc.completed_at as completedAt
       FROM course_completions cc
       LEFT JOIN courses c ON cc.course_id = c.id
       WHERE cc.user_id = ?
       ORDER BY cc.completed_at DESC`,
      [req.user.id]
    );
    return res.json(completions);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getMyProfile(req, res) {
  const userId = req.user.id;
  try {
    const [[user]] = await pool.query('SELECT email, nickname FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const [[{ completedCount }]] = await pool.query(
      'SELECT COUNT(*) as completedCount FROM course_completions WHERE user_id = ?', [userId]
    );
    const [[{ createdCount }]] = await pool.query(
      'SELECT COUNT(*) as createdCount FROM courses WHERE user_id = ?', [userId]
    );
    const [[{ likedCount }]] = await pool.query(
      'SELECT COUNT(*) as likedCount FROM course_likes WHERE user_id = ?', [userId]
    );

    const [recentCompletions] = await pool.query(
      `SELECT cc.id, cc.course_id, c.title as courseTitle, cc.note, cc.completed_at as completedAt
       FROM course_completions cc
       LEFT JOIN courses c ON cc.course_id = c.id
       WHERE cc.user_id = ?
       ORDER BY cc.completed_at DESC LIMIT 5`,
      [userId]
    );

    const createdCourses = await queryCourses(
      'c.user_id = ?', [userId], userId, 'c.created_at DESC', 5
    );

    return res.json({
      userId: String(userId),
      nickname: user.nickname,
      email: user.email,
      stats: { completedCount, createdCount, likedCount },
      recentCompletions,
      createdCourses,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

module.exports = {
  getPublicCourses, getFeed, getRanking,
  createCourse, getCourses, getCourse, updateCourse, deleteCourse,
  forkCourse, toggleLike, completeCourse, getMyCompletions, getMyProfile,
};
