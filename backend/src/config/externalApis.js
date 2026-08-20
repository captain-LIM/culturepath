'use strict';

require('dotenv').config({ quiet: true });

const DEFAULTS = Object.freeze({
  mobileOs: 'ETC',
  mobileApp: 'CulturePath',
  relatedTourBaseYm: '202503',
  timeoutMs: 8000,
  maxRetries: 1,
  retryDelayMs: 200,
  tourApiBaseUrl: 'https://apis.data.go.kr/B551011/KorService2',
  tourApiEngBaseUrl: 'https://apis.data.go.kr/B551011/EngService2',
  tourApiJpnBaseUrl: 'https://apis.data.go.kr/B551011/JpnService2',
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
    relatedTourBaseYm:
      env.RELATED_TOUR_BASE_YM?.trim() || DEFAULTS.relatedTourBaseYm,
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
      tourEng: {
        name: 'tourEng',
        baseUrl: env.TOUR_API_ENG_BASE_URL?.trim() || DEFAULTS.tourApiEngBaseUrl,
        // EngService2/JpnService2는 KorService2와 별도로 발급되는 인증키를 쓴다.
        apiKey: env.TOUR_API_ENG_KEY?.trim() || '',
      },
      tourJpn: {
        name: 'tourJpn',
        baseUrl: env.TOUR_API_JPN_BASE_URL?.trim() || DEFAULTS.tourApiJpnBaseUrl,
        apiKey: env.TOUR_API_JPN_KEY?.trim() || '',
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
