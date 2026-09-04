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
  // Piwik PRO Core -> Matomo Analytics is one-directional in the real pattern set (Matomo Analytics
  // declares no excludes back). The declarer here happens to score higher (script=60 > html=40),
  // so this alone would pass under either a confidence tie-break or unconditional suppression — see
  // the dedicated lower-confidence test below for the case that actually distinguishes the two.
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

test('a one-directional exclude suppresses even when the declarer scores LOWER than its target', () => {
  // This is the real-world case applyExcludes originally got wrong: AngularJS -> Angular is
  // one-directional (Angular declares no excludes back), and in the actual corpus AngularJS fires
  // at confidence 16-ish-prevalence while Angular fires far more broadly. AngularJS is asserting
  // domain knowledge — its 1.x scripts contain the literal string "angular", which unavoidably also
  // matches Angular's pattern — not competing with Angular on confidence. A confidence tie-break
  // would leave the declarer's own lower score losing every time, shipping the feature inert for
  // exactly this case. It must suppress unconditionally whenever the declarer also fires.
  const e = engineWith({
    Weak: { html: ['weak'], excludes: ['Strong'], categories: ['Unclassified'] },      // html = 40
    Strong: { scripts: ['strong'], categories: ['Unclassified'] },                     // script = 60, no excludes back: one-directional
  });
  const names = e.matchPatterns(EVIDENCE({
    html: '<div>weak</div>',
    scripts: [{ src: 'https://cdn.test/strong.js' }],
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Weak'],
    'one-directional exclude must suppress the target even though the declarer scored lower');
});

test('a mutual pair does NOT get the one-directional unconditional treatment', () => {
  // Identical confidence shape to the test above (declarer scores lower than its named target), but
  // here BOTH sides declare excludes on each other, making the pair mutual. Mutual must fall back to
  // the confidence tie-break — the higher-confidence match survives — proving the two code paths
  // really are distinct and not just one rule with the other silently subsumed.
  const e = engineWith({
    Weak: { html: ['weak'], excludes: ['Strong'], categories: ['Unclassified'] },      // html = 40
    Strong: { scripts: ['strong'], excludes: ['Weak'], categories: ['Unclassified'] }, // script = 60, excludes back: MUTUAL
  });
  const names = e.matchPatterns(EVIDENCE({
    html: '<div>weak</div>',
    scripts: [{ src: 'https://cdn.test/strong.js' }],
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Strong'],
    'mutual pair resolves on confidence — the higher-confidence match survives, unlike the one-directional case');
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

test('mutual excludes tie-break uses the UNCAPPED raw score, not the display-capped confidence', () => {
  // UNI-237 bug: confidence is Math.min(raw, 100), and 63.2% of technologies (4,012/6,347) can
  // reach that cap — so two mutually-excluding technologies that both cap out read as an "exact
  // tie" under the reported value even when their real signal strength differs, and the "exact tie
  // keeps both" rule silently no-ops the exclusion. A's raw total is exactly 100 (html 40 + script
  // 60); B's is 150 (html 40 + script 60 + url 50) — both display-cap to confidence 100, but B's
  // raw is higher and must be the sole survivor.
  const e = engineWith({
    A: { html: ['aaa'], scripts: ['sss'], excludes: ['B'], categories: ['Unclassified'] },
    B: { html: ['bbb'], scripts: ['ttt'], url: ['/ttt-page'], excludes: ['A'], categories: ['Unclassified'] },
  });
  const matches = e.matchPatterns(EVIDENCE({
    html: '<div>aaa bbb</div>',
    scripts: [{ src: 'https://cdn.test/sss.js' }, { src: 'https://cdn.test/ttt.js' }],
    finalUrl: 'https://example.edu/ttt-page',
  }));
  assert.deepStrictEqual(matches.map((m) => m.name), ['B'],
    'both cap at confidence 100, but B has the higher raw total (150 vs 100) and must be the survivor');
  assert.strictEqual(matches[0].confidence, 100);
  assert.strictEqual(matches[0]._rawConfidence, undefined,
    '_rawConfidence is an internal resolution aid and must not leak into the public match shape');
});

test('excludes naming an absent technology is inert', () => {
  const e = engineWith({ Solo: { html: ['solo'], excludes: ['Nonexistent'], categories: ['Unclassified'] } });
  assert.deepStrictEqual(e.matchPatterns(EVIDENCE({ html: 'solo' })).map((m) => m.name), ['Solo']);
});

test('a three-way exclusion chain suppresses transitively without letting a suppressed tech suppress others', () => {
  // A excludes B, B excludes C — all three one-directional (none declares excludes back), so each
  // suppression is unconditional once its declarer fires; confidence only decides sort order here,
  // not who wins. A fires and suppresses B unconditionally. B is now suppressed, so it must NOT get
  // to also apply its own rule against C — C only loses if something that itself survived excludes
  // it, and nothing does. This pins applyExcludes' `if (suppressed.has(match.name)) continue`
  // guard: a suppressed match's own exclude rules never run.
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

test('config declares no confidence floor', () => {
  // minConfidence was 30 while the weakest single match scores 40, so it rejected nothing. Keeping
  // an inert knob is worse than having none: it reads as a precision control that is not one.
  const config = require(path.resolve(__dirname, '../src/config.js'));
  assert.strictEqual('minConfidence' in config, false,
    'minConfidence is inert — filtering happens at authoring time via the breadth gate');
});

test('nothing in the repo root, src/, or scripts/ still references minConfidence (read or write)', () => {
  // Covers both directions: a READ (`config.minConfidence`) and a WRITE (`config.minConfidence =
  // argv.confidence`, the cli.js:62 form that made --confidence a live no-op). Comments are
  // stripped first — the explanatory prose left in config.js names the setting on purpose, and a
  // bare-token search would otherwise fail on that comment — so what remains is a bare
  // `minConfidence` token in actual code, which must not exist anywhere.
  const fs = require('fs');
  const dirs = ['..', '../src', '../scripts'].map((d) => path.resolve(__dirname, d));
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const offenders = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile()) continue;
      const code = stripComments(fs.readFileSync(full, 'utf8'));
      if (/\bminConfidence\b/.test(code)) offenders.push(path.relative(path.resolve(__dirname, '..'), full));
    }
  }
  assert.deepStrictEqual(offenders, [], `still references minConfidence outside a comment: ${offenders.join(', ')}`);
});
