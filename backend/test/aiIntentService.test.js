'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createAiIntentService,
  deterministicIntent,
  normalizeIntent,
} = require('../src/services/aiIntentService');
const {
  PREFERENCE_ALIASES,
  REGION_PROFILES,
} = require('../src/config/aiRegionProfiles');

test('keeps every curated region tag explainable and backed by review evidence', () => {
  const supportedTags = new Set(Object.keys(PREFERENCE_ALIASES));
  for (const profile of Object.values(REGION_PROFILES)) {
    assert.ok(profile.tags.length > 0);
    assert.ok(profile.tags.every(tag => supportedTags.has(tag)));
    assert.ok(profile.evidence.length > 0);
    assert.ok(profile.evidence.every(item => typeof item === 'string' && item.trim()));
  }
});

test('extracts exact region, culture, companion and day conditions without a model', () => {
  const intent = deterministicIntent([
    { role: 'user', content: '중년층 가족과 통영 문학 여행을 2일 코스로 짜줘' },
  ], {});
  assert.equal(intent.action, 'create_course_draft');
  assert.deepEqual(intent.regions, ['tongyeong']);
  assert.deepEqual(intent.cultures, ['문학']);
  assert.ok(intent.companions.includes('middle_aged_group'));
  assert.equal(intent.dayCount, 2);
});

test('uses the previous region when a follow-up asks for another culture', () => {
  const intent = deterministicIntent([
    { role: 'user', content: '해당 지역 다른 카테고리도 추천해줘' },
  ], {
    regions: ['tongyeong'],
    cultures: ['문학'],
    preferenceTags: ['sea'],
  });
  assert.equal(intent.action, 'discover_cultures');
  assert.deepEqual(intent.regions, ['tongyeong']);
});

test('reuses a preference tag from an earlier turn instead of asking again', () => {
  const intent = deterministicIntent([
    { role: 'user', content: '동행인은 대부분 중년층인데 어떤 주제가 좋을까?' },
  ], {
    preferenceTags: ['sea'],
    regions: [],
    cultures: [],
  });

  assert.equal(intent.needsClarification, false);
  assert.equal(intent.action, 'discover_cultures');
  assert.deepEqual(intent.preferenceTags, ['sea']);
});

test('validates model references against session allowlists', () => {
  const normalized = normalizeIntent({
    action: 'explain_place',
    regions: ['tongyeong', 'unknown'],
    cultures: ['문학', '가짜 문화'],
    preferenceTags: [],
    companions: [],
    dayCount: null,
    referencedSourceIds: ['100', '999'],
    referencedCoursePlaceIds: ['200', '888'],
    needsClarification: false,
    clarificationQuestion: null,
  }, {
    recentSources: [{ contentId: '100' }],
    coursePlaceIds: ['200'],
  }, {});

  assert.deepEqual(normalized.regions, ['tongyeong']);
  assert.deepEqual(normalized.cultures, ['문학']);
  assert.deepEqual(normalized.referencedSourceIds, ['100']);
  assert.deepEqual(normalized.referencedCoursePlaceIds, ['200']);
});

test('allows only curated preference tags and clarifies a multi-region place request', () => {
  const normalized = normalizeIntent({
    action: 'discover_places',
    regions: ['gangneung', 'tongyeong'],
    cultures: ['문학'],
    preferenceTags: ['sea', 'invented_tag'],
    companions: [],
    dayCount: null,
    referencedSourceIds: [],
    referencedCoursePlaceIds: [],
    needsClarification: false,
    clarificationQuestion: null,
  }, {}, {});

  assert.equal(normalized.action, 'clarify');
  assert.equal(normalized.needsClarification, true);
  assert.deepEqual(normalized.preferenceTags, ['sea']);
});

test('uses strict structured generation in live mode', async () => {
  let receivedOptions;
  const service = createAiIntentService({
    llmService: {
      isMockMode: () => false,
      async generate(systemPrompt, messages, options) {
        assert.match(systemPrompt, /의도 해석기/);
        assert.equal(messages.length, 1);
        receivedOptions = options;
        return {
          content: JSON.stringify({
            action: 'discover_places',
            regions: ['tongyeong'],
            cultures: ['문학'],
            preferenceTags: [],
            companions: [],
            dayCount: null,
            referencedSourceIds: [],
            referencedCoursePlaceIds: [],
            needsClarification: false,
            clarificationQuestion: null,
          }),
        };
      },
    },
  });
  const intent = await service.parse([
    { role: 'user', content: '통영 문학 장소 추천해줘' },
  ], {}, { env: { USE_MOCK_AI: 'false' } });
  assert.equal(receivedOptions.jsonSchema.name, 'culturepath_intent');
  assert.equal(receivedOptions.temperature, 0);
  assert.equal(intent.action, 'discover_places');
});
