// tests/generated-guard.test.js — UNI-237.
//
// patterns/generated/webappanalyzer-merged.json is a BUILD ARTIFACT that looks like a source file.
// Editing it in place is reverted by the next import, and that mistake has cost real time more than
// once. Three defences: the path says so, every definition says so, and the build fails on a hand
// edit. This pins the second and third.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'patterns/generated/webappanalyzer-merged.json');

test('definitions from patterns/generated are stamped _generated', () => {
  const patterns = new DeTECHtor().patterns;
  const fromGenerated = Object.entries(patterns)
    .filter(([n, d]) => n !== '_metadata' && d && d._sourceFile === 'webappanalyzer-merged.json');
  assert.ok(fromGenerated.length > 5000, `expected the bulk of patterns, got ${fromGenerated.length}`);
  const unstamped = fromGenerated.filter(([, d]) => d._generated !== true).map(([n]) => n);
  assert.deepStrictEqual(unstamped.slice(0, 5), [], `${unstamped.length} generated defs are unstamped`);
});

test('hand-written pattern files are NOT stamped _generated', () => {
  const patterns = new DeTECHtor().patterns;
  const wrong = Object.entries(patterns)
    .filter(([n, d]) => n !== '_metadata' && d && /^higher-ed-/.test(d._sourceFile || '') && d._generated)
    .map(([n]) => n);
  assert.deepStrictEqual(wrong, [], `curated defs wrongly stamped _generated: ${wrong.join(', ')}`);
});

test('the guard passes on the committed artifact', () => {
  execFileSync('node', [path.join(ROOT, 'scripts/lint-generated.js'), '--gate'], { cwd: ROOT, stdio: 'pipe' });
});

test('the guard FAILS on a hand-edit, and names the override layer', () => {
  const original = fs.readFileSync(GENERATED, 'utf8');
  const tampered = JSON.parse(original);
  tampered.__tamper_probe__ = { html: ['x'], cats: [1] };
  fs.writeFileSync(GENERATED, JSON.stringify(tampered, null, 2) + '\n');
  try {
    execFileSync('node', [path.join(ROOT, 'scripts/lint-generated.js'), '--gate'], { cwd: ROOT, stdio: 'pipe' });
    assert.fail('guard passed on a tampered artifact');
  } catch (e) {
    assert.strictEqual(e.status, 1);
    assert.match(String(e.stdout || ''), /pattern-overrides\.json/,
      'the failure must tell the reader where the edit belongs, not just that it is wrong');
  } finally {
    fs.writeFileSync(GENERATED, original);   // always restore, even if an assertion threw
  }
});
