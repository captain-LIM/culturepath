'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeHomepage,
  normalizeImageItems,
  normalizeTourPlaceDetail,
} = require('../src/utils/normalizeTourPlaceDetail');

test('combines common, intro, images, and optional repeated information', () => {
  const detail = normalizeTourPlaceDetail({
    commonItem: {
      contentid: '2390314',
      contenttypeid: '14',
      title: '박경리 문학관',
      addr1: '경상남도 통영시',
      addr2: '산양읍',
      lDongRegnCd: '48',
      lDongSignguCd: '220',
      lDongRegnNm: '경상남도',
      mapx: '128.3',
      mapy: '34.8',
      overview: '<b>문학</b> 전시 공간',
      homepage: '<a href="https://example.com/place?x=1&amp;y=2">홈페이지</a>',
      firstimage: 'https://example.com/main.jpg',
      modifiedtime: '20260722153045',
      lclsSystm1: 'VE',
    },
    introItem: {
      infocenterculture: '055-000-0000',
      usetimeculture: '09:00~18:00',
      restdateculture: '매주 월요일',
      parkingculture: '주차 가능',
    },
    imageItems: [
      {
        originimgurl: 'https://example.com/detail.jpg',
        smallimageurl: 'https://example.com/detail-small.jpg',
        imgname: '전경',
        cpyrhtDivCd: 'Type3',
        serialnum: '1',
      },
      { originimgurl: 'https://example.com/detail.jpg' },
      { originimgurl: 'javascript:alert(1)' },
    ],
    infoItems: [
      { infoname: '<b>관람 안내</b>', infotext: '무료', fldgubun: '1' },
      { infoname: '', infotext: '' },
    ],
  });

  assert.equal(detail.contentId, '2390314');
  assert.equal(detail.overview, '문학 전시 공간');
  assert.equal(detail.regionName, '경상남도');
  assert.equal(detail.tel, '055-000-0000');
  assert.equal(detail.openTime, '09:00~18:00');
  assert.equal(detail.restDate, '매주 월요일');
  assert.equal(detail.parking, '주차 가능');
  assert.equal(detail.homepage, 'https://example.com/place?x=1&y=2');
  assert.deepEqual(detail.images, [
    {
      imageUrl: 'https://example.com/detail.jpg',
      thumbnailUrl: 'https://example.com/detail-small.jpg',
      name: '전경',
      copyrightType: 'Type3',
      serialNumber: '1',
    },
  ]);
  assert.deepEqual(detail.additionalInfo, [
    {
      name: '관람 안내',
      text: '무료',
      section: '1',
      serialNumber: null,
    },
  ]);
  assert.ok(Object.isFrozen(detail));
  assert.ok(Object.isFrozen(detail.images));
  assert.ok(Object.isFrozen(detail.images[0]));
});

test('uses nullable detail fields and rejects unsafe homepage and images', () => {
  const detail = normalizeTourPlaceDetail({
    commonItem: {
      contentid: '1',
      title: '일반 장소',
      homepage: 'javascript:x',
      overview: '&amp;lt;img src=x onerror=alert(1)&amp;gt; 안전한 설명',
    },
    imageItems: [{ originimgurl: 'ftp://example.com/image.jpg' }],
  });

  assert.equal(detail.homepage, null);
  assert.equal(detail.overview, '안전한 설명');
  assert.equal(detail.openTime, null);
  assert.equal(detail.restDate, null);
  assert.equal(detail.parking, null);
  assert.deepEqual(detail.images, []);
  assert.deepEqual(detail.additionalInfo, []);
});

test('normalization helpers extract safe homepage URLs and deduplicate images', () => {
  assert.equal(
    normalizeHomepage('<a href="http://example.com">링크</a>'),
    'http://example.com/',
  );
  assert.equal(normalizeHomepage('<a>링크</a>'), null);
  assert.equal(
    normalizeImageItems([
      { smallimageurl: 'https://example.com/a.jpg' },
      { smallimageurl: 'https://example.com/a.jpg' },
    ]).length,
    1,
  );
  assert.deepEqual(
    normalizeImageItems([
      {
        originimgurl: 'https://example.com/origin-1.jpg',
        smallimageurl: 'https://example.com/shared.jpg',
      },
      {
        originimgurl: 'https://example.com/shared.jpg',
        smallimageurl: 'https://example.com/thumb-2.jpg',
      },
      {
        originimgurl: 'https://example.com/origin-3.jpg',
        smallimageurl: 'https://example.com/shared.jpg',
      },
    ]),
    [
      {
        imageUrl: 'https://example.com/origin-1.jpg',
        thumbnailUrl: 'https://example.com/shared.jpg',
        name: null,
        copyrightType: null,
        serialNumber: null,
      },
      {
        imageUrl: null,
        thumbnailUrl: 'https://example.com/thumb-2.jpg',
        name: null,
        copyrightType: null,
        serialNumber: null,
      },
      {
        imageUrl: 'https://example.com/origin-3.jpg',
        thumbnailUrl: null,
        name: null,
        copyrightType: null,
        serialNumber: null,
      },
    ],
  );
});
