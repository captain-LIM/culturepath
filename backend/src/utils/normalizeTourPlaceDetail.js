'use strict';

const { createPlaceDetail } = require('../models/placeDetail');
const {
  decodeHtmlEntities,
  normalizeHttpUrl,
  normalizeNullableString,
  normalizeTourPlace,
} = require('./normalizeTourPlace');

const OPEN_TIME_FIELDS = Object.freeze([
  'usetime',
  'usetimeculture',
  'usetimeleports',
  'opentime',
  'opentimefood',
  'checkintime',
]);
const REST_DATE_FIELDS = Object.freeze([
  'restdate',
  'restdateculture',
  'restdateleports',
  'restdateshopping',
  'restdatefood',
  'restdatelodging',
]);
const CONTACT_FIELDS = Object.freeze([
  'infocenter',
  'infocenterculture',
  'infocenterleports',
  'infocentershopping',
  'infocenterfood',
  'infocenterlodging',
  'sponsor1tel',
]);
const PARKING_FIELDS = Object.freeze([
  'parking',
  'parkingculture',
  'parkingleports',
  'parkingshopping',
  'parkingfood',
  'parkinglodging',
]);

function firstNormalizedValue(source, names) {
  for (const name of names) {
    const value = normalizeNullableString(source?.[name]);
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeHomepage(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const href = /href\s*=\s*["']([^"']+)["']/i.exec(raw)?.[1];
  return normalizeHttpUrl(decodeHtmlEntities(href || raw));
}

function normalizeImageItems(items = []) {
  const images = [];
  const seenUrls = new Set();

  for (const item of items) {
    let imageUrl = normalizeHttpUrl(item?.originimgurl ?? item?.originImgUrl);
    let thumbnailUrl = normalizeHttpUrl(
      item?.smallimageurl ?? item?.smallImageUrl,
    );
    if (imageUrl && seenUrls.has(imageUrl)) {
      imageUrl = null;
    }
    if (thumbnailUrl && (thumbnailUrl === imageUrl || seenUrls.has(thumbnailUrl))) {
      thumbnailUrl = null;
    }
    if (!imageUrl && !thumbnailUrl) {
      continue;
    }

    if (imageUrl) {
      seenUrls.add(imageUrl);
    }
    if (thumbnailUrl) {
      seenUrls.add(thumbnailUrl);
    }
    images.push({
      imageUrl,
      thumbnailUrl,
      name: normalizeNullableString(item?.imgname ?? item?.imageName),
      copyrightType: normalizeNullableString(
        item?.cpyrhtDivCd ?? item?.copyrightType,
      ),
      serialNumber: normalizeNullableString(item?.serialnum ?? item?.serialNumber),
    });
  }

  return images;
}

function normalizeAdditionalInfo(items = []) {
  return items
    .map(item => ({
      name: normalizeNullableString(item?.infoname ?? item?.infoName),
      text: normalizeNullableString(item?.infotext ?? item?.infoText),
      section: normalizeNullableString(item?.fldgubun ?? item?.section),
      serialNumber: normalizeNullableString(item?.serialnum ?? item?.serialNumber),
    }))
    .filter(item => item.name || item.text);
}

function normalizeTourPlaceDetail(
  { commonItem, introItem, imageItems = [], infoItems = [] } = {},
  options = {},
) {
  const summary = normalizeTourPlace(commonItem, options);
  const intro = introItem || {};

  return createPlaceDetail({
    ...summary,
    overview: normalizeNullableString(commonItem?.overview),
    regionName: normalizeNullableString(
      commonItem?.lDongRegnNm ?? commonItem?.ldongregnnm,
    ),
    tel: summary.tel || firstNormalizedValue(intro, CONTACT_FIELDS),
    openTime: firstNormalizedValue(intro, OPEN_TIME_FIELDS),
    restDate: firstNormalizedValue(intro, REST_DATE_FIELDS),
    homepage: normalizeHomepage(commonItem?.homepage),
    parking: firstNormalizedValue(intro, PARKING_FIELDS),
    images: normalizeImageItems(imageItems),
    additionalInfo: normalizeAdditionalInfo(infoItems),
  });
}

module.exports = {
  normalizeAdditionalInfo,
  normalizeHomepage,
  normalizeImageItems,
  normalizeTourPlaceDetail,
};
