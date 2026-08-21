'use strict';

const { validateDataset } = require('./ragEvaluationService');

function collectExpectations(dataset) {
  validateDataset(dataset, 'live');
  const byContentId = new Map();

  for (const item of dataset.cases) {
    for (const contentId of item.expected.contentIds || []) {
      const expectation = byContentId.get(contentId) || {
        caseIds: [],
        contentId,
        coverageGapCategories: new Set(),
        expectedCategories: new Set(),
        expectedTitlesByLocale: {},
        translationGapLocales: new Set(),
      };
      expectation.caseIds.push(item.id);
      const titlesForContentId = item.expected.titlesByContentId?.[contentId] ||
        item.expected.titlesByLocale || {};
      for (const [locale, titles] of Object.entries(titlesForContentId)) {
        const expectedTitles = expectation.expectedTitlesByLocale[locale] || new Set();
        for (const title of titles) expectedTitles.add(title);
        expectation.expectedTitlesByLocale[locale] = expectedTitles;
      }
      const category = item.expectedFilters?.category;
      if (category && item.expected.outcome === 'relevant') {
        expectation.expectedCategories.add(category);
      }
      if (category && item.expected.coverageGapReason === 'UNCLASSIFIED_CULTURE') {
        expectation.coverageGapCategories.add(category);
      }
      if (item.expected.coverageGapReason === 'MISSING_TRANSLATION') {
        expectation.translationGapLocales.add(item.expected.coverageGapLocale);
      }
      byContentId.set(contentId, expectation);
    }
  }

  return [...byContentId.values()];
}

function placeSummary(place) {
  return place?.summary || {};
}

function observedTitleForLocale(place, locale) {
  if (locale === 'ko') return String(placeSummary(place).title || '') || null;
  return String(place?.translations?.[locale]?.detail?.title || '') || null;
}

async function auditRagLiveFixture({ dataset, findExistingPlaces }) {
  if (typeof findExistingPlaces !== 'function') {
    throw new TypeError('live fixture 감사에는 findExistingPlaces 함수가 필요합니다.');
  }
  const expectations = collectExpectations(dataset);
  const contentIds = expectations.map(item => item.contentId);
  const places = await findExistingPlaces(contentIds);
  const placesById = new Map((places || []).map(place => [String(place.contentId), place]));
  const results = expectations.map(expectation => {
    const place = placesById.get(expectation.contentId);
    if (!place) {
      return {
        caseIds: expectation.caseIds,
        contentId: expectation.contentId,
        issues: ['MISSING_FROM_PLACES_CACHE'],
        localeTitles: {},
        observedCultures: [],
        observedTitle: null,
        titleMatchesSnapshot: false,
      };
    }

    const summary = placeSummary(place);
    const cultures = Array.isArray(summary.cultures) ? summary.cultures : [];
    const title = String(summary.title || '');
    const issues = [];
    for (const category of expectation.expectedCategories) {
      if (!cultures.includes(category)) issues.push(`EXPECTED_CATEGORY_MISSING:${category}`);
    }
    for (const category of expectation.coverageGapCategories) {
      if (cultures.includes(category)) issues.push(`COVERAGE_GAP_RESOLVED:${category}`);
    }
    const localeTitles = {};
    for (const [locale, expectedTitles] of Object.entries(expectation.expectedTitlesByLocale)) {
      const observed = observedTitleForLocale(place, locale);
      const missing = observed === null;
      const matchesSnapshot = observed !== null && expectedTitles.has(observed);
      localeTitles[locale] = {
        expected: [...expectedTitles],
        matchesSnapshot,
        missing,
        observed,
      };
      if (expectation.translationGapLocales.has(locale)) {
        if (!missing) issues.push(`COVERAGE_GAP_RESOLVED:MISSING_TRANSLATION:${locale}`);
      } else if (missing) {
        issues.push(`EXPECTED_LOCALE_TITLE_MISSING:${locale}`);
      }
    }

    return {
      caseIds: expectation.caseIds,
      contentId: expectation.contentId,
      issues,
      localeTitles,
      observedCultures: cultures,
      observedTitle: title || null,
      titleMatchesSnapshot: localeTitles.ko?.matchesSnapshot ?? false,
    };
  });
  const issueCount = results.reduce((sum, item) => sum + item.issues.length, 0);
  const pendingVerificationCases = dataset.cases.filter(item =>
    item.evidence.verification !== 'mysql_verified',
  ).length;

  return {
    auditedContentIds: results.length,
    foundContentIds: results.filter(item => item.observedTitle !== null).length,
    issueCount,
    pendingVerificationCases,
    readyForApproval: issueCount === 0 && pendingVerificationCases === 0,
    results,
  };
}

module.exports = {
  auditRagLiveFixture,
  collectExpectations,
};
