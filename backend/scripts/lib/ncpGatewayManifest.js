'use strict';
const { createHash } = require('node:crypto');
const { SERVICES, COMMON, PARAMETERS, OPERATIONS } = require('../../src/config/publicDataRoutes');
const { parseServices } = require('../../src/config/publicDataTransport');
const REQUIRED = {
  areaBasedList2: ['lDongRegnCd'], searchKeyword2: ['keyword'],
  locationBasedList2: ['mapX', 'mapY', 'radius'],
  detailCommon2: ['contentId'], detailIntro2: ['contentId', 'contentTypeId'],
  detailInfo2: ['contentId', 'contentTypeId'], detailImage2: ['contentId'],
  areaBasedList1: ['baseYm', 'areaCd', 'signguCd'], searchKeyword1: ['baseYm', 'areaCd', 'signguCd', 'keyword'],
  metcoRegnVisitrDDList: ['startYmd', 'endYmd'], locgoRegnVisitrDDList: ['startYmd', 'endYmd'],
};
function createManifest({ services = 'tour', stage = 'test' } = {}) {
  if (!['test', 'prod'].includes(stage)) throw new Error('Stage must be test or prod');
  const selected = [...parseServices(services)].sort();
  const routes = selected.flatMap(service => OPERATIONS[service].map(operation => {
    const query = [...COMMON, ...PARAMETERS[operation]];
    return {
      service, operation, resourcePath: `/${SERVICES[service]}/${operation}`,
      method: 'GET', requiredApiKey: true, authentication: 'NONE', stream: false,
      endpointPath: `/B551011/${SERVICES[service]}/${operation}?` + query.map(name => `${name}={${name}}`).join('&'),
      parameters: query.map(name => ({ parameterName: name, parameterCode: 'REQUEST_QUERY',
        parameterType: 'string', isArray: false,
        isRequired: COMMON.includes(name) || (REQUIRED[operation] || []).includes(name) })),
    };
  }));
  const manifest = { version: 1, apiName: 'tourrelay', stage, services: selected,
    endpointDomain: 'https://apis.data.go.kr', cacheEnabled: false,
    queryContract: 'UNVERIFIED_OPTIONAL_SUBSTITUTION', routes };
  return { ...manifest, hash: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
}
module.exports = { createManifest };
