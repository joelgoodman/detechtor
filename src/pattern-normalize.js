// src/pattern-normalize.js — strip upstream Wappalyzer modifier suffixes.
//
// UNI-226. Wappalyzer patterns carry modifiers after an escaped-semicolon separator:
//
//   "adocean\\.pl\\;confidence:80"
//   "jquery-([\\d.]+)\\.js\\;version:\\1"
//
// Our importer never stripped them, so for every field the engine REGEX-TESTS the suffix became a
// literal requirement no real page can satisfy:
//
//   new RegExp('adocean\\.pl\\;confidence:80', 'i').test('cdn.adocean.pl/lib.js')  // false
//
// 939 values dead across scriptSrc/meta/headers/html/cookies/scripts, plus 79 dom selectors that
// fail to parse. Same class as the UNI-224 dom defect -- unparsed upstream syntax causing SILENT
// death -- on a much larger surface. lint-patterns.js could never have found it: it hunts patterns
// that are too BROAD, and these are pathologically NARROW.
//
// ⚠️ We strip and DISCARD. Honouring upstream's `confidence:NN` would change scoring across 1,160
// techs and needs its own measurement; `version:\1` capture extraction is already reimplemented in
// extractVersionInfo. Both are deliberate non-goals here -- the bug is the dead regex.
'use strict';

// Upstream separates fields with a literal backslash-semicolon. Measured across the whole shipped
// set (2026-08-09) the ONLY segment kinds that appear are `version` (1,289) and `confidence` (208),
// so dropping exactly those two is provably safe here. Anything else is KEPT: silently truncating
// an unrecognised modifier would change a pattern's meaning without telling anyone.
const SEPARATOR = '\\;';
const MODIFIER_SEGMENT = /^(confidence|version):/i;

/** Does this string carry a modifier we would strip? */
function hasModifier(value) {
  if (typeof value !== 'string' || !value.includes(SEPARATOR)) return false;
  return value.split(SEPARATOR).slice(1).some((s) => MODIFIER_SEGMENT.test(s));
}

/**
 * Remove `\;confidence:NN` / `\;version:...` segments, preserving anything else.
 * @param {string} value
 * @returns {string}
 */
function stripModifiers(value) {
  if (typeof value !== 'string' || !value.includes(SEPARATOR)) return value;
  const [head, ...rest] = value.split(SEPARATOR);
  const kept = rest.filter((segment) => !MODIFIER_SEGMENT.test(segment));
  return kept.length ? [head, ...kept].join(SEPARATOR) : head;
}

/**
 * Deep-strip a technology definition, in place.
 *
 * Values are stripped everywhere. KEYS are stripped only for `dom`, whose keys (and array
 * entries) are CSS selectors that must parse. `meta`/`headers`/`cookies` keys are header/tag
 * names and `js` keys are global property paths -- none are regex-tested, and none carry a
 * modifier in the shipped set anyway.
 */
function normalizeDefinition(def) {
  if (!def || typeof def !== 'object') return def;

  const walk = (value) => {
    if (typeof value === 'string') return stripModifiers(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v);
      return out;
    }
    return value;
  };

  for (const field of ['html', 'scriptSrc', 'scripts', 'meta', 'headers', 'cookies', 'js',
                       'url', 'text', 'network', 'xhr', 'dns', 'certIssuer', 'robots']) {
    if (def[field] !== undefined) def[field] = walk(def[field]);
  }

  // `dom` is the one place a KEY needs stripping: array entries and object keys are selectors.
  if (def.dom !== undefined) {
    if (Array.isArray(def.dom)) {
      def.dom = def.dom.map((s) => (typeof s === 'string' ? stripModifiers(s) : walk(s)));
    } else if (def.dom && typeof def.dom === 'object') {
      const out = {};
      for (const [selector, v] of Object.entries(def.dom)) out[stripModifiers(selector)] = walk(v);
      def.dom = out;
    } else {
      def.dom = walk(def.dom);
    }
  }

  return def;
}

module.exports = { stripModifiers, normalizeDefinition, hasModifier, SEPARATOR };
