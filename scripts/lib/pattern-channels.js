// scripts/lib/pattern-channels.js -- the regexes the engine ACTUALLY COMPILES, enumerated.
//
// The guard must apply to what the engine loads at runtime (generated artifact + curated files +
// identity merge + override layers), not to the source files: the generated upstream file is
// re-imported and brings wildcards back, and a source-file lint would never see a curated override
// that fixed -- or failed to fix -- the same technology. So this module asks the ENGINE's own loader
// and then lists every string the engine hands to `new RegExp`.
//
// ⚠️ THE CHANNEL LIST IS A CONTRACT WITH src/detechtor.js. If the engine starts compiling a new
// field, a pattern in that field is invisible to the gate. tests/pattern-channels.test.js therefore
// scans src/ for every `new RegExp(` call and fails if one is not accounted for here, and the gate
// itself fails on any definition field it has not classified.
'use strict';
const path = require('path');
const DeTECHtor = require('../../src/detechtor.js');

/**
 * Evidence channels, with the `new RegExp(` call site each one corresponds to.
 *   shape 'array'  -> field is string[]        shape 'object' -> field is { key: regex }
 *   input          -> what the regex is run against (drives the rewriter's evidence and span class)
 */
const CHANNELS = [
  { channel: 'html', field: 'html', shape: 'array', input: 'page html', site: 'htmlPattern' },
  { channel: 'scripts', field: 'scripts', shape: 'array', input: 'script src', site: 'scriptPattern' },
  { channel: 'scriptSrc', field: 'scriptSrc', shape: 'array', input: 'script src', site: 'scriptPattern' },
  { channel: 'network', field: 'network', shape: 'array', input: 'network host', site: 'networkPattern' },
  { channel: 'url', field: 'url', shape: 'array', input: 'final URL', site: 'urlPattern' },
  { channel: 'xhr', field: 'xhr', shape: 'array', input: 'network host', site: 'xhrPattern' },
  { channel: 'headers', field: 'headers', shape: 'object', input: 'response header value', site: 'headerPattern' },
  { channel: 'meta', field: 'meta', shape: 'object', input: 'meta content', site: 'metaPattern' },
  { channel: 'cookies', field: 'cookies', shape: 'object', input: 'cookie value', site: 'cookiePattern' },
  // `dom` regexes are compiled by the engine from the pre-normalised `_domRules` (src/dom-rules.js).
  { channel: 'dom', field: '_domRules', shape: 'dom', input: 'element text / attribute', site: 'rule.regex' },
  // `pattern.version` is passed through `extractVersion({name}, ...)`, so it is dead today. Scanned
  // anyway: costing nothing now, it would become live the day someone passes the real definition.
  { channel: 'version', field: 'version', shape: 'string', input: 'page html', site: 'pattern.version' },
];

/** Definition fields that are known NOT to be compiled as regexes. Anything else fails the gate. */
const NON_REGEX_FIELDS = new Set([
  'description', 'icon', 'website', 'implies', 'requires', 'requiresCategory', 'excludes', 'categories', 'cats',
  'oss', 'saas', 'pricing', 'cpe', 'higher_ed', 'confidence', 'signal_polarity', 'js', 'dom',
  // upstream fields the engine never reads (dns/css/robots/probe/certIssuer/text are not evaluated):
  'dns', 'css', 'robots', 'probe', 'certIssuer', 'text',
  // engine/loader provenance and annotations:
  '_curated', '_sourceFile', '_generated', '_categoryOverride', '_validation', '_legacy_names',
  '_detection_note', '_patternOverride', '_patternRewrite', '_domRules',
]);

/** Load the effective pattern set through the engine's own loader. */
function loadEffective(options = {}) {
  const engine = Object.create(DeTECHtor.prototype);
  engine.patterns = engine.loadPatterns(options);
  // `_domRules` is attached by the engine's own planner; reuse it rather than re-derive it.
  engine.buildDomPlan();
  return engine.patterns;
}

/** The same compiled view of a hand-made pattern map (fixtures): attaches the engine's `_domRules`. */
function fromPatternMap(patterns) {
  const engine = Object.create(DeTECHtor.prototype);
  engine.patterns = patterns;
  engine.buildDomPlan();
  return engine.patterns;
}

/** Fields present on definitions that neither feed a channel nor are known to be inert. */
function unclassifiedFields(patterns) {
  const known = new Set([...NON_REGEX_FIELDS, ...CHANNELS.map((c) => c.field)]);
  const out = new Map();
  for (const [name, def] of Object.entries(patterns)) {
    if (name === '_metadata' || !def || typeof def !== 'object') continue;
    for (const f of Object.keys(def)) if (!known.has(f)) out.set(f, (out.get(f) || []).concat(name));
  }
  return out;
}

/**
 * Every regex string the engine will compile, one record each.
 * @returns {Array<{tech:string, channel:string, field:string, key:string|null, pattern:string,
 *   curated:boolean, generated:boolean, sourceFile:string|null}>}
 */
function enumerateRegexes(patterns) {
  const out = [];
  for (const [tech, def] of Object.entries(patterns)) {
    if (tech === '_metadata' || !def || typeof def !== 'object') continue;
    const prov = { curated: !!def._curated, generated: !!def._generated, sourceFile: def._sourceFile || null };
    for (const ch of CHANNELS) {
      const v = def[ch.field];
      if (v === undefined || v === null) continue;
      if (ch.shape === 'array') {
        if (!Array.isArray(v)) continue;
        for (const p of v) out.push({ tech, channel: ch.channel, field: ch.field, key: null, pattern: String(p), ...prov });
      } else if (ch.shape === 'object') {
        if (typeof v !== 'object' || Array.isArray(v)) continue;
        for (const [key, p] of Object.entries(v)) {
          // The engine skips an empty cookie pattern and header/meta values it cannot find; an empty
          // string compiles to /(?:)/ and costs nothing, so it carries no signal either way.
          if (p === '' || p === undefined || p === null) continue;
          out.push({ tech, channel: ch.channel, field: ch.field, key, pattern: String(p), ...prov });
        }
      } else if (ch.shape === 'dom') {
        if (!Array.isArray(v)) continue;
        for (const r of v) {
          if (!r.regex) continue;
          out.push({
            tech, channel: 'dom', field: 'dom', key: `${r.selector} [${r.kind}${r.name ? '.' + r.name : ''}]`,
            dom: { selector: r.selector, kind: r.kind, name: r.name || null },
            pattern: String(r.regex), ...prov,
          });
        }
      } else if (ch.shape === 'string') {
        if (typeof v === 'string') out.push({ tech, channel: ch.channel, field: ch.field, key: null, pattern: v, ...prov });
      }
    }
  }
  return out;
}

/** Does the engine accept this source? (An invalid one is skipped at runtime: dead, not costly.) */
function compiles(source) {
  try { new RegExp(source, 'i'); return true; } catch { return false; }
}

const ROOT = path.resolve(__dirname, '../..');

module.exports = { CHANNELS, NON_REGEX_FIELDS, loadEffective, fromPatternMap, enumerateRegexes, unclassifiedFields, compiles, ROOT };
