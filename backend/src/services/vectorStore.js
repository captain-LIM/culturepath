require('dotenv').config();

const MOCK_DOCUMENTS = [
  {
    id: 'doc_001',
    content: '안목해변 커피거리는 강릉시 창해로14번길에 위치한 한국 대표 커피 명소입니다. 약 50개의 카페가 해변을 따라 늘어서 있으며, 바다를 보며 커피를 즐길 수 있습니다. 강릉 커피 축제가 매년 10월에 열립니다.',
    metadata: { category: '커피·카페', region: '강릉', place_name: '안목해변 커피거리', address: '강릉시 창해로14번길', open_time: '상시' },
  },
  {
    id: 'doc_002',
    content: '책방 나다는 강릉시 경강로 2121에 위치한 독립서점입니다. 문학과 예술 관련 서적을 주로 다루며, 아늑한 분위기에서 독서를 즐길 수 있습니다. 종종 작가와의 만남 행사도 열립니다.',
    metadata: { category: '독립서점·책방', region: '강릉', place_name: '책방 나다', address: '강릉시 경강로 2121', open_time: '12:00~20:00' },
  },
  {
    id: 'doc_003',
    content: '오죽헌은 강릉시 율곡로 3139번길 24에 있는 대표적인 조선 시대 건축물입니다. 신사임당과 율곡 이이가 태어난 역사적인 문학의 산실로, 고즈넉한 풍경과 함께 깊은 문학적 영감을 얻을 수 있습니다.',
    metadata: { category: '문학', region: '강릉', place_name: '오죽헌', address: '강릉시 율곡로 3139번길 24', open_time: '09:00~18:00' },
  },
  {
    id: 'doc_004',
    content: '전주 한옥마을은 전주시 완산구 기린대로 99 일대에 위치한 대규모 한옥 군락지입니다. 700여 채의 한옥이 모여 있으며, 경기전과 오목대 등 다양한 문화유산을 함께 둘러볼 수 있는 전주의 상징입니다.',
    metadata: { category: '근대 문화유산', region: '전주', place_name: '전주 한옥마을', address: '전주시 완산구 기린대로 99', open_time: '상시' },
  },
  {
    id: 'doc_005',
    content: '경암책방은 전주시 완산구 최명희길 29에 자리 잡은 작고 예쁜 독립서점입니다. 한옥마을 골목길에 있어 접근성이 좋으며, 지역 작가들의 책과 다양한 독립 출판물을 만날 수 있습니다.',
    metadata: { category: '독립서점·책방', region: '전주', place_name: '경암책방', address: '전주시 완산구 최명희길 29', open_time: '10:00~19:00' },
  },
  {
    id: 'doc_006',
    content: '전주 막걸리 골목은 전주시 완산구 전라감영5길 일대에 조성된 전통주 명거리입니다. 주전자로 막걸리를 시키면 푸짐한 안주 상차림이 끝없이 나오는 독특한 문화를 체험할 수 있습니다.',
    metadata: { category: '전통주·양조장', region: '전주', place_name: '전주 막걸리 골목', address: '전주시 완산구 전라감영5길', open_time: '11:00~22:00' },
  },
  {
    id: 'doc_007',
    content: '박경리기념관은 통영시 산양읍 산양중앙로 173에 위치해 있습니다. 한국 문학의 거장 박경리 작가의 생애와 작품 세계를 기리기 위해 설립되었으며, 아름다운 정원과 전시실이 마련되어 있습니다.',
    metadata: { category: '문학', region: '통영', place_name: '박경리기념관', address: '통영시 산양읍 산양중앙로 173', open_time: '09:00~18:00' },
  },
  {
    id: 'doc_008',
    content: '통영국제음악당은 통영시 도천동 문화마당로 1에 있는 세계적 수준의 클래식 공연장입니다. 작곡가 윤이상을 기리며 세워졌으며, 통영 앞바다의 수려한 풍광과 함께 아름다운 음악 선율을 감상할 수 있습니다.',
    metadata: { category: '음악', region: '통영', place_name: '통영국제음악당', address: '통영시 도천동 문화마당로 1', open_time: '공연 시간표 참고' },
  },
  {
    id: 'doc_009',
    content: '통영 중앙시장은 통영시 중앙로 51에 위치한 통영 제일의 전통시장입니다. 신선한 해산물과 통영 특산물인 꿀빵, 충무김밥 등 다양한 로컬 미식을 맛볼 수 있는 활기찬 명소입니다.',
    metadata: { category: '로컬 미식', region: '통영', place_name: '통영 중앙시장', address: '통영시 중앙로 51', open_time: '06:00~21:00' },
  },
  {
    id: 'doc_010',
    content: '군산 근대역사박물관은 근대 문화유산이 많이 남은 군산의 역사를 한눈에 볼 수 있는 곳입니다. 주변의 신흥동 일본식 가옥, 옛 세관 건물들과 함께 둘러보기 좋은 코스입니다.',
    metadata: { category: '근대 문화유산', region: '군산', place_name: '근대역사박물관', address: '전북 군산시 해망로 240', open_time: '09:00~17:00' },
  },
  {
    id: 'doc_011',
    content: '애니메이션박물관은 강원도 춘천시 서면에 있는 국내 유일의 애니메이션 전문 박물관입니다. 한국 애니메이션의 역사부터 체험 코너까지 아이들과 어른 모두 동심으로 돌아갈 수 있는 공간입니다.',
    metadata: { category: '영화·애니메이션', region: '춘천', place_name: '애니메이션박물관', address: '강원도 춘천시 서면 박사로 854', open_time: '10:00~18:00' },
  },
  {
    id: 'doc_012',
    content: '안동소주 박물관은 전통주 명인 조옥화 명인이 설립한 곳으로, 안동소주의 제조 과정과 시음 체험을 제공합니다. 하회마을과 가까워 안동 문화 여행 코스로 함께 방문하기 좋습니다.',
    metadata: { category: '전통주·양조장', region: '안동', place_name: '안동소주 박물관', address: '경북 안동시 강남로 71-1', open_time: '09:00~17:00' },
  }
];

/**
 * Vector DB에서 유사 문서를 검색합니다.
 *
 * @param {string} query - 사용자의 검색 질문 (예: "강릉 카페 추천해줘")
 * @param {Object} filter - 검색 필터 조건
 * @param {string|null} filter.category - 카테고리 필터 (예: "커피·카페"). null이면 필터 안 함
 * @param {string|null} filter.region - 지역 필터 (예: "강릉"). null이면 필터 안 함
 * @param {number} filter.topK - 반환할 최대 문서 수. 기본값은 환경변수 RAG_TOP_K 또는 5
 *
 * @returns {Promise<Array<{id: string, content: string, metadata: Object, score: number}>>}
 */
async function search(query, filter = {}) {
  if (process.env.USE_MOCK_RAG === 'true' || process.env.USE_MOCK_RAG === undefined) {
    return mockSearch(query, filter);
  } else {
    return supabaseSearch(query, filter);
  }
}

async function mockSearch(query, filter) {
  const topK = filter.topK || parseInt(process.env.RAG_TOP_K) || 5;
  const tokens = query.split(/\s+/).filter(t => t.trim().length > 0);
  
  const results = [];
  
  for (const doc of MOCK_DOCUMENTS) {
    let score = 0.0;
    
    // 1단계: 카테고리 필터 (null이면 전 카테고리 허용)
    if (filter.category) {
      if (doc.metadata.category === filter.category) {
        score += 0.4;
      } else {
        continue; // 카테고리가 다르면 제외
      }
    }
    
    // 2단계: 지역 필터 (null이면 전 지역 허용)
    // ⚠️ 카테고리와 지역 필터는 AND 조건입니다.
    if (filter.region) {
      if (doc.metadata.region === filter.region) {
        score += 0.3;
      } else {
        continue; // 지역이 다르면 제외
      }
    }
    
    // 3단계: 키워드 매칭
    if (tokens.length > 0) {
      const matchScorePerToken = 0.3 / tokens.length;
      for (const token of tokens) {
        if (doc.content.includes(token) || doc.metadata.place_name.includes(token)) {
          score += matchScorePerToken;
        }
      }
    }
    
    results.push({ ...doc, score });
  }
  
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * 실제 Supabase pgvector 연동 시 사용할 함수.
 * 현재는 미구현 상태이므로 에러를 throw합니다.
 */
async function supabaseSearch(query, filter) {
  // TODO: Supabase 계정 생성 후 구현
  // const { createClient } = require('@supabase/supabase-js');
  // const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  // const embedding = await getEmbedding(query);  // 임베딩 생성
  // const { data, error } = await supabase.rpc('match_documents', {
  //   query_embedding: embedding,
  //   match_count: filter.topK || 5,
  //   filter_metadata: { category: filter.category, region: filter.region },
  // });
  throw new Error('Supabase 연동이 아직 설정되지 않았습니다. USE_MOCK_RAG=true로 설정하세요.');
}

module.exports = { search };
