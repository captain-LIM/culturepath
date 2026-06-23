const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

// POST /auth/register
async function register(req, res) {
  const { email, password, nickname } = req.body;

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(409).json({ message: '이미 사용 중인 이메일입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)',
      [email, passwordHash, nickname]
    );

    const token = generateToken(result.insertId);
    return res.status(201).json({ token, userId: result.insertId, nickname });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

// POST /auth/login
async function login(req, res) {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = generateToken(user.id);
    return res.json({ token, userId: user.id, nickname: user.nickname });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

// POST /auth/migrate-guest
// 게스트가 로컬에 저장한 코스를 로그인 후 서버로 이관
async function migrateGuest(req, res) {
  const userId = req.user.id;
  const { guestCourses } = req.body; // [{ title, tracks: [{contentId, sequence, stayMinutes, memo}] }]

  if (!Array.isArray(guestCourses) || guestCourses.length === 0) {
    return res.json({ migratedCount: 0 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let migratedCount = 0;
    for (const course of guestCourses) {
      const [result] = await conn.query(
        'INSERT INTO courses (user_id, title, area_code) VALUES (?, ?, ?)',
        [userId, course.title || '게스트 코스', course.areaCode || null]
      );
      const courseId = result.insertId;

      if (Array.isArray(course.tracks)) {
        for (const track of course.tracks) {
          await conn.query(
            'INSERT INTO course_tracks (course_id, sequence, content_id, stay_minutes, memo) VALUES (?, ?, ?, ?, ?)',
            [courseId, track.sequence, track.contentId, track.stayMinutes || 60, track.memo || '']
          );
        }
      }
      migratedCount++;
    }

    await conn.commit();
    return res.json({ migratedCount });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: '마이그레이션 실패' });
  } finally {
    conn.release();
  }
}

module.exports = { register, login, migrateGuest };
