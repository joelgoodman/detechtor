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
// ⚠️ `confidence:NN` is stripped and DISCARDED: honouring it would change scoring across 1,160
// techs and needs its own measurement. `version:` templates are stripped from the regex but KEPT in
// `def._versions` (keyed by the stripped regex), so the engine takes a version from the capture
// groups of a rule that fired for that technology and from nothing else.
'use strict';

// Upstream separates fields with a literal backslash-semicolon. Measured across the whole shipped
// set (2026-08-09) the ONLY segment kinds that appear are `version` (1,289) and `confidence` (208),
// so dropping exactly those two is provably safe here. Anything else is KEPT: silently truncating
// an unrecognised modifier would change a pattern's meaning without telling anyone.
const SEPARATOR = '\\;';
const MODIFIER_SEGMENT = /^(confidence|version):/i;

const { mapCategory } = require('./category-mapping');

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

// Fields whose regex hits the engine keeps (src/detechtor.js evaluatePattern), so a version template
// on them can be resolved against the rule that fired.
const VERSIONED_FIELDS = ['html', 'scripts', 'scriptSrc', 'meta', 'headers'];

/**
 * The `\;version:` template of a pattern value, or null when it has none.
 * @param {string} value
 * @returns {string|null}
 */
function versionTemplate(value) {
  if (typeof value !== 'string' || !value.includes(SEPARATOR)) return null;
  const segment = value.split(SEPARATOR).slice(1).find((s) => /^version:/i.test(s));
  return segment === undefined ? null : segment.slice('version:'.length);
}

/**
 * Resolve an upstream version template against a regex hit: `\1` is group 1, and `\1?a:b` is `a`
 * when group 1 matched and `b` when it did not. Empty or whitespace-only output is no version.
 * @param {string} template
 * @param {Array<string|undefined>} hit  a RegExp exec result
 * @returns {string|null}
 */
function resolveVersion(template, hit) {
  if (typeof template !== 'string' || !hit) return null;
  let out = template;
  const ternary = /^\\(\d)\?([^:]*):(.*)$/.exec(out);
  if (ternary) out = hit[Number(ternary[1])] ? ternary[2] : ternary[3];
  out = out.replace(/\\(\d)/g, (_, n) => hit[Number(n)] || '');
  out = out.trim();
  return out ? out : null;
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

  // A rule's `\;version:` template is kept, keyed by the stripped regex it belongs to, so the engine
  // can take a version from the capture groups of a rule that fired (2026-11-16 review, finding 3).
  // Only regex-tested fields that record a hit carry one: html, scripts/scriptSrc, meta, headers.
  const versions = def._versions && typeof def._versions === 'object' ? { ...def._versions } : {};
  const collect = (value) => {
    if (typeof value === 'string') {
      const template = versionTemplate(value);
      if (template !== null) versions[stripModifiers(value)] = template;
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const field of VERSIONED_FIELDS) if (def[field] !== undefined) collect(def[field]);
  if (Object.keys(versions).length) def._versions = versions;

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

  // UNI-233: 73 technologies list the same category twice (Framework7 carries 'JavaScript
  // Framework' twice in its own array). Harmless to matching, but it double-counts in any
  // per-category tally and makes two identical definitions compare unequal. Dedupe by MAPPED
  // value, since 1 and 'CMS' are the same category expressed two ways — while preserving the
  // original id form so nothing downstream that reads raw ids breaks.
  for (const field of ['cats', 'categories']) {
    if (!Array.isArray(def[field])) continue;
    const seen = new Set();
    def[field] = def[field].filter((c) => {
      const key = mapCategory(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

module.exports = { stripModifiers, normalizeDefinition, hasModifier, versionTemplate, resolveVersion, SEPARATOR };
