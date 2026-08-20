'use strict';

const REGION_DEFINITIONS = Object.freeze({
  seoul: Object.freeze({
    areaCode: 'seoul',
    name: '서울',
    nameEn: 'Seoul',
    visitorLevel: 'metropolitan',
    visitorCodeGroups: Object.freeze([Object.freeze(['11'])]),
  }),
  gangneung: Object.freeze({
    areaCode: 'gangneung',
    name: '강릉',
    nameEn: 'Gangneung',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42150', '51150']),
    ]),
  }),
  jeonju: Object.freeze({
    areaCode: 'jeonju',
    name: '전주',
    nameEn: 'Jeonju',
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
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48220'])]),
  }),
  chuncheon: Object.freeze({
    areaCode: 'chuncheon',
    name: '춘천',
    nameEn: 'Chuncheon',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42110', '51110']),
    ]),
  }),
  pohang: Object.freeze({
    areaCode: 'pohang',
    name: '포항',
    nameEn: 'Pohang',
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
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['47170'])]),
  }),
  hadong: Object.freeze({
    areaCode: 'hadong',
    name: '하동',
    nameEn: 'Hadong',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48850'])]),
  }),
  gunsan: Object.freeze({
    areaCode: 'gunsan',
    name: '군산',
    nameEn: 'Gunsan',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['45130', '52130']),
    ]),
  }),
  mokpo: Object.freeze({
    areaCode: 'mokpo',
    name: '목포',
    nameEn: 'Mokpo',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['46110'])]),
  }),
});

function entry(areaCode, description, spotCount, curationScore, descriptionEn) {
  const region = REGION_DEFINITIONS[areaCode];
  return Object.freeze({
    areaCode,
    name: region.name,
    nameEn: region.nameEn,
    description,
    descriptionEn,
    spotCount,
    curationScore,
  });
}

const REGION_CULTURE_CATALOG = Object.freeze({
  1: Object.freeze([
    entry('seoul', '홍대·연남·망원 동네 책방 밀집지', 12, 80, 'Independent bookstores clustered in Hongdae, Yeonnam, and Mangwon'),
    entry('gangneung', '안목해변 책방거리·북스테이 성지', 1, 92, 'Anmok Beach bookstore street and book-stay haven'),
    entry('jeonju', '한옥마을 골목 독립서점 밀집', 1, 87, 'Independent bookstores tucked into Hanok Village alleys'),
  ]),
  2: Object.freeze([
    entry('tongyeong', '박경리·청마 유치환의 흔적', 1, 95, 'Traces of novelist Park Kyung-ni and poet Cheongma Yu Chi-hwan'),
    entry('gangneung', '허균·허난설헌 문학의 고장', 2, 88, 'Home of writers Heo Gyun and Heo Nanseolheon'),
    entry('hadong', '최참판댁·박경리 토지의 배경지', 2, 83, "Choi Champan House, the setting of Park Kyung-ni's novel Toji"),
  ]),
  3: Object.freeze([
    entry('tongyeong', '윤이상·통영국제음악당', 2, 94, 'Composer Isang Yun and the Tongyeong Concert Hall'),
  ]),
  4: Object.freeze([
    entry('jeonju', '막걸리 골목·전통주 공방', 1, 91, 'Makgeolli alley and traditional liquor workshops'),
    entry('andong', '안동소주·전통 양조장 투어', 1, 89, 'Andong soju and traditional distillery tours'),
  ]),
  5: Object.freeze([
    entry('jeonju', '전통시장·비빔밥·막걸리 골목', 20, 96, 'Traditional market, bibimbap, and makgeolli alley'),
    entry('gangneung', '초당 순두부·오죽헌 시장', 12, 82, 'Chodang tofu village and Ojukheon market'),
    entry('tongyeong', '통영 꿀빵·굴 요리·중앙시장', 3, 88, 'Tongyeong honey bread, oyster dishes, and Jungang Market'),
  ]),
  6: Object.freeze([
    entry('jeonju', '한옥마을 공방·한지·부채 체험', 6, 93, 'Hanok Village craft workshops: hanji paper and fan-making'),
    entry('tongyeong', '나전칠기·소반 공예 전통', 1, 85, 'Mother-of-pearl lacquerware and traditional tray craft'),
  ]),
  7: Object.freeze([
    entry('gunsan', '일제강점기 근대 건축물 밀집', 4, 92, 'Dense cluster of Japanese colonial-era modern architecture'),
    entry('pohang', '산업도시 근대 문화유산·제철 역사', 3, 87, 'Industrial-city heritage and steel-making history'),
    entry('mokpo', '구도심 근대역사문화공간', 2, 89, 'Old town modern history and culture quarter'),
  ]),
  8: Object.freeze([
    entry('seoul', '성수·을지로 소규모 갤러리', 20, 78, 'Small galleries in Seongsu and Euljiro'),
    entry('pohang', '포항시립미술관·로컬 갤러리 씬', 2, 84, 'Pohang Museum of Art and the local gallery scene'),
  ]),
  9: Object.freeze([
    entry('chuncheon', '애니메이션박물관·로봇체험관', 1, 90, 'Animation Museum and robot experience center'),
  ]),
  10: Object.freeze([
    entry('gangneung', '안목해변 커피거리·카페 성지', 18, 97, 'Anmok Beach coffee street, a cafe pilgrimage site'),
    entry('jeonju', '한옥 감성 카페 골목', 20, 85, 'Hanok-style cafe alley'),
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
