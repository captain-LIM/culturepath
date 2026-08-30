// recommended_course_data.dart의 장소 중 실제 TourAPI contentId가 없는
// 항목들(rec_* 접두사)은 백엔드에 조회할 데이터 자체가 없어 상세페이지
// 번역 파이프라인을 절대 탈 수 없다. 개수가 10개로 고정돼 있고 앞으로도
// 잘 안 바뀌는 정적 큐레이션 데이터이므로, LLM 실시간 번역 대신 여기서
// 직접 번역문을 들고 있는 편이 더 빠르고 안정적이다.
//
// CourseTrackView가 place.contentId가 숫자가 아닐 때 이 테이블에서
// title·address를 찾아 표시에 덮어쓴다. 새 rec_* 항목을 추가하면 여기도
// 같이 채워야 한다 — 안 채우면 그 항목만 국문으로 남는다(치명적이진
// 않지만 놓치기 쉬우니 항목 추가 시 확인할 것).
const Map<String, Map<String, Map<String, String>>> recommendedCourseFallbackTranslations = {
  'rec_summer_2_2': {
    'en': {'title': 'Tongyeong Jungang Market', 'address': '27 Jungang-ro, Tongyeong-si, Gyeongnam'},
    'ja': {'title': '統営中央市場', 'address': '慶尚南道統営市中央路27'},
    'zh': {'title': '统营中央市场', 'address': '庆尚南道统营市中央路27'},
  },
  'rec_summer_3_2': {
    'en': {'title': 'Yihundong Garden', 'address': '182 Yudal-ro, Mokpo-si, Jeonnam'},
    'ja': {'title': 'イフンドン庭園', 'address': '全羅南道木浦市儒達路182'},
    'zh': {'title': '李薰东庭园', 'address': '全罗南道木浦市儒达路182'},
  },
  'rec_spring_1_3': {
    'en': {'title': 'Jeonju Choi Myung-hee Literature Museum', 'address': '29 Choimyeonghui-gil, Wansan-gu, Jeonju-si, Jeonbuk'},
    'ja': {'title': '全州チェ・ミョンヒ文学館', 'address': '全羅北道全州市完山区チェミョンヒギル29'},
    'zh': {'title': '全州崔明姬文学馆', 'address': '全罗北道全州市完山区崔明姬街29'},
  },
  'rec_spring_2_1': {
    'en': {'title': 'Thanks Books', 'address': '10 Wausan-ro29na-gil, Mapo-gu, Seoul'},
    'ja': {'title': 'サンクスブックス', 'address': 'ソウル特別市麻浦区ワウサン路29ナギル10'},
    'zh': {'title': 'Thanks Books书店', 'address': '首尔特别市麻浦区瓦雨山路29那街10'},
  },
  'rec_spring_3_3': {
    'en': {'title': 'Andong Folk Museum', 'address': '13 Minsokchon-gil, Andong-si, Gyeongbuk'},
    'ja': {'title': '安東民俗博物館', 'address': '慶尚北道安東市民俗村ギル13'},
    'zh': {'title': '安东民俗博物馆', 'address': '庆尚北道安东市民俗村街13'},
  },
  'rec_autumn_1_3': {
    'en': {'title': 'Lisbon Books', 'address': '22 Jahamun-ro7-gil, Jongno-gu, Seoul'},
    'ja': {'title': 'リスボン書店', 'address': 'ソウル特別市鍾路区紫霞門路7ギル22'},
    'zh': {'title': '里斯本书店', 'address': '首尔特别市钟路区紫霞门路7街22'},
  },
  'rec_autumn_2_1': {
    'en': {'title': 'Gangneung Literature Museum', 'address': '193 Nanseolheon-ro, Gangneung-si, Gangwon'},
    'ja': {'title': '江陵文学館', 'address': '江原道江陵市蘭雪軒路193'},
    'zh': {'title': '江陵文学馆', 'address': '江原道江陵市兰雪轩路193'},
  },
  'rec_autumn_3_1': {
    'en': {'title': 'Hadong Tea Culture Center', 'address': '304 Hwagae-ro, Hwagae-myeon, Hadong-gun, Gyeongnam'},
    'ja': {'title': '河東茶文化センター', 'address': '慶尚南道河東郡花開面花開路304'},
    'zh': {'title': '河东茶文化中心', 'address': '庆尚南道河东郡花开面花开路304'},
  },
  'rec_winter_1_1': {
    'en': {'title': 'Chuncheon CGV Art Hall', 'address': '62 Geumgang-ro, Chuncheon-si, Gangwon'},
    'ja': {'title': '春川CGVアートホール', 'address': '江原道春川市錦江路62'},
    'zh': {'title': '春川CGV艺术馆', 'address': '江原道春川市锦江路62'},
  },
  'rec_winter_1_3': {
    'en': {'title': 'Soyanggang Skywalk Cafe Street', 'address': '2663 Yeongseo-ro, Chuncheon-si, Gangwon'},
    'ja': {'title': '昭陽江スカイウォークカフェ通り', 'address': '江原道春川市嶺西路2663'},
    'zh': {'title': '昭阳江天空步道咖啡街', 'address': '江原道春川市岭西路2663'},
  },
};

// region 필드(예: '통영', '목포')는 추천 코스뿐 아니라 실제 contentId가
// 있는 항목에서도 백엔드 regionName이 비어 있을 때가 많아 자주 국문으로
// 남는다. 이 코스 데이터에 등장하는 지역명만 다루는 작은 사전이라
// regionCatalog 전체를 끌어올 필요 없이 여기서 함께 관리한다.
const Map<String, Map<String, String>> recommendedCourseRegionTranslations = {
  '서울': {'en': 'Seoul', 'ja': 'ソウル', 'zh': '首尔'},
  '강릉': {'en': 'Gangneung', 'ja': '江陵', 'zh': '江陵'},
  '통영': {'en': 'Tongyeong', 'ja': '統営', 'zh': '统营'},
  '목포': {'en': 'Mokpo', 'ja': '木浦', 'zh': '木浦'},
  '전주': {'en': 'Jeonju', 'ja': '全州', 'zh': '全州'},
  '안동': {'en': 'Andong', 'ja': '安東', 'zh': '安东'},
  '하동': {'en': 'Hadong', 'ja': '河東', 'zh': '河东'},
  '춘천': {'en': 'Chuncheon', 'ja': '春川', 'zh': '春川'},
  '군산': {'en': 'Gunsan', 'ja': '群山', 'zh': '群山'},
};
