'use strict';

const REGION_DEFINITIONS = Object.freeze({
  seoul: Object.freeze({
    areaCode: 'seoul',
    name: '서울',
    nameEn: 'Seoul',
    nameJa: 'ソウル',
    nameZh: '首尔',
    visitorLevel: 'metropolitan',
    visitorCodeGroups: Object.freeze([Object.freeze(['11'])]),
  }),
  gangneung: Object.freeze({
    areaCode: 'gangneung',
    name: '강릉',
    nameEn: 'Gangneung',
    nameJa: '江陵',
    nameZh: '江陵',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42150', '51150']),
    ]),
  }),
  jeonju: Object.freeze({
    areaCode: 'jeonju',
    name: '전주',
    nameEn: 'Jeonju',
    nameJa: '全州',
    nameZh: '全州',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['45111', '52111']),
      Object.freeze(['45113', '52113']),
    ]),
  }),
  tongyeong: Object.freeze({
    areaCode: 'tongyeong',
    name: '통영',
    nameEn: 'Tongyeong',
    nameJa: '統営',
    nameZh: '统营',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48220'])]),
  }),
  chuncheon: Object.freeze({
    areaCode: 'chuncheon',
    name: '춘천',
    nameEn: 'Chuncheon',
    nameJa: '春川',
    nameZh: '春川',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42110', '51110']),
    ]),
  }),
  pohang: Object.freeze({
    areaCode: 'pohang',
    name: '포항',
    nameEn: 'Pohang',
    nameJa: '浦項',
    nameZh: '浦项',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['47111']),
      Object.freeze(['47113']),
    ]),
  }),
  andong: Object.freeze({
    areaCode: 'andong',
    name: '안동',
    nameEn: 'Andong',
    nameJa: '安東',
    nameZh: '安东',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['47170'])]),
  }),
  hadong: Object.freeze({
    areaCode: 'hadong',
    name: '하동',
    nameEn: 'Hadong',
    nameJa: '河東',
    nameZh: '河东',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48850'])]),
  }),
  gunsan: Object.freeze({
    areaCode: 'gunsan',
    name: '군산',
    nameEn: 'Gunsan',
    nameJa: '群山',
    nameZh: '群山',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['45130', '52130']),
    ]),
  }),
  mokpo: Object.freeze({
    areaCode: 'mokpo',
    name: '목포',
    nameEn: 'Mokpo',
    nameJa: '木浦',
    nameZh: '木浦',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['46110'])]),
  }),
});

function entry(areaCode, description, spotCount, curationScore, descriptionEn, descriptionJa, descriptionZh) {
  const region = REGION_DEFINITIONS[areaCode];
  return Object.freeze({
    areaCode,
    name: region.name,
    nameEn: region.nameEn,
    nameJa: region.nameJa,
    nameZh: region.nameZh,
    description,
    descriptionEn,
    descriptionJa,
    descriptionZh,
    spotCount,
    curationScore,
  });
}

const REGION_CULTURE_CATALOG = Object.freeze({
  1: Object.freeze([
    entry('seoul', '홍대·연남·망원 동네 책방 밀집지', 12, 80, 'Independent bookstores clustered in Hongdae, Yeonnam, and Mangwon', '弘大・延南・望遠に集まる独立書店街', '弘大·延南·望远一带的独立书店聚集地'),
    entry('gangneung', '안목해변 책방거리·북스테이 성지', 1, 92, 'Anmok Beach bookstore street and book-stay haven', 'アンモク海岸の書店通り・ブックステイの聖地', '安木海边书店街·图书民宿胜地'),
    entry('jeonju', '한옥마을 골목 독립서점 밀집', 1, 87, 'Independent bookstores tucked into Hanok Village alleys', '韓屋村の路地に集まる独立書店', '韩屋村巷弄间的独立书店'),
  ]),
  2: Object.freeze([
    entry('tongyeong', '박경리·청마 유치환의 흔적', 1, 95, 'Traces of novelist Park Kyung-ni and poet Cheongma Yu Chi-hwan', '朴景利・青馬柳致環の足跡', '朴景利与青马柳致环的足迹'),
    entry('gangneung', '허균·허난설헌 문학의 고장', 2, 88, 'Home of writers Heo Gyun and Heo Nanseolheon', '許筠・許蘭雪軒ゆかりの文学の里', '许筠·许兰雪轩文学故里'),
    entry('hadong', '최참판댁·박경리 토지의 배경지', 2, 83, "Choi Champan House, the setting of Park Kyung-ni's novel Toji", '崔参判宅、朴景利の小説『土地』の舞台', '崔参判宅，朴景利小说《土地》的背景地'),
  ]),
  3: Object.freeze([
    entry('tongyeong', '윤이상·통영국제음악당', 2, 94, 'Composer Isang Yun and the Tongyeong Concert Hall', '尹伊桑と統営国際音楽堂', '作曲家尹伊桑与统营国际音乐堂'),
  ]),
  4: Object.freeze([
    entry('jeonju', '막걸리 골목·전통주 공방', 1, 91, 'Makgeolli alley and traditional liquor workshops', 'マッコリ横丁と伝統酒工房', '马格利酒巷·传统酒作坊'),
    entry('andong', '안동소주·전통 양조장 투어', 1, 89, 'Andong soju and traditional distillery tours', '安東焼酎と伝統醸造所ツアー', '安东烧酒与传统酿造厂之旅'),
  ]),
  5: Object.freeze([
    entry('jeonju', '전통시장·비빔밥·막걸리 골목', 20, 96, 'Traditional market, bibimbap, and makgeolli alley', '伝統市場・ビビンバ・マッコリ横丁', '传统市场·拌饭·马格利酒巷'),
    entry('gangneung', '초당 순두부·오죽헌 시장', 12, 82, 'Chodang tofu village and Ojukheon market', '草堂スンドゥブ村とオジュクホン市場', '草堂豆腐村与乌竹轩市场'),
    entry('tongyeong', '통영 꿀빵·굴 요리·중앙시장', 3, 88, 'Tongyeong honey bread, oyster dishes, and Jungang Market', '統営のハチミツパン・牡蠣料理・中央市場', '统营蜂蜜面包·牡蛎料理·中央市场'),
  ]),
  6: Object.freeze([
    entry('jeonju', '한옥마을 공방·한지·부채 체험', 6, 93, 'Hanok Village craft workshops: hanji paper and fan-making', '韓屋村の工房・韓紙・扇子づくり体験', '韩屋村工坊·韩纸与扇子体验'),
    entry('tongyeong', '나전칠기·소반 공예 전통', 1, 85, 'Mother-of-pearl lacquerware and traditional tray craft', '螺鈿漆器と伝統膳工芸', '螺钿漆器与传统木盘工艺'),
  ]),
  7: Object.freeze([
    entry('gunsan', '일제강점기 근대 건축물 밀집', 4, 92, 'Dense cluster of Japanese colonial-era modern architecture', '日本統治時代の近代建築が密集', '日治时期近代建筑聚集地'),
    entry('pohang', '산업도시 근대 문화유산·제철 역사', 3, 87, 'Industrial-city heritage and steel-making history', '産業都市の近代文化遺産と製鉄の歴史', '工业城市近代文化遗产与制铁历史'),
    entry('mokpo', '구도심 근대역사문화공간', 2, 89, 'Old town modern history and culture quarter', '旧市街の近代歴史文化空間', '旧市区近代历史文化空间'),
  ]),
  8: Object.freeze([
    entry('seoul', '성수·을지로 소규모 갤러리', 20, 78, 'Small galleries in Seongsu and Euljiro', '聖水・乙支路の小規模ギャラリー', '圣水洞·乙支路小型画廊'),
    entry('pohang', '포항시립미술관·로컬 갤러리 씬', 2, 84, 'Pohang Museum of Art and the local gallery scene', '浦項市立美術館とローカルギャラリーシーン', '浦项市立美术馆与本地画廊'),
  ]),
  9: Object.freeze([
    entry('chuncheon', '애니메이션박물관·로봇체험관', 1, 90, 'Animation Museum and robot experience center', 'アニメーション博物館とロボット体験館', '动画博物馆与机器人体验馆'),
  ]),
  10: Object.freeze([
    entry('gangneung', '안목해변 커피거리·카페 성지', 18, 97, 'Anmok Beach coffee street, a cafe pilgrimage site', 'アンモク海岸のコーヒー通り、カフェの聖地', '安木海边咖啡街，咖啡爱好者圣地'),
    entry('jeonju', '한옥 감성 카페 골목', 20, 85, 'Hanok-style cafe alley', '韓屋情緒あふれるカフェ横丁', '韩屋风情咖啡巷'),
  ]),
});

function getRegionsForCulture(cultureId) {
  return REGION_CULTURE_CATALOG[String(cultureId)] || null;
}

function getRegionDefinition(areaCode) {
  return REGION_DEFINITIONS[areaCode] || null;
}

module.exports = {
  REGION_CULTURE_CATALOG,
  REGION_DEFINITIONS,
  getRegionDefinition,
  getRegionsForCulture,
};
