// src/js-probe.js — the JS-global probe list, generated from the patterns.
//
// UNI-225. 109 signal-category technologies (Chatbot 62, CMS 31, Site Search 9, LMS 7) set a JS
// global and leave nothing in static markup. benchmark-agent probes for them during the Puppeteer
// load it ALREADY performs for content capture -- property lookups, milliseconds, no extra page
// load -- and writes the names actually present to scan_pages.content.js_globals.
//
// The list is generated here and exported by the package rather than hardcoded downstream, so it
// cannot drift from the patterns the engine will evaluate. (src/detechtor.js:648-694 hardcodes ~40
// globals today; that is the drift this replaces.)
//
// Cross-repo contract (docs/DATA_CONTRACTS.md): benchmark-agent writes
// `scan_pages.content.js_globals` as string[] -- the names present at capture time. An ABSENT key
// means NOT PROBED (unknown); it does NOT mean "no globals present".
'use strict';

/**
 * Distinct JS global names across all patterns.
 * @param {object} patterns the loaded pattern map
 * @returns {string[]} sorted
 */
function probeNames(patterns) {
  const names = new Set();
  for (const [name, def] of Object.entries(patterns || {})) {
    if (name === '_metadata' || !def || typeof def !== 'object') continue;
    if (!def.js || typeof def.js !== 'object') continue;
    for (const key of Object.keys(def.js)) names.add(key);
  }
  return [...names].sort();
}

/**
 * Resolve a dotted probe path against a root object WITHOUT eval.
 *
 * 21 of the 5,082 pattern globals contain characters illegal in a dotted identifier
 * (`pmg-mail-tracker`, `litElementVersions.0`), so traversal must be bracket-based. Presence, not
 * truthiness, is the test -- matching `typeof window.X !== 'undefined'` at detechtor.js:1111.
 */
function isPresent(root, path) {
  var cur = root;
  var segments = String(path).split('.');
  for (var i = 0; i < segments.length; i++) {
    if (cur === null || cur === undefined) return false;
    try {
      cur = cur[segments[i]];
    } catch (e) {
      return false; // getters can throw on cross-origin or trapped objects
    }
  }
  return cur !== undefined;
}

/**
 * @param {object} root the global object (window, in a browser)
 * @param {string[]} names
 * @returns {string[]} the subset present on root
 */
function probeGlobals(root, names) {
  return (names || []).filter((n) => isPresent(root, n));
}

// Source text of a self-contained browser-side probe, DERIVED from isPresent so the two cannot
// drift. benchmark-agent injects this into the page it is already loading:
//   globals = page.evaluate("(#{probe_source}).call(window, #{names.to_json})")
// `this` is the root, so the function needs no reference to `window` and works under any harness.
const PROBE_SOURCE =
  '(function (names) {\n' +
  '  ' + isPresent.toString().split('\n').join('\n  ') + '\n' +
  '  var root = this;\n' +
  '  var out = [];\n' +
  '  for (var i = 0; i < names.length; i++) {\n' +
  '    if (isPresent(root, names[i])) out.push(names[i]);\n' +
  '  }\n' +
  '  return out;\n' +
  '})';

module.exports = { probeNames, isPresent, probeGlobals, PROBE_SOURCE };
