'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { requireDatePattern, requireStringParams } = require('../utils/publicDataValidation');

const CONTEXT = Object.freeze({
  service: 'relatedTour',
  operation: 'areaBasedList1',
});

function createRelatedTourApiService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('relatedTour', options);

  return Object.freeze({
    getAreaBasedRelatedPlaces({
      baseYm,
      areaCd,
      signguCd,
      pageNo = 1,
      numOfRows = 10,
    } = {}) {
      const params = { baseYm, areaCd, signguCd };
      requireStringParams(params, ['baseYm', 'areaCd', 'signguCd'], CONTEXT);
      requireDatePattern(baseYm, 'baseYm', /^\d{6}$/, CONTEXT);

      return client.get(CONTEXT.operation, {
        params,
        pageNo,
        numOfRows,
      });
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createRelatedTourApiService();
  }
  return defaultService;
}

function getAreaBasedRelatedPlaces(options) {
  return getDefaultService().getAreaBasedRelatedPlaces(options);
}

module.exports = {
  createRelatedTourApiService,
  getAreaBasedRelatedPlaces,
};
