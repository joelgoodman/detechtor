// src/tiered-detect.js — evaluate the cheapest page first; escalate while a ledger category still lacks
// evidence the ledger loader would load.
//
// UNI-225. deTECHtor evaluated one page per institution -- the homepage -- and one page is not
// enough: 14 of 29 TerminalFour candidates carry a fingerprint only on an interior page, including
// University of York, which had been cited as proof of a "structural ceiling". There was no
// ceiling; there was a page-choice error.
//
// Cost: N x (1 + 4e) page parses for escalation rate e, versus 5N for scan-everything.
//
// Escalation is decided per ledger category, on loadable evidence (2026-11 review, finding 9). It
// used to stop for all six categories on the first signal-category hit at any confidence: a Canvas
// LMS link, a 40-point html rule, Font Awesome's `.fa-salesforce`. Reading the pages that stop left
// out added 355 loadable non-CMS rows on cohort 143. Now a category is settled only by a detection
// with a match the loader grades `anchored` or `link` without needing its policy lists, and the
// pages are read until every requested category is settled or they run out.
'use strict';
const config = require('./config');
const { classifyCapture } = require('./capture-quality');
const { evidenceFromHtml } = require('./evidence-from-html');
const { orderPages } = require('./page-selection');
const { SIGNAL_CATEGORIES } = require('./category-mapping');
const { mergeMatches, operatedByFor } = require('./rule-matches');

const isSignal = (tech) => (tech.categories || []).some((c) => SIGNAL_CATEGORIES.has(c));

/** The tech ledger's categories (speedyu-benchmark `detechtor-eligibility.json` candidate_categories). */
const LEDGER_CATEGORIES = Object.freeze(['CMS', 'CRM', 'Marketing Automation', 'Chatbot', 'Accessibility', 'Site Search']);

/**
 * A rule match (src/rule-matches.js) the loader grades `anchored` or `link` with no policy list: a Meta
 * match, or a Script / DOM match on one of the technology's vendor hosts (link DOM included). The
 * loader also accepts first-party, own-CDN, distinctive-name and structural-DOM matches for technologies
 * its policy names; those are not counted here, so a doubtful case costs a page read, never a row.
 */
function isLoadableMatch(m) {
  if (!m) return false;
  if (m.channel === 'Meta') return true;
  return (m.channel === 'Script' || m.channel === 'DOM') && m.vendorHost === true;
}

/** The categories (of `categories`, in that order) in which this detection carries loadable evidence. */
function loadableCategories(tech, categories = LEDGER_CATEGORIES) {
  if (!(tech.matches || []).some(isLoadableMatch)) return [];
  const cats = new Set(tech.categories || []);
  return categories.filter((c) => cats.has(c));
}

/** The categories of `categories` that no detection in `techs` settles with loadable evidence. */
function pendingCategories(techs, categories = LEDGER_CATEGORIES) {
  const settled = new Set();
  for (const t of techs) for (const c of loadableCategories(t, categories)) settled.add(c);
  return categories.filter((c) => !settled.has(c));
}

/** Union across pages: highest confidence wins, evidence and page list accumulate. */
function merge(into, techs, pageType) {
  for (const tech of techs) {
    const prev = into.get(tech.name);
    if (!prev) {
      into.set(tech.name, { ...tech, evidence: [...(tech.evidence || [])], matches: mergeMatches(tech.matches, []),
        pages: [pageType] });
      continue;
    }
    if (!prev.pages.includes(pageType)) prev.pages.push(pageType);
    if (tech.confidence > prev.confidence) {
      prev.confidence = tech.confidence;
      prev.version = tech.version || prev.version;
    }
    for (const e of tech.evidence || []) if (!prev.evidence.includes(e)) prev.evidence.push(e);
    prev.matches = mergeMatches(prev.matches, tech.matches);
    const op = operatedByFor(prev.name, prev.matches);
    if (op) prev.operatedBy = op; else delete prev.operatedBy;
  }
}

/**
 * @param {object} engine a DeTECHtor instance (needs .domPlan and .matchPatterns)
 * @param {Array<{pageType:string, html:string, url?:string, jsGlobals?:string[], headers?:object}>} pages
 *        `url` is the page URL the capture is of; rule matches place first-party hosts against it
 * @param {{pagePreference?: string[], categories?: string[]}} [options]
 *        `categories`: the categories escalation must settle (default LEDGER_CATEGORIES)
 * @returns {{status:'detected'|'none'|'unknown', technologies:Array, pagesEvaluated:string[],
 *            unscannable:Array<{pageType:string,reason:string}>, tier:0|1|2, pendingCategories:string[]}}
 *          tier 2 = tier 1 left a category pending; `pendingCategories` = still pending at the end
 */
function detectTiered(engine, pages, options = {}) {
  const preference = options.pagePreference || config.pagePreference;
  const categories = options.categories || LEDGER_CATEGORIES;
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
    return { status: 'unknown', technologies: [], pagesEvaluated: [], unscannable, tier: 0,
      pendingCategories: [...categories] };
  }

  const merged = new Map();
  const pagesEvaluated = [];

  const evaluate = (page) => {
    const evidence = evidenceFromHtml(page.html, engine.domPlan, {
      jsGlobals: page.jsGlobals,
      headers: page.headers,
      pageUrl: page.url || page.pageUrl,
    });
    merge(merged, engine.matchPatterns(evidence), page.pageType);
    pagesEvaluated.push(page.pageType);
  };

  // Tier 1 — one page, the highest-yield one available.
  evaluate(scannable[0]);
  let tier = 1;

  // Tier 2 — escalate while any category has no loadable evidence, page by page, and stop at the page
  // that settles the last one. Only an institution with all of them settled on tier 1 costs one parse.
  let pending = pendingCategories(merged.values(), categories);
  if (pending.length) {
    tier = 2;
    for (const page of scannable.slice(1)) {
      evaluate(page);
      pending = pendingCategories(merged.values(), categories);
      if (!pending.length) break;
    }
  }

  const technologies = [...merged.values()].sort((a, b) => b.confidence - a.confidence);
  return {
    status: technologies.some(isSignal) ? 'detected' : 'none',
    technologies,
    pagesEvaluated,
    unscannable,
    tier,
    pendingCategories: pending,
  };
}

module.exports = { detectTiered, LEDGER_CATEGORIES, isLoadableMatch, loadableCategories, pendingCategories };
