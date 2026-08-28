'use strict';

// CulturePath 지역 slug를 TourAPI 법정동 코드로 연결한다.
// 한 도시에 여러 시군구 코드가 필요한 경우 배열 순서대로 모두 조회한다.
const REGION_TOUR_CODES = Object.freeze({
  seoul: Object.freeze({ lDongRegnCd: '11' }),
  gangneung: Object.freeze({ lDongRegnCd: '51', lDongSignguCd: '150' }),
  jeonju: Object.freeze([
    Object.freeze({ lDongRegnCd: '52', lDongSignguCd: '111' }),
    Object.freeze({ lDongRegnCd: '52', lDongSignguCd: '113' }),
  ]),
  tongyeong: Object.freeze({ lDongRegnCd: '48', lDongSignguCd: '220' }),
  chuncheon: Object.freeze({ lDongRegnCd: '51', lDongSignguCd: '110' }),
  pohang: Object.freeze([
    Object.freeze({ lDongRegnCd: '47', lDongSignguCd: '111' }),
    Object.freeze({ lDongRegnCd: '47', lDongSignguCd: '113' }),
  ]),
  andong: Object.freeze({ lDongRegnCd: '47', lDongSignguCd: '170' }),
  hadong: Object.freeze({ lDongRegnCd: '48', lDongSignguCd: '850' }),
  gunsan: Object.freeze({ lDongRegnCd: '52', lDongSignguCd: '130' }),
  mokpo: Object.freeze({ lDongRegnCd: '46', lDongSignguCd: '110' }),
});

function getTourRegionCodes(region) {
  const value = REGION_TOUR_CODES[String(region || '').trim()];
  if (!value) return null;
  return Array.isArray(value) ? value : [value];
}

module.exports = { REGION_TOUR_CODES, getTourRegionCodes };
