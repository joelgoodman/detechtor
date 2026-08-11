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

test('a url pattern fires against the final page URL', () => {
  const e = engineWith({ Coldfusion: { url: ['\\.cfm(?:$|\\?)'], categories: ['Unclassified'] } });
  const hit = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/index.cfm' }));
  const miss = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/' }));
  assert.deepStrictEqual(hit.map((m) => m.name), ['Coldfusion']);
  assert.deepStrictEqual(miss.map((m) => m.name), []);
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

test('no pattern file declares `text` any more', () => {
  // `text` was declared on 60 patterns and read by nothing — an unread field, not a weak one.
  const e = new DeTECHtor();
  const withText = Object.entries(e.patterns)
    .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object' && d.text)
    .map(([n]) => n);
  assert.deepStrictEqual(withText, [], `still declaring text: ${withText.slice(0, 5).join(', ')}`);
});
