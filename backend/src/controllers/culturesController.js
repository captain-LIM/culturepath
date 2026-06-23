const pool = require('../config/db');

// DB 팀 연동 전 시드 데이터 (cultures 테이블 구성 후 DB 조회로 교체)
const SEED_CULTURES = [
  { id: 1, name: '독립서점·책방', description: '동네 책방·북스테이 감성', color: '#8B6F47', emoji: '📚', lcls_codes: 'A02' },
  { id: 2, name: '문학',          description: '작가의 흔적·문학관',       color: '#2D6A7F', emoji: '✍️',  lcls_codes: 'A02' },
  { id: 3, name: '음악',          description: '공연장·음악 거점',          color: '#6B4FA8', emoji: '🎵', lcls_codes: 'A04' },
  { id: 4, name: '전통주·양조장', description: '지역 양조장·전통주 체험',   color: '#C17A2B', emoji: '🍶', lcls_codes: 'A05' },
  { id: 5, name: '로컬 미식',     description: '지역 고유 식문화',          color: '#D4523A', emoji: '🍜', lcls_codes: 'A05' },
  { id: 6, name: '공예·공방',     description: '수공예·체험 공방',          color: '#5A8A6B', emoji: '🪡', lcls_codes: 'A04' },
  { id: 7, name: '근대 문화유산', description: '근대 건축·산업유산',         color: '#4A6FA5', emoji: '🏛️', lcls_codes: 'A01' },
  { id: 8, name: '미술·갤러리',   description: '소규모 갤러리·아트씬',      color: '#B5737A', emoji: '🖼️', lcls_codes: 'A04' },
  { id: 9, name: '영화·애니메이션', description: '애니·만화·영화 감성',     color: '#3D4F8A', emoji: '🎬', lcls_codes: 'A04' },
  { id: 10, name: '커피·카페',    description: '커피 문화 거점',            color: '#8B5E3C', emoji: '☕', lcls_codes: 'A05' },
];

// GET /cultures
async function getCultures(req, res) {
  try {
    // DB 연동 후 아래 주석 해제 후 SEED_CULTURES 제거
    // const [rows] = await pool.query('SELECT * FROM cultures ORDER BY id');
    // return res.json(rows);
    return res.json(SEED_CULTURES);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '서버 오류' });
  }
}

module.exports = { getCultures };
