-- culturepath 데이터베이스 스키마
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS culturepath CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE culturepath;

-- ─── 유저 ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── 코스 ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  user_id                INT NOT NULL,
  title                  VARCHAR(255) NOT NULL,
  description            TEXT,
  is_public              BOOLEAN DEFAULT FALSE,
  forked_from_course_id  INT DEFAULT NULL,
  forked_from_title      VARCHAR(255) DEFAULT NULL,
  forked_from_author_id  VARCHAR(100) DEFAULT NULL,
  area_code              VARCHAR(50) DEFAULT NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (forked_from_course_id) REFERENCES courses(id) ON DELETE SET NULL
);

-- ─── 코스 트랙 아이템 ─────────────────────────────────────────────────────────
-- track_number: 1·2·3 중 하나, sequence: 트랙 내 순서

CREATE TABLE IF NOT EXISTS course_tracks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  course_id      INT NOT NULL,
  track_number   TINYINT NOT NULL DEFAULT 1,
  sequence       INT NOT NULL,
  content_id     VARCHAR(100) DEFAULT NULL,
  place_title    VARCHAR(255) DEFAULT NULL,
  place_address  VARCHAR(500) DEFAULT NULL,
  place_category VARCHAR(100) DEFAULT NULL,
  place_region   VARCHAR(100) DEFAULT NULL,
  stay_minutes   INT DEFAULT 60,
  memo           TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE KEY uk_track_seq (course_id, track_number, sequence)
);

-- ─── 좋아요 ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_likes (
  course_id  INT NOT NULL,
  user_id    INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);

-- ─── 완주 인증 ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_completions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  course_id    INT NOT NULL,
  user_id      INT NOT NULL,
  note         TEXT,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_completion (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);
