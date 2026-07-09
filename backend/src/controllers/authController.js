const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');

const GOOGLE_CLIENT_IDS = [
  '793585667481-iu2hei6lm8j0askoilc37bl7qos01oms.apps.googleusercontent.com', // Android
  '793585667481-59trfjaarlkffp2g3u2nacmac3127uh9.apps.googleusercontent.com', // Web
];
const googleClient = new OAuth2Client();

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

// POST /auth/google
async function googleAuth(req, res) {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken이 필요합니다.' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_IDS,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const nickname = payload.given_name || payload.name || email.split('@')[0];

    let [[user]] = await pool.query(
      'SELECT * FROM users WHERE google_id = ? OR email = ?',
      [googleId, email]
    );

    if (!user) {
      const [result] = await pool.query(
        'INSERT INTO users (email, nickname, google_id) VALUES (?, ?, ?)',
        [email, nickname, googleId]
      );
      user = { id: result.insertId, email, nickname };
    } else if (!user.google_id) {
      await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
    }

    const token = generateToken(user.id);
    return res.json({ token, userId: user.id, nickname: user.nickname });
  } catch (err) {
    console.error('Google 인증 오류:', err.message);
    return res.status(401).json({ message: '구글 인증에 실패했습니다.' });
  }
}

module.exports = { register, login, migrateGuest, googleAuth };
