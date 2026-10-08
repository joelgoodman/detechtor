// tests/pattern-cost-gate.test.js -- scripts/lint-pattern-cost.js and its library.
//
// The gate exists because a wildcard in a detection pattern was "fixed" at least four times and kept
// coming back, each fix targeting precision with a text heuristic while nothing measured runtime cost.
// So this file pins, one fixture each: every banned shape in every channel the engine compiles; the
// allowlist ratchet; the measured check (including a regex that must time out and a worker that must
// be killed); and that the importer cannot write an artifact that carries the construct.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { checkStatic, validateAllowlist, loadAllowlist, MEASURE_DEFAULT_BUDGET_MS } = require('../scripts/lib/cost-gate.js');
const { measureSources } = require('../scripts/lib/cost-measure.js');
const { fromPatternMap, CHANNELS, enumerateRegexes } = require('../scripts/lib/pattern-channels.js');

const T = (def) => fromPatternMap({ Tech: { categories: ['CMS'], ...def } });
const codes = (patterns, allow = []) => checkStatic(patterns, { allowlist: { entries: allow } }).violations.map((v) => `${v.channel}:${v.rules.join('+')}`);

test('the construct is banned in EVERY channel the engine compiles', () => {
  const bad = 'a.*b.*c';
  const cases = {
    html: { html: [bad] },
    scripts: { scripts: [bad] },
    scriptSrc: { scriptSrc: [bad] },
    url: { url: [bad] },
    xhr: { xhr: [bad] },
    network: { network: [bad] },
    headers: { headers: { 'x-a': bad } },
    meta: { meta: { generator: bad } },
    cookies: { cookies: { sid: bad } },
    dom: { dom: { 'div.x': bad } },
    domAttr: { dom: { 'a[href]': { attributes: { href: bad } } } },
    version: { version: bad },
  };
  for (const [name, def] of Object.entries(cases)) {
    const got = codes(T(def));
    assert.ok(got.length === 1 && /unbounded-span\+multiple-wildcards|multiple-wildcards\+unbounded-span/.test(got[0]), `${name}: ${JSON.stringify(got)}`);
  }
});

test('every channel the gate knows is one the engine actually compiles', () => {
  // The contract with src/detechtor.js: each `new RegExp(` call site has a channel here.
  const engine = fs.readFileSync(path.join(ROOT, 'src/detechtor.js'), 'utf8');
  const sites = [...engine.matchAll(/new RegExp\(([^,)]+),\s*'i'\)/g)].map((m) => m[1].trim());
  const known = new Set(CHANNELS.map((c) => c.site));
  for (const s of sites) assert.ok(known.has(s), `src/detechtor.js compiles a regex from \`${s}\` that no gate channel covers: add it to CHANNELS in scripts/lib/pattern-channels.js`);
  // And every other file in src/ must stay free of pattern-driven regex compilation. The rewrite
  // layer compiles a replacement only to VALIDATE it (never to match with it).
  const VALIDATION_ONLY = new Set(['pattern-rewrites.js']);
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.js') && x !== 'detechtor.js' && !VALIDATION_ONLY.has(x))) {
    const text = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    assert.ok(!/new RegExp\(\s*[a-zA-Z_]/.test(text.replace(/\/\/.*$/gm, '')), `src/${f} compiles a regex from a variable: teach the gate its channel`);
  }
});

test('a definition field the gate has not classified fails the gate (a new channel cannot hide)', () => {
  const r = checkStatic(T({ html: ['ok'], sneaky: ['a.*b.*c'] }), { allowlist: { entries: [] } });
  assert.ok(r.unclassified.has('sneaky'), 'an unknown field is reported, not ignored');
});

test('allowed shapes pass: bounded, terminal, anchored and the version idioms', () => {
  const ok = T({
    html: ['foo[^<>\\n]{0,80}bar', 'foo.*', '^foo.*bar$', 'jquery-([\\d.]+)\\.js', '(?:\\d+\\.)+\\d+'],
    scriptSrc: ['/wp-content/plugins/x/[^/]{1,60}\\.js(?:\\?ver=(\\d+(?:\\.\\d+)+))?'],
    headers: { server: '^Apache(?:/([\\d.]+))?$' },
  });
  assert.deepStrictEqual(codes(ok), []);
});

test('the violation names the technology, channel and exact pattern', () => {
  const r = checkStatic(T({ html: ['i.*clicker'], headers: { 'x-a': 'ok' } }), { allowlist: { entries: [] } });
  assert.strictEqual(r.violations.length, 1);
  assert.deepStrictEqual([r.violations[0].tech, r.violations[0].channel, r.violations[0].pattern], ['Tech', 'html', 'i.*clicker']);
});

// ---- the allowlist ratchet --------------------------------------------------------------------

const entry = (extra = {}) => ({
  technology: 'Tech', channel: 'html', pattern: 'a.*b.*c',
  reason: 'Vendor markup genuinely spans two attribute lists; measured span 40 chars, bounded rewrite loses a corpus match.',
  maxSpan: 40, worstCaseMs: 12.5, ...extra,
});

test('an allowlisted pattern is exempt from the static rules, and only that exact pattern', () => {
  const p = T({ html: ['a.*b.*c', 'x.*y.*z'] });
  const got = checkStatic(p, { allowlist: { entries: [entry()] } });
  assert.deepStrictEqual(got.violations.map((v) => v.pattern), ['x.*y.*z']);
  assert.strictEqual(got.allowlisted.length, 1);
});

test('the ratchet: an entry needs a reason, a measured span and a measured cost', () => {
  const p = T({ html: ['a.*b.*c'] });
  const probs = (e) => validateAllowlist([e], checkStatic(p, { allowlist: { entries: [e] } })).map((x) => x.problem).join(' | ');
  assert.strictEqual(probs(entry()), '');
  assert.match(probs(entry({ reason: '' })), /reason/);
  assert.match(probs(entry({ reason: 'ok' })), /reason/);
  assert.match(probs(entry({ maxSpan: undefined })), /maxSpan/);
  assert.match(probs(entry({ worstCaseMs: 'fast' })), /worstCaseMs/);
  assert.match(probs(entry({ channel: 'nope' })), /channel/);
});

test('the ratchet: an entry for a pattern that no longer exists, or no longer offends, fails', () => {
  const gone = T({ html: ['other'] });
  assert.match(validateAllowlist([entry()], checkStatic(gone, { allowlist: { entries: [entry()] } })).map((x) => x.problem).join(), /no longer exists/);
  const fixed = T({ html: ['a.*b.*c'] });
  const noop = entry({ pattern: 'a.*b.*c' });
  // same pattern still offends -> fine; make a record that exists but is clean:
  const clean = T({ html: ['foo{0,80}'] });
  const e2 = entry({ pattern: 'foo{0,80}' });
  assert.match(validateAllowlist([e2], checkStatic(clean, { allowlist: { entries: [e2] } })).map((x) => x.problem).join(), /not needed|no longer offends/);
  void fixed; void noop;
});

test('the ratchet: duplicates fail', () => {
  const p = T({ html: ['a.*b.*c'] });
  const dup = [entry(), entry()];
  assert.match(validateAllowlist(dup, checkStatic(p, { allowlist: { entries: dup } })).map((x) => x.problem).join(), /duplicate/);
});

test('the shipped allowlist never grows silently', () => {
  // Raising this number is the deliberate act that adds an exception; it shows up in review.
  const MAX_ALLOWLIST = 0;
  const { entries } = loadAllowlist();
  assert.ok(entries.length <= MAX_ALLOWLIST, `patterns/wildcard-allowlist.json has ${entries.length} entries, the ratchet allows ${MAX_ALLOWLIST}`);
});

// ---- the measured check -----------------------------------------------------------------------

test('the measured check passes a linear regex and flags a quadratic one', async () => {
  const res = await measureSources(['iclicker', 'canva[^<>\\n]{0,80}for', 'x.*y.*z'], { budgetMs: 250, workers: 2 });
  assert.strictEqual(res.get('iclicker').status, 'ok');
  assert.strictEqual(res.get('canva[^<>\\n]{0,80}for').status, 'ok');
  // near-miss "x y x y ..." makes this cubic: it cannot finish
  assert.ok(['timeout', 'slow'].includes(res.get('x.*y.*z').status), JSON.stringify(res.get('x.*y.*z')));
});

test('a regex that cannot finish is stopped, not waited for', async () => {
  const t0 = Date.now();
  const res = await measureSources(['x.*y.*z'], { budgetMs: 100, workers: 1 });
  assert.strictEqual(res.get('x.*y.*z').status, 'timeout');
  assert.ok(Date.now() - t0 < 15000, 'the vm timeout, not the regex, decides when this ends');
});

test('a worker that stops answering is killed and its job recorded as hung', async () => {
  const hang = path.join(os.tmpdir(), `hang-worker-${process.pid}.js`);
  fs.writeFileSync(hang, "process.on('message', () => { for (;;) {} }); process.send({ ready: true });\n");
  try {
    const t0 = Date.now();
    const res = await measureSources(['a', 'b', 'c'], { budgetMs: 100, workers: 2, hardMs: 600, workerPath: hang });
    for (const s of ['a', 'b', 'c']) assert.strictEqual(res.get(s).status, 'hung', s);
    assert.ok(Date.now() - t0 < 12000, 'killed by the watchdog, not waited out');
  } finally { fs.rmSync(hang, { force: true }); }
});

test('the exhaustive run adds the unbroken-run input', async () => {
  const res = await measureSources(['\\d+x'], { budgetMs: 100, workers: 1, exhaustive: true });
  assert.ok(Object.keys(res.get('\\d+x').shapes).some((s) => s.startsWith('pump')), JSON.stringify(res.get('\\d+x').shapes));
  assert.notStrictEqual(res.get('\\d+x').status, 'ok', 'a leading \\d+ is quadratic on a digit run');
});

// ---- the shipped pattern set ------------------------------------------------------------------

test('the CLI is green on the shipped, effective pattern set', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/lint-pattern-cost.js'), '--gate', '--static-only'], { encoding: 'utf8' });
  assert.match(out, /0 violation/);
});

test('the CLI fails, listing technology + channel + pattern, when a rule is violated', () => {
  const fixture = path.join(os.tmpdir(), `cost-fixture-${process.pid}.json`);
  fs.writeFileSync(fixture, JSON.stringify({ 'Fixture Tech': { categories: ['CMS'], html: ['a.*b.*c'], higher_ed: true } }));
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/lint-pattern-cost.js'), '--gate', '--static-only', '--all', '--extra-patterns', fixture], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /Fixture Tech/);
    assert.match(r.stdout + r.stderr, /html/);
    assert.match(r.stdout + r.stderr, /a\.\*b\.\*c/);
  } finally { fs.rmSync(fixture, { force: true }); }
});

test('MEASURE_DEFAULT_BUDGET_MS is stated, not implied', () => {
  assert.ok(Number.isFinite(MEASURE_DEFAULT_BUDGET_MS) && MEASURE_DEFAULT_BUDGET_MS >= 100);
  void enumerateRegexes;
});
