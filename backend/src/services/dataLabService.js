'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { ExternalApiError } = require('../utils/externalApiError');
const { requireDatePattern, requireStringParams } = require('../utils/publicDataValidation');

const CONTEXT = Object.freeze({
  service: 'dataLab',
  operation: 'metcoRegnVisitrDDList',
});

function createDataLabService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('dataLab', options);

  return Object.freeze({
    getMetropolitanVisitors({
      startYmd,
      endYmd,
      pageNo = 1,
      numOfRows = 100,
    } = {}) {
      const params = { startYmd, endYmd };
      requireStringParams(params, ['startYmd', 'endYmd'], CONTEXT);
      requireDatePattern(startYmd, 'startYmd', /^\d{8}$/, CONTEXT);
      requireDatePattern(endYmd, 'endYmd', /^\d{8}$/, CONTEXT);

      if (String(startYmd) > String(endYmd)) {
        throw new ExternalApiError('startYmd는 endYmd보다 늦을 수 없습니다.', {
          code: 'VALIDATION_ERROR',
          ...CONTEXT,
        });
      }

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
    defaultService = createDataLabService();
  }
  return defaultService;
}

function getMetropolitanVisitors(options) {
  return getDefaultService().getMetropolitanVisitors(options);
}

module.exports = { createDataLabService, getMetropolitanVisitors };
