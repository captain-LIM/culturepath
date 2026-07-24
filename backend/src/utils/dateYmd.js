'use strict';

const YMD_PATTERN = /^\d{8}$/;

function parseYmd(value) {
  const normalized = String(value || '').trim();
  if (!YMD_PATTERN.test(normalized)) {
    return null;
  }
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function isValidYmd(value) {
  return parseYmd(value) !== null;
}

function formatYmd(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function shiftYmd(value, days) {
  const date = parseYmd(value);
  if (!date || !Number.isInteger(days)) {
    throw new TypeError('기준 날짜와 이동 일수가 올바르지 않습니다.');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

module.exports = { formatYmd, isValidYmd, parseYmd, shiftYmd };
