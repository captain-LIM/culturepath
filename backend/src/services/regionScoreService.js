'use strict';

const { getDataLabCacheConfig } = require('../config/dataLabCache');
const {
  getRegionDefinition,
  getRegionsForCulture,
} = require('../config/regionCatalog');
const cachedDataLabService = require('./cachedDataLabService');
const { shiftYmd } = require('../utils/dateYmd');

const WEIGHTS = Object.freeze({
  density: 0.4,
  visitorTrend: 0.3,
  curation: 0.3,
});
const NON_RESIDENT_VISITOR_TYPES = new Set(['2', '3']);
const STATUS_PRIORITY = Object.freeze({
  HIT: 1,
  REFRESHED: 2,
  BYPASS: 3,
  STALE: 4,
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDensity(entries) {
  const counts = entries.map(entry => entry.spotCount);
  const minimum = Math.min(...counts);
  const maximum = Math.max(...counts);
  return new Map(entries.map(entry => [
    entry.areaCode,
    maximum === minimum
      ? 50
      : ((entry.spotCount - minimum) / (maximum - minimum)) * 100,
  ]));
}

function sumNonResidentVisitors(items, definition, baseYmd) {
  let regionTotal = 0;

  for (const codeGroup of definition.visitorCodeGroups) {
    let groupTotal = null;
    for (const code of codeGroup) {
      const matchedTypes = new Set();
      let codeTotal = 0;
      for (const item of items || []) {
        if (
          item.level !== definition.visitorLevel ||
          item.baseYmd !== baseYmd ||
          item.code !== code ||
          !NON_RESIDENT_VISITOR_TYPES.has(item.visitorTypeCode)
        ) {
          continue;
        }
        matchedTypes.add(item.visitorTypeCode);
        codeTotal += item.visitorCount;
      }
      if (matchedTypes.size === NON_RESIDENT_VISITOR_TYPES.size) {
        groupTotal = codeTotal;
        break;
      }
    }
    if (groupTotal === null) {
      return null;
    }
    regionTotal += groupTotal;
  }

  return regionTotal;
}

function calculateTrendScore(current, previous) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    current < 0 ||
    previous < 0
  ) {
    return null;
  }
  if (previous === 0) {
    return current === 0 ? 50 : 100;
  }
  const changePercent = ((current - previous) / previous) * 100;
  return clamp(50 + changePercent * 2.5, 0, 100);
}

function combineCacheStatuses(statuses) {
  return [...statuses].sort(
    (left, right) =>
      (STATUS_PRIORITY[right] || 0) - (STATUS_PRIORITY[left] || 0),
  )[0] || 'BYPASS';
}

function curatedResult(entries) {
  return [...entries]
    .sort((left, right) =>
      right.curationScore - left.curationScore ||
      left.areaCode.localeCompare(right.areaCode),
    )
    .map(entry => ({
      areaCode: entry.areaCode,
      name: entry.name,
      description: entry.description,
      spotCount: entry.spotCount,
      score: entry.curationScore,
    }));
}

function createRegionScoreService(options = {}) {
  const dataLab = options.dataLabService || cachedDataLabService;
  const config = options.config || getDataLabCacheConfig(options.env);
  const logger = options.logger || console;

  async function loadVisitorLevel(level, referenceYmd, previousYmd) {
    const method = level === 'metropolitan'
      ? 'getAllMetropolitanVisitors'
      : 'getAllLocalVisitors';
    return Promise.all([
      dataLab[method]({
        startYmd: referenceYmd,
        endYmd: referenceYmd,
      }),
      dataLab[method]({
        startYmd: previousYmd,
        endYmd: previousYmd,
      }),
    ]);
  }

  async function getRegionsByCulture(cultureId) {
    const entries = getRegionsForCulture(cultureId);
    if (!entries) {
      return null;
    }

    const referenceYmd = config.referenceYmd;
    const previousYmd = shiftYmd(referenceYmd, -config.compareDays);
    const levels = new Set(entries.map(entry =>
      getRegionDefinition(entry.areaCode).visitorLevel,
    ));

    try {
      const loaded = new Map();
      for (const level of levels) {
        loaded.set(
          level,
          await loadVisitorLevel(level, referenceYmd, previousYmd),
        );
      }
      const densityScores = normalizeDensity(entries);
      const statuses = new Set();
      const scored = [];

      for (const entry of entries) {
        const definition = getRegionDefinition(entry.areaCode);
        const [currentResult, previousResult] = loaded.get(
          definition.visitorLevel,
        );
        statuses.add(currentResult.cacheStatus);
        statuses.add(previousResult.cacheStatus);
        const currentVisitors = sumNonResidentVisitors(
          currentResult.items,
          definition,
          referenceYmd,
        );
        const previousVisitors = sumNonResidentVisitors(
          previousResult.items,
          definition,
          previousYmd,
        );
        const visitorTrendScore = calculateTrendScore(
          currentVisitors,
          previousVisitors,
        );
        if (visitorTrendScore === null) {
          return {
            items: curatedResult(entries),
            dataStatus: 'CURATED',
          };
        }

        const score = Math.round(
          densityScores.get(entry.areaCode) * WEIGHTS.density +
          visitorTrendScore * WEIGHTS.visitorTrend +
          entry.curationScore * WEIGHTS.curation,
        );
        scored.push({
          areaCode: entry.areaCode,
          name: entry.name,
          description: entry.description,
          spotCount: entry.spotCount,
          score: clamp(score, 0, 100),
        });
      }

      scored.sort((left, right) =>
        right.score - left.score ||
        left.areaCode.localeCompare(right.areaCode),
      );
      return {
        items: scored,
        dataStatus: combineCacheStatuses(statuses),
      };
    } catch (error) {
      logger?.warn?.('DataLab 지역점수를 큐레이션 점수로 대체합니다.', {
        errorName: error?.name || 'Error',
      });
      return {
        items: curatedResult(entries),
        dataStatus: 'CURATED',
      };
    }
  }

  return Object.freeze({ getRegionsByCulture });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createRegionScoreService();
  }
  return defaultService;
}

module.exports = {
  WEIGHTS,
  calculateTrendScore,
  combineCacheStatuses,
  createRegionScoreService,
  getRegionsByCulture: cultureId =>
    getDefaultService().getRegionsByCulture(cultureId),
  normalizeDensity,
  sumNonResidentVisitors,
};
