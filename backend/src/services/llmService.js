'use strict';

const { createOpenRouterClient } = require('./openRouterClient');

const MOCK_RESPONSES = {
  default: '안녕하세요! 문화여행 AI 어시스턴트입니다. 현재 데모 모드로 실행 중입니다.',
  강릉: '강릉의 문화 장소를 바탕으로 코스를 함께 조정해볼게요.',
  전주: '전주의 문화 장소를 바탕으로 코스를 함께 조정해볼게요.',
  통영: '통영의 문화 장소를 바탕으로 코스를 함께 조정해볼게요.',
};

function isMockMode(env = process.env) {
  return env.USE_MOCK_RAG !== 'false';
}

function getMockResponse(messages) {
  const lastContent = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (lastContent.includes('강릉')) return MOCK_RESPONSES.강릉;
  if (lastContent.includes('전주')) return MOCK_RESPONSES.전주;
  if (lastContent.includes('통영')) return MOCK_RESPONSES.통영;
  return MOCK_RESPONSES.default;
}

async function generate(systemPrompt, messages, options = {}) {
  const env = options.env || process.env;
  if (isMockMode(env)) {
    const hasContext = systemPrompt.includes('[참고 자료]');
    const baseResponse = getMockResponse(messages);
    return {
      content: hasContext ? `[Mock RAG 응답] ${baseResponse}` : baseResponse,
      mock: true,
      model: 'mock',
    };
  }

  const client = options.client || createOpenRouterClient({
    env,
    fetchImpl: options.fetchImpl,
  });
  const response = await client.generate(systemPrompt, messages, options);
  return { ...response, mock: false };
}

async function createEmbedding(input, options = {}) {
  const env = options.env || process.env;
  if (isMockMode(env)) {
    throw new Error('Mock 모드에서는 외부 임베딩을 호출하지 않습니다.');
  }
  const client = options.client || createOpenRouterClient({
    env,
    fetchImpl: options.fetchImpl,
  });
  return client.embed(input);
}

module.exports = { createEmbedding, generate, isMockMode };
