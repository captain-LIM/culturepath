'use strict';

// Shared by the runtime and the offline Gateway manifest. No env or I/O here.
const SERVICES = Object.freeze({
  tour: 'KorService2', tourEng: 'EngService2', tourJpn: 'JpnService2',
  tourChs: 'ChsService2', relatedTour: 'TarRlteTarService1', dataLab: 'DataLabService',
});
const COMMON = Object.freeze(['serviceKey', 'MobileOS', 'MobileApp', '_type', 'pageNo', 'numOfRows']);
const classification = ['lclsSystm1', 'lclsSystm2', 'lclsSystm3'];
const area = ['lDongRegnCd', 'lDongSignguCd', 'contentTypeId', ...classification, 'arrange'];
const PARAMETERS = Object.freeze(Object.fromEntries(Object.entries({
  areaCode2: ['areaCode'],
  ldongCode2: ['lDongRegnCd', 'lDongListYn'],
  lclsSystmCode2: classification,
  areaBasedList2: area,
  searchKeyword2: ['keyword', ...area],
  locationBasedList2: ['mapX', 'mapY', 'radius', 'contentTypeId', ...classification, 'arrange'],
  detailCommon2: ['contentId'],
  detailIntro2: ['contentId', 'contentTypeId'],
  detailInfo2: ['contentId', 'contentTypeId'],
  detailImage2: ['contentId', 'imageYN'],
  areaBasedList1: ['baseYm', 'areaCd', 'signguCd'],
  searchKeyword1: ['baseYm', 'areaCd', 'signguCd', 'keyword'],
  metcoRegnVisitrDDList: ['startYmd', 'endYmd'],
  locgoRegnVisitrDDList: ['startYmd', 'endYmd'],
}).map(([operation, params]) => [operation, Object.freeze(params)])));
const translated = Object.freeze(['searchKeyword2', 'locationBasedList2', 'detailCommon2', 'detailIntro2', 'detailInfo2', 'detailImage2']);
const OPERATIONS = Object.freeze({
  tour: Object.freeze(['areaCode2', 'ldongCode2', 'lclsSystmCode2', 'areaBasedList2', ...translated]),
  tourEng: translated, tourJpn: translated, tourChs: translated,
  relatedTour: Object.freeze(['areaBasedList1', 'searchKeyword1']),
  dataLab: Object.freeze(['metcoRegnVisitrDDList', 'locgoRegnVisitrDDList']),
});
module.exports = { SERVICES, COMMON, PARAMETERS, OPERATIONS };
