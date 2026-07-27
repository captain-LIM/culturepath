import '../../course_builder/data/course_model.dart';
import '../../course_builder/data/place_item.dart';

CourseItem getSeasonalRecommendedCourse() {
  final month = DateTime.now().month;
  if (month >= 3 && month <= 5) return _springCourse;
  if (month >= 6 && month <= 8) return _summerCourse;
  if (month >= 9 && month <= 11) return _autumnCourse;
  return _winterCourse;
}

// ── 여름 ──────────────────────────────────────────────────────────────────────

const _summerCourse = CourseItem(
  title: '여름 문화 기행 — 바다·카페·미식',
  description: '강릉의 커피향과 통영의 남해 미식, 목포의 근대 골목을 따라가는 여름 문화 코스',
  tracks: [
    CourseTrack(trackNumber: 1, places: [
      PlaceItem(
        contentId: 'rec_summer_1_1',
        title: '테라로사 본점',
        category: '커피·카페',
        region: '강릉',
        address: '강원 강릉시 구정면 현천길 25',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_1_2',
        title: '오죽헌',
        category: '근대 문화유산',
        region: '강릉',
        address: '강원 강릉시 율곡로3139번길 24',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_1_3',
        title: '강릉 선교장',
        category: '근대 문화유산',
        region: '강릉',
        address: '강원 강릉시 운정길 63',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 2, places: [
      PlaceItem(
        contentId: 'rec_summer_2_1',
        title: '동피랑 벽화마을',
        category: '미술·갤러리',
        region: '통영',
        address: '경남 통영시 동피랑1길 6',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_2_2',
        title: '통영 중앙시장',
        category: '로컬 미식',
        region: '통영',
        address: '경남 통영시 중앙로 27',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_2_3',
        title: '박경리기념관',
        category: '문학',
        region: '통영',
        address: '경남 통영시 산양읍 산양중앙로 173',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 3, places: [
      PlaceItem(
        contentId: 'rec_summer_3_1',
        title: '목포 근대역사관 1관',
        category: '근대 문화유산',
        region: '목포',
        address: '전남 목포시 영산로29번길 6',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_3_2',
        title: '이훈동정원',
        category: '근대 문화유산',
        region: '목포',
        address: '전남 목포시 유달로 182',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_summer_3_3',
        title: '목포 문학관',
        category: '문학',
        region: '목포',
        address: '전남 목포시 해안로249번길 21',
        tel: '',
        openTime: '',
      ),
    ]),
  ],
);

// ── 봄 ───────────────────────────────────────────────────────────────────────

const _springCourse = CourseItem(
  title: '봄 문화 기행 — 전통·공예·책방',
  description: '전주 한옥마을의 전통주와 공예, 서울 골목 독립서점, 안동의 유교 문화를 잇는 봄 코스',
  tracks: [
    CourseTrack(trackNumber: 1, places: [
      PlaceItem(
        contentId: 'rec_spring_1_1',
        title: '전주 전통술박물관',
        category: '전통주·양조장',
        region: '전주',
        address: '전북 전주시 완산구 한지길 76',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_1_2',
        title: '전주공예품전시관',
        category: '공예·공방',
        region: '전주',
        address: '전북 전주시 완산구 태조로 15',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_1_3',
        title: '전주 최명희문학관',
        category: '문학',
        region: '전주',
        address: '전북 전주시 완산구 최명희길 29',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 2, places: [
      PlaceItem(
        contentId: 'rec_spring_2_1',
        title: '땡스북스',
        category: '독립서점·책방',
        region: '서울',
        address: '서울 마포구 와우산로29나길 10',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_2_2',
        title: '유어마인드',
        category: '독립서점·책방',
        region: '서울',
        address: '서울 마포구 잔다리로 35',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_2_3',
        title: '국립현대미술관 서울관',
        category: '미술·갤러리',
        region: '서울',
        address: '서울 종로구 삼청로 30',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 3, places: [
      PlaceItem(
        contentId: 'rec_spring_3_1',
        title: '안동 하회마을',
        category: '근대 문화유산',
        region: '안동',
        address: '경북 안동시 풍천면 전서로 206',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_3_2',
        title: '봉정사',
        category: '근대 문화유산',
        region: '안동',
        address: '경북 안동시 서후면 봉정사길 222',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_spring_3_3',
        title: '안동민속박물관',
        category: '근대 문화유산',
        region: '안동',
        address: '경북 안동시 민속촌길 13',
        tel: '',
        openTime: '',
      ),
    ]),
  ],
);

// ── 가을 ──────────────────────────────────────────────────────────────────────

const _autumnCourse = CourseItem(
  title: '가을 문화 기행 — 문학·미술·갤러리',
  description: '서울 미술관 순례부터 강릉 문학 기행, 하동 차밭 공방까지 이어지는 가을 코스',
  tracks: [
    CourseTrack(trackNumber: 1, places: [
      PlaceItem(
        contentId: 'rec_autumn_1_1',
        title: '일민미술관',
        category: '미술·갤러리',
        region: '서울',
        address: '서울 종로구 세종대로 152',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_1_2',
        title: '아트선재센터',
        category: '미술·갤러리',
        region: '서울',
        address: '서울 종로구 율곡로3길 144',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_1_3',
        title: '리스본 서점',
        category: '독립서점·책방',
        region: '서울',
        address: '서울 종로구 자하문로7길 22',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 2, places: [
      PlaceItem(
        contentId: 'rec_autumn_2_1',
        title: '강릉 문학관',
        category: '문학',
        region: '강릉',
        address: '강원 강릉시 난설헌로 193',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_2_2',
        title: '허균·허난설헌기념관',
        category: '문학',
        region: '강릉',
        address: '강원 강릉시 난설헌로 193',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_2_3',
        title: '테라로사 본점',
        category: '커피·카페',
        region: '강릉',
        address: '강원 강릉시 구정면 현천길 25',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 3, places: [
      PlaceItem(
        contentId: 'rec_autumn_3_1',
        title: '하동 차문화센터',
        category: '공예·공방',
        region: '하동',
        address: '경남 하동군 화개면 화개로 304',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_3_2',
        title: '최참판댁',
        category: '문학',
        region: '하동',
        address: '경남 하동군 악양면 평사리길 66-7',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_autumn_3_3',
        title: '하동 야생차박물관',
        category: '공예·공방',
        region: '하동',
        address: '경남 하동군 화개면 화개로 304',
        tel: '',
        openTime: '',
      ),
    ]),
  ],
);

// ── 겨울 ──────────────────────────────────────────────────────────────────────

const _winterCourse = CourseItem(
  title: '겨울 문화 기행 — 영화·근대·카페',
  description: '춘천 영화도시의 감성, 군산 근대 골목의 역사, 강릉 커피 향으로 마무리하는 겨울 코스',
  tracks: [
    CourseTrack(trackNumber: 1, places: [
      PlaceItem(
        contentId: 'rec_winter_1_1',
        title: '춘천 CGV 아트홀',
        category: '영화·애니메이션',
        region: '춘천',
        address: '강원 춘천시 금강로 62',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_1_2',
        title: '김유정문학촌',
        category: '문학',
        region: '춘천',
        address: '강원 춘천시 신동면 김유정로 1430-14',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_1_3',
        title: '소양강 스카이워크 카페거리',
        category: '커피·카페',
        region: '춘천',
        address: '강원 춘천시 영서로 2663',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 2, places: [
      PlaceItem(
        contentId: 'rec_winter_2_1',
        title: '군산근대역사박물관',
        category: '근대 문화유산',
        region: '군산',
        address: '전북 군산시 해망로 240',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_2_2',
        title: '군산 히로쓰가옥',
        category: '근대 문화유산',
        region: '군산',
        address: '전북 군산시 구영3길 17-1',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_2_3',
        title: '이성당',
        category: '로컬 미식',
        region: '군산',
        address: '전북 군산시 중앙로 177',
        tel: '',
        openTime: '',
      ),
    ]),
    CourseTrack(trackNumber: 3, places: [
      PlaceItem(
        contentId: 'rec_winter_3_1',
        title: '테라로사 본점',
        category: '커피·카페',
        region: '강릉',
        address: '강원 강릉시 구정면 현천길 25',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_3_2',
        title: '강릉 선교장',
        category: '근대 문화유산',
        region: '강릉',
        address: '강원 강릉시 운정길 63',
        tel: '',
        openTime: '',
      ),
      PlaceItem(
        contentId: 'rec_winter_3_3',
        title: '오죽헌',
        category: '근대 문화유산',
        region: '강릉',
        address: '강원 강릉시 율곡로3139번길 24',
        tel: '',
        openTime: '',
      ),
    ]),
  ],
);
