// src/pattern-rewrites.js -- evidence-pattern REPLACEMENTS, applied at load.
//
// Sibling of src/pattern-overrides.js (which only REMOVES patterns) and for the same reason: 6,202 of
// the 6,504 technologies live in `patterns/generated/webappanalyzer-merged.json`, which the importer
// regenerates wholesale. A bounded replacement written into that file is silently reverted by the
// next import; one written here names the exact ORIGINAL text, so
//   - a re-import that brings the original back is fixed again at load, and
//   - a re-import that changes the original makes the rule STALE, which
//     scripts/lint-pattern-cost.js turns into a failure rather than a silent no-op.
//
// Written by scripts/rewrite-unbounded-wildcards.js, never by hand. Each entry carries the evidence
// basis it was applied on ("corpus:IDENTICAL", "decision:...", "unobservable-channel").
//
// ⚠️ This layer REPLACES the text of an evidence regex and nothing else: not categories (that is
// category-overrides.js), not which patterns exist (pattern-overrides.js). It never adds or removes
// an evidence entry, so it cannot change which technologies are detectable, only how a pattern is spelled.
'use strict';

const ARRAY_FIELDS = ['html', 'scripts', 'scriptSrc', 'url', 'xhr', 'network'];
const OBJECT_FIELDS = ['headers', 'meta', 'cookies'];
const FIELDS = [...ARRAY_FIELDS, ...OBJECT_FIELDS, 'dom'];
const DOM_KINDS = ['text', 'attributes', 'properties'];

function rewriteDom(dom, entries) {
  if (!dom || typeof dom !== 'object' || Array.isArray(dom)) return { dom, changed: [] };
  const out = { ...dom };
  const changed = [];
  for (const e of entries) {
    const value = out[e.selector];
    if (e.kind === 'text') {
      if (value === e.from) { out[e.selector] = e.to; changed.push(e); }
      else if (value && typeof value === 'object' && value.text === e.from) { out[e.selector] = { ...value, text: e.to }; changed.push(e); }
    } else if (value && typeof value === 'object' && value[e.kind] && typeof value[e.kind] === 'object' && value[e.kind][e.name] === e.from) {
      out[e.selector] = { ...value, [e.kind]: { ...value[e.kind], [e.name]: e.to } };
      changed.push(e);
    }
  }
  return { dom: out, changed };
}

/**
 * @param {object} patterns name -> definition
 * @param {object} [rewrites] name -> { field: [{from, to, key?, selector?, kind?, name?, basis?}] }
 * @returns {object} a new pattern map; the input and its definitions are not mutated.
 */
function applyPatternRewrites(patterns, rewrites = {}) {
  const out = { ...patterns };
  for (const [name, rule] of Object.entries(rewrites)) {
    if (name === '_comment') continue;
    const def = out[name];
    if (!def || typeof def !== 'object' || !rule || typeof rule !== 'object') continue;
    const next = { ...def };
    const applied = [];

    for (const [field, entries] of Object.entries(rule)) {
      if (!Array.isArray(entries)) continue;
      if (ARRAY_FIELDS.includes(field) && Array.isArray(def[field])) {
        const map = new Map(entries.map((e) => [e.from, e]));
        const seen = new Set();
        const rewritten = [];
        for (const p of def[field]) {
          const e = map.get(p);
          if (e) applied.push({ field, from: e.from, to: e.to, basis: e.basis ?? null });
          const v = e ? e.to : p;
          if (!seen.has(v)) { seen.add(v); rewritten.push(v); }
        }
        next[field] = rewritten;
      } else if (OBJECT_FIELDS.includes(field) && def[field] && typeof def[field] === 'object') {
        const copy = { ...def[field] };
        for (const e of entries) {
          if (copy[e.key] === e.from) { copy[e.key] = e.to; applied.push({ field, key: e.key, from: e.from, to: e.to, basis: e.basis ?? null }); }
        }
        next[field] = copy;
      } else if (field === 'dom') {
        const r = rewriteDom(def.dom, entries);
        next.dom = r.dom;
        for (const e of r.changed) applied.push({ field, selector: e.selector, kind: e.kind, name: e.name ?? null, from: e.from, to: e.to, basis: e.basis ?? null });
      }
    }

    if (applied.length === 0) continue;
    next._patternRewrite = applied;
    out[name] = next;
  }
  return out;
}

function isPresent(def, field, e) {
  if (ARRAY_FIELDS.includes(field)) return Array.isArray(def[field]) && def[field].includes(e.from);
  if (OBJECT_FIELDS.includes(field)) return !!def[field] && typeof def[field] === 'object' && def[field][e.key] === e.from;
  return rewriteDom(def.dom, [e]).changed.length > 0;
}

/**
 * Structural problems with the rewrite file. Gated by scripts/lint-pattern-cost.js so that a reimport
 * which changes an original, or a stale rule, fails the build instead of rotting.
 *
 * @param {object} patterns the pristine map, with pattern-overrides REMOVALS already applied
 * @returns {Array<{name: string, problem: string}>}
 */
function validatePatternRewrites(patterns, rewrites = {}) {
  const problems = [];
  for (const [name, rule] of Object.entries(rewrites)) {
    if (name === '_comment') continue;
    const def = patterns[name];
    if (!def || typeof def !== 'object') { problems.push({ name, problem: 'no such technology — the rewrite is stale' }); continue; }
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) { problems.push({ name, problem: 'malformed: a rule is an object of field -> entries[]' }); continue; }

    for (const [field, entries] of Object.entries(rule)) {
      if (!FIELDS.includes(field)) { problems.push({ name, problem: `"${field}" is not a pattern field this layer may rewrite` }); continue; }
      if (!Array.isArray(entries) || entries.length === 0) { problems.push({ name, problem: `malformed: ${field} must be a non-empty array of {from, to}` }); continue; }
      for (const e of entries) {
        if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') { problems.push({ name, problem: `malformed: ${field} entry needs string "from" and "to"` }); continue; }
        if (OBJECT_FIELDS.includes(field) && typeof e.key !== 'string') { problems.push({ name, problem: `malformed: ${field} entry needs the header/meta/cookie "key"` }); continue; }
        if (field === 'dom' && (typeof e.selector !== 'string' || !DOM_KINDS.includes(e.kind) || (e.kind !== 'text' && typeof e.name !== 'string'))) {
          problems.push({ name, problem: 'malformed: dom entry needs selector, kind (text|attributes|properties) and, unless text, name' });
          continue;
        }
        if (e.from === e.to) { problems.push({ name, problem: `${field} "${e.from}" is rewritten to an identical string — a no-op` }); continue; }
        try { new RegExp(e.to, 'i'); } catch (err) { problems.push({ name, problem: `${field} replacement "${e.to}" does not compile: ${err.message}` }); continue; }
        if (!isPresent(def, field, e)) problems.push({ name, problem: `${field} "${e.from}" is not present — the rewrite is stale` });
      }
    }
  }
  return problems;
}

module.exports = { applyPatternRewrites, validatePatternRewrites, ARRAY_FIELDS, OBJECT_FIELDS, FIELDS };
