'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AiSessionError,
  createAiSessionStore,
} = require('../src/services/aiSessionStore');

test('keeps structured AI context for the same user and refreshes its TTL', () => {
  let now = 1000;
  const store = createAiSessionStore({ clock: () => now, ttlMs: 100, maxSessions: 3 });
  const created = store.create({
    userId: 7,
    entryContext: { type: 'course', courseId: 42 },
  });
  assert.equal(created.state.courseId, 42);
  assert.equal(created.state.entryType, 'course');

  store.update(created.id, 7, state => ({
    ...state,
    regions: ['tongyeong'],
    pendingDraft: { id: 'preview' },
  }));
  now = 1050;
  const loaded = store.get(created.id, 7);
  assert.deepEqual(loaded.state.regions, ['tongyeong']);
  assert.deepEqual(loaded.state.pendingDraft, { id: 'preview' });
  assert.equal(loaded.expiresAt, 1150);
});

test('rejects cross-user access and removes expired AI sessions', () => {
  let now = 0;
  const store = createAiSessionStore({ clock: () => now, ttlMs: 10 });
  const session = store.create({ userId: 1 });
  assert.throws(
    () => store.get(session.id, 2),
    error => error instanceof AiSessionError && error.status === 403,
  );

  now = 11;
  assert.throws(
    () => store.get(session.id, 1),
    error => error instanceof AiSessionError && error.status === 404,
  );
  assert.equal(store.size(), 0);
});

test('bounds in-memory sessions by evicting the oldest session', () => {
  let now = 0;
  const store = createAiSessionStore({ clock: () => now, ttlMs: 1000, maxSessions: 2 });
  const first = store.create({ userId: 1 });
  now += 1;
  store.create({ userId: 2 });
  now += 1;
  store.create({ userId: 3 });

  assert.equal(store.size(), 2);
  assert.throws(() => store.get(first.id, 1), /찾을 수 없습니다/);
});

test('removes every session owned by a logging-out user only', () => {
  const store = createAiSessionStore();
  store.create({ userId: 7 });
  store.create({ userId: 7 });
  const other = store.create({ userId: 8 });

  assert.equal(store.removeAllForUser(7), 2);
  assert.equal(store.size(), 1);
  assert.equal(store.get(other.id, 8).userId, '8');
});
