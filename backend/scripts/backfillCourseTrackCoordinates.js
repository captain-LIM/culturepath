'use strict';

require('dotenv').config({ quiet: true });

const pool = require('../src/config/db');
const placeCacheRepository = require('../src/repositories/placeCacheRepository');
const tourApiService = require('../src/services/tourApiService');
const { normalizeCoordinate } = require('../src/utils/normalizeTourPlace');

function parseArgs(argv) {
  const result = { dryRun: false, help: false };
  for (const argument of argv) {
    if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else throw new TypeError(`지원하지 않는 인자입니다: ${argument}`);
  }
  return result;
}

function usage() {
  return [
    'Usage: node scripts/backfillCourseTrackCoordinates.js [options]',
    '',
    '기존에 저장된 코스의 장소 중 좌표가 비어 있는 항목을 places_cache 또는',
    'TourAPI 상세 조회로 채워 넣습니다.',
    '',
    '  --dry-run   실제 UPDATE 없이 몇 건이 채워질지만 보고합니다.',
    '  --help, -h  도움말을 표시합니다.',
  ].join('\n');
}

async function fetchLiveCoordinate(contentId) {
  const result = await tourApiService.getCommonDetail({ contentId });
  const item = result.items[0];
  if (!item) return null;
  const latitude = normalizeCoordinate(item.mapy, -90, 90);
  const longitude = normalizeCoordinate(item.mapx, -180, 180);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const [rows] = await pool.query(
    `SELECT DISTINCT content_id FROM course_tracks
      WHERE content_id IS NOT NULL
        AND (place_latitude IS NULL OR place_longitude IS NULL)`,
  );
  const contentIds = rows.map(r => String(r.content_id));
  console.log(`좌표가 비어 있는 장소 ${contentIds.length}건을 찾았습니다.`);
  if (contentIds.length === 0) return;

  const cached = await placeCacheRepository.findExistingPlaces(contentIds);
  const cachedById = new Map(cached.map(place => [place.contentId, place.summary]));

  let fromCache = 0;
  let fromLive = 0;
  let failed = 0;
  const updates = [];

  for (const contentId of contentIds) {
    const summary = cachedById.get(contentId);
    const cachedLatitude = normalizeCoordinate(summary?.latitude, -90, 90);
    const cachedLongitude = normalizeCoordinate(summary?.longitude, -180, 180);
    if (cachedLatitude !== null && cachedLongitude !== null) {
      updates.push({ contentId, latitude: cachedLatitude, longitude: cachedLongitude });
      fromCache += 1;
      continue;
    }

    try {
      const live = await fetchLiveCoordinate(contentId);
      if (live) {
        updates.push({ contentId, ...live });
        fromLive += 1;
      } else {
        failed += 1;
        console.warn(`좌표를 찾을 수 없습니다: contentId=${contentId}`);
      }
    } catch (error) {
      failed += 1;
      console.warn(`조회 실패: contentId=${contentId} (${error.message})`);
    }
  }

  console.log(
    `캐시에서 ${fromCache}건, TourAPI 조회로 ${fromLive}건 확보. 실패 ${failed}건.`,
  );

  if (args.dryRun) {
    console.log('--dry-run 모드라 DB는 변경하지 않았습니다.');
    return;
  }

  let updatedRows = 0;
  for (const { contentId, latitude, longitude } of updates) {
    const [result] = await pool.query(
      `UPDATE course_tracks SET place_latitude = ?, place_longitude = ?
        WHERE content_id = ? AND (place_latitude IS NULL OR place_longitude IS NULL)`,
      [latitude, longitude, contentId],
    );
    updatedRows += result.affectedRows;
  }
  console.log(`course_tracks ${updatedRows}행을 갱신했습니다.`);
}

main()
  .then(() => pool.end())
  .catch(error => {
    console.error(error);
    return pool.end().finally(() => process.exit(1));
  });
