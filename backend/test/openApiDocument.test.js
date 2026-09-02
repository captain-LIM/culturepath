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

test('documents the email-verified public account deletion flow without a GET mutation', () => {
  const request = openApiDocument.paths['/account-deletion/requests'].post;
  const confirmation = openApiDocument.paths['/account-deletion/confirm'].post;
  assert.ok(request.responses[202]);
  assert.ok(request.responses[429]);
  assert.ok(confirmation.responses[200]);
  assert.ok(confirmation.responses[403]);
  assert.match(request.description, /아웃박스/);
  assert.match(request.description, /백그라운드 워커/);
  assert.match(confirmation.description, /한 번만/);
  assert.match(confirmation.responses[429].description, /별도 버킷/);
  assert.equal(openApiDocument.paths['/account-deletion/confirm'].get, undefined);
  assert.equal(
    openApiDocument.components.schemas.AccountDeletionConfirmation
      .properties.token.writeOnly,
    true,
  );
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
  assert.match(spots.description, /TourAPI 신분류 코드/);
  assert.match(spots.description, /엄격 검증 결과/);
  assert.match(spots.description, /5개 미만/);
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
  assert.ok(regionSpot.required.includes('publicCourseCount'));
  assert.equal(regionSpot.properties.imageUrl.nullable, true);
  assert.equal(regionSpot.properties.thumbnailUrl.nullable, true);
  assert.equal(regionSpot.properties.publicCourseCount.minimum, 0);
  assert.equal(regionSpot.properties.publicCourseCount.nullable, true);
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
  assert.doesNotMatch(JSON.stringify(transform.responses), /Qdrant|AI\/RAG/);
  assert.doesNotMatch(
    JSON.stringify(openApiDocument.paths['/ai/edit-course'].post.responses),
    /Qdrant|AI\/RAG/,
  );
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
  assert.equal(
    chat.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/AiChatRequest',
  );
  assert.ok(chat.responses[401]);
  assert.ok(chat.responses[429]);
  assert.ok(openApiDocument.components.schemas.AiChatResponse.required.includes('sources'));
  assert.ok(openApiDocument.components.schemas.AiChatResponse.required.includes('sessionId'));
  assert.ok(openApiDocument.components.schemas.AiChatResponse.required.includes('action'));
  assert.equal(
    openApiDocument.components.schemas.AiChatResponse.properties.sources.maxItems,
    10,
  );
  assert.equal(
    openApiDocument.paths['/ai/chat/sessions/{sessionId}'].delete.responses[204].description,
    '세션 종료 성공',
  );
  assert.equal(
    openApiDocument.paths['/ai/chat/sessions'].delete.responses[204].description,
    '사용자 AI 세션 전체 종료 성공',
  );
  assert.equal(
    openApiDocument.paths['/ai/chat/sessions/{sessionId}/course-saved'].post
      .requestBody.content['application/json'].schema.properties.courseId.minimum,
    1,
  );

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

test('documents authenticated account deletion and explicit confirmation', () => {
  const deletion = openApiDocument.paths['/users/me'].delete;

  assert.deepEqual(deletion.security, [{ bearerAuth: [] }]);
  assert.match(deletion.description, /AI 신고를 삭제/);
  assert.deepEqual(
    deletion.requestBody.content['application/json']
      .schema.properties.confirmation.enum,
    ['DELETE'],
  );
  assert.ok(deletion.responses[204]);
  assert.ok(deletion.responses[400]);
  assert.ok(deletion.responses[401]);
  assert.ok(deletion.responses[404]);
  assert.ok(deletion.responses[500]);
});

test('documents in-app AI content reporting for moderation', () => {
  const report = openApiDocument.paths['/ai/reports'].post;
  assert.deepEqual(report.security, [{ bearerAuth: [] }]);
  assert.match(report.description, /report is deleted when the account is deleted/);
  assert.doesNotMatch(report.description, /anonymized/);
  assert.equal(
    report.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/AiContentReportRequest',
  );
  assert.equal(
    report.responses[201].content['application/json'].schema.$ref,
    '#/components/schemas/AiContentReportResponse',
  );
  assert.equal(
    openApiDocument.components.schemas.AiContentReportRequest
      .properties.content.maxLength,
    10000,
  );
  assert.ok(report.responses[400]);
  assert.ok(report.responses[401]);
  assert.ok(report.responses[429]);
  assert.ok(report.responses[500]);
});
