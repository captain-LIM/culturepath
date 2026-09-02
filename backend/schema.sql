-- culturepath 데이터베이스 스키마
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS culturepath CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE culturepath;

-- ─── 마이그레이션 원장 ───────────────────────────────────────────────────────
-- scripts/migrate.js 가 적용한 migrations/*.sql 을 기록한다. 신규 DB는 이 표가
-- 비어 있고, 첫 `npm run migrate` 실행 시 기존 마이그레이션이 멱등하게 no-op
-- 처리되며 적용된 것으로 기록된다. (러너가 없어도 CREATE 는 자동으로 수행됨)

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(255) NOT NULL PRIMARY KEY,
  checksum   CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    forked_from_author_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    idempotency_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    area_code              VARCHAR(50) DEFAULT NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revision               BIGINT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (forked_from_course_id) REFERENCES courses(id) ON DELETE SET NULL,
    UNIQUE KEY uk_course_idempotency (user_id, idempotency_key)
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
  place_latitude  DECIMAL(10,7) DEFAULT NULL,
  place_longitude DECIMAL(10,7) DEFAULT NULL,
  place_image_url     VARCHAR(500) DEFAULT NULL,
  place_thumbnail_url VARCHAR(500) DEFAULT NULL,
  stay_minutes   INT DEFAULT 60,
  memo           TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE KEY uk_track_seq (course_id, track_number, sequence),
  INDEX idx_course_tracks_content_course (content_id, course_id)
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
  culture      VARCHAR(30) DEFAULT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_completion (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);

-- ─── TourAPI 장소 캐시 ────────────────────────────────────────────────────────
-- 목록 요약과 상세 JSON을 분리해 목록 갱신이 기존 상세정보를 지우지 않게 한다.

-- AI-generated content reports submitted inside the app for moderation.
-- Reports are deleted together with the reporter's account.
CREATE TABLE IF NOT EXISTS ai_content_reports (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT DEFAULT NULL,
  session_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  content     TEXT NOT NULL,
  reason      VARCHAR(500) DEFAULT NULL,
  status      ENUM('pending', 'reviewed', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_content_reports_status_created (status, created_at),
  INDEX idx_ai_content_reports_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS places_cache (
  content_id          VARCHAR(100) PRIMARY KEY,
  content_type_id     VARCHAR(20) DEFAULT NULL,
  title               VARCHAR(255) NOT NULL,
  l_dong_regn_cd      VARCHAR(2) DEFAULT NULL,
  l_dong_signgu_cd    VARCHAR(3) DEFAULT NULL,
  cultures_json       JSON NOT NULL,
  summary_json        JSON NOT NULL,
  detail_json         JSON DEFAULT NULL,
  detail_json_en      JSON DEFAULT NULL,
  detail_json_ja      JSON DEFAULT NULL,
  detail_json_zh      JSON DEFAULT NULL,
  source_updated_at   VARCHAR(35) DEFAULT NULL,
  summary_cached_at   DATETIME(3) NOT NULL,
  summary_expires_at  DATETIME(3) NOT NULL,
  detail_cached_at    DATETIME(3) DEFAULT NULL,
  detail_expires_at   DATETIME(3) DEFAULT NULL,
  detail_cached_at_en DATETIME(3) DEFAULT NULL,
  detail_expires_at_en DATETIME(3) DEFAULT NULL,
  detail_cached_at_ja DATETIME(3) DEFAULT NULL,
  detail_expires_at_ja DATETIME(3) DEFAULT NULL,
  detail_cached_at_zh DATETIME(3) DEFAULT NULL,
  detail_expires_at_zh DATETIME(3) DEFAULT NULL,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_places_cache_region (l_dong_regn_cd, l_dong_signgu_cd),
  INDEX idx_places_cache_summary_expiry (summary_expires_at),
  INDEX idx_places_cache_detail_expiry (detail_expires_at)
);

-- 검색 조건과 결과 contentId 순서를 보존한다. 인증키와 외부 요청 URL은 저장하지 않는다.

CREATE TABLE IF NOT EXISTS place_query_cache (
  cache_key         CHAR(64) PRIMARY KEY,
  operation         VARCHAR(30) NOT NULL,
  request_json      JSON NOT NULL,
  content_ids_json  JSON NOT NULL,
  pagination_json   JSON NOT NULL,
  cached_at         DATETIME(3) NOT NULL,
  expires_at        DATETIME(3) NOT NULL,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_place_query_cache_expiry (expires_at)
);

-- ─── DataLab 지역 방문자 캐시 ─────────────────────────────────────────────────
-- 기준일·비교일별 정규화 응답을 보존한다. 인증키와 전체 요청 URL은 저장하지 않는다.

CREATE TABLE IF NOT EXISTS data_lab_query_cache (
  cache_key       CHAR(64) PRIMARY KEY,
  operation       VARCHAR(30) NOT NULL,
  request_json    JSON NOT NULL,
  response_json   JSON NOT NULL,
  cached_at       DATETIME(3) NOT NULL,
  expires_at      DATETIME(3) NOT NULL,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_data_lab_query_cache_expiry (expires_at)
);
