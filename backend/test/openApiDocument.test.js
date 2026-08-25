'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const openApiDocument = require('../src/docs/openapi');

test('documents the implemented public place routes and compatibility contract', () => {
  assert.equal(openApiDocument.openapi, '3.0.3');
  assert.ok(openApiDocument.paths['/places/search']);
  assert.ok(openApiDocument.paths['/places/{id}']);
  assert.ok(openApiDocument.paths['/places/{id}/related']);

  const search = openApiDocument.paths['/places/search'].get;
  const searchCulture = search.parameters.find(
    parameter => parameter.name === 'culture',
  );
  assert.equal(
    search.responses[200].content['application/json'].schema.type,
    'array',
  );
  assert.ok(search.responses[200].headers['X-Total-Count']);
  assert.ok(search.responses[200].headers['X-Cache-Status']);
  assert.ok(search.responses[400]);
  assert.ok(search.responses[500]);
  assert.ok(search.responses[504]);
  assert.equal(searchCulture.schema.enum.length, 10);
  assert.equal(
    search.responses[200].content['application/json']
      .schema['x-culture-filter-max-items'],
    50,
  );
  assert.ok(
    openApiDocument.paths['/places/{id}']
      .get.responses[200].headers['X-Cache-Status'],
  );
  const related = openApiDocument.paths['/places/{id}/related'].get;
  assert.equal(
    related.responses[200].content['application/json'].schema.type,
    'array',
  );
  assert.equal(
    related.responses[200].content['application/json'].schema.maxItems,
    5,
  );
  assert.ok(related.responses[200].headers['X-Cache-Status']);

  const serialized = JSON.stringify(openApiDocument);
  assert.doesNotMatch(serialized, /serviceKey|TOUR_API_KEY|OPENROUTER_API_KEY/);
});

test('documents the backward-compatible DataLab region score contract', () => {
  const regions = openApiDocument.paths['/cultures/{id}/regions'].get;
  const response = regions.responses[200];
  const schema = openApiDocument.components.schemas.RegionItem;

  assert.equal(
    response.content['application/json'].schema.type,
    'array',
  );
  assert.deepEqual(schema.required, [
    'areaCode',
    'name',
    'description',
    'spotCount',
    'score',
  ]);
  assert.equal(schema.properties.score.type, 'integer');
  assert.equal(schema.properties.score.maximum, 100);
  assert.deepEqual(
    response.headers['X-Region-Data-Status'].schema.enum,
    ['HIT', 'REFRESHED', 'STALE', 'BYPASS', 'CURATED'],
  );
  assert.ok(regions.responses[404]);
  assert.ok(regions.responses[500]);
});

test('documents strict culture filtering for region spots', () => {
  const spots = openApiDocument.paths['/regions/{code}/spots'].get;
  const culture = spots.parameters.find(parameter => parameter.name === 'culture');
  const success = spots.responses[200];

  assert.equal(culture.schema.enum.length, 10);
  assert.equal(
    success.content['application/json'].schema.items.$ref,
    '#/components/schemas/RegionSpot',
  );
  assert.equal(success.content['application/json'].schema.maxItems, 50);
  assert.ok(success.headers['X-Cache-Status']);
  assert.ok(success.headers['X-Has-More']);
  assert.ok(success.headers['X-Next-Page']);
  assert.ok(spots.parameters.some(
    parameter => parameter.$ref?.endsWith('/CulturePageNo'),
  ));
  assert.equal(
    openApiDocument.components.parameters.CulturePageNo.schema.maximum,
    5,
  );
  assert.ok(spots.parameters.some(parameter => parameter.$ref?.endsWith('/NumOfRows')));
  assert.ok(spots.responses[400]);
  assert.ok(spots.responses[404]);
  assert.ok(spots.responses[502]);
  assert.ok(spots.responses[503]);
  assert.ok(spots.responses[504]);
  const regionSpot = openApiDocument.components.schemas.RegionSpot;
  assert.ok(regionSpot.required.includes('imageUrl'));
  assert.ok(regionSpot.required.includes('thumbnailUrl'));
  assert.equal(regionSpot.properties.imageUrl.nullable, true);
  assert.equal(regionSpot.properties.thumbnailUrl.nullable, true);
  assert.equal(
    openApiDocument.components.schemas.PlaceDetail.allOf[1]
      .properties.images.maxItems,
    10,
  );
});

test('documents the authenticated structured AI transform contract', () => {
  const transform = openApiDocument.paths['/ai/transform'].post;
  assert.deepEqual(transform.security, [{ bearerAuth: [] }]);
  assert.equal(
    transform.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/CourseTransformRequest',
  );
  assert.equal(
    transform.responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CourseTransformResponse',
  );
  assert.ok(transform.responses[400]);
  assert.ok(transform.responses[401]);
  assert.ok(transform.responses[403]);
  assert.ok(transform.responses[404]);
  assert.ok(transform.responses[429]);
  assert.ok(transform.responses[500]);
  assert.ok(transform.responses[502]);
  assert.ok(transform.responses[503]);
  assert.ok(transform.responses[504]);
  const transformResponse = openApiDocument.components.schemas.CourseTransformResponse;
  assert.equal(openApiDocument.components.schemas.CourseDraft.properties.tracks.maxItems, 3);
  assert.equal(openApiDocument.components.schemas.CourseTrack.properties.trackNumber.maximum, 3);
  assert.equal(openApiDocument.components.schemas.TransformConstraints.properties.days.maximum, 3);
  assert.equal(transformResponse.properties.summary.maxLength, 500);
  assert.equal(transformResponse.properties.warnings.maxItems, 5);
  assert.deepEqual(transformResponse.properties.usage.required, [
    'model',
    'inputTokens',
    'outputTokens',
  ]);

  const chat = openApiDocument.paths['/ai/chat'].post;
  assert.deepEqual(chat.security, [{ bearerAuth: [] }]);
  assert.ok(chat.responses[401]);
  assert.ok(chat.responses[429]);

  const compatibilityAlias = openApiDocument.paths['/ai/edit-course'].post;
  assert.equal(compatibilityAlias.deprecated, true);
  assert.deepEqual(compatibilityAlias.security, [{ bearerAuth: [] }]);
  assert.deepEqual(
    compatibilityAlias.requestBody.content['application/json'].schema.oneOf,
    [
      { $ref: '#/components/schemas/CourseTransformRequest' },
      { $ref: '#/components/schemas/LegacyCourseTransformRequest' },
    ],
  );
  const legacy = openApiDocument.components.schemas.LegacyCourseTransformRequest;
  assert.deepEqual(legacy.properties.course.allOf[1].required, ['id']);
  assert.equal(
    legacy.properties.constraints.$ref,
    '#/components/schemas/TransformConstraints',
  );
});
