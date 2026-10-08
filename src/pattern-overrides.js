// src/pattern-overrides.js — UNI-237. Evidence-pattern removals, applied at load.
//
// WHY A LAYER AND NOT AN EDIT. Same reason as src/category-overrides.js: 6,202 of the 6,504
// technologies live in `patterns/generated/webappanalyzer-merged.json`, which the importer
// regenerates wholesale (`{ ...webappPatterns }`). An in-place deletion there is silently reverted
// by the next import.
//
// ⚠️ This layer REMOVES evidence patterns and does nothing else. It never adds, rewrites or
// reorders evidence, and it never touches `categories`/`cats` — that is category-overrides.js.
// Keeping the two disjoint is what makes the UNI-224 dom-clobbering hazard structurally impossible
// rather than merely tested against.
//
// RETIRE. One more removal, of the whole technology: `{ retire: true, reason, decided }` drops a
// technology from the loaded map. It exists for a generated technology whose every evidence pattern
// is wrong: emptying it is refused below (a technology with no evidence looks alive and never
// fires), and deleting it in place is reverted by the next import. Ova (2026-10-08) is the case: its
// only evidence is two JS globals of the Custom Facebook Feed WordPress plugin. Still a removal: it
// never adds or rewrites anything.
'use strict';

const { admittedDomRules } = require('./dom-rules');

// Only these may be targeted. `dom` is deliberately absent: its rules are pre-compiled into
// `_domRules` at load, so removing a raw `dom` entry would leave the compiled rule live and the two
// out of sync. A bad dom rule is fixed in the pattern file, not here.
const EVIDENCE_FIELDS = ['html', 'scripts', 'scriptSrc', 'url', 'xhr', 'text'];
const OBJECT_FIELDS = ['meta', 'headers', 'cookies', 'js'];

function isArrayField(f) { return EVIDENCE_FIELDS.includes(f); }
function isObjectField(f) { return OBJECT_FIELDS.includes(f); }

/**
 * Every evidence entry a definition currently carries, counted across both shapes, plus its dom
 * rules. A dom rule cannot be removed here (see above) but it fires, so a definition left with dom
 * rules only is still detectable. Only rules the Phase A gate admits count: a denied one never fires.
 *
 * @param {object} def
 * @param {string} [name] the technology name, which the dom denylist is keyed by
 */
function evidenceCount(def, name = '') {
  let n = 0;
  for (const f of EVIDENCE_FIELDS) if (Array.isArray(def[f])) n += def[f].length;
  for (const f of OBJECT_FIELDS) if (def[f] && typeof def[f] === 'object') n += Object.keys(def[f]).length;
  try { n += admittedDomRules(name, def).length; } catch { /* unusable dom shape: lint-dom-rules gates it */ }
  return n;
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Apply evidence-pattern removals.
 *
 * @param {object} patterns name -> definition
 * @param {object} [overrides] name -> {remove: {field: string[]}, reason?, decided?}
 *                              | {retire: true, reason, decided}
 * @returns {object} a new pattern map; the input and its definitions are not mutated.
 */
function applyPatternOverrides(patterns, overrides = {}) {
  const out = { ...patterns };

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;
    const def = out[name];
    // Never invent a technology. A stale rule is reported by validatePatternOverrides and gated in
    // CI; at runtime it is simply inert.
    if (!def || typeof def !== 'object') continue;
    if (rule && rule.retire === true && !rule.remove) { delete out[name]; continue; }
    if (!rule || !rule.remove || typeof rule.remove !== 'object') continue;

    const next = { ...def };
    const removed = {};

    for (const [field, values] of Object.entries(rule.remove)) {
      if (!Array.isArray(values) || values.length === 0) continue;

      if (isArrayField(field) && Array.isArray(def[field])) {
        const drop = new Set(values);
        const kept = def[field].filter((p) => !drop.has(p));
        if (kept.length !== def[field].length) {
          next[field] = kept;
          removed[field] = [...values];
        }
      } else if (isObjectField(field) && def[field] && typeof def[field] === 'object') {
        const copy = { ...def[field] };
        const hit = [];
        for (const k of values) if (k in copy) { delete copy[k]; hit.push(k); }
        if (hit.length) { next[field] = copy; removed[field] = hit; }
      }
    }

    if (Object.keys(removed).length === 0) continue;

    next._patternOverride = {
      removed,
      reason: rule.reason ?? null,
      decided: rule.decided ?? null,
    };
    out[name] = next;
  }

  return out;
}

/**
 * Structural problems with the override file. Gated by scripts/lint-pattern-breadth.js so that a
 * reimport which reverts a decision, or a stale rule, fails the build instead of rotting.
 *
 * @returns {Array<{name: string, problem: string}>}
 */
function validatePatternOverrides(patterns, overrides = {}) {
  const problems = [];

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;

    if (rule && rule.retire !== undefined) {
      if (rule.retire !== true) { problems.push({ name, problem: 'malformed: `retire` is either true or absent' }); continue; }
      if (rule.remove !== undefined) { problems.push({ name, problem: 'malformed: a retire rule removes the whole technology; it takes no `remove`' }); continue; }
      if (typeof rule.reason !== 'string' || rule.reason.length < 30) problems.push({ name, problem: 'a retire rule needs a real `reason` (what the evidence actually is)' });
      if (!isDate(rule.decided)) problems.push({ name, problem: 'a retire rule needs a `decided` date (YYYY-MM-DD)' });
      const def = patterns[name];
      if (!def || typeof def !== 'object') problems.push({ name, problem: 'no such technology — the override is stale' });
      continue;
    }

    if (!rule || !rule.remove || typeof rule.remove !== 'object' || Array.isArray(rule.remove)) {
      problems.push({ name, problem: 'malformed: `remove` must be an object of field -> string[]' });
      continue;
    }

    let malformed = false;
    for (const [field, values] of Object.entries(rule.remove)) {
      if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== 'string')) {
        problems.push({ name, problem: `malformed: remove.${field} must be a non-empty array of strings` });
        malformed = true;
        continue;
      }
      if (!isArrayField(field) && !isObjectField(field)) {
        problems.push({ name, problem: `"${field}" is not an evidence field this layer may remove` });
        malformed = true;
      }
    }
    if (malformed) continue;

    const def = patterns[name];
    if (!def || typeof def !== 'object') {
      problems.push({ name, problem: 'no such technology — the override is stale' });
      continue;
    }

    // A rule naming a pattern the technology no longer carries has silently stopped doing anything.
    // That is exactly the drift this layer exists to catch, so it fails rather than passing quietly.
    for (const [field, values] of Object.entries(rule.remove)) {
      const present = isArrayField(field)
        ? new Set(Array.isArray(def[field]) ? def[field] : [])
        : new Set(def[field] && typeof def[field] === 'object' ? Object.keys(def[field]) : []);
      for (const v of values) {
        if (!present.has(v)) {
          problems.push({ name, problem: `remove.${field} "${v}" is not present — the override is stale` });
        }
      }
    }

    // Removing a technology's last evidence makes it permanently undetectable. If that is genuinely
    // wanted, delete the technology; do not hollow it out and leave a corpse that looks alive.
    const after = applyPatternOverrides({ [name]: def }, { [name]: rule })[name];
    if (evidenceCount(after, name) === 0) {
      problems.push({ name, problem: 'would leave no evidence at all — retire the technology instead (`retire: true`)' });
    }
  }

  return problems;
}

module.exports = { applyPatternOverrides, validatePatternOverrides, evidenceCount, EVIDENCE_FIELDS, OBJECT_FIELDS };
