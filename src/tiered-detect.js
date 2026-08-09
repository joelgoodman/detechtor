// src/tiered-detect.js — evaluate the cheapest page first; escalate only when it told us nothing.
//
// UNI-225. deTECHtor evaluated one page per institution -- the homepage -- and one page is not
// enough: 14 of 29 TerminalFour candidates carry a fingerprint only on an interior page, including
// University of York, which had been cited as proof of a "structural ceiling". There was no
// ceiling; there was a page-choice error.
//
// Cost: N x (1 + 4e) page parses for escalation rate e, versus 5N for scan-everything.
'use strict';
const config = require('./config');
const { classifyCapture } = require('./capture-quality');
const { evidenceFromHtml } = require('./evidence-from-html');
const { orderPages } = require('./page-selection');
const { SIGNAL_CATEGORIES } = require('./category-mapping');

const isSignal = (tech) => (tech.categories || []).some((c) => SIGNAL_CATEGORIES.has(c));

/** Union across pages: highest confidence wins, evidence and page list accumulate. */
function merge(into, techs, pageType) {
  for (const tech of techs) {
    const prev = into.get(tech.name);
    if (!prev) {
      into.set(tech.name, { ...tech, evidence: [...(tech.evidence || [])], pages: [pageType] });
      continue;
    }
    if (!prev.pages.includes(pageType)) prev.pages.push(pageType);
    if (tech.confidence > prev.confidence) {
      prev.confidence = tech.confidence;
      prev.version = tech.version || prev.version;
    }
    for (const e of tech.evidence || []) if (!prev.evidence.includes(e)) prev.evidence.push(e);
  }
}

/**
 * @param {object} engine a DeTECHtor instance (needs .domPlan and .matchPatterns)
 * @param {Array<{pageType:string, html:string, jsGlobals?:string[], headers?:object}>} pages
 * @param {{pagePreference?: string[]}} [options]
 * @returns {{status:'detected'|'none'|'unknown', technologies:Array, pagesEvaluated:string[],
 *            unscannable:Array<{pageType:string,reason:string}>, tier:0|1|2}}
 */
function detectTiered(engine, pages, options = {}) {
  const preference = options.pagePreference || config.pagePreference;
  const ordered = orderPages(pages || [], preference);

  const scannable = [];
  const unscannable = [];
  for (const page of ordered) {
    const q = classifyCapture(page.html);
    if (q.scannable) scannable.push(page);
    else unscannable.push({ pageType: page.pageType, reason: q.reason });
  }

  // Nothing readable. This is "we could not look", NOT "there is nothing to find" -- reporting it
  // as absence would fabricate a finding for a site we never saw.
  if (!scannable.length) {
    return { status: 'unknown', technologies: [], pagesEvaluated: [], unscannable, tier: 0 };
  }

  const merged = new Map();
  const pagesEvaluated = [];

  const evaluate = (page) => {
    const evidence = evidenceFromHtml(page.html, engine.domPlan, {
      jsGlobals: page.jsGlobals,
      headers: page.headers,
    });
    merge(merged, engine.matchPatterns(evidence), page.pageType);
    pagesEvaluated.push(page.pageType);
  };

  // Tier 1 — one page, the highest-yield one available.
  evaluate(scannable[0]);
  let tier = 1;

  // Tier 2 — escalate only when Tier 1 found no signal-category technology. An institution already
  // confidently on WordPress or Drupal stops here and costs one parse.
  if (![...merged.values()].some(isSignal)) {
    tier = 2;
    for (const page of scannable.slice(1)) evaluate(page);
  }

  const technologies = [...merged.values()].sort((a, b) => b.confidence - a.confidence);
  return {
    status: technologies.some(isSignal) ? 'detected' : 'none',
    technologies,
    pagesEvaluated,
    unscannable,
    tier,
  };
}

module.exports = { detectTiered };
