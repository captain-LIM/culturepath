'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isMockMode } = require('../src/services/llmService');

test('defaults to mock mode when USE_MOCK_AI is unset, regardless of USE_MOCK_RAG', () => {
  // USE_MOCK_RAG는 Qdrant/embedding 전용 플래그로 실제 답변 생성과 무관하다
  // (AI_CHAT_CONTRACT.md). 여기 값과 무관하게 USE_MOCK_AI가 없으면 안전하게
  // mock을 유지해야, 키를 넣고 이 값만 깜빡했을 때도 조용히 mock 응답만
  // 나가는 사고를 막는다.
  assert.equal(isMockMode({}), true);
  assert.equal(isMockMode({ USE_MOCK_RAG: 'false' }), true);
  assert.equal(isMockMode({ USE_MOCK_RAG: 'true' }), true);
});

test('honors USE_MOCK_AI explicitly in both directions', () => {
  assert.equal(isMockMode({ USE_MOCK_AI: 'false' }), false);
  assert.equal(isMockMode({ USE_MOCK_AI: 'false', USE_MOCK_RAG: 'true' }), false);
  assert.equal(isMockMode({ USE_MOCK_AI: 'true' }), true);
  assert.equal(isMockMode({ USE_MOCK_AI: 'anything-else' }), true);
});
