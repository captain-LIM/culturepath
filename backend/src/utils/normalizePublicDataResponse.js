'use strict';

const { ExternalApiError } = require('./externalApiError');

function normalizeItems(itemsContainer) {
  if (
    itemsContainer === undefined ||
    itemsContainer === null ||
    itemsContainer === ''
  ) {
    return [];
  }

  const rawItems =
    typeof itemsContainer === 'object' &&
    !Array.isArray(itemsContainer) &&
    Object.prototype.hasOwnProperty.call(itemsContainer, 'item')
      ? itemsContainer.item
      : itemsContainer;

  if (rawItems === undefined || rawItems === null || rawItems === '') {
    return [];
  }

  if (Array.isArray(rawItems)) {
    return rawItems;
  }

  if (typeof rawItems === 'object' && Object.keys(rawItems).length === 0) {
    return [];
  }

  return [rawItems];
}

function normalizeCount(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readServiceError(payload) {
  const commonHeader = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (!commonHeader) {
    return null;
  }

  return {
    resultCode: commonHeader.returnReasonCode || commonHeader.errMsg || 'UNKNOWN',
    resultMsg:
      commonHeader.returnAuthMsg || commonHeader.errMsg || '공공데이터 요청 오류',
  };
}

function normalizePublicDataResponse(payload, context = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new ExternalApiError('공공데이터 응답이 올바른 JSON 객체가 아닙니다.', {
      code: 'INVALID_RESPONSE',
      service: context.service,
      operation: context.operation,
    });
  }

  const serviceError = readServiceError(payload);
  const envelope = payload.response || payload;
  const header = envelope.header || payload.header || serviceError;
  const body = envelope.body || payload.body;

  if (!header) {
    throw new ExternalApiError('공공데이터 응답 헤더가 없습니다.', {
      code: 'INVALID_RESPONSE',
      service: context.service,
      operation: context.operation,
    });
  }

  const resultCode = String(header.resultCode ?? header.returnReasonCode ?? '');
  const resultMsg = String(
    header.resultMsg ?? header.returnAuthMsg ?? header.errMsg ?? '',
  );
  const isSuccess = resultCode === '0000' || resultCode === '0';

  if (!isSuccess) {
    throw new ExternalApiError(
      `공공데이터 업무 오류(${resultCode || 'UNKNOWN'}): ${
        resultMsg || '알 수 없는 오류'
      }`,
      {
        code: 'BUSINESS_ERROR',
        service: context.service,
        operation: context.operation,
        resultCode: resultCode || null,
      },
    );
  }

  if (!body || typeof body !== 'object') {
    throw new ExternalApiError('공공데이터 성공 응답 본문이 없습니다.', {
      code: 'INVALID_RESPONSE',
      service: context.service,
      operation: context.operation,
      resultCode,
    });
  }

  const items = normalizeItems(body.items);

  return {
    header: {
      resultCode,
      resultMsg,
    },
    items,
    pagination: {
      pageNo: normalizeCount(body.pageNo, 1),
      numOfRows: normalizeCount(body.numOfRows, items.length),
      totalCount: normalizeCount(body.totalCount, items.length),
    },
  };
}

module.exports = { normalizeItems, normalizePublicDataResponse };
