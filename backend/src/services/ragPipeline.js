const vectorStore = require('./vectorStore');
const llmService = require('./llmService');

const CATEGORIES = [
  '독립서점·책방', '문학', '음악', '전통주·양조장', '로컬 미식',
  '공예·공방', '근대 문화유산', '미술·갤러리', '영화·애니메이션', '커피·카페',
];

const REGIONS = ['강릉', '전주', '통영', '군산', '춘천', '안동'];

const BASE_SYSTEM_PROMPT = `당신은 '문화여행 따라가방' 서비스의 AI 여행 어시스턴트입니다.
한국의 문화 관광지를 안내하고, 사용자 취향에 맞는 코스를 추천해주는 역할입니다.

규칙:
- 한국어로 친근하고 간결하게 답변 (3~5문장)
- 구체적인 장소명, 코스 순서, 이동 팁을 포함
- 사용자가 카테고리나 지역을 언급하면 즉시 해당 정보 제공
- 코스 추천 시 Day 1·2·3 형식으로 제안 가능
- 아래 [참고 자료]에 있는 정보를 우선적으로 활용하여 답변`;

const ALIAS_MAP = {
  '카페': '커피·카페',
  '커피': '커피·카페',
  '책방': '독립서점·책방',
  '서점': '독립서점·책방',
  '북스테이': '독립서점·책방',
  '막걸리': '전통주·양조장',
  '소주': '전통주·양조장',
  '양조장': '전통주·양조장',
  '맛집': '로컬 미식',
  '음식': '로컬 미식',
  '미식': '로컬 미식',
  '공방': '공예·공방',
  '공예': '공예·공방',
  '체험': '공예·공방',
  '갤러리': '미술·갤러리',
  '미술관': '미술·갤러리',
  '아트': '미술·갤러리',
  '영화': '영화·애니메이션',
  '애니': '영화·애니메이션',
  '만화': '영화·애니메이션',
  '근대': '근대 문화유산',
  '유산': '근대 문화유산',
  '역사': '근대 문화유산'
};

function routeQuery(query) {
  // 4-1. 입력 정규화: 앞뒤 공백 제거 및 소문자 변환 (영문 혼합 입력 대비)
  const normalizedQuery = query.trim().toLowerCase();
  let matchedCategory = null;
  let matchedRegion = null;

  for (const cat of CATEGORIES) {
    if (normalizedQuery.includes(cat)) {
      matchedCategory = cat;
      break;
    }
  }

  if (!matchedCategory) {
    for (const [alias, realCat] of Object.entries(ALIAS_MAP)) {
      if (normalizedQuery.includes(alias)) {
        matchedCategory = realCat;
        break;
      }
    }
  }

  for (const reg of REGIONS) {
    if (normalizedQuery.includes(reg)) {
      matchedRegion = reg;
      break;
    }
  }

  return { category: matchedCategory, region: matchedRegion };
}

async function retrieveContext(query, routeInfo) {
  const topK = parseInt(process.env.RAG_TOP_K) || 5;
  return vectorStore.search(query, {
    category: routeInfo.category,
    region: routeInfo.region,
    topK,
  });
}

function buildAugmentedPrompt(docs) {
  if (!docs || docs.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const contextBlock = docs.map(doc => {
    const m = doc.metadata;
    return `---\n장소: ${m.place_name}\n지역: ${m.region}\n카테고리: ${m.category}\n설명: ${doc.content}`;
  }).join('\n');

  return `${BASE_SYSTEM_PROMPT}\n\n[참고 자료]\n${contextBlock}`;
}

/**
 * (선택 사항) 검색된 문서들의 연관성을 다시 평가하여 재정렬(Rerank)합니다.
 * 추후 검색 품질을 고도화할 때 주석을 해제하여 사용하세요.
 */
// async function rerankContext(query, docs) {
//   // 예시: Cohere Rerank API 연동
//   // const cohere = require('cohere-ai');
//   // cohere.init(process.env.COHERE_API_KEY);
//   // const response = await cohere.rerank({
//   //   query: query,
//   //   documents: docs.map(d => d.content),
//   //   top_n: 5,
//   //   model: "rerank-multilingual-v2.0"
//   // });
//   // return response.results.map(r => docs[r.index]);
//   
//   // 단순 통과 (Pass-through)
//   return docs;
// }

const MOCK_COURSES = {
  강릉: {
    title: '강릉 감성 책방 코스',
    description: '책방에서 시작하는 강릉 문화 여행',
    isPublic: false,
    tracks: [
      {
        trackNumber: 1,
        places: [
          { contentId: 'ai_g_1', title: '책방 나다', address: '강릉시', tel: '', openTime: '', category: '독립서점·책방' },
          { contentId: 'ai_g_2', title: '안목해변 커피거리', address: '강릉시 견소동', tel: '', openTime: '', category: '커피·카페' },
        ],
      },
      {
        trackNumber: 2,
        places: [
          { contentId: 'ai_g_3', title: '오죽헌', address: '강릉시 율곡로', tel: '', openTime: '', category: '근대 문화유산' },
        ],
      },
    ],
  },
  전주: {
    title: '전주 전통 문화 코스',
    description: '한옥마을에서 시작하는 전통 문화 여행',
    isPublic: false,
    tracks: [
      {
        trackNumber: 1,
        places: [
          { contentId: 'ai_j_1', title: '전주 한옥마을', address: '전주시 완산구 기린대로', tel: '', openTime: '', category: '근대 문화유산' },
          { contentId: 'ai_j_2', title: '경암책방', address: '전주시 완산구', tel: '', openTime: '', category: '독립서점·책방' },
        ],
      },
      {
        trackNumber: 2,
        places: [
          { contentId: 'ai_j_3', title: '전주 막걸리 골목', address: '전주시 완산구', tel: '', openTime: '', category: '전통주·양조장' },
        ],
      },
    ],
  },
  통영: {
    title: '통영 문학·음악 기행 코스',
    description: '문학과 음악이 어우러진 통영 여행',
    isPublic: false,
    tracks: [
      {
        trackNumber: 1,
        places: [
          { contentId: 'ai_t_1', title: '박경리기념관', address: '통영시 산양읍', tel: '', openTime: '', category: '문학' },
          { contentId: 'ai_t_2', title: '청마문학관', address: '통영시 망일봉길', tel: '', openTime: '', category: '문학' },
        ],
      },
      {
        trackNumber: 2,
        places: [
          { contentId: 'ai_t_3', title: '통영국제음악당', address: '통영시 도천동', tel: '', openTime: '', category: '음악' },
          { contentId: 'ai_t_4', title: '통영 중앙시장', address: '통영시 중앙동', tel: '', openTime: '', category: '로컬 미식' },
        ],
      },
    ],
  },
};

async function chat(messages) {
  const lastUserContent = messages.filter(m => m.role === 'user').pop()?.content || '';

  // 4-2. 유효한 user 메시지가 없으면 검색 없이 기본 프롬프트로만 LLM 호출
  if (!lastUserContent.trim()) {
    const llmResponse = await llmService.generate(BASE_SYSTEM_PROMPT, messages);
    return {
      content: llmResponse.content,
      mock: llmResponse.mock,
      retrievedDocs: [],
      routeInfo: { category: null, region: null },
      ...(llmResponse.usage && { usage: llmResponse.usage }),
    };
  }

  const routeInfo = routeQuery(lastUserContent);
  const docs = await retrieveContext(lastUserContent, routeInfo);
  
  // [Rerank 단계] - 추후 검색 품질을 높이고 싶을 때 주석 해제하여 사용
  // const rerankedDocs = await rerankContext(lastUserContent, docs);
  // const augmentedPrompt = buildAugmentedPrompt(rerankedDocs);
  
  const augmentedPrompt = buildAugmentedPrompt(docs); // Rerank 적용 시 이 줄 삭제/주석처리
  
  const llmResponse = await llmService.generate(augmentedPrompt, messages);
  
  const suggestedCourse =
    llmResponse.mock && routeInfo.region && MOCK_COURSES[routeInfo.region]
      ? MOCK_COURSES[routeInfo.region]
      : null;

  return {
    content: llmResponse.content,
    mock: llmResponse.mock,
    retrievedDocs: docs.map(d => d.metadata),
    routeInfo,
    suggestedCourse,
    ...(llmResponse.usage && { usage: llmResponse.usage }),
  };
}

// ── 코스 AI 편집 ─────────────────────────────────────────────────────────────

const COURSE_EDIT_SYSTEM_PROMPT = `당신은 문화여행 코스를 사용자 요청에 따라 수정하는 AI입니다.

규칙:
1. 반드시 순수 JSON만 출력 (마크다운 코드 블록 없이)
2. 코스 구조(tracks 배열, trackNumber, places 배열) 유지
3. 장소 제거 시 places 배열에서 삭제, 추가 시 모든 필드 포함
4. 새 장소 contentId는 "new_1", "new_2" 형식 사용
5. 각 track에 최소 1개 이상 장소 유지
6. title/description 수정 가능

출력 형식 (이 형식만 출력):
{"explanation":"변경 사항 설명 1~2문장","course":{...수정된 코스 JSON...}}`;

function mockEditCourse(course, userRequest) {
  const lower = userRequest.toLowerCase();
  const modified = JSON.parse(JSON.stringify(course));
  let explanation = '';

  if (lower.includes('빼') || lower.includes('제거') || lower.includes('삭제') || lower.includes('줄여')) {
    modified.tracks = modified.tracks.map(t => ({
      ...t,
      places: t.places.length > 1 ? t.places.slice(0, -1) : t.places,
    }));
    explanation = '각 Day의 마지막 장소를 제거했습니다. (Mock 모드)';
  } else if (lower.includes('실내')) {
    modified.description = (modified.description || '') + '\n(실내 위주 코스로 조정됨)';
    explanation = '실내 위주 코스로 설명을 업데이트했습니다. (Mock 모드)';
  } else if (lower.includes('아이') || lower.includes('어린이') || lower.includes('가족')) {
    modified.description = (modified.description || '') + '\n(가족 친화 코스로 조정됨)';
    explanation = '가족 친화적 코스 설명을 추가했습니다. (Mock 모드)';
  } else {
    explanation = `"${userRequest}" 요청을 받았습니다. 실제 AI 수정은 ANTHROPIC_API_KEY 설정 후 이용하세요. (Mock 모드)`;
  }

  return { course: modified, explanation, mock: true };
}

async function editCourse(course, userRequest) {
  if (process.env.USE_MOCK_RAG !== 'false') {
    return mockEditCourse(course, userRequest);
  }

  const courseJson = JSON.stringify(course);
  const userMessage = `현재 코스 JSON:\n${courseJson}\n\n수정 요청: ${userRequest}`;

  const llmResponse = await llmService.generate(
    COURSE_EDIT_SYSTEM_PROMPT,
    [{ role: 'user', content: userMessage }],
    { maxTokens: 2048 },
  );

  let jsonText = llmResponse.content.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  const parsed = JSON.parse(jsonText);
  return { course: parsed.course, explanation: parsed.explanation, mock: false };
}

module.exports = { chat, editCourse, routeQuery, retrieveContext, buildAugmentedPrompt };
