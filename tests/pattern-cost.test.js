// tests/pattern-cost.test.js — the cost of a pattern is a property of the pattern.
//
// An offline run over 300 archived cohort-140 institutions found four `html` rules whose unanchored
// `.*` rescans to the end of the line from every start letter -- `i.*clicker`, `reef.*iclicker`
// (iClicker), `screencast.*o.*matic` (Screencast-O-Matic) and `ps.*powerschool` (PowerSchool SIS).
// Archived pages are minified onto one line, so the cost is quadratic in page size: iClicker alone
// was 67% of all match CPU, and one 3.35 MB page took 206 s.
//
// Two checks, because they fail for different reasons:
//   1. STRUCTURE -- no unbounded `*`, `+` or `{n,}` quantifier in these technologies' html/scripts
//      rules. Deterministic; names the offending pattern.
//   2. COST -- the technology evaluates a 1 MB single-line adversarial page quickly. Run in a child
//      process with a hard timeout so a regression fails fast instead of hanging the suite.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const CHILD = path.resolve(__dirname, 'helpers/pattern-cost-child.js');

// The three technologies named in the audit. (Unit4's bare `coda` script substring is covered in
// vendor-patterns.test.js; it is a false positive, not a cost problem.)
const TECHS = ['iClicker', 'Screencast-O-Matic', 'PowerSchool SIS'];

const engine = new DeTECHtor();

/** Does a regex source contain a quantifier with no upper bound? Escapes and classes are inert. */
function unboundedQuantifier(source) {
  const bare = String(source)
    .replace(/\\./g, '')                       // \. \s \n ... -- escapes are not quantifiers
    .replace(/\[(?:[^\]\\]|\\.)*\]/g, '[]');   // [^<>\n] -- a class is one char, not a quantifier
  return /[*+]|\{\d*,\}/.test(bare);
}

test('the unbounded-quantifier check itself distinguishes the old rules from bounded ones', () => {
  for (const old of ['i.*clicker', 'reef.*iclicker', 'screencast.*o.*matic', 'ps.*powerschool', 'a.+b', 'a{2,}']) {
    assert.ok(unboundedQuantifier(old), `${old} is unbounded`);
  }
  for (const ok of ['iclicker', '\\bi[\\s_-]clicker', 'ps[^<>\\n]{0,80}powerschool', 'a\\.b', 'colou?r']) {
    assert.ok(!unboundedQuantifier(ok), `${ok} is bounded`);
  }
});

for (const tech of TECHS) {
  test(`${tech}: no html/scripts rule has an unbounded quantifier`, () => {
    // Inspect the LOADED definition, not one file: that is what ships, after the curated entry has
    // overridden the generated one and identity resolution has unioned any aliases.
    const def = engine.patterns[tech];
    assert.ok(def, `${tech} must exist`);
    const fields = ['html', 'scripts', 'scriptSrc'];
    const offenders = [];
    for (const f of fields) for (const p of def[f] || []) if (unboundedQuantifier(p)) offenders.push(`${f}: ${p}`);
    assert.deepStrictEqual(offenders, [], `${tech} carries unbounded quantifiers`);
  });

  test(`${tech}: evaluating a 1 MB single-line adversarial page stays well under a second`, () => {
    const r = spawnSync(process.execPath, [CHILD, tech, '1000000'], {
      encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL',
    });
    assert.ok(!r.error, `${tech}: child did not finish within 30 s -- quadratic match cost (${r.error && r.error.code})`);
    assert.strictEqual(r.status, 0, `${tech}: child failed: ${r.stderr}`);
    const res = JSON.parse(r.stdout.trim().split('\n').pop());
    for (const s of res.shapes) {
      assert.strictEqual(s.confidence, 0, `${tech}/${s.shape}: adversarial filler must not match`);
    }
    assert.ok(res.totalMs < 2000,
      `${tech}: ${res.totalMs} ms over ${res.shapes.length} one-MB shapes (budget 2000 ms): ` +
      res.shapes.map((s) => `${s.shape}=${s.ms}ms`).join(', '));
  });
}
