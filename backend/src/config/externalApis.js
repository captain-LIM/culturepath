'use strict';

require('dotenv').config({ quiet: true });

const DEFAULTS = Object.freeze({
  mobileOs: 'ETC',
  mobileApp: 'CulturePath',
  timeoutMs: 8000,
  maxRetries: 1,
  retryDelayMs: 200,
  tourApiBaseUrl: 'https://apis.data.go.kr/B551011/KorService2',
  relatedTourApiBaseUrl: 'https://apis.data.go.kr/B551011/TarRlteTarService1',
  dataLabApiBaseUrl: 'https://apis.data.go.kr/B551011/DataLabService',
});

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getExternalApiConfig(env = process.env) {
  return {
    apiKey: env.TOUR_API_KEY?.trim() || '',
    mobileOs: env.PUBLIC_DATA_MOBILE_OS?.trim() || DEFAULTS.mobileOs,
    mobileApp: env.PUBLIC_DATA_MOBILE_APP?.trim() || DEFAULTS.mobileApp,
    timeoutMs: parsePositiveInteger(env.EXTERNAL_API_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxRetries: parseNonNegativeInteger(
      env.EXTERNAL_API_MAX_RETRIES,
      DEFAULTS.maxRetries,
    ),
    retryDelayMs: parseNonNegativeInteger(
      env.EXTERNAL_API_RETRY_DELAY_MS,
      DEFAULTS.retryDelayMs,
    ),
    services: {
      tour: {
        name: 'tour',
        baseUrl: env.TOUR_API_BASE_URL?.trim() || DEFAULTS.tourApiBaseUrl,
      },
      relatedTour: {
        name: 'relatedTour',
        baseUrl:
          env.RELATED_TOUR_API_BASE_URL?.trim() || DEFAULTS.relatedTourApiBaseUrl,
      },
      dataLab: {
        name: 'dataLab',
        baseUrl: env.DATALAB_API_BASE_URL?.trim() || DEFAULTS.dataLabApiBaseUrl,
      },
    },
  };
}

module.exports = { DEFAULTS, getExternalApiConfig };
