// 전체 장소 풀 — DB/TourAPI(OpenAPI) 연동 후 교체
const ALL_PLACES = [
  { contentId: 'gn001', title: '하슬라아트월드', address: '강릉시 강동면 율곡로 1441', tel: '033-644-9411', openTime: '09:00~18:00', category: '미술·갤러리', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn002', title: '안목해변 커피거리', address: '강릉시 창해로14번길', tel: '', openTime: '상시', category: '커피·카페', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn003', title: '오죽헌', address: '강릉시 율곡로 3139번길 24', tel: '033-660-3301', openTime: '09:00~18:00', category: '문학', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn004', title: '강릉독립예술극장 신영', address: '강릉시 경강로 2072', tel: '033-646-0555', openTime: '상영 시간표 참고', category: '영화', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'gn005', title: '책방 나다', address: '강릉시 경강로 2121', tel: '', openTime: '12:00~20:00', category: '독립서점', areaCode: 'gangneung', region: '강릉' },
  { contentId: 'jj001', title: '전주 한옥마을', address: '전주시 완산구 기린대로 99', tel: '063-282-1330', openTime: '상시', category: '문화유산', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj002', title: '경암책방', address: '전주시 완산구 최명희길 29', tel: '063-284-3397', openTime: '10:00~19:00', category: '독립서점', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj003', title: '전주 막걸리 골목', address: '전주시 완산구 전라감영5길', tel: '', openTime: '11:00~22:00', category: '전통주', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj004', title: '전주 공예품전시관', address: '전주시 완산구 기린대로 119', tel: '063-231-4565', openTime: '09:00~18:00', category: '공예', areaCode: 'jeonju', region: '전주' },
  { contentId: 'jj005', title: '남부시장 청년몰', address: '전주시 완산구 풍남문3길 1', tel: '063-900-5893', openTime: '12:00~21:00', category: '로컬 미식', areaCode: 'jeonju', region: '전주' },
  { contentId: 'ty001', title: '박경리기념관', address: '통영시 산양읍 산양중앙로 173', tel: '055-650-2541', openTime: '09:00~18:00', category: '문학', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty002', title: '통영국제음악당', address: '통영시 도천동 문화마당로 1', tel: '055-650-0800', openTime: '공연 시간표 참고', category: '음악', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty003', title: '청마문학관', address: '통영시 망일1길 82', tel: '055-650-4621', openTime: '09:00~18:00', category: '문학', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty004', title: '통영 중앙시장', address: '통영시 중앙로 51', tel: '', openTime: '06:00~21:00', category: '로컬 미식', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'ty005', title: '나전칠기 체험관', address: '통영시 광도면 죽림4로', tel: '055-650-0400', openTime: '09:00~17:00', category: '공예', areaCode: 'tongyeong', region: '통영' },
  { contentId: 'cc001', title: '춘천 애니메이션박물관', address: '춘천시 서면 박사로 854', tel: '033-245-6490', openTime: '10:00~18:00', category: '애니메이션', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'cc002', title: '김유정문학촌', address: '춘천시 신동면 김유정로 1430-14', tel: '033-261-4650', openTime: '09:00~18:00', category: '문학', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'cc003', title: '소양강 스카이워크', address: '춘천시 영서로 2663', tel: '033-250-3033', openTime: '09:00~21:00', category: '관광지', areaCode: 'chuncheon', region: '춘천' },
  { contentId: 'ph001', title: '포항시립미술관', address: '포항시 북구 환호공원길 10', tel: '054-270-5051', openTime: '10:00~18:00', category: '미술', areaCode: 'pohang', region: '포항' },
  { contentId: 'ph002', title: '구룡포 근대문화역사거리', address: '포항시 남구 구룡포읍 구룡포길', tel: '', openTime: '상시', category: '근대 문화유산', areaCode: 'pohang', region: '포항' },
  { contentId: 'ph003', title: '스페이스워크', address: '포항시 북구 환호동 146', tel: '054-289-1475', openTime: '24시간', category: '미술', areaCode: 'pohang', region: '포항' },
  { contentId: 'sl001', title: '땡스북스 (합정)', address: '마포구 양화로 7안길 61', tel: '02-322-4979', openTime: '12:00~21:00', category: '독립서점', areaCode: 'seoul', region: '서울' },
  { contentId: 'sl002', title: '유어마인드 (홍대)', address: '마포구 성지1길 5-13', tel: '02-323-1441', openTime: '13:00~21:00', category: '독립서점', areaCode: 'seoul', region: '서울' },
  { contentId: 'sl003', title: '을지로 갤러리 구역', address: '중구 을지로 일대', tel: '', openTime: '가게별 상이', category: '미술', areaCode: 'seoul', region: '서울' },
  { contentId: 'ad001', title: '안동소주 전통음식박물관', address: '안동시 수상동 산 36-1', tel: '054-858-4541', openTime: '09:00~18:00', category: '전통주', areaCode: 'andong', region: '안동' },
  { contentId: 'ad002', title: '하회마을', address: '안동시 풍천면 하회종가길 40', tel: '054-853-0109', openTime: '09:00~18:00', category: '문화유산', areaCode: 'andong', region: '안동' },
  { contentId: 'hd001', title: '최참판댁', address: '하동군 악양면 평사리길 66-7', tel: '055-884-2154', openTime: '09:00~18:00', category: '문학', areaCode: 'hadong', region: '하동' },
  { contentId: 'hd002', title: '하동 화개장터', address: '하동군 화개면 쌍계로 15', tel: '', openTime: '상시', category: '로컬 미식', areaCode: 'hadong', region: '하동' },
  { contentId: 'gs001', title: '근대역사박물관', address: '군산시 해망로 240', tel: '063-454-7870', openTime: '09:00~18:00', category: '근대 문화유산', areaCode: 'gunsan', region: '군산' },
  { contentId: 'gs002', title: '신흥동 일본식 가옥', address: '군산시 구영1길 17', tel: '063-454-3274', openTime: '09:00~18:00', category: '근대 문화유산', areaCode: 'gunsan', region: '군산' },
  { contentId: 'mp001', title: '목포 근대역사문화공간', address: '목포시 중앙로1가 일대', tel: '', openTime: '상시', category: '근대 문화유산', areaCode: 'mokpo', region: '목포' },
  { contentId: 'mp002', title: '국립해양문화재연구소', address: '목포시 남농로 136', tel: '061-270-2000', openTime: '09:00~18:00', category: '문화유산', areaCode: 'mokpo', region: '목포' },
];

// GET /places/search?q=&culture=&region=
async function searchPlaces(req, res) {
  const { q = '', culture = '', region = '' } = req.query;

  let places = ALL_PLACES;

  if (q) {
    const query = q.toLowerCase();
    places = places.filter(p =>
      p.title.toLowerCase().includes(query) ||
      p.address.toLowerCase().includes(query)
    );
  }
  if (culture) {
    places = places.filter(p => p.category.includes(culture));
  }
  if (region) {
    places = places.filter(p => p.areaCode === region);
  }

  return res.json(places.slice(0, 20));
}

// GET /places/:id
async function getPlaceDetail(req, res) {
  const place = ALL_PLACES.find(p => p.contentId === req.params.id);
  if (!place) return res.status(404).json({ message: '장소를 찾을 수 없습니다.' });
  return res.json(place);
}

// GET /places/:id/related
async function getRelatedPlaces(req, res) {
  const place = ALL_PLACES.find(p => p.contentId === req.params.id);
  if (!place) return res.status(404).json({ message: '장소를 찾을 수 없습니다.' });

  const related = ALL_PLACES
    .filter(p => p.contentId !== place.contentId &&
      (p.areaCode === place.areaCode || p.category === place.category))
    .slice(0, 5);

  return res.json(related);
}

module.exports = { searchPlaces, getPlaceDetail, getRelatedPlaces };
