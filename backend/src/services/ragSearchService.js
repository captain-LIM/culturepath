'use strict';

const { getRagSearchConfig } = require('../config/ragSearch');
const defaultPlaceRepository = require('../repositories/placeCacheRepository');
const defaultVectorStore = require('./vectorStore');
const { buildPlaceIndexDocument } = require('./placeIndexDocument');
const { routeQuery } = require('./ragQuery');

function uniqueWarnings(values) {
  return [...new Set(values.filter(Boolean))];
}

function trustedDocument(cachedPlace, searchResult) {
  try {
    const indexed = buildPlaceIndexDocument(cachedPlace);
    const payload = indexed.payload;
    return {
      content: indexed.content,
      id: String(searchResult.id),
      metadata: {
        address: String(payload.address || ''),
        category: String(payload.category || ''),
        contentId: String(payload.contentId),
        contentTypeId: payload.contentTypeId ? String(payload.contentTypeId) : null,
        cultures: Array.isArray(payload.cultures) ? [...payload.cultures] : [],
        open_time: String(payload.openTime || ''),
        place_name: String(payload.title || ''),
        region: String(payload.regionName || ''),
        tel: String(payload.tel || ''),
        trustedSource: true,
      },
      score: Number(searchResult.score),
    };
  } catch {
    return null;
  }
}

function matchesFilters(document, filters) {
  const metadata = document.metadata;
  if (filters.category && !metadata.cultures.includes(filters.category)) return false;
  if (filters.region && metadata.region !== filters.region) return false;
  if (filters.contentTypeId && metadata.contentTypeId !== filters.contentTypeId) return false;
  return true;
}

function createRagSearchService(dependencies = {}) {
  const vectorStore = dependencies.vectorStore || defaultVectorStore;
  const defaultRepository = dependencies.placeRepository || defaultPlaceRepository;

  async function search(query, input = {}, options = {}) {
    const env = options.env || process.env;
    const suppliedRoute = input.routeInfo || {};
    const routeInfo = routeQuery(query, {
      category: suppliedRoute.category ?? input.category,
      contentTypeId: suppliedRoute.contentTypeId ?? input.contentTypeId,
      region: suppliedRoute.region ?? input.region,
    });
    const searchConfig = getRagSearchConfig(env, {
      ...(input.topK === undefined ? {} : { topK: input.topK }),
      ...(input.minResults === undefined ? {} : { minResults: input.minResults }),
      ...(Object.prototype.hasOwnProperty.call(input, 'scoreThreshold')
        ? { scoreThreshold: input.scoreThreshold }
        : {}),
    });
    const result = await vectorStore.searchDetailed(routeInfo.normalizedQuery, {
      category: routeInfo.category,
      contentTypeId: routeInfo.contentTypeId,
      minResults: searchConfig.minResults,
      region: routeInfo.region,
      scoreThreshold: searchConfig.scoreThreshold,
      softConditions: routeInfo.softConditions,
      topK: searchConfig.topK,
    }, options);

    if (result.diagnostics?.source === 'mock') {
      return {
        diagnostics: {
          ...result.diagnostics,
          routeInfo,
          trustedSourceRate: null,
        },
        documents: result.documents,
        routeInfo,
      };
    }

    const dropped = {
      duplicateContentId: 0,
      filterMismatch: 0,
      invalidContentId: 0,
      invalidSource: 0,
      missingSource: 0,
    };
    const uniqueResults = [];
    const seen = new Set();
    for (const document of result.documents) {
      const contentId = String(document?.metadata?.contentId || '');
      if (!/^\d+$/.test(contentId)) {
        dropped.invalidContentId += 1;
        continue;
      }
      if (seen.has(contentId)) {
        dropped.duplicateContentId += 1;
        continue;
      }
      seen.add(contentId);
      uniqueResults.push({ ...document, contentId });
    }

    const repository = options.placeRepository || defaultRepository;
    const cachedPlaces = await repository.findExistingPlaces(
      uniqueResults.map(document => document.contentId),
    );
    const placesById = new Map(cachedPlaces.map(place => [String(place.contentId), place]));
    const documents = [];
    for (const resultDocument of uniqueResults) {
      const cachedPlace = placesById.get(resultDocument.contentId);
      if (!cachedPlace) {
        dropped.missingSource += 1;
        continue;
      }
      const document = trustedDocument(cachedPlace, resultDocument);
      if (!document) {
        dropped.invalidSource += 1;
        continue;
      }
      if (!matchesFilters(document, routeInfo)) {
        dropped.filterMismatch += 1;
        continue;
      }
      documents.push(document);
    }

    const shortage = documents.length < searchConfig.minResults;
    const warnings = uniqueWarnings([
      ...(result.diagnostics?.warnings || []),
      shortage ? 'INSUFFICIENT_RESULTS' : null,
      documents.length === 0 && result.documents.length > 0 ? 'NO_TRUSTED_RESULTS' : null,
    ]);
    return {
      diagnostics: {
        ...result.diagnostics,
        dropped,
        filters: {
          category: routeInfo.category,
          contentTypeId: routeInfo.contentTypeId,
          filtersRelaxed: false,
          region: routeInfo.region,
          scoreThreshold: searchConfig.scoreThreshold,
          topK: searchConfig.topK,
        },
        returnedCount: documents.length,
        routeInfo,
        shortage,
        source: 'mysql-rehydrated',
        trustedSourceRate: documents.length ? 1 : null,
        warnings,
      },
      documents,
      routeInfo,
    };
  }

  return Object.freeze({ search });
}

module.exports = { createRagSearchService, matchesFilters, trustedDocument };
