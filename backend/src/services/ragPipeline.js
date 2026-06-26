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
- 코스 추천 시 Track 1·2·3 형식으로 제안 가능
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
  
  return {
    content: llmResponse.content,
    mock: llmResponse.mock,
    retrievedDocs: docs.map(d => d.metadata),
    routeInfo,
    ...(llmResponse.usage && { usage: llmResponse.usage }),
  };
}

module.exports = { chat, routeQuery, retrieveContext, buildAugmentedPrompt };
