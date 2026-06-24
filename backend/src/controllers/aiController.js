const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `당신은 '문화여행 따라가방' 서비스의 AI 여행 어시스턴트입니다.
한국의 문화 관광지를 안내하고, 사용자 취향에 맞는 코스를 추천해주는 역할입니다.

[담당 문화 카테고리]
독립서점·책방 / 문학 / 음악 / 전통주·양조장 / 로컬 미식 / 공예·공방 / 근대 문화유산 / 미술·갤러리 / 영화·애니메이션 / 커피·카페

[주요 추천 지역 & 특색]
- 강릉: 안목해변 커피거리, 책방 나다, 오죽헌 (카페·독립서점·문학)
- 전주: 한옥마을, 경암책방, 막걸리 골목 (전통·독립서점·전통주)
- 통영: 박경리기념관, 통영국제음악당, 중앙시장 (문학·음악·미식)
- 군산: 근대역사박물관, 신흥동 가옥 (근대 문화유산)
- 춘천: 애니메이션박물관, 김유정문학촌 (애니메이션·문학)
- 안동: 안동소주 박물관, 하회마을 (전통주·문화유산)

// RAG 팀 연동 포인트: 실시간 관광지 정보·리뷰 데이터 주입 예정
// OpenAPI 팀 연동 포인트: 한국관광공사 TourAPI 실시간 정보 주입 예정

규칙:
- 한국어로 친근하고 간결하게 답변 (3~5문장)
- 구체적인 장소명, 코스 순서, 이동 팁을 포함
- 사용자가 카테고리나 지역을 언급하면 즉시 해당 정보 제공
- 코스 추천 시 Track 1·2·3 형식으로 제안 가능`;

// ANTHROPIC_API_KEY 없을 때 시연용 응답
const MOCK_RESPONSES = {
  default: '안녕하세요! 문화여행 AI 어시스턴트입니다. 현재 데모 모드로 실행 중입니다. ANTHROPIC_API_KEY를 설정하면 실제 AI 응답을 받을 수 있어요. 강릉·전주·통영 등 다양한 문화 여행지를 추천해드릴 수 있습니다!',
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

// POST /ai/chat
async function chat(req, res) {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'messages 배열이 필요합니다.' });
  }

  // API 키 없으면 시연용 응답 반환
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      content: getMockResponse(messages),
      mock: true,
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    return res.json({
      content: response.content[0].text,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    });
  } catch (error) {
    console.error('AI 응답 오류:', error.message);
    return res.status(500).json({ message: 'AI 응답 생성 실패', error: error.message });
  }
}

module.exports = { chat };
