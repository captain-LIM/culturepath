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
  assert.equal(
    search.responses[200].content['application/json'].schema.type,
    'array',
  );
  assert.ok(search.responses[200].headers['X-Total-Count']);
  assert.ok(search.responses[200].headers['X-Cache-Status']);
  assert.ok(search.responses[400]);
  assert.ok(search.responses[500]);
  assert.ok(search.responses[504]);
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
