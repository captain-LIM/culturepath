'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pool = require('../src/config/db');
const {
  MAX_REPORT_CONTENT_LENGTH,
  createAiContentReport,
} = require('../src/services/aiContentReportService');
const { reportAiContent } = require('../src/controllers/aiController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('persists a normalized AI content report for moderation', async () => {
  const queries = [];
  const result = await createAiContentReport(
    {
      userId: 12,
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      content: '  unsafe reply  ',
      reason: '  offensive  ',
    },
    {
      pool: {
        async query(sql, params) {
          queries.push({ sql, params });
          return [{ insertId: 44 }];
        },
      },
    },
  );

  assert.deepEqual(result, { id: 44, status: 'received' });
  assert.match(queries[0].sql, /INSERT INTO ai_content_reports/);
  assert.deepEqual(queries[0].params, [
    12,
    '123e4567-e89b-42d3-a456-426614174000',
    'unsafe reply',
    'offensive',
  ]);
});

test('rejects empty, oversized, and invalid-session reports', async () => {
  const database = { query: async () => { throw new Error('must not query'); } };
  await assert.rejects(
    createAiContentReport({ userId: 1, content: '   ' }, { pool: database }),
    /content is required/,
  );
  await assert.rejects(
    createAiContentReport(
      { userId: 1, content: 'x'.repeat(MAX_REPORT_CONTENT_LENGTH + 1) },
      { pool: database },
    ),
    /content is too long/,
  );
  await assert.rejects(
    createAiContentReport(
      { userId: 1, content: 'reply', sessionId: 'not-a-session' },
      { pool: database },
    ),
    /sessionId is invalid/,
  );
});

test('controller accepts a valid report without launching an external app', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [{ insertId: 7 }];
  try {
    const res = responseRecorder();
    await reportAiContent(
      {
        user: { id: 3 },
        body: { content: 'reported answer', reason: '' },
      },
      res,
    );
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { id: 7, status: 'received' });
  } finally {
    pool.query = originalQuery;
  }
});

test('schema and migration retain reports while anonymizing deleted reporters', () => {
  const root = path.join(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'migrations', '20260902_add_ai_content_reports.sql'),
    'utf8',
  );
  for (const sql of [schema, migration]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_content_reports/);
    assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.match(sql, /status.*DEFAULT '{1,2}pending'{1,2}/s);
  }
});
