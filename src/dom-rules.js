// src/dom-rules.js — the `dom` field shape contract.
//
// Pattern files carry `dom` in three on-disk shapes. The engine historically understood none
// of them (it regex-tested a fixed six-key `evidence.dom` bag, while patterns key `dom` on CSS
// selectors), so all 1,456 dom-carrying techs were dead. This module is the single conversion
// point into one internal rule form:
//
//   { selector, kind: 'exists'|'text'|'attributes'|'properties', name?, regex? }
//
// It THROWS on anything it cannot represent. That is deliberate: the defect being fixed is
// silent death, so an unrepresentable rule must fail loudly at load rather than quietly never
// firing. Callers that want tolerance must catch explicitly.
//
// On-disk vocabulary, enumerated across all 11 pattern files (2026-08-01):
//   attributes 163 · text 63 · exists 19 · properties 1

const CONDITION_KEYS = new Set(['attributes', 'text', 'exists', 'properties']);

/**
 * @param {object} def a technology definition (may or may not carry `dom`)
 * @returns {Array<{selector:string, kind:string, name?:string, regex?:string}>}
 */
function normalizeDomRules(def) {
  const dom = def && def.dom;
  if (dom === undefined || dom === null) return [];

  const rules = [];

  // Shape 3: dom = ["selector", …] — existence alone is the whole rule.
  if (Array.isArray(dom)) {
    for (const selector of dom) {
      if (typeof selector !== 'string') {
        throw new TypeError(
          `dom array entries must be selector strings, got ${typeof selector}: ${JSON.stringify(selector)}`,
        );
      }
      rules.push({ selector, kind: 'exists' });
    }
    return rules;
  }

  if (typeof dom !== 'object') {
    throw new TypeError(`dom must be an object or array of selectors, got ${typeof dom}`);
  }

  for (const [selector, value] of Object.entries(dom)) {
    // Shape 1: dom.<selector> = "regex" — match against the element's text.
    if (typeof value === 'string') {
      rules.push({ selector, kind: 'text', regex: value });
      continue;
    }

    // Shape 2: dom.<selector> = { attributes | text | exists | properties }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(
        `dom["${selector}"] must be a regex string or a condition object, got ${Array.isArray(value) ? 'array' : typeof value}`,
      );
    }

    for (const [key, condition] of Object.entries(value)) {
      if (!CONDITION_KEYS.has(key)) {
        throw new TypeError(
          `dom["${selector}"] has unknown condition "${key}" (expected one of: ${[...CONDITION_KEYS].join(', ')})`,
        );
      }

      if (key === 'exists') {
        rules.push({ selector, kind: 'exists' });
      } else if (key === 'text') {
        rules.push({ selector, kind: 'text', regex: String(condition) });
      } else {
        // attributes / properties: an object of name -> regex
        if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
          throw new TypeError(
            `dom["${selector}"].${key} must be an object of name->regex, got ${typeof condition}`,
          );
        }
        for (const [name, regex] of Object.entries(condition)) {
          rules.push({ selector, kind: key, name, regex: String(regex) });
        }
      }
    }
  }

  return rules;
}

// --- admission gate -----------------------------------------------------------------------
//
// Phase A (UNI-224) measured every dom rule against 4,214 real institutions. 1,585 rules landed
// in UNVALIDATED/PLAUSIBLE and auto-admit; 13 needed adjudication and 4 were rejected. A denylist
// of the failures is smaller and more legible than an allowlist of the survivors.
//
// Admission is per-RULE, not per-tech: a tech may have one over-broad selector denied while its
// other selectors still run.

const DENYLIST = require('../patterns/dom-rule-denylist.json');

const DENIED = new Map(); // tech -> Set<selector>
for (const entry of DENYLIST.denied || []) {
  if (!DENIED.has(entry.tech)) DENIED.set(entry.tech, new Set());
  DENIED.get(entry.tech).add(entry.selector);
}

/**
 * Normalize a technology's `dom` field and drop any rule denied by the Phase A evidence gate.
 * @param {string} tech technology name (denylist is keyed by it)
 * @param {object} def the technology definition
 * @returns {Array<{selector:string, kind:string, name?:string, regex?:string}>}
 */
function admittedDomRules(tech, def) {
  const denied = DENIED.get(tech);
  const rules = normalizeDomRules(def);
  if (!denied) return rules;
  return rules.filter((r) => !denied.has(r.selector));
}

// --- Phase C guardrails -------------------------------------------------------------------
//
// Two independent questions, and we historically only ever asked the second:
//   STRUCTURAL — is this the shape the engine consumes?   (the silent-death class)
//   SEMANTIC   — is this pattern too broad?               (the false-positive class)
// One rule can fail either. checkDomRules() answers the first; isOverBroadSelector() the second.

const cheerio = require('cheerio');

/** A selector is only useful if the engine can actually parse it. */
function selectorParses(selector) {
  try {
    cheerio.load('<div></div>')(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a technology's `dom` field. Denied rules are skipped — they are already quarantined
 * by the Phase A evidence gate and must not be re-reported as defects.
 *
 * @returns {{rules: Array, problems: Array<{tech:string, kind:'shape'|'selector', message:string}>}}
 */
function checkDomRules(tech, def) {
  const problems = [];
  let rules = [];
  try {
    rules = admittedDomRules(tech, def);
  } catch (err) {
    problems.push({ tech, kind: 'shape', message: err.message });
    return { rules: [], problems };
  }
  for (const r of rules) {
    if (!selectorParses(r.selector)) {
      problems.push({ tech, kind: 'selector', message: `unparseable selector: ${r.selector}` });
    }
  }
  return { rules, problems };
}

// Substring-match selectors keyed on a short token are the `dom` equivalent of the bare-token
// html/scripts offenders the specificity lint already catches. Measured examples from the Phase A
// corpus run: [class*='fa'] fires on "de-FA-ult"; [class*='el-'] fires on "lev-EL-", "lab-EL-".
const SUBSTRING_ATTR = /\[\s*[a-z-]+\s*[*^$~|]?=\s*['"]([^'"]*)['"]/gi;
const MIN_SUBSTRING_TOKEN = 4;

/**
 * Heuristic breadth check for a `dom` selector. Deliberately conservative — it reports the
 * mechanically obvious cases and does not attempt to judge semantics.
 *
 * Known limit: it does NOT catch link[type*='application'] (the RSS denial), because
 * "application" is long enough to look specific while still being a media-type namespace shared
 * by json, json+oembed and rsd+xml. That class needs the base-rate report, not a lint.
 */
function isOverBroadSelector(selector) {
  const sel = String(selector).trim();

  // A bare element name with no class/id/attribute qualifier matches on nearly every page.
  if (/^[a-z][a-z0-9]*$/i.test(sel)) return true;

  for (const m of sel.matchAll(SUBSTRING_ATTR)) {
    const value = m[1];
    const alnum = value.replace(/[^a-z0-9]/gi, '');
    if (alnum.length < MIN_SUBSTRING_TOKEN) return true;
  }
  return false;
}

/**
 * Breadth check for a normalized RULE rather than a bare selector.
 *
 * Selector breadth only matters when existence IS the whole rule. Curated Pleroma's `noscript`
 * selector matches ~78% of university homepages, but the rule pairs it with
 * `^To use Pleroma, please enable JavaScript\.$` and fires on 0% — the regex is what constrains
 * it. Judging that selector in isolation would condemn a sound rule, which is the same mistake
 * as auditing selectors without their regexes.
 */
function isOverBroadRule(rule) {
  const existenceOnly =
    rule.kind === 'exists' ||
    ((rule.kind === 'attributes' || rule.kind === 'properties') && !rule.regex);
  if (!existenceOnly) return false;
  return isOverBroadSelector(rule.selector);
}

module.exports = {
  normalizeDomRules,
  admittedDomRules,
  checkDomRules,
  isOverBroadSelector,
  isOverBroadRule,
  CONDITION_KEYS,
};
