'use strict';

const {
  createConfiguredPublicDataClient,
} = require('./publicDataClient');
const { ExternalApiError } = require('../utils/externalApiError');
const {
  normalizePagination,
  requireStringParams,
} = require('../utils/publicDataValidation');
const {
  PAGINATION_METADATA,
} = require('../utils/normalizePublicDataResponse');
const { isValidYmd } = require('../utils/dateYmd');

const AREA_CODE_PATTERN = /^\d{2}$/;
const SIGNGU_CODE_PATTERN = /^\d{5}$/;
const DAY_OF_WEEK_PATTERN = /^[1-7]$/;
const VISITOR_DIVISION_PATTERN = /^[1-3]$/;
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 5;

const OPERATIONS = Object.freeze({
  metropolitan: 'metcoRegnVisitrDDList',
  local: 'locgoRegnVisitrDDList',
});

function operationContext(operation) {
  return { service: 'dataLab', operation };
}

function readField(item, ...names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item?.[name] !== null) {
      return item[name];
    }
  }
  return null;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function requireYmd(value, name, context) {
  requireStringParams({ [name]: value }, [name], context);
  const normalized = String(value).trim();
  if (!isValidYmd(normalized)) {
    throw new ExternalApiError(`${name} 형식이 올바르지 않습니다.`, {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }
  return normalized;
}

function normalizeVisitorRequest(
  input = {},
  operation,
  { defaultNumOfRows = DEFAULT_PAGE_SIZE } = {},
) {
  const context = operationContext(operation);
  const startYmd = requireYmd(input.startYmd, 'startYmd', context);
  const endYmd = requireYmd(input.endYmd, 'endYmd', context);
  if (startYmd > endYmd) {
    throw new ExternalApiError('startYmd는 endYmd보다 늦을 수 없습니다.', {
      code: 'VALIDATION_ERROR',
      ...context,
    });
  }

  return Object.freeze({
    startYmd,
    endYmd,
    ...normalizePagination(input.pageNo, input.numOfRows, context, {
      defaultNumOfRows,
      maxNumOfRows: DEFAULT_PAGE_SIZE,
    }),
  });
}

function invalidVisitorResponse(operation) {
  return new ExternalApiError('DataLab 방문자 응답 항목이 올바르지 않습니다.', {
    code: 'INVALID_RESPONSE',
    service: 'dataLab',
    operation,
  });
}

function normalizeTotalCount(value, itemCount, operation) {
  const totalCount = Number(value);
  if (
    !Number.isInteger(totalCount) ||
    totalCount < 0 ||
    totalCount < itemCount
  ) {
    throw invalidVisitorResponse(operation);
  }
  return totalCount;
}

function validatePageMetadata(
  page,
  {
    expectedPageNo,
    expectedPageSize = null,
    expectedTotalCount = null,
    operation,
  },
) {
  const pagination = page?.pagination;
  const metadata = pagination?.[PAGINATION_METADATA];
  if (
    !pagination ||
    (
      metadata &&
      (
        !metadata.pageNoProvided ||
        !metadata.pageNoValid ||
        !metadata.numOfRowsProvided ||
        !metadata.numOfRowsValid ||
        !metadata.totalCountProvided ||
        !metadata.totalCountValid
      )
    )
  ) {
    throw invalidVisitorResponse(operation);
  }

  const pageNo = Number(pagination.pageNo);
  const pageSize = Number(pagination.numOfRows);
  const totalCount = normalizeTotalCount(
    pagination.totalCount,
    page.items.length,
    operation,
  );
  if (
    !Number.isInteger(pageNo) ||
    pageNo !== expectedPageNo ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > DEFAULT_PAGE_SIZE ||
    (expectedPageSize !== null && pageSize !== expectedPageSize) ||
    (
      expectedTotalCount !== null &&
      totalCount !== expectedTotalCount
    )
  ) {
    throw invalidVisitorResponse(operation);
  }

  const expectedItemCount = Math.max(
    0,
    Math.min(pageSize, totalCount - ((pageNo - 1) * pageSize)),
  );
  if (page.items.length !== expectedItemCount) {
    throw invalidVisitorResponse(operation);
  }

  return { pageNo, pageSize, totalCount };
}

function normalizeVisitorItem(item, level, operation) {
  const code = normalizeText(
    level === 'metropolitan'
      ? readField(item, 'areaCode', 'areacode')
      : readField(item, 'signguCode', 'signgucode'),
  );
  const name = normalizeText(
    level === 'metropolitan'
      ? readField(item, 'areaNm', 'areanm')
      : readField(item, 'signguNm', 'signgunm'),
  );
  const dayOfWeekCode = normalizeText(
    readField(item, 'daywkDivCd', 'daywkdivcd'),
  );
  const dayOfWeekName = normalizeText(
    readField(item, 'daywkDivNm', 'daywkdivnm'),
  );
  const visitorTypeCode = normalizeText(
    readField(item, 'touDivCd', 'toudivcd'),
  );
  const visitorTypeName = normalizeText(
    readField(item, 'touDivNm', 'toudivnm'),
  );
  const baseYmd = normalizeText(readField(item, 'baseYmd', 'baseymd'));
  const rawVisitorCount = readField(item, 'touNum', 'tounum');
  const visitorCount =
    rawVisitorCount === null ||
    String(rawVisitorCount).trim() === ''
      ? Number.NaN
      : Number(rawVisitorCount);
  const codePattern =
    level === 'metropolitan' ? AREA_CODE_PATTERN : SIGNGU_CODE_PATTERN;

  if (
    !codePattern.test(code || '') ||
    !name ||
    !DAY_OF_WEEK_PATTERN.test(dayOfWeekCode || '') ||
    !dayOfWeekName ||
    !VISITOR_DIVISION_PATTERN.test(visitorTypeCode || '') ||
    !visitorTypeName ||
    !isValidYmd(baseYmd) ||
    !Number.isFinite(visitorCount) ||
    visitorCount < 0
  ) {
    throw invalidVisitorResponse(operation);
  }

  return Object.freeze({
    level,
    code,
    name,
    dayOfWeekCode,
    dayOfWeekName,
    visitorTypeCode,
    visitorTypeName,
    visitorCount,
    baseYmd,
  });
}

function createDataLabService(options = {}) {
  const client =
    options.client || createConfiguredPublicDataClient('dataLab', options);
  const maxPages = Number(options.maxPages ?? DEFAULT_MAX_PAGES);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new TypeError('DataLab maxPages는 1~100 범위의 정수여야 합니다.');
  }

  async function getPage(level, input = {}) {
    const operation = OPERATIONS[level];
    const request = normalizeVisitorRequest(input, operation);
    const { pageNo, numOfRows, ...params } = request;
    const result = await client.get(operation, {
      params,
      pageNo,
      numOfRows,
    });
    return {
      ...result,
      items: result.items.map(item =>
        normalizeVisitorItem(item, level, operation),
      ),
    };
  }

  async function getAll(level, input = {}) {
    const operation = OPERATIONS[level];
    const firstRequest = normalizeVisitorRequest(
      { ...input, pageNo: 1 },
      operation,
    );
    const first = await getPage(level, firstRequest);
    const {
      pageSize,
      totalCount,
    } = validatePageMetadata(first, {
      expectedPageNo: 1,
      operation,
    });
    const totalPages = Math.max(
      1,
      Math.ceil(totalCount / pageSize),
    );
    if (totalPages > maxPages) {
      throw new ExternalApiError(
        `DataLab 응답이 최대 ${maxPages}페이지를 초과합니다.`,
        {
          code: 'RESPONSE_LIMIT',
          service: 'dataLab',
          operation,
        },
      );
    }

    const items = [...first.items];
    for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
      const page = await getPage(level, {
        ...firstRequest,
        pageNo,
      });
      validatePageMetadata(page, {
        expectedPageNo: pageNo,
        expectedPageSize: pageSize,
        expectedTotalCount: totalCount,
        operation,
      });
      items.push(...page.items);
    }

    if (items.length !== totalCount) {
      throw invalidVisitorResponse(operation);
    }
    const uniqueRows = new Set(items.map(item => [
      item.level,
      item.code,
      item.baseYmd,
      item.visitorTypeCode,
    ].join(':')));
    if (uniqueRows.size !== items.length) {
      throw invalidVisitorResponse(operation);
    }

    return {
      header: first.header,
      items,
      pagination: {
        pageNo: 1,
        numOfRows: pageSize,
        totalCount,
      },
    };
  }

  return Object.freeze({
    getMetropolitanVisitors(input = {}) {
      return getPage('metropolitan', input);
    },
    getLocalVisitors(input = {}) {
      return getPage('local', input);
    },
    getAllMetropolitanVisitors(input = {}) {
      return getAll('metropolitan', input);
    },
    getAllLocalVisitors(input = {}) {
      return getAll('local', input);
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createDataLabService();
  }
  return defaultService;
}

module.exports = {
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  OPERATIONS,
  createDataLabService,
  getAllLocalVisitors: input =>
    getDefaultService().getAllLocalVisitors(input),
  getAllMetropolitanVisitors: input =>
    getDefaultService().getAllMetropolitanVisitors(input),
  getLocalVisitors: input => getDefaultService().getLocalVisitors(input),
  getMetropolitanVisitors: input =>
    getDefaultService().getMetropolitanVisitors(input),
  isValidYmd,
  normalizeVisitorItem,
  normalizeVisitorRequest,
  normalizeTotalCount,
  validatePageMetadata,
};
