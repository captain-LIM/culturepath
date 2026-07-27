'use strict';

const REGION_DEFINITIONS = Object.freeze({
  seoul: Object.freeze({
    areaCode: 'seoul',
    name: '서울',
    visitorLevel: 'metropolitan',
    visitorCodeGroups: Object.freeze([Object.freeze(['11'])]),
  }),
  gangneung: Object.freeze({
    areaCode: 'gangneung',
    name: '강릉',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42150', '51150']),
    ]),
  }),
  jeonju: Object.freeze({
    areaCode: 'jeonju',
    name: '전주',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['45111', '52111']),
      Object.freeze(['45113', '52113']),
    ]),
  }),
  tongyeong: Object.freeze({
    areaCode: 'tongyeong',
    name: '통영',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48220'])]),
  }),
  chuncheon: Object.freeze({
    areaCode: 'chuncheon',
    name: '춘천',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['42110', '51110']),
    ]),
  }),
  pohang: Object.freeze({
    areaCode: 'pohang',
    name: '포항',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['47111']),
      Object.freeze(['47113']),
    ]),
  }),
  andong: Object.freeze({
    areaCode: 'andong',
    name: '안동',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['47170'])]),
  }),
  hadong: Object.freeze({
    areaCode: 'hadong',
    name: '하동',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['48850'])]),
  }),
  gunsan: Object.freeze({
    areaCode: 'gunsan',
    name: '군산',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([
      Object.freeze(['45130', '52130']),
    ]),
  }),
  mokpo: Object.freeze({
    areaCode: 'mokpo',
    name: '목포',
    visitorLevel: 'local',
    visitorCodeGroups: Object.freeze([Object.freeze(['46110'])]),
  }),
});

function entry(areaCode, description, spotCount, curationScore) {
  const region = REGION_DEFINITIONS[areaCode];
  return Object.freeze({
    areaCode,
    name: region.name,
    description,
    spotCount,
    curationScore,
  });
}

const REGION_CULTURE_CATALOG = Object.freeze({
  1: Object.freeze([
    entry('seoul', '홍대·연남·망원 동네 책방 밀집지', 12, 80),
    entry('gangneung', '안목해변 책방거리·북스테이 성지', 1, 92),
    entry('jeonju', '한옥마을 골목 독립서점 밀집', 1, 87),
  ]),
  2: Object.freeze([
    entry('tongyeong', '박경리·청마 유치환의 흔적', 1, 95),
    entry('gangneung', '허균·허난설헌 문학의 고장', 2, 88),
    entry('hadong', '최참판댁·박경리 토지의 배경지', 2, 83),
  ]),
  3: Object.freeze([
    entry('tongyeong', '윤이상·통영국제음악당', 2, 94),
  ]),
  4: Object.freeze([
    entry('jeonju', '막걸리 골목·전통주 공방', 1, 91),
    entry('andong', '안동소주·전통 양조장 투어', 1, 89),
  ]),
  5: Object.freeze([
    entry('jeonju', '전통시장·비빔밥·막걸리 골목', 20, 96),
    entry('gangneung', '초당 순두부·오죽헌 시장', 12, 82),
    entry('tongyeong', '통영 꿀빵·굴 요리·중앙시장', 3, 88),
  ]),
  6: Object.freeze([
    entry('jeonju', '한옥마을 공방·한지·부채 체험', 6, 93),
    entry('tongyeong', '나전칠기·소반 공예 전통', 1, 85),
  ]),
  7: Object.freeze([
    entry('gunsan', '일제강점기 근대 건축물 밀집', 4, 92),
    entry('pohang', '산업도시 근대 문화유산·제철 역사', 3, 87),
    entry('mokpo', '구도심 근대역사문화공간', 2, 89),
  ]),
  8: Object.freeze([
    entry('seoul', '성수·을지로 소규모 갤러리', 20, 78),
    entry('pohang', '포항시립미술관·로컬 갤러리 씬', 2, 84),
  ]),
  9: Object.freeze([
    entry('chuncheon', '애니메이션박물관·로봇체험관', 1, 90),
  ]),
  10: Object.freeze([
    entry('gangneung', '안목해변 커피거리·카페 성지', 18, 97),
    entry('jeonju', '한옥 감성 카페 골목', 20, 85),
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
