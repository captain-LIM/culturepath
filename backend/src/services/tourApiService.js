'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');

function createTourApiService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('tour', options);

  return Object.freeze({
    getAreaCodes({ areaCode, pageNo = 1, numOfRows = 20 } = {}) {
      return client.get('areaCode2', {
        params: { areaCode },
        pageNo,
        numOfRows,
      });
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createTourApiService();
  }
  return defaultService;
}

function getAreaCodes(options) {
  return getDefaultService().getAreaCodes(options);
}

module.exports = { createTourApiService, getAreaCodes };
