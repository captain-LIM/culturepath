'use strict';

const { ExternalApiError } = require('./externalApiError');

function publicPlaceError(error) {
  if (!(error instanceof ExternalApiError)) {
    return {
      status: 500,
      body: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다.',
        retryable: false,
      },
    };
  }

  if (error.code === 'VALIDATION_ERROR') {
    return {
      status: 400,
      body: { code: error.code, message: error.message, retryable: false },
    };
  }
  if (error.code === 'CONFIG_ERROR') {
    return {
      status: 503,
      body: {
        code: 'TOUR_API_UNAVAILABLE',
        message: '관광정보 서비스를 사용할 수 없습니다.',
        retryable: false,
      },
    };
  }
  if (error.code === 'TIMEOUT') {
    return {
      status: 504,
      body: {
        code: 'EXTERNAL_API_TIMEOUT',
        message: '관광정보 응답 시간이 초과되었습니다.',
        retryable: true,
      },
    };
  }

  return {
    status: 502,
    body: {
      code: 'EXTERNAL_API_ERROR',
      message: '관광정보를 불러오지 못했습니다.',
      retryable: error.retryable === true,
    },
  };
}

module.exports = { publicPlaceError };
