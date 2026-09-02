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
    courseEditOperation: 'remove',
    courseEditDestinationDay: null,
    courseEditDestinationPosition: 'none',
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
    courseEditOperation: 'none',
    courseEditDestinationDay: null,
    courseEditDestinationPosition: 'none',
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
            courseEditOperation: 'none',
            courseEditDestinationDay: null,
            courseEditDestinationPosition: 'none',
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

test('overrides a model clarify response when it misses a region the message clearly states', async () => {
  const service = createAiIntentService({
    llmService: {
      isMockMode: () => false,
      async generate() {
        // 모델이 "전주"를 놓치고 지역을 다시 물어보는 상황을 재현한다.
        return {
          content: JSON.stringify({
            action: 'clarify',
            regions: [],
            cultures: ['전통주·양조장'],
            preferenceTags: [],
            companions: [],
            dayCount: null,
            referencedSourceIds: [],
            referencedCoursePlaceIds: [],
            courseEditOperation: 'none',
            courseEditDestinationDay: null,
            courseEditDestinationPosition: 'none',
            needsClarification: true,
            clarificationQuestion: '먼저 여행할 지역을 알려주세요.',
          }),
        };
      },
    },
  });
  const intent = await service.parse([
    { role: 'user', content: '전주에서 전통주 관련 관광지 3곳 추천해줘' },
  ], {}, { env: { USE_MOCK_AI: 'false' } });
  assert.equal(intent.action, 'discover_places');
  assert.deepEqual(intent.regions, ['jeonju']);
  assert.deepEqual(intent.cultures, ['전통주·양조장']);
  assert.equal(intent.needsClarification, false);
});

test('overrides a model clarify response when it misses a culture the message clearly states', async () => {
  const service = createAiIntentService({
    llmService: {
      isMockMode: () => false,
      async generate() {
        return {
          content: JSON.stringify({
            action: 'clarify',
            regions: ['jeonju'],
            cultures: [],
            preferenceTags: [],
            companions: [],
            dayCount: null,
            referencedSourceIds: [],
            referencedCoursePlaceIds: [],
            courseEditOperation: 'none',
            courseEditDestinationDay: null,
            courseEditDestinationPosition: 'none',
            needsClarification: true,
            clarificationQuestion: '어떤 문화 주제를 찾으시나요?',
          }),
        };
      },
    },
  });
  const intent = await service.parse([
    { role: 'user', content: '전주 커피 카페 추천해줘' },
  ], {}, { env: { USE_MOCK_AI: 'false' } });
  assert.equal(intent.action, 'discover_places');
  assert.deepEqual(intent.regions, ['jeonju']);
  assert.deepEqual(intent.cultures, ['커피·카페']);
  assert.equal(intent.needsClarification, false);
});

test('keeps a genuine model clarification when the deterministic layer also finds nothing new', async () => {
  const service = createAiIntentService({
    llmService: {
      isMockMode: () => false,
      async generate() {
        return {
          content: JSON.stringify({
            action: 'clarify',
            regions: [],
            cultures: [],
            preferenceTags: [],
            companions: [],
            dayCount: null,
            referencedSourceIds: [],
            referencedCoursePlaceIds: [],
            courseEditOperation: 'none',
            courseEditDestinationDay: null,
            courseEditDestinationPosition: 'none',
            needsClarification: true,
            clarificationQuestion: '원하는 지역이나 문화 주제를 조금 더 알려주세요.',
          }),
        };
      },
    },
  });
  const intent = await service.parse([
    { role: 'user', content: '아무데나 추천해줘' },
  ], {}, { env: { USE_MOCK_AI: 'false' } });
  assert.equal(intent.action, 'clarify');
  assert.equal(intent.needsClarification, true);
});

test('extracts an explicit course edit plan and clarifies an ambiguous target', () => {
  const state = {
    courseId: 42,
    coursePlaceIds: ['100', '200'],
    coursePlaces: [
      { contentId: '100', title: '박경리기념관', trackNumber: 1 },
      { contentId: '200', title: '통영국제음악당', trackNumber: 1 },
    ],
  };
  const removal = deterministicIntent([
    { role: 'user', content: '음악당을 빼줘' },
  ], state);
  assert.equal(removal.action, 'edit_course');
  assert.equal(removal.courseEditOperation, 'remove');
  assert.deepEqual(removal.referencedCoursePlaceIds, ['200']);

  const ambiguous = deterministicIntent([
    { role: 'user', content: '장소 하나를 빼줘' },
  ], state);
  assert.equal(ambiguous.action, 'clarify');
  assert.equal(ambiguous.needsClarification, true);
});

test('uses the most specific title and asks compound edit operations to be split', async () => {
  const state = {
    courseId: 42,
    coursePlaceIds: ['100', '200', '300'],
    coursePlaces: [
      { contentId: '100', title: '박물관', trackNumber: 1 },
      { contentId: '200', title: '박물관 별관', trackNumber: 1 },
      { contentId: '300', title: '음악당', trackNumber: 1 },
    ],
  };
  const specific = deterministicIntent([
    { role: 'user', content: '박물관 별관을 삭제해줘' },
  ], state);
  assert.equal(specific.action, 'edit_course');
  assert.deepEqual(specific.referencedCoursePlaceIds, ['200']);

  const both = deterministicIntent([
    { role: 'user', content: '박물관을 삭제하고 박물관 별관도 삭제해줘' },
  ], state);
  assert.equal(both.action, 'edit_course');
  assert.deepEqual(both.referencedCoursePlaceIds, ['100', '200']);

  const compound = deterministicIntent([
    { role: 'user', content: '박물관은 빼고 음악당을 2일차로 옮겨줘' },
  ], state);
  assert.equal(compound.action, 'clarify');
  assert.equal(compound.needsClarification, true);
  assert.match(compound.clarificationQuestion, /한 가지씩/);

  let modelCalled = false;
  const liveService = createAiIntentService({
    llmService: {
      isMockMode: () => false,
      async generate() { modelCalled = true; throw new Error('호출하면 안 됩니다.'); },
    },
  });
  const liveSpecific = await liveService.parse([
    { role: 'user', content: '박물관 별관을 삭제해줘' },
  ], state, { env: { USE_MOCK_AI: 'false' } });
  assert.equal(modelCalled, false);
  assert.deepEqual(liveSpecific.referencedCoursePlaceIds, ['200']);
});

test('clarifies duplicate titles without losing a longer unique title match', () => {
  const state = {
    courseId: 42,
    coursePlaceIds: ['100', '101', '200'],
    coursePlaces: [
      { contentId: '100', title: '박물관', trackNumber: 1 },
      { contentId: '101', title: '박물관', trackNumber: 2 },
      { contentId: '200', title: '박물관 별관', trackNumber: 1 },
    ],
  };

  const ambiguous = deterministicIntent([
    { role: 'user', content: '박물관을 삭제해줘' },
  ], state);
  assert.equal(ambiguous.action, 'clarify');
  assert.deepEqual(ambiguous.referencedCoursePlaceIds, []);

  const specific = deterministicIntent([
    { role: 'user', content: '박물관 별관을 삭제해줘' },
  ], state);
  assert.equal(specific.action, 'edit_course');
  assert.deepEqual(specific.referencedCoursePlaceIds, ['200']);

  const mixed = deterministicIntent([
    { role: 'user', content: '박물관을 삭제하고 박물관 별관도 삭제해줘' },
  ], state);
  assert.equal(mixed.action, 'clarify');
  assert.deepEqual(mixed.referencedCoursePlaceIds, []);
});
