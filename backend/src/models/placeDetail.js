'use strict';

const { createPlaceSummary } = require('./placeSummary');

function freezeRecords(records = []) {
  return Object.freeze(
    records.map(record => Object.freeze({ ...record })),
  );
}

function createPlaceDetail(fields) {
  const summary = createPlaceSummary(fields);

  return Object.freeze({
    ...summary,
    overview: fields.overview ?? null,
    regionName: fields.regionName ?? null,
    tel: fields.tel ?? summary.tel,
    openTime: fields.openTime ?? null,
    restDate: fields.restDate ?? null,
    homepage: fields.homepage ?? null,
    parking: fields.parking ?? null,
    images: freezeRecords(fields.images),
    additionalInfo: freezeRecords(fields.additionalInfo),
  });
}

module.exports = { createPlaceDetail };
