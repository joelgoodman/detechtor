// tests/engine-fields.test.js — UNI-237.
//
// The engine consumed 7 pattern fields and silently ignored 15 more. These tests pin the four
// repairs: scripts/scriptSrc union, `url`, `xhr`, and the excludes tie-break (Task 3).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

function engineWith(patterns) {
  const e = new DeTECHtor();
  e.patterns = patterns;
  e.domPlan = e.buildDomPlan();
  return e;
}

const EVIDENCE = (over = {}) => ({
  html: '', headers: {}, scripts: [], meta: {}, cookies: [],
  dom: { jsObjects: {} }, domNodes: {}, apiEndpoints: [], networkHosts: [],
  versionInfo: {}, jsProbed: false, finalUrl: 'https://example.edu/',
  ...over,
});

test('a pattern declaring BOTH scripts and scriptSrc matches on either', () => {
  // 85 patterns declare both, 54 with differing content, and `scripts || scriptSrc` discarded the
  // scriptSrc half entirely.
  const e = engineWith({
    Widget: { scripts: ['alpha\\.js'], scriptSrc: ['beta\\.js'], categories: ['Analytics'] },
  });
  const viaScripts = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/alpha.js' }] }));
  const viaScriptSrc = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/beta.js' }] }));
  assert.deepStrictEqual(viaScripts.map((m) => m.name), ['Widget']);
  assert.deepStrictEqual(viaScriptSrc.map((m) => m.name), ['Widget'], 'scriptSrc half was discarded');
});

test('a pattern declaring the SAME regex in scripts and scriptSrc counts it once', () => {
  // 31 of the 85 both-populated patterns declare identical content in each field. Task 3's
  // excludes tie-break resolves on confidence, so a doubled score can decide which of two
  // competing technologies survives.
  const e = engineWith({
    Adevole: { scripts: ['adevole'], scriptSrc: ['adevole'], categories: ['Analytics'] },
  });
  const [m] = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/adevole.js' }] }));
  assert.strictEqual(m.confidence, 60, 'one script match must score once, not twice');
  assert.deepStrictEqual(m.evidence, ['Script: adevole']);
});

test('a url pattern fires against the final page URL', () => {
  const e = engineWith({ Coldfusion: { url: ['\\.cfm(?:$|\\?)'], categories: ['Unclassified'] } });
  const hit = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/index.cfm' }));
  const miss = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/' }));
  assert.deepStrictEqual(hit.map((m) => m.name), ['Coldfusion']);
  assert.deepStrictEqual(miss.map((m) => m.name), []);
  assert.strictEqual(hit[0].confidence, 50, 'a url substring is weaker than a script src (60)');
});

test('an xhr pattern fires against network hosts', () => {
  const e = engineWith({ AMP: { xhr: ['cdn\\.ampproject\\.org'], categories: ['Unclassified'] } });
  const hit = e.matchPatterns(EVIDENCE({ networkHosts: ['cdn.ampproject.org'] }));
  const miss = e.matchPatterns(EVIDENCE({ networkHosts: ['cdn.example.edu'] }));
  assert.deepStrictEqual(hit.map((m) => m.name), ['AMP']);
  assert.deepStrictEqual(miss.map((m) => m.name), []);
});

test('a missing finalUrl or networkHosts never throws', () => {
  const e = engineWith({
    A: { url: ['x'], categories: ['Unclassified'] },
    B: { xhr: ['y'], categories: ['Unclassified'] },
  });
  const ev = EVIDENCE();
  delete ev.finalUrl;
  delete ev.networkHosts;
  assert.deepStrictEqual(e.matchPatterns(ev).map((m) => m.name), []);
});

test('excludes suppresses the excluded technology', () => {
  const e = engineWith({
    'Piwik PRO Core': { scripts: ['piwik\\.pro'], excludes: ['Matomo Analytics'], categories: ['Analytics'] },
    'Matomo Analytics': { html: ['matomo'], categories: ['Analytics'] },
  });
  const names = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/piwik.pro.js' }],
    html: '<div>matomo</div>',
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Piwik PRO Core']);
});

test('mutual excludes resolve to the higher-confidence match, not to neither', () => {
  // Underscore.js excludes Lodash AND Lodash excludes Underscore.js. Suppressing both loses a real
  // detection; picking by file order makes the answer depend on load sequence.
  const e = engineWith({
    'Underscore.js': { scripts: ['underscore'], excludes: ['Lodash'], categories: ['JavaScript Library'] },
    Lodash: { html: ['lodash'], excludes: ['Underscore.js'], categories: ['JavaScript Library'] },
  });
  const names = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/underscore.js' }],   // script = 60
    html: '<div>lodash</div>',                              // html   = 40
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Underscore.js'], 'higher-confidence match must survive');
});

test('mutual excludes at an exact tie keep both', () => {
  const e = engineWith({
    A: { html: ['aaa'], excludes: ['B'], categories: ['Unclassified'] },
    B: { html: ['bbb'], excludes: ['A'], categories: ['Unclassified'] },
  });
  const names = e.matchPatterns(EVIDENCE({ html: '<div>aaa bbb</div>' })).map((m) => m.name).sort();
  assert.deepStrictEqual(names, ['A', 'B'], 'an exact tie must keep both rather than pick arbitrarily');
});

test('excludes naming an absent technology is inert', () => {
  const e = engineWith({ Solo: { html: ['solo'], excludes: ['Nonexistent'], categories: ['Unclassified'] } });
  assert.deepStrictEqual(e.matchPatterns(EVIDENCE({ html: 'solo' })).map((m) => m.name), ['Solo']);
});

test('a three-way exclusion chain suppresses transitively without letting a suppressed tech suppress others', () => {
  // A excludes B, B excludes C. A (script=60) beats B (html=40) beats C (url=50... wait, ordered by
  // confidence descending regardless of declaration order). Concretely: A=60 excludes B=50, and
  // B=50 excludes C=40. A survives and suppresses B. B is suppressed, so it must NOT get to also
  // suppress C — C only loses if something that survives excludes it. Nothing does, so C survives
  // alongside A. This pins applyExcludes' `if (suppressed.has(match.name)) continue` guard: a
  // suppressed match's own exclude rules never run.
  const e = engineWith({
    A: { scripts: ['aaa'], excludes: ['B'], categories: ['Unclassified'] },       // script = 60
    B: { url: ['bbb'], excludes: ['C'], categories: ['Unclassified'] },           // url = 50
    C: { html: ['ccc'], categories: ['Unclassified'] },                          // html = 40
  });
  const names = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/aaa.js' }],
    finalUrl: 'https://example.edu/bbb',
    html: '<div>ccc</div>',
  })).map((m) => m.name).sort();
  assert.deepStrictEqual(names, ['A', 'C'], 'B is suppressed by A; a suppressed B must not also suppress C');
});

test('no pattern file declares `text` any more', () => {
  // `text` was declared on 60 patterns and read by nothing — an unread field, not a weak one.
  const e = new DeTECHtor();
  const withText = Object.entries(e.patterns)
    .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object' && d.text)
    .map(([n]) => n);
  assert.deepStrictEqual(withText, [], `still declaring text: ${withText.slice(0, 5).join(', ')}`);
});
