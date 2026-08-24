'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const {
  main,
  parseArgs,
  safeFailure,
  usage,
  validateRuntimeConfiguration,
} = require('../scripts/seedRagLiveFixture');
const { loadDataset } = require('../scripts/evaluateRag');
const { collectExpectations } = require('../src/services/ragLiveFixtureAuditService');

const liveEnv = Object.freeze({
  DB_HOST: 'localhost',
  DB_NAME: 'culturepath',
  DB_PASSWORD: 'not-a-real-secret',
  DB_PORT: '3306',
  DB_USER: 'app',
  TOUR_API_KEY: 'not-a-real-key',
});

function placesFor(dataset) {
  const classificationCodes = {
    130444: ['VE'],
    1950195: ['FD', 'FD05', 'FD050100'],
    913869: ['HS', 'HS01', 'HS011100'],
  };
  return collectExpectations(dataset).map(expectation => ({
    contentId: expectation.contentId,
    summary: {
      cultures: [...expectation.expectedCategories],
      contentId: expectation.contentId,
      lclsSystmCodes: classificationCodes[expectation.contentId] || [],
      title: [...expectation.expectedTitlesByLocale.ko][0],
    },
    translations: {},
  }));
}

test('requires an explicit live flag and exposes a non-writing help path', async () => {
  assert.throws(() => parseArgs([]), /--live/);
  assert.deepEqual(parseArgs(['--live']), { help: false, live: true });
  assert.throws(() => parseArgs(['--unknown']), /지원하지 않는/);
  assert.match(usage(), /rag:seed-live-fixture -- --live/);

  let output = '';
  const result = await main(['--help'], {
    stdout: { write: value => { output += value; } },
  });
  assert.deepEqual(result, { help: true });
  assert.match(output, /외부 호출이나 DB 쓰기 없이/);

  const processResult = spawnSync(
    process.execPath,
    [path.join('scripts', 'seedRagLiveFixture.js'), '--help'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
  );
  assert.equal(processResult.status, 0, processResult.stderr);
  assert.match(processResult.stdout, /^Usage:/);
  assert.doesNotMatch(processResult.stdout, /injected env|dotenvx/);
  assert.equal(processResult.stderr, '');
});

test('validates live credentials without exposing their values', () => {
  for (const name of Object.keys(liveEnv)) {
    assert.throws(
      () => validateRuntimeConfiguration({ ...liveEnv, [name]: '' }),
      new RegExp(name),
    );
  }
});

test('runs an injected seed, writes diagnostics, and closes its resource', async () => {
  const dataset = loadDataset('live');
  const places = placesFor(dataset);
  const first = places.shift();
  const stored = [first];
  let closeCalls = 0;
  let output = '';
  const result = await main(['--live'], {
    close: async () => { closeCalls += 1; },
    dataset,
    env: liveEnv,
    placesService: {
      getPlaceDetail: async ({ contentId }) => {
        const place = places.find(item => item.contentId === contentId);
        stored.push(place);
        return { item: { ...place.summary, contentId } };
      },
    },
    repository: {
      findExistingPlaces: async contentIds =>
        stored.filter(place => contentIds.includes(place.contentId)),
      updatePlaceCultures: async ({ contentId, cultures, summary }) => {
        const place = stored.find(item => item.contentId === contentId);
        place.summary = { ...summary, cultures };
        return true;
      },
    },
    stdout: { write: value => { output += value; } },
  });

  assert.equal(result.seededContentIds.length, 12);
  assert.equal(result.readyForEvidenceReview, true);
  assert.equal(closeCalls, 1);
  assert.match(output, /"readyForEvidenceReview": true/);
});

test('closes an injected resource on failure and sanitizes secrets', async () => {
  const dataset = loadDataset('live');
  let closeCalls = 0;
  await assert.rejects(() => main(['--live'], {
    close: async () => { closeCalls += 1; },
    dataset,
    env: liveEnv,
    placesService: {
      getPlaceDetail: async () => {
        const error = new Error('secret URL and key');
        error.code = 'UPSTREAM_FAILURE';
        throw error;
      },
    },
    repository: {
      findExistingPlaces: async () => [],
      updatePlaceCultures: async () => true,
    },
    stdout: { write: () => {} },
  }), /secret URL and key/);
  assert.equal(closeCalls, 1);

  const error = new Error('https://secret-host/?serviceKey=secret');
  error.code = 'UPSTREAM_FAILURE';
  assert.equal(safeFailure(error), 'live RAG fixture 적재 실패 (UPSTREAM_FAILURE)');
  assert.doesNotMatch(safeFailure(error), /secret-host|serviceKey/);
});
