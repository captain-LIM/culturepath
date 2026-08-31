'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createAiChatService } = require('../src/services/aiChatService');
const { createAiSessionStore } = require('../src/services/aiSessionStore');

function source(contentId = '100') {
  return {
    contentId,
    title: '박경리기념관',
    address: '통영시',
    category: '문학',
    cultures: ['문학'],
    region: 'tongyeong',
    regionName: '통영',
    trustedSource: true,
  };
}

function intent(action, overrides = {}) {
  return {
    action,
    regions: ['tongyeong'],
    cultures: ['문학'],
    preferenceTags: ['sea'],
    companions: [],
    dayCount: null,
    referencedSourceIds: [],
    referencedCoursePlaceIds: action === 'edit_course' ? ['200'] : [],
    courseEditOperation: action === 'edit_course' ? 'remove' : 'none',
    courseEditDestinationDay: null,
    courseEditDestinationPosition: 'none',
    needsClarification: false,
    clarificationQuestion: null,
    ...overrides,
  };
}

test('returns only Backend candidate cards and reuses the structured session', async () => {
  const sessionStore = createAiSessionStore();
  let resolveCalls = 0;
  const intents = [intent('discover_places'), intent('create_course_draft', { dayCount: 2 })];
  const service = createAiChatService({
    sessionStore,
    intentService: { async parse() { return intents.shift(); } },
    candidateResolver: {
      async resolve() {
        resolveCalls += 1;
        return { items: [source('100'), source('200')], cacheStatus: 'HIT', partial: false };
      },
      async rehydrate() {
        return { items: [source('100'), source('200')], cacheStatus: 'HIT', partial: false };
      },
    },
    llmService: {
      isMockMode: () => true,
      async generate() { throw new Error('mock 설명은 외부 모델을 호출하지 않는다.'); },
    },
  });

  const first = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '통영 문학 장소 추천해줘' }],
    entryContext: { type: 'general', courseId: null },
    env: { USE_MOCK_AI: 'true' },
  });
  assert.match(first.sessionId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(first.sources.map(item => item.contentId), ['100', '200']);

  const second = await service.chat({
    userId: 7,
    sessionId: first.sessionId,
    messages: [{ role: 'user', content: '2일 코스로 만들어줘' }],
    entryContext: { type: 'general', courseId: null },
    env: { USE_MOCK_AI: 'true' },
  });
  assert.equal(resolveCalls, 1);
  assert.equal(second.action, 'create_course_draft');
  assert.equal(second.suggestedCourse.tracks.length, 2);
  assert.equal(second.suggestedCourse.tracks[0].places[0].contentId, '100');
});

test('caps a plain recommendation to a browsable number and explains each one', async () => {
  const sessionStore = createAiSessionStore();
  const items = ['100', '200', '300', '400', '500'].map(id => source(id));
  let explainedCandidateCount = null;
  const intents = [intent('discover_places'), intent('create_course_draft', { dayCount: 1 })];
  const service = createAiChatService({
    sessionStore,
    intentService: { async parse() { return intents.shift(); } },
    candidateResolver: {
      async resolve() { return { items, cacheStatus: 'HIT', partial: false }; },
      async rehydrate() { return { items, cacheStatus: 'HIT', partial: false }; },
    },
    llmService: {
      isMockMode: () => false,
      async generate(_systemPrompt, messages) {
        explainedCandidateCount = JSON.parse(messages[0].content).referenceCandidates.length;
        return { content: '설명', usage: null };
      },
    },
  });

  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '영화 관광지 추천해줘' }],
    entryContext: { type: 'general', courseId: null },
  });

  // 후보가 5곳이어도 화면엔 한 번에 훑을 수 있는 3곳까지만 보여준다.
  assert.deepEqual(response.sources.map(item => item.contentId), ['100', '200', '300']);
  // LLM에도 잘린 3곳만 넘겨, 보여주지 않는 후보를 본문에서 언급하지 않는다.
  assert.equal(explainedCandidateCount, 3);

  const followUp = await service.chat({
    userId: 7,
    sessionId: response.sessionId,
    messages: [{ role: 'user', content: '2일 코스로 만들어줘' }],
    entryContext: { type: 'general', courseId: null },
  });
  // 화면 표시는 3곳으로 줄였지만, 다음 턴(코스 초안)은 전체 후보 5곳을 그대로 쓸 수 있다.
  assert.equal(followUp.suggestedCourse.tracks.reduce((sum, t) => sum + t.places.length, 0), 5);
});

test('routes a course-context edit to the existing-place editor without candidate search', async () => {
  let resolverCalled = false;
  let editedCourse;
  const course = {
    id: 42,
    title: '통영 문학 코스',
    description: '',
    tracks: [{
      trackNumber: 1,
      places: [
        { contentId: '100', title: '박경리기념관' },
        { contentId: '200', title: '통영국제음악당' },
      ],
    }],
  };
  const service = createAiChatService({
    sessionStore: createAiSessionStore(),
    intentService: { async parse() { return intent('edit_course'); } },
    candidateResolver: { async resolve() { resolverCalled = true; return { items: [] }; } },
    courseLoader: async (courseId, userId) => {
      assert.equal(courseId, 42);
      assert.equal(userId, 7);
      return course;
    },
    courseEditor: async (current, request, constraints) => {
      editedCourse = current;
      assert.equal(request, '음악당을 빼줘');
      assert.deepEqual(constraints.editPlan, {
        operation: 'remove',
        targetContentIds: ['200'],
        destinationDay: null,
        destinationPosition: 'none',
      });
      return {
        course: { ...current, tracks: [{ trackNumber: 1, places: [current.tracks[0].places[0]] }] },
        summary: '장소 한 곳을 제외했습니다.',
        warnings: [],
        sources: [],
        mock: true,
      };
    },
    llmService: { isMockMode: () => true },
  });

  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '음악당을 빼줘' }],
    entryContext: { type: 'course', courseId: 42 },
    env: { USE_MOCK_AI: 'true' },
  });
  assert.equal(editedCourse.id, 42);
  assert.equal(resolverCalled, false);
  assert.equal(response.action, 'edit_course');
  assert.equal(response.suggestedCourse.tracks[0].places.length, 1);
});

test('does not fabricate candidates when the resolver returns an empty result', async () => {
  const service = createAiChatService({
    sessionStore: createAiSessionStore(),
    intentService: { async parse() { return intent('discover_places'); } },
    candidateResolver: {
      async resolve() { return { items: [], cacheStatus: 'HIT', partial: false }; },
    },
    llmService: { isMockMode: () => true },
  });
  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '통영 문학 장소 추천' }],
    env: { USE_MOCK_AI: 'true' },
  });
  assert.deepEqual(response.sources, []);
  assert.match(response.content, /찾지 못했어요/);
});

test('never calls the model when no candidates are found, even outside mock mode', async () => {
  // 라이브 스모크에서 실제로 확인된 사례: referenceCandidates가 빈 배열이어도
  // 모델이 "한계를 알려주라"는 지시를 어기고 실존하는 듯한 장소를 만들어냈다.
  // 모델의 준수 여부에 맡기지 않고, 후보가 0곳이면 Backend가 모델을 아예
  // 호출하지 않아야 한다.
  let generateCalled = false;
  const service = createAiChatService({
    sessionStore: createAiSessionStore(),
    intentService: { async parse() { return intent('discover_places'); } },
    candidateResolver: {
      async resolve() { return { items: [], cacheStatus: 'HIT', partial: false }; },
    },
    llmService: {
      isMockMode: () => false,
      async generate() { generateCalled = true; return { content: '조작된 답변', usage: null }; },
    },
  });
  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '군산 영화 관광지 추천해줘' }],
    entryContext: { type: 'general', courseId: null },
  });
  assert.equal(generateCalled, false);
  assert.deepEqual(response.sources, []);
  assert.match(response.content, /찾지 못했어요/);
  assert.equal(response.mock, false);
});

test('asks the user to narrow more than two culture filters before candidate lookup', async () => {
  let resolverCalled = false;
  const service = createAiChatService({
    sessionStore: createAiSessionStore(),
    intentService: {
      async parse() {
        return intent('discover_places', {
          cultures: ['문학', '음악', '공예·공방'],
        });
      },
    },
    candidateResolver: {
      async resolve() { resolverCalled = true; return { items: [] }; },
    },
    llmService: { isMockMode: () => true },
  });

  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '통영 문화 장소를 폭넓게 보여줘' }],
    env: { USE_MOCK_AI: 'true' },
  });

  assert.equal(response.action, 'clarify');
  assert.equal(resolverCalled, false);
  assert.match(response.content, /두 개까지/);
});

test('refuses a rating-based recommendation because TourAPI has no trusted rating', async () => {
  let resolverCalled = false;
  let intentCalled = false;
  const service = createAiChatService({
    sessionStore: createAiSessionStore(),
    intentService: {
      async parse() { intentCalled = true; return intent('discover_places'); },
    },
    candidateResolver: {
      async resolve() { resolverCalled = true; return { items: [source()], partial: false }; },
    },
    llmService: { isMockMode: () => true },
  });

  const response = await service.chat({
    userId: 7,
    messages: [{ role: 'user', content: '추천한 카테고리에서 가장 평 높은 곳 추가해줘' }],
    env: { USE_MOCK_AI: 'true' },
  });

  assert.equal(resolverCalled, false);
  assert.equal(intentCalled, false);
  assert.equal(response.action, 'unsupported');
  assert.deepEqual(response.sources, []);
  assert.match(response.content, /평점순 추천은 할 수 없어요/);
  assert.doesNotMatch(response.content, /공개 코스에서 많이 사용/);
});

test('explains only the referenced trusted source from the recent candidate set', async () => {
  const sessionStore = createAiSessionStore();
  const detailedIds = [];
  const created = sessionStore.create({ userId: 7 });
  sessionStore.update(created.id, 7, state => ({
    ...state,
    regions: ['tongyeong'],
    cultures: ['문학'],
    recentSources: [{ contentId: '100' }, { contentId: '200' }],
  }));
  const service = createAiChatService({
    sessionStore,
    intentService: {
      async parse() {
        return intent('explain_place', { referencedSourceIds: ['200'] });
      },
    },
    candidateResolver: {
      async rehydrate() {
        return { items: [source('100'), source('200')], cacheStatus: 'HIT', partial: false };
      },
      async getDetail({ contentId }) {
        detailedIds.push(contentId);
        return { item: { overview: '검증된 상세 설명' }, cacheStatus: 'HIT' };
      },
    },
    llmService: {
      isMockMode: () => false,
      async generate(systemPrompt, messages) {
        assert.match(systemPrompt, /검증한 referenceCandidates/);
        const payload = JSON.parse(messages[0].content);
        assert.equal(
          payload.referenceCandidates[0].detail.overview,
          '검증된 상세 설명',
        );
        return { content: '검증된 상세 정보를 설명합니다.', usage: null };
      },
    },
  });

  const response = await service.chat({
    userId: 7,
    sessionId: created.id,
    messages: [{ role: 'user', content: '두 번째 장소를 더 설명해 줘' }],
    env: { USE_MOCK_AI: 'false' },
  });

  assert.equal(response.action, 'explain_place');
  assert.deepEqual(response.sources.map(item => item.contentId), ['200']);
  assert.deepEqual(detailedIds, ['200']);
  assert.equal(Object.hasOwn(response.sources[0], 'detail'), false);
});

test('clarifies an ambiguous place explanation without reloading candidates', async () => {
  const sessionStore = createAiSessionStore();
  const created = sessionStore.create({ userId: 7 });
  sessionStore.update(created.id, 7, state => ({
    ...state,
    regions: ['tongyeong'],
    cultures: ['문학'],
    recentSources: [{ contentId: '100' }, { contentId: '200' }],
  }));
  let resolverCalled = false;
  const service = createAiChatService({
    sessionStore,
    intentService: {
      async parse() { return intent('explain_place'); },
    },
    candidateResolver: {
      async resolve() { resolverCalled = true; return { items: [] }; },
      async rehydrate() { resolverCalled = true; return { items: [] }; },
    },
    llmService: { isMockMode: () => true },
  });

  const response = await service.chat({
    userId: 7,
    sessionId: created.id,
    messages: [{ role: 'user', content: '그 장소를 설명해 줘' }],
    env: { USE_MOCK_AI: 'true' },
  });

  assert.equal(response.action, 'clarify');
  assert.equal(resolverCalled, false);
  assert.match(response.content, /하나를 선택/);
});

test('clears only pending previews after save and keeps the conversation session', async () => {
  const sessionStore = createAiSessionStore();
  const created = sessionStore.create({ userId: 7 });
  sessionStore.update(created.id, 7, state => ({
    ...state,
    pendingDraft: { id: 'draft' },
    pendingTransform: { id: 'transform' },
    regions: ['tongyeong'],
  }));
  const service = createAiChatService({
    sessionStore,
    courseLoader: async () => ({
      tracks: [{
        trackNumber: 1,
        places: [{ contentId: '100', title: '박경리기념관' }],
      }],
    }),
    llmService: { isMockMode: () => true },
  });

  const result = await service.markCourseSaved({
    userId: 7,
    sessionId: created.id,
    courseId: 42,
  });
  const kept = sessionStore.get(created.id, 7);
  assert.equal(result.courseId, 42);
  assert.equal(kept.state.courseId, 42);
  assert.deepEqual(kept.state.regions, ['tongyeong']);
  assert.equal(kept.state.pendingDraft, null);
  assert.equal(kept.state.pendingTransform, null);
});
