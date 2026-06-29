const Anthropic = require('@anthropic-ai/sdk');

// ANTHROPIC_API_KEY 없을 때 시연용 응답
const MOCK_RESPONSES = {
  default: '안녕하세요! 문화여행 AI 어시스턴트입니다. 현재 데모 모드로 실행 중입니다. 실제 AI 연동 전 임시 응답입니다. 강릉·전주·통영 등 다양한 문화 여행지를 추천해드릴 수 있습니다!',
  강릉: '강릉 감성 책방 코스를 추천드려요! Track 1은 책방 나다 → 안목해변 커피거리로 오전을 채우고, Track 2는 오죽헌에서 문학 감성을 느껴보세요. 안목해변 커피거리는 약 50개 카페가 몰려 있어 산책하기 좋습니다.',
  전주: '전주 전통 문화 코스입니다. Track 1은 한옥마을 → 경암책방으로 오전 탐방, Track 2는 전주 막걸리 골목에서 점심과 전통주 체험을 추천드려요. 한옥마을에서 도보 5분 거리라 이동도 편해요!',
  통영: '통영 문학·음악 기행 코스예요. Track 1은 박경리기념관 → 청마문학관으로 문학 감성 충전, Track 2는 통영국제음악당 → 통영 중앙시장 순서로 하루를 마무리하세요. 통영은 작지만 볼거리가 밀집해 있어요.',
};

function getMockResponse(messages) {
  const lastContent = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (lastContent.includes('강릉')) return MOCK_RESPONSES['강릉'];
  if (lastContent.includes('전주')) return MOCK_RESPONSES['전주'];
  if (lastContent.includes('통영')) return MOCK_RESPONSES['통영'];
  return MOCK_RESPONSES['default'];
}

/**
 * LLM에 프롬프트를 보내고 응답을 받습니다.
 *
 * @param {string} systemPrompt - 시스템 프롬프트 (RAG 문맥이 주입된 최종 프롬프트)
 * @param {Array<{role: string, content: string}>} messages - 대화 메시지 배열
 *   - role: 'user' 또는 'assistant'
 *   - content: 메시지 내용
 *
 * @returns {Promise<{content: string, mock: boolean, usage?: {inputTokens: number, outputTokens: number}}>}
 */
async function generate(systemPrompt, messages) {
  if (process.env.USE_MOCK_RAG === 'true' || process.env.USE_MOCK_RAG === undefined) {
    return mockGenerate(systemPrompt, messages);
  } else {
    return anthropicGenerate(systemPrompt, messages);
  }
}

// 3-1. systemPrompt를 인자로 받아 RAG Context가 주입됐는지 확인하도록 개선
async function mockGenerate(systemPrompt, messages) {
  const hasContext = systemPrompt.includes('[참고 자료]');
  const baseResponse = getMockResponse(messages);

  return {
    content: hasContext
      ? `[Mock RAG 응답] 검색된 참고 자료를 바탕으로 답변합니다:\n${baseResponse}`
      : baseResponse,
    mock: true,
  };
}

async function anthropicGenerate(systemPrompt, messages) {
  // 3-2. API 키 유효성 검사
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 설정되지 않았습니다. USE_MOCK_RAG=true로 설정하거나 API 키를 입력하세요.'
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return {
    content: response.content[0].text,
    mock: false,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

module.exports = { generate };
