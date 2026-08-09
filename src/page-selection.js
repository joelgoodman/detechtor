// src/page-selection.js — which archived page do we look at first?
//
// UNI-225. A stable sort by measured yield. Deliberately tiny and pure so the ordering can be
// re-measured and re-tuned in config.js without touching logic.
'use strict';

/**
 * @param {Array<{pageType:string}>} pages
 * @param {string[]} preference highest-yield page type first
 * @returns {Array} a new array, highest-yield first; unknown types last in input order
 */
function orderPages(pages, preference) {
  const rank = new Map((preference || []).map((t, i) => [t, i]));
  const unknown = rank.size;
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => {
      const ra = rank.has(a.page.pageType) ? rank.get(a.page.pageType) : unknown;
      const rb = rank.has(b.page.pageType) ? rank.get(b.page.pageType) : unknown;
      return ra - rb || a.index - b.index; // stable within a rank
    })
    .map((x) => x.page);
}

module.exports = { orderPages };
