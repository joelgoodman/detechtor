// tests/breadth-gate.test.js -- UNI-237. The gate must fail on each threshold independently, must
// spare a pattern the specificity screen finds unsuspect even when it is high-excess, must reject
// a stale or no-op allowlist entry, and must never pass trivially on an empty artifact.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// The gate must run IN PLACE: src/detechtor.js requires ~12 pattern files by relative path, so a
// copy or symlink in a scratch directory cannot load. --breadth/--allowlist point it at fixtures.
// The dictionary is real (patterns/dictionary.txt) and not overridden by these fixtures -- the
// point of these tests is the gate's threshold and allowlist logic, and the fixture words below
// are chosen to have known, stable dictionary membership.
function runGate(breadth, allow) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'breadth-'));
  const bPath = path.join(dir, 'breadth.json');
  const aPath = path.join(dir, 'allow.json');
  fs.writeFileSync(bPath, JSON.stringify(breadth));
  fs.writeFileSync(aPath, JSON.stringify({ allow }));
  try {
    const out = execFileSync(
      'node',
      [path.join(ROOT, 'scripts/lint-pattern-breadth.js'), '--gate', '--breadth', bPath, '--allowlist', aPath],
      { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }
    );
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') };
  }
}

// `class=".*row` is suspect under stage 1 (both "class" and "row" are dictionary words either side
// of a wildcard) AND excessive under stage 2:
// absLimit = 2% of 1000 = 20; excess = 800 - 100 = 700. Fails absolute (and relative).
const ABS_CASE = {
  scanned: 1000,
  patterns: { Bootstrap: { fires: 900, strongest: 100, html: { 'class=".*row': 800 } } },
};
// The TargetX shape, sized so ONLY the relative test can fire. "targetx" is not suspect under
// stage 1 (not a dictionary word) -- this fixture uses a suspect BARE dictionary token instead
// ("ghost", 5 chars, entirely a dictionary word) so stage 1 passes it through to stage 2:
//   absLimit = 2% of 5000 = 100; excess = 122 - 87 = 35, which is UNDER it.
//   relative = 35/122 = 28.7%, which is OVER the 25% line.
// If this fixture ever trips the absolute test too, the test proves nothing -- raise `scanned`.
const REL_CASE = {
  scanned: 5000,
  patterns: { Ghost: { fires: 122, strongest: 87, html: { ghost: 122 } } },
};
// Shaped like a vendor string ("algolia" is not in the dictionary) but sized to blow through BOTH
// numeric thresholds if stage 1 did not spare it. Proves the screen, not just the threshold, is
// load-bearing: a measured-excess-only gate would flag this.
const SCREENED_CASE = {
  scanned: 1000,
  patterns: { Algolia: { fires: 900, strongest: 0, html: { algolia: 800 } } },
};

test('the absolute threshold fails an over-broad, dictionary-shaped pattern', () => {
  const r = runGate(ABS_CASE, {});
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /absolute/);
});

test('the relative threshold fails a dictionary-shaped pattern that is under the absolute one', () => {
  const r = runGate(REL_CASE, {});
  assert.strictEqual(r.code, 1);
  // Must say `relative` ALONE. If it says `absolute+relative` the fixture is mis-sized and the test
  // is not proving the thresholds are independent.
  assert.match(r.out, /\[relative\]/, r.out);
  assert.doesNotMatch(r.out, /\[absolute/, 'fixture must not trip the absolute threshold');
});

test('a non-dictionary vendor string is spared even when its measured excess is huge', () => {
  const r = runGate(SCREENED_CASE, {});
  assert.strictEqual(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Algolia/, 'the specificity screen must spare a vendor-string pattern');
  assert.match(r.out, /spared by screen \(excessive but not suspect\): 1/, r.out);
});

test('an allowlisted pattern passes', () => {
  const r = runGate(ABS_CASE, { Bootstrap: [{ pattern: 'class=".*row', reason: 'reviewed' }] });
  assert.strictEqual(r.code, 0, r.out);
});

test('a stale allowlist entry naming a missing technology fails', () => {
  const r = runGate(ABS_CASE, {
    Bootstrap: [{ pattern: 'class=".*row', reason: 'reviewed' }],
    Nonexistent: [{ pattern: 'x', reason: 'r' }],
  });
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /stale/);
});

test('a no-op allowlist entry fails', () => {
  // "algolia" is spared by the screen already (not suspect), so it never reaches stage 2 -- this
  // allowlist entry has nothing to exempt regardless of the numbers, which is exactly the no-op
  // shape the hygiene check exists to catch.
  const clean = { scanned: 1000, patterns: { Algolia: { fires: 300, strongest: 300, html: { algolia: 300 } } } };
  const r = runGate(clean, { Algolia: [{ pattern: 'algolia', reason: 'distinctive vendor string' }] });
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /no-op/);
});

test('an empty breadth artifact fails rather than passing trivially', () => {
  const r = runGate({ scanned: 0, patterns: {} }, {});
  assert.strictEqual(r.code, 1);
});
