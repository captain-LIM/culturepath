const ragPipeline = require('../services/ragPipeline');

// POST /ai/chat
async function chat(req, res) {
  const { messages } = req.body;

  // 1-1. 배열 존재 + 각 요소의 형태까지 검증
  const isValid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(m => typeof m.role === 'string' && typeof m.content === 'string');

  if (!isValid) {
    return res.status(400).json({
      message: 'messages는 { role: string, content: string }[] 형태여야 합니다.',
    });
  }

  try {
    const result = await ragPipeline.chat(messages);
    return res.json(result);
  } catch (error) {
    console.error('AI 응답 오류:', error.message);

    // 1-2. 운영 환경에서는 내부 에러 메시지를 클라이언트에 노출하지 않음
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(500).json({
      message: 'AI 응답 생성 실패',
      ...(isDev && { error: error.message }),
    });
  }
}

module.exports = { chat };
