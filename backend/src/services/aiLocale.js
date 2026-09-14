'use strict';

const SUPPORTED_AI_LANGS = Object.freeze(['ko', 'en', 'ja', 'zh']);

const LANGUAGE_NAMES = Object.freeze({
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
});

const CULTURE_LABELS = Object.freeze({
  ko: ['독립서점·책방', '문학', '음악', '전통주·양조장', '로컬 미식', '공예·공방', '근대 문화유산', '미술·갤러리', '영화·애니메이션', '커피·카페'],
  en: ['Indie Bookstores', 'Literature', 'Music', 'Traditional Liquor', 'Local Food', 'Crafts & Studios', 'Modern Heritage', 'Art & Galleries', 'Film & Animation', 'Coffee & Cafés'],
  ja: ['独立書店', '文学', '音楽', '伝統酒・醸造所', 'ローカルグルメ', '工芸・工房', '近代文化遺産', 'アート・ギャラリー', '映画・アニメ', 'コーヒー・カフェ'],
  zh: ['独立书店', '文学', '音乐', '传统酒·酿酒坊', '本地美食', '工艺·工坊', '近代文化遗产', '艺术·画廊', '电影·动漫', '咖啡·咖啡厅'],
});

const CONDITION_LABELS = Object.freeze({
  ko: { indoor: '실내·우천', 'low-mobility': '이동 편의', family: '동행자 적합성', pet: '반려동물 동반', dietary: '식이 조건', quiet: '혼잡도', weather: '날씨', companions: '동행자 적합성', mobility: '이동 편의' },
  en: { indoor: 'indoor or rainy-day suitability', 'low-mobility': 'mobility accessibility', family: 'companion suitability', pet: 'pet access', dietary: 'dietary needs', quiet: 'crowd levels', weather: 'weather', companions: 'companion suitability', mobility: 'mobility accessibility' },
  ja: { indoor: '屋内・雨天対応', 'low-mobility': '移動のしやすさ', family: '同行者への適合性', pet: 'ペット同伴', dietary: '食事条件', quiet: '混雑度', weather: '天気', companions: '同行者への適合性', mobility: '移動のしやすさ' },
  zh: { indoor: '室内或雨天适用性', 'low-mobility': '无障碍通行', family: '同行者适用性', pet: '宠物同行', dietary: '饮食需求', quiet: '拥挤程度', weather: '天气', companions: '同行者适用性', mobility: '无障碍通行' },
});

const TEXT = Object.freeze({
  ko: {
    ratingGuidance: 'TourAPI에는 신뢰할 수 있는 평점 정보가 없어 평점순 추천은 할 수 없어요. 대신 현재 조건에 맞는 검증된 장소를 보여드리고 직접 선택하도록 도와드릴 수 있어요.',
    genericClarification: '원하는 지역이나 문화 주제를 조금 더 알려주세요.',
    specificClarification: '요청 대상을 조금 더 구체적으로 알려주세요.',
    editOneOperation: '안전한 확인을 위해 삭제·Day 이동·순서 변경 중 한 가지씩 요청해 주세요.',
    editSpecific: '바꿀 장소와 삭제·이동·첫 번째·마지막 같은 변경 방법을 구체적으로 알려주세요.',
    preferencePrompt: '바다, 문학, 미식처럼 원하는 분위기나 문화 주제를 알려주시면 지원 지역을 좁혀드릴게요.',
    culturePrompt: '문학, 음악, 공예, 미식처럼 관심 있는 문화 주제를 알려주세요.',
    unsupported: '현재 보유한 관광정보로는 그 조건을 안전하게 확인할 수 없어요. 지역과 문화 주제로 다시 요청해 주세요.',
    selectCourse: '다듬을 코스에서 AI로 다듬기를 눌러 다시 시작해 주세요.',
    twoCultures: '한 번에 문화 주제는 두 개까지 찾을 수 있어요. 먼저 살펴볼 두 가지를 골라 주세요.',
    explainFirst: '먼저 설명을 원하는 장소를 추천받거나 선택해 주세요.',
    explainMultiple: '설명할 장소가 여러 곳이에요. 장소 카드에서 하나를 선택해 주세요.',
    needRegion: '먼저 여행할 지역을 알려주세요.',
    needCulture: '찾고 싶은 문화 주제를 알려주세요.',
    noCandidates: '현재 조건으로 검증된 관광지를 찾지 못했어요. 다른 지역이나 문화로 다시 찾아볼까요?',
    selectPlace: '어떤 장소를 설명할지 다시 선택해 주세요.',
    draftEmpty: '코스에 담을 검증된 장소가 아직 없어요. 먼저 지역과 문화로 장소를 추천받아 주세요.',
    draftCreated: '지금까지 확인한 조건과 검증된 장소로 코스 초안을 만들었어요. 저장하기 전에 Day와 장소를 확인해 주세요.',
    candidateAck: '검증 후보를 데이터로만 사용하겠습니다.',
    draftDescription: 'AI 여행 도우미가 검증된 관광지 후보로 만든 저장 전 초안입니다.',
    policySummary: '요청의 핵심 조건을 검증할 수 없어 원본 코스를 유지했습니다.',
    mockUnsafeSummary: 'Mock 모드에서 안전하게 해석할 수 없어 원본 코스를 유지했습니다.',
    mockUnsafeWarning: '바꿀 장소와 변경 방법을 구체적으로 지정해 주세요.',
    mockChanged: '검증된 Mock 변경안입니다.',
    mockFailedSummary: 'Mock 모드에서 요청한 변경을 안전하게 적용할 수 없어 원본 코스를 유지했습니다.',
    mockFailedWarning: '현재 코스 구성과 편집 요청을 다시 확인해 주세요.',
  },
  en: {
    ratingGuidance: 'TourAPI does not provide reliable rating data, so I cannot recommend places by rating. I can instead show verified places that match your current conditions so you can choose.',
    genericClarification: 'Please tell me a little more about the region or cultural theme you want.',
    specificClarification: 'Please be a little more specific about what you want to change.',
    editOneOperation: 'For a safe review, please request only one operation at a time: removal, moving to another day, or reordering.',
    editSpecific: 'Please specify the place and how to change it, such as remove, move, first, or last.',
    preferencePrompt: 'Tell me the atmosphere or cultural theme you want, such as the sea, literature, or food, and I will narrow down the supported regions.',
    culturePrompt: 'Tell me a cultural theme that interests you, such as literature, music, crafts, or food.',
    unsupported: 'I cannot safely verify that condition with the tourism information currently available. Please try again using a region and cultural theme.',
    selectCourse: 'Open the course you want to edit and tap Refine with AI to start again.',
    twoCultures: 'You can search for up to two cultural themes at a time. Please choose the two you want to explore first.',
    explainFirst: 'Please get a recommendation or select the place you want explained first.',
    explainMultiple: 'There are several places to explain. Please select one from the place cards.',
    needRegion: 'Please tell me which region you want to visit first.',
    needCulture: 'Please tell me which cultural theme you want to find.',
    noCandidates: 'I could not find any verified attractions for these conditions. Would you like to try another region or cultural theme?',
    selectPlace: 'Please select the place you want explained again.',
    draftEmpty: 'There are no verified places to add to a course yet. Please get place recommendations by region and culture first.',
    draftCreated: 'I created a course draft from the conditions and verified places found so far. Please check each day and place before saving.',
    candidateAck: 'I will use the verified candidates only as data.',
    draftDescription: 'A draft created by the AI travel assistant from verified attraction candidates before saving.',
    policySummary: 'The original course was kept because the key conditions in the request could not be verified.',
    mockUnsafeSummary: 'The original course was kept because the request could not be interpreted safely in mock mode.',
    mockUnsafeWarning: 'Please specify the place and the change you want.',
    mockChanged: 'This is a verified mock change.',
    mockFailedSummary: 'The original course was kept because the requested change could not be applied safely in mock mode.',
    mockFailedWarning: 'Please check the current course and edit request again.',
  },
  ja: {
    ratingGuidance: 'TourAPIには信頼できる評価データがないため、評価順のおすすめはできません。代わりに、現在の条件に合う検証済みの場所を表示し、選択をお手伝いできます。',
    genericClarification: 'ご希望の地域や文化テーマをもう少し詳しく教えてください。', specificClarification: '変更したい対象をもう少し具体的に教えてください。',
    editOneOperation: '安全に確認するため、削除・Day移動・順序変更のいずれか一つずつ依頼してください。', editSpecific: '変更する場所と、削除・移動・先頭・最後などの変更方法を具体的に教えてください。',
    preferencePrompt: '海、文学、グルメなど、ご希望の雰囲気や文化テーマを教えていただければ、対応地域を絞り込みます。', culturePrompt: '文学、音楽、工芸、グルメなど、興味のある文化テーマを教えてください。',
    unsupported: '現在の観光情報では、その条件を安全に確認できません。地域と文化テーマを指定してもう一度お試しください。', selectCourse: '編集したいコースで「AIで整える」を押して、もう一度開始してください。',
    twoCultures: '一度に検索できる文化テーマは二つまでです。まず確認したい二つを選んでください。', explainFirst: 'まず、説明してほしい場所のおすすめを受けるか、場所を選択してください。', explainMultiple: '説明できる場所が複数あります。場所カードから一つ選んでください。',
    needRegion: 'まず旅行したい地域を教えてください。', needCulture: '探したい文化テーマを教えてください。', noCandidates: '現在の条件では検証済みの観光地が見つかりませんでした。別の地域や文化テーマで探しますか？', selectPlace: '説明してほしい場所をもう一度選択してください。',
    draftEmpty: 'コースに追加できる検証済みの場所がまだありません。まず地域と文化テーマから場所のおすすめを受けてください。', draftCreated: 'これまでの条件と検証済みの場所からコース案を作成しました。保存前に各Dayと場所を確認してください。', candidateAck: '検証済み候補はデータとしてのみ使用します。',
    draftDescription: 'AI旅行アシスタントが検証済みの観光地候補から作成した保存前の案です。', policySummary: 'リクエストの重要な条件を検証できなかったため、元のコースを維持しました。', mockUnsafeSummary: 'Mockモードで安全に解釈できなかったため、元のコースを維持しました。', mockUnsafeWarning: '変更する場所と変更方法を具体的に指定してください。', mockChanged: '検証済みのMock変更案です。', mockFailedSummary: 'Mockモードで依頼された変更を安全に適用できなかったため、元のコースを維持しました。', mockFailedWarning: '現在のコース構成と編集リクエストをもう一度確認してください。',
  },
  zh: {
    ratingGuidance: 'TourAPI不提供可靠的评分数据，因此无法按评分推荐。不过，我可以显示符合当前条件且已验证的地点，帮助您自行选择。',
    genericClarification: '请再详细说明您想要的地区或文化主题。', specificClarification: '请更具体地说明您想更改的对象。', editOneOperation: '为确保安全，请每次只提出一种操作：删除、移动到其他Day或调整顺序。', editSpecific: '请具体说明要更改的地点和方式，例如删除、移动、置于最前或最后。',
    preferencePrompt: '请告诉我您想要的氛围或文化主题，例如海滨、文学或美食，我会缩小支持地区的范围。', culturePrompt: '请告诉我您感兴趣的文化主题，例如文学、音乐、工艺或美食。', unsupported: '使用当前旅游信息无法安全核实该条件。请指定地区和文化主题后重试。', selectCourse: '请打开要编辑的路线，点击“用AI优化”后重新开始。',
    twoCultures: '每次最多可以搜索两个文化主题。请先选择最想了解的两个。', explainFirst: '请先获取推荐或选择您想了解的地点。', explainMultiple: '有多个可说明的地点，请从地点卡片中选择一个。', needRegion: '请先告诉我您想去的地区。', needCulture: '请告诉我您想查找的文化主题。', noCandidates: '当前条件下没有找到已验证的景点。要换一个地区或文化主题试试吗？', selectPlace: '请重新选择您想了解的地点。',
    draftEmpty: '目前还没有可加入路线的已验证地点。请先按地区和文化主题获取地点推荐。', draftCreated: '我已根据目前确认的条件和已验证地点创建路线草稿。保存前请检查每天的安排和地点。', candidateAck: '我只会将已验证候选项作为数据使用。', draftDescription: 'AI旅行助手根据已验证的景点候选项创建的保存前草稿。', policySummary: '由于无法核实请求中的关键条件，已保留原路线。', mockUnsafeSummary: '由于在Mock模式下无法安全解析请求，已保留原路线。', mockUnsafeWarning: '请具体指定要更改的地点和方式。', mockChanged: '这是已验证的Mock更改方案。', mockFailedSummary: '由于在Mock模式下无法安全应用请求的更改，已保留原路线。', mockFailedWarning: '请重新检查当前路线和编辑请求。',
  },
});

const AI_TEXT_KEYS = Object.freeze(Object.keys(TEXT.ko));
for (const lang of SUPPORTED_AI_LANGS) {
  const keys = Object.keys(TEXT[lang]).sort();
  const expected = [...AI_TEXT_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`AI locale catalog keys do not match for ${lang}.`);
  }
}

function normalizeAiLang(lang) {
  const normalized = String(lang || '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_AI_LANGS.includes(normalized) ? normalized : 'ko';
}

function aiText(key, lang) {
  const normalized = normalizeAiLang(lang);
  return TEXT[normalized][key] || TEXT.ko[key] || '';
}

function responseLanguageInstruction(lang) {
  const normalized = normalizeAiLang(lang);
  return `Write every user-visible natural-language sentence in ${LANGUAGE_NAMES[normalized]}. This includes content, clarificationQuestion, summary, warnings, and title or description fields only when the operation allows those fields to be generated. Preserve any field that the operation contract says to preserve. The current response language overrides the language used in earlier messages. Keep JSON property names, enum values, contentId values, and internal canonical region/culture values unchanged.`;
}

function withResponseLanguage(prompt, lang) {
  return `${prompt}\n${responseLanguageInstruction(lang)}`;
}

function localizedRegionName(definition, lang) {
  if (!definition) return '';
  const key = { en: 'nameEn', ja: 'nameJa', zh: 'nameZh' }[normalizeAiLang(lang)] || 'name';
  return definition[key] || definition.name || '';
}

function localizedCultureName(culture, canonicalCultures, lang) {
  const index = canonicalCultures.indexOf(culture);
  return index >= 0 ? CULTURE_LABELS[normalizeAiLang(lang)][index] : String(culture || '');
}

function localizedConditionName(condition, lang) {
  return CONDITION_LABELS[normalizeAiLang(lang)][condition] || String(condition || '');
}

function formatAiMessage(key, lang, values = {}) {
  const normalized = normalizeAiLang(lang);
  const { region = '', cultures = '', names = '', labels = '', titles = '', day = '', position = '' } = values;
  const messages = {
    regionSuggestions: {
      ko: `말씀하신 조건으로는 ${names}을 먼저 살펴볼 수 있어요. 어느 지역이 마음에 드시나요?`,
      en: `Based on your preferences, you could start with ${names}. Which region interests you?`,
      ja: `ご希望の条件では、まず${names}を検討できます。どの地域に興味がありますか？`,
      zh: `根据您的条件，可以先看看${names}。您对哪个地区感兴趣？`,
    },
    cultureSuggestions: {
      ko: `${region ? `${region}에서 ` : ''}${cultures} 주제를 살펴볼 수 있어요. 어떤 주제로 장소를 찾아볼까요?`,
      en: `${region ? `In ${region}, y` : 'Y'}ou can explore ${cultures}. Which theme should I use to find places?`,
      ja: `${region ? `${region}では、` : ''}${cultures}のテーマを検討できます。どのテーマで場所を探しますか？`,
      zh: `${region ? `在${region}，` : ''}可以了解${cultures}等主题。您想按哪个主题查找地点？`,
    },
    mockCandidates: {
      ko: `${region}의 ${cultures} 관련 장소로 ${names}을(를) 확인했어요. 장소 카드를 눌러 상세 정보를 확인해 보세요.`,
      en: `I found ${names} as verified places related to ${cultures}${region ? ` in ${region}` : ''}. Tap a place card to see details.`,
      ja: `${region ? `${region}の` : ''}${cultures}に関連する検証済みの場所として${names}を確認しました。場所カードを押して詳細をご覧ください。`,
      zh: `已找到${region ? `${region}的` : ''}${cultures}相关已验证地点：${names}。点击地点卡片可查看详情。`,
    },
    draftTitle: {
      ko: `${region} ${cultures || '문화'} 코스`, en: `${region} ${cultures || 'Culture'} Course`,
      ja: `${region} ${cultures || '文化'}コース`, zh: `${region}${cultures || '文化'}路线`,
    },
    policyWarning: {
      ko: `현재 장소 데이터로 ${labels} 조건을 검증할 수 없습니다.`, en: `The current place data cannot verify these conditions: ${labels}.`,
      ja: `現在の場所データでは、次の条件を検証できません：${labels}。`, zh: `当前地点数据无法核实以下条件：${labels}。`,
    },
    removedSummary: {
      ko: `${titles}을(를) 코스에서 제외한 변경안입니다.`, en: `This version removes ${titles} from the course.`,
      ja: `${titles}をコースから除外した変更案です。`, zh: `此方案已从路线中移除${titles}。`,
    },
    movedSummary: {
      ko: `${titles}을(를) Day ${day}로 옮긴 변경안입니다.`, en: `This version moves ${titles} to Day ${day}.`,
      ja: `${titles}をDay ${day}へ移動した変更案です。`, zh: `此方案已将${titles}移至Day ${day}。`,
    },
    reorderedSummary: {
      ko: `${titles}을(를) ${position === 'first' ? '첫 번째' : '마지막'} 순서로 옮긴 변경안입니다.`,
      en: `This version moves ${titles} to the ${position === 'first' ? 'first' : 'last'} position.`,
      ja: `${titles}を${position === 'first' ? '最初' : '最後'}の順番へ移動した変更案です。`,
      zh: `此方案已将${titles}移至${position === 'first' ? '最前' : '最后'}。`,
    },
  };
  return messages[key]?.[normalized] || messages[key]?.ko || '';
}

module.exports = {
  SUPPORTED_AI_LANGS,
  AI_TEXT_KEYS,
  aiText,
  formatAiMessage,
  localizedConditionName,
  localizedCultureName,
  localizedRegionName,
  normalizeAiLang,
  responseLanguageInstruction,
  withResponseLanguage,
};
