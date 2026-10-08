// src/page-selection.js — which archived page do we look at first?
//
// UNI-225. A stable sort by measured yield. Deliberately tiny and pure so the ordering can be
// re-measured and re-tuned in config.js without touching logic.
'use strict';

/**
 * Page types compare with `_` and `-` treated as the same character.
 *
 * The page archive names its types with underscores (`cost_aid`, `student_life`) while
 * config.pagePreference is written with hyphens (`cost-aid`, `student-life`). Compared as raw
 * strings those two entries never matched anything, so two of the six preferences silently never
 * applied. Normalising here, in the one place that compares them, means neither the archive's
 * spelling nor the config's has to change and no caller has to remember to translate.
 *
 * Used for COMPARISON only: `orderPages` returns the caller's own page objects, so a page keeps the
 * `pageType` it arrived with (and `pagesEvaluated` / `pages` in a tiered result stay in the
 * archive's spelling).
 *
 * @param {*} type
 * @returns {*} the type with `_` read as `-`; a non-string is returned untouched (and so never
 *          matches a preference entry)
 */
function normalizePageType(type) {
  return typeof type === 'string' ? type.replace(/_/g, '-') : type;
}

/**
 * @param {Array<{pageType:string}>} pages
 * @param {string[]} preference highest-yield page type first
 * @returns {Array} a new array, highest-yield first; unknown types last in input order
 */
function orderPages(pages, preference) {
  const rank = new Map();
  (preference || []).forEach((t, i) => {
    const key = normalizePageType(t);
    if (!rank.has(key)) rank.set(key, i); // first spelling wins if a list names the same type twice
  });
  const unknown = (preference || []).length;
  const rankOf = (page) => {
    const key = normalizePageType(page.pageType);
    return rank.has(key) ? rank.get(key) : unknown;
  };
  return pages
    .map((page, index) => ({ page, index, rank: rankOf(page) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index) // stable within a rank
    .map((x) => x.page);
}

module.exports = { orderPages, normalizePageType };
