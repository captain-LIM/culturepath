'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTourApiService } = require('../src/services/tourApiService');
const {
  createRelatedTourApiService,
} = require('../src/services/relatedTourApiService');
const { createDataLabService } = require('../src/services/dataLabService');

function recordingClient() {
  const calls = [];
  return {
    calls,
    client: {
      get: async (operation, options) => {
        calls.push({ operation, options });
        return { items: [] };
      },
    },
  };
}

test('TourAPI representative method calls areaCode2', async () => {
  const fake = recordingClient();
  const service = createTourApiService({ client: fake.client });

  await service.getAreaCodes({ areaCode: '1', pageNo: 2, numOfRows: 20 });

  assert.deepEqual(fake.calls, [
    {
      operation: 'areaCode2',
      options: {
        params: { areaCode: '1' },
        pageNo: 2,
        numOfRows: 20,
      },
    },
  ]);
});

test('related-tour representative method enforces region parameters', async () => {
  const fake = recordingClient();
  const service = createRelatedTourApiService({ client: fake.client });

  await service.getAreaBasedRelatedPlaces({
    baseYm: '202503',
    areaCd: '11',
    signguCd: '11530',
  });

  assert.equal(fake.calls[0].operation, 'areaBasedList1');
  assert.deepEqual(fake.calls[0].options.params, {
    baseYm: '202503',
    areaCd: '11',
    signguCd: '11530',
  });

  await assert.rejects(
    service.getAreaBasedRelatedPlaces({ baseYm: '202503', areaCd: '11' }),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('DataLab representative method validates and forwards the date range', async () => {
  const fake = recordingClient();
  const service = createDataLabService({ client: fake.client });

  await service.getMetropolitanVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });

  assert.equal(fake.calls[0].operation, 'metcoRegnVisitrDDList');
  assert.deepEqual(fake.calls[0].options.params, {
    startYmd: '20210513',
    endYmd: '20210513',
  });

  await service.getLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });
  assert.equal(fake.calls[1].operation, 'locgoRegnVisitrDDList');

  await assert.rejects(
    service.getMetropolitanVisitors({
      startYmd: '20210514',
      endYmd: '20210513',
    }),
    error => error.code === 'VALIDATION_ERROR',
  );
});
