// src/technology-identity.js — one technology, one entry.
//
// UNI-233. The same product shipped under several names, and every one of them fired:
//
//   Slate (higher-ed-infra, Chatbot+SIS)  ==  Slate (Technolutions) (higher-ed-crm, CRM)
//     → identical detection sets across 111 institutions (Jaccard 1.00), counted twice,
//       categorised contradictorily. UNI-156 added the correct CRM entry and never retired the old.
//
//   Omni CMS / OmniCMS  ==  Modern Campus CMS       (vendor renamed the product)
//   AccessiBe / accessiBe, MailChimp / Mailchimp, ActiveCampaign / Active Campaign
//     → curated files intended to OVERRIDE the base, but loadPatterns keys on the exact string,
//       so a casing difference meant both survived: curated correct, base wrong, both firing.
//
// Two mechanisms, because the two problems are different:
//
//   1. Names differing only by case/spacing/punctuation are resolved AUTOMATICALLY. That is a
//      spelling accident and needs no human.
//   2. Genuine renames and vendor changes need knowledge, so they live in an explicit, reviewable
//      alias file rather than being guessed from string distance.
//
// ⚠️ Merging is not deleting. The losing entry routinely holds evidence the winner lacks — base
// `Omni CMS` carries the dom rule that UNI-224 recovered Omni CMS with, which the curated entry
// does not have. Dropping it would silently undo that ticket. So we UNION the evidence and keep
// only the canonical's identity (name + categories).
'use strict';

// Evidence fields worth carrying across a merge. Identity fields (cats/description/website) are
// deliberately absent: the canonical's identity is the whole point of picking one.
const ARRAY_FIELDS = ['html', 'scripts', 'scriptSrc', 'url', 'text', 'network', 'implies', 'requires'];
const OBJECT_FIELDS = ['js', 'meta', 'headers', 'cookies'];
// `dom` is neither: it ships as an array of selectors OR an object keyed by selector (see
// src/dom-rules.js for the three on-disk shapes). Treating it as a plain array wrapped an
// object-form dom inside an array and produced a shape normalizeDomRules rejects outright —
// caught by the UNI-224 Phase C validator, which is exactly what that guard is for.

/** Normalised identity: case, spacing and punctuation are spelling, not meaning. */
function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Merge `other` INTO `canonical`, keeping the canonical's identity and unioning its evidence.
 * @returns {object} a new definition; neither input is mutated.
 */
function mergeDefinitions(canonical, other) {
  const out = { ...canonical };

  for (const field of ARRAY_FIELDS) {
    const a = canonical[field];
    const b = other[field];
    if (a === undefined && b === undefined) continue;
    const merged = [
      ...(Array.isArray(a) ? a : a === undefined ? [] : [a]),
      ...(Array.isArray(b) ? b : b === undefined ? [] : [b]),
    ];
    // `dom` is the one array whose entries may be objects; JSON-key the dedupe so both work.
    const seen = new Set();
    out[field] = merged.filter((v) => {
      const k = typeof v === 'string' ? v : JSON.stringify(v);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  for (const field of OBJECT_FIELDS) {
    const a = canonical[field];
    const b = other[field];
    if (!a && !b) continue;
    // Canonical last: on a key conflict the canonical's value wins.
    out[field] = { ...(b || {}), ...(a || {}) };
  }

  out.dom = mergeDom(canonical.dom, other.dom);
  if (out.dom === undefined) delete out.dom;

  return out;
}

/**
 * Merge two `dom` fields, each of which may be an array of selectors or a selector-keyed object.
 * Mixed shapes are normalised to the object form, which can express everything the array form can
 * (a bare selector becomes `{exists: true}`).
 */
function mergeDom(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;

  const bothArrays = Array.isArray(a) && Array.isArray(b);
  if (bothArrays) return [...new Set([...a, ...b])];

  const toObject = (dom) => {
    if (Array.isArray(dom)) return Object.fromEntries(dom.map((s) => [s, { exists: true }]));
    return { ...dom };
  };
  // Canonical last so its condition wins on a shared selector.
  return { ...toObject(b), ...toObject(a) };
}

/**
 * Collapse aliases and spelling collisions so each technology appears exactly once.
 *
 * @param {object} patterns  name -> definition
 * @param {object} [aliases] alias name -> canonical name (explicit renames)
 * @returns {object} a new pattern map
 */
function resolveIdentities(patterns, aliases = {}) {
  const out = { ...patterns };

  // --- 1. explicit aliases (renames, vendor changes) -----------------------------------------
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (!(alias in out)) continue;
    if (!(canonical in out)) continue; // never delete a technology whose canonical is missing
    if (alias === canonical) continue;
    out[canonical] = mergeDefinitions(out[canonical], out[alias]);
    delete out[alias];
  }

  // --- 2. spelling collisions ----------------------------------------------------------------
  const groups = new Map();
  for (const name of Object.keys(out)) {
    if (name === '_metadata') continue;
    const key = normalizeName(name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }

  for (const names of groups.values()) {
    if (names.length < 2) continue;
    // A curated entry is the deliberate one — it wins. Otherwise fall back to the first name in
    // a stable sort, so the outcome does not depend on object key order.
    const sorted = [...names].sort();
    const winner = sorted.find((n) => out[n] && out[n]._curated) || sorted[0];
    for (const loser of names) {
      if (loser === winner) continue;
      out[winner] = mergeDefinitions(out[winner], out[loser]);
      delete out[loser];
    }
  }

  return out;
}

module.exports = { resolveIdentities, mergeDefinitions, normalizeName, ARRAY_FIELDS, OBJECT_FIELDS };
