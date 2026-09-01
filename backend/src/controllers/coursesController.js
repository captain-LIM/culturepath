const crypto = require('node:crypto');
const pool = require('../config/db');

function idempotencyFingerprint(operation, payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ operation, payload }))
    .digest('hex');
}

function normalizedCreatePayload({ title, description, tracks, isPublic }) {
  return {
    title,
    description: description || '',
    isPublic: Boolean(isPublic),
    tracks: Array.isArray(tracks) ? tracks.map(track => ({
      trackNumber: track?.trackNumber || 1,
      places: Array.isArray(track?.places) ? track.places.map(place => ({
        contentId: place?.contentId || null,
        title: place?.title || null,
        address: place?.address || null,
        category: place?.category || null,
        region: place?.region || null,
        imageUrl: place?.imageUrl || null,
        thumbnailUrl: place?.thumbnailUrl || null,
      })) : [],
    })) : [],
  };
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function buildCourse(row, trackRows, isLikedByMe = false, userId = null) {
  const byTrack = {};
  for (const t of trackRows) {
    if (!byTrack[t.track_number]) byTrack[t.track_number] = [];
    byTrack[t.track_number].push({
      contentId: t.content_id,
      title: t.place_title || '',
      address: t.place_address || '',
      category: t.place_category || '',
      region: t.place_region || null,
      latitude: t.place_latitude != null ? Number(t.place_latitude) : null,
      longitude: t.place_longitude != null ? Number(t.place_longitude) : null,
      imageUrl: t.place_image_url || null,
      thumbnailUrl: t.place_thumbnail_url || null,
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
    forkedFrom: (
      row.forked_from_course_id != null ||
      row.forked_from_title != null ||
      row.forked_from_author_id != null ||
      Boolean(row.forked_from_author_deleted)
    ) ? {
      courseId: row.forked_from_course_id ?? null,
      title: row.forked_from_title || '',
      authorId: row.forked_from_author_id ?? null,
      authorDeleted: Boolean(row.forked_from_author_deleted),
    } : null,
    tracks: [1, 2, 3].map(n => ({ trackNumber: n, places: byTrack[n] || [] })),
    likeCount,
    forkCount,
    isLikedByMe: Boolean(isLikedByMe),
    isOwner: userId != null && String(row.user_id) === String(userId),
    score: likeCount * 2 + forkCount,
    totalPlaces,
    revision: Number(row.revision || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function queryCourses(
  whereClause,
  params,
  userId = null,
  orderBy = 'c.created_at DESC',
  limit = null,
  database = pool,
) {
  const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
  const [courseRows] = await database.query(
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

  const [trackRows] = await database.query(
    `SELECT * FROM course_tracks WHERE course_id IN (?)
     ORDER BY course_id, track_number, sequence`,
    [ids]
  );

  let likedSet = new Set();
  if (userId) {
    const [likedRows] = await database.query(
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

  return courseRows.map(r => buildCourse(r, trackMap[r.id] || [], likedSet.has(r.id), userId));
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
           (course_id, track_number, sequence, content_id, place_title, place_address, place_category, place_region, place_latitude, place_longitude, place_image_url, place_thumbnail_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, track.trackNumber || 1, i + 1,
         p.contentId || null, p.title || null, p.address || null,
         p.category || null, p.region || null,
         Number.isFinite(p.latitude) ? p.latitude : null,
         Number.isFinite(p.longitude) ? p.longitude : null,
         p.imageUrl || null, p.thumbnailUrl || null]
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
  const idempotencyKey = req.get?.('Idempotency-Key') || null;
  if (idempotencyKey && !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) {
    return res.status(400).json({ message: 'Idempotency-Key 형식이 올바르지 않습니다.' });
  }
  const requestFingerprint = idempotencyKey
    ? idempotencyFingerprint('create', normalizedCreatePayload(req.body))
    : null;

  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO courses (
         user_id, title, description, is_public, idempotency_key, idempotency_fingerprint
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, title, description || '', isPublic ? 1 : 0,
        idempotencyKey, requestFingerprint,
      ]
    );
    const courseId = result.insertId;
    await saveTracks(conn, courseId, tracks || []);
    await conn.commit();
    committed = true;

    try {
      const [course] = await queryCourses('c.id = ?', [courseId], req.user.id);
      if (course) return res.status(201).json(course);
    } catch (readError) {
      console.error('Committed course read-back failed:', readError);
    }
    return res.status(201).json({
      id: courseId,
      userId: String(req.user.id),
      authorId: String(req.user.id),
      title,
      description: description || '',
      isPublic: Boolean(isPublic),
      forkedFrom: null,
      tracks: Array.isArray(tracks) ? tracks : [],
      likeCount: 0,
      forkCount: 0,
      isLikedByMe: false,
      isOwner: true,
      score: 0,
    });
  } catch (err) {
    if (!committed) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Course transaction rollback failed:', rollbackError);
      }
    }
    if (idempotencyKey && err?.code === 'ER_DUP_ENTRY') {
      try {
        const [[existing]] = await conn.query(
          `SELECT id, idempotency_fingerprint
           FROM courses WHERE user_id = ? AND idempotency_key = ?`,
          [req.user.id, idempotencyKey],
        );
        if (existing) {
          if (existing.idempotency_fingerprint !== requestFingerprint) {
            return res.status(409).json({
              message: 'Idempotency-Key가 다른 요청에 이미 사용되었습니다.',
            });
          }
          const [course] = await queryCourses(
            'c.id = ?', [existing.id], req.user.id, 'c.created_at DESC', null, conn,
          );
          if (course) return res.status(200).json(course);
        }
      } catch (replayError) {
        console.error('Idempotent course replay failed:', replayError);
      }
    }
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
  const courseId = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
  }

  try {
    const userId = req.user?.id ?? null;
    const whereClause = userId == null
      ? 'c.id = ? AND c.is_public = TRUE'
      : 'c.id = ? AND (c.is_public = TRUE OR c.user_id = ?)';
    const params = userId == null ? [courseId] : [courseId, userId];
    const courses = await queryCourses(whereClause, params, userId);
    if (!courses.length) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    return res.json(courses[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function updateCourse(req, res) {
  const courseId = parseInt(req.params.id);
  const { title, description, tracks, isPublic, expectedRevision } = req.body;
  if (expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return res.status(400).json({ message: 'expectedRevision이 올바르지 않습니다.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      'SELECT user_id, revision FROM courses WHERE id = ? FOR UPDATE',
      [courseId],
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    }
    if (String(existing.user_id) !== String(req.user.id)) {
      await conn.rollback();
      return res.status(403).json({ message: '권한이 없습니다.' });
    }
    if (expectedRevision !== undefined && Number(existing.revision) !== expectedRevision) {
      await conn.rollback();
      return res.status(409).json({
        message: '코스가 다른 곳에서 변경되었습니다. 최신 코스를 다시 불러와 주세요.',
        currentRevision: Number(existing.revision),
      });
    }

    const updates = ['updated_at = NOW()', 'revision = revision + 1'];
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
  const idempotencyKey = req.get?.('Idempotency-Key') || null;
  if (idempotencyKey && !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) {
    return res.status(400).json({ message: 'Idempotency-Key 형식이 올바르지 않습니다.' });
  }
  const requestFingerprint = idempotencyKey
    ? idempotencyFingerprint('fork', { originalId })
    : null;
  const conn = await pool.getConnection();
  let committed = false;
  let transactionStarted = false;
  try {
    if (idempotencyKey) {
      const [[existingReplay]] = await conn.query(
        `SELECT id, idempotency_fingerprint
         FROM courses WHERE user_id = ? AND idempotency_key = ?`,
        [req.user.id, idempotencyKey],
      );
      if (existingReplay) {
        if (existingReplay.idempotency_fingerprint !== requestFingerprint) {
          return res.status(409).json({
            message: 'Idempotency-Key가 다른 요청에 이미 사용되었습니다.',
          });
        }
        const [course] = await queryCourses(
          'c.id = ?', [existingReplay.id], req.user.id,
          'c.created_at DESC', null, conn,
        );
        if (course) return res.status(200).json(course);
      }
    }
    await conn.beginTransaction();
    transactionStarted = true;
    const [[original]] = await conn.query(
      'SELECT c.*, u.nickname FROM courses c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?',
      [originalId]
    );
    if (!original) {
      await conn.rollback();
      return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });
    }
    if (!original.is_public && String(original.user_id) !== String(req.user.id)) {
      await conn.rollback();
      return res.status(403).json({ message: '비공개 코스는 Fork할 수 없습니다.' });
    }

    const [result] = await conn.query(
      `INSERT INTO courses
         (user_id, title, description, is_public, forked_from_course_id,
          forked_from_title, forked_from_author_id, idempotency_key,
          idempotency_fingerprint)
       VALUES (?, ?, ?, FALSE, ?, ?, ?, ?, ?)`,
      [req.user.id, `${original.title} (포크)`, original.description || '',
       originalId, original.title, original.nickname || String(original.user_id),
       idempotencyKey, requestFingerprint]
    );
    const newId = result.insertId;

    const [origTracks] = await conn.query(
      'SELECT * FROM course_tracks WHERE course_id = ? ORDER BY track_number, sequence',
      [originalId]
    );
    for (const t of origTracks) {
      await conn.query(
        `INSERT INTO course_tracks
           (course_id, track_number, sequence, content_id, place_title, place_address, place_category, place_region, place_latitude, place_longitude, place_image_url, place_thumbnail_url, stay_minutes, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, t.track_number, t.sequence, t.content_id, t.place_title,
         t.place_address, t.place_category, t.place_region,
         t.place_latitude, t.place_longitude,
         t.place_image_url, t.place_thumbnail_url, t.stay_minutes, t.memo]
      );
    }
    await conn.commit();
    committed = true;

    try {
      const [course] = await queryCourses('c.id = ?', [newId], req.user.id);
      if (course) return res.status(201).json(course);
    } catch (readError) {
      console.error('Committed fork read-back failed:', readError);
    }
    const fallback = buildCourse({
      ...original,
      id: newId,
      user_id: req.user.id,
      nickname: String(req.user.id),
      is_public: 0,
      forked_from_course_id: originalId,
      forked_from_title: original.title,
      forked_from_author_id: original.nickname || String(original.user_id),
      like_count: 0,
      fork_count: 0,
    }, origTracks.map(track => ({ ...track, course_id: newId })), false, req.user.id);
    return res.status(201).json(fallback);
  } catch (err) {
    if (transactionStarted && !committed) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Fork transaction rollback failed:', rollbackError);
      }
    }
    if (idempotencyKey && err?.code === 'ER_DUP_ENTRY') {
      try {
        const [[existing]] = await conn.query(
          `SELECT id, idempotency_fingerprint
           FROM courses WHERE user_id = ? AND idempotency_key = ?`,
          [req.user.id, idempotencyKey],
        );
        if (existing) {
          if (existing.idempotency_fingerprint !== requestFingerprint) {
            return res.status(409).json({
              message: 'Idempotency-Key가 다른 요청에 이미 사용되었습니다.',
            });
          }
          const [course] = await queryCourses(
            'c.id = ?', [existing.id], req.user.id, 'c.created_at DESC', null, conn,
          );
          if (course) return res.status(200).json(course);
        }
      } catch (replayError) {
        console.error('Idempotent fork replay failed:', replayError);
      }
    }
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
    const [[exists]] = await pool.query(
      'SELECT id FROM courses WHERE id = ? AND (is_public = TRUE OR user_id = ?)',
      [courseId, userId]
    );
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
  const { note, culture } = req.body;
  try {
    const [[course]] = await pool.query(
      'SELECT id FROM courses WHERE id = ? AND (is_public = TRUE OR user_id = ?)',
      [courseId, userId]
    );
    if (!course) return res.status(404).json({ message: '코스를 찾을 수 없습니다.' });

    const [[existing]] = await pool.query(
      'SELECT id FROM course_completions WHERE course_id = ? AND user_id = ?', [courseId, userId]
    );
    if (existing) return res.status(409).json({ message: '이미 완주 인증한 코스입니다.' });

    const [result] = await pool.query(
      'INSERT INTO course_completions (course_id, user_id, note, culture) VALUES (?, ?, ?, ?)',
      [courseId, userId, note || '', culture || null]
    );

    const [[completion]] = await pool.query(
      `SELECT cc.id, cc.course_id as courseId, c.title as courseTitle, cc.note, cc.culture, cc.completed_at as completedAt
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
      `SELECT cc.id, cc.course_id as courseId, c.title as courseTitle, cc.note, cc.culture, cc.completed_at as completedAt
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

async function deleteCompletion(req, res) {
  const userId = req.user.id;
  const completionId = parseInt(req.params.id, 10);
  try {
    const [result] = await pool.query(
      'DELETE FROM course_completions WHERE id = ? AND user_id = ?',
      [completionId, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
    return res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function getMyLikedCourses(req, res) {
  const userId = req.user.id;
  try {
    const courses = await queryCourses(
      `EXISTS (SELECT 1 FROM course_likes lf WHERE lf.course_id = c.id AND lf.user_id = ?)
       AND (c.is_public = TRUE OR c.user_id = ?)`,
      [userId, userId],
      userId,
      'c.created_at DESC'
    );
    return res.json(courses);
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
      `SELECT cc.id, cc.course_id as courseId, c.title as courseTitle, cc.note, cc.culture, cc.completed_at as completedAt
       FROM course_completions cc
       LEFT JOIN courses c ON cc.course_id = c.id
       WHERE cc.user_id = ?
       ORDER BY cc.completed_at DESC LIMIT 5`,
      [userId]
    );

    const [badgeRows] = await pool.query(
      `SELECT culture, COUNT(*) as cnt
       FROM course_completions
       WHERE user_id = ? AND culture IS NOT NULL
       GROUP BY culture`,
      [userId]
    );
    const badges = Object.fromEntries(badgeRows.map(r => [r.culture, r.cnt]));

    const createdCourses = await queryCourses(
      'c.user_id = ?', [userId], userId, 'c.created_at DESC', 5
    );

    return res.json({
      userId: String(userId),
      nickname: user.nickname,
      email: user.email,
      stats: { completedCount, createdCount, likedCount },
      recentCompletions,
      badges,
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
  forkCourse, toggleLike, completeCourse, getMyCompletions, deleteCompletion, getMyProfile, getMyLikedCourses,
};
