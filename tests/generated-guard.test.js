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
const os = require('os');
const { execFileSync } = require('child_process');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'patterns/generated/webappanalyzer-merged.json');
const REPORT = path.join(ROOT, 'patterns/import-report.json');
const LINT = path.join(ROOT, 'scripts/lint-generated.js');

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
  // Read-only, real paths, no --artifact/--report override: this is what proves the tracked
  // artifact and its recorded hash are actually clean, not just that the guard logic works.
  execFileSync('node', [LINT, '--gate'], { cwd: ROOT, stdio: 'pipe' });
});

test('the guard FAILS on a hand-edit, and names the override layer', () => {
  // UNI-237 review fix: the original version of this test tampered with the real tracked artifact
  // in place. That's a live race against every other test file constructing `new DeTECHtor()` (they
  // re-read every pattern file from disk, and `node --test tests/*.test.js` runs files in
  // parallel), and if the process were killed mid-window the `finally` restore would never run,
  // leaving the real artifact in the exact "unreconciled hand-edit" state the guard exists to
  // prevent. Instead: copy the artifact and report to a temp dir, tamper with the copy only, and
  // point the guard at both via --artifact/--report. The real file is never touched.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detechtor-lint-generated-'));
  const tmpArtifact = path.join(tmpDir, 'webappanalyzer-merged.json');
  const tmpReport = path.join(tmpDir, 'import-report.json');
  try {
    const tampered = JSON.parse(fs.readFileSync(GENERATED, 'utf8'));
    tampered.__tamper_probe__ = { html: ['x'], cats: [1] };
    fs.writeFileSync(tmpArtifact, JSON.stringify(tampered, null, 2) + '\n');
    fs.copyFileSync(REPORT, tmpReport);
    try {
      execFileSync('node', [LINT, '--gate', '--artifact', tmpArtifact, '--report', tmpReport],
        { cwd: ROOT, stdio: 'pipe' });
      assert.fail('guard passed on a tampered artifact');
    } catch (e) {
      assert.strictEqual(e.status, 1);
      assert.match(String(e.stderr || ''), /pattern-overrides\.json/,
        'the failure must tell the reader where the edit belongs, not just that it is wrong');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('the guard FAILS when --report names a file with no artifactSha256', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detechtor-lint-generated-'));
  const tmpReport = path.join(tmpDir, 'import-report-no-hash.json');
  try {
    fs.writeFileSync(tmpReport, JSON.stringify({ totalPatterns: 1 }, null, 2) + '\n');
    try {
      // No --artifact override: the real committed artifact exists, so this exercises the "report
      // has no recorded hash" path specifically, not the "artifact missing" path.
      execFileSync('node', [LINT, '--gate', '--report', tmpReport], { cwd: ROOT, stdio: 'pipe' });
      assert.fail('guard passed with a report that records no artifactSha256');
    } catch (e) {
      assert.strictEqual(e.status, 1);
      assert.match(String(e.stderr || ''), /npm run update-patterns/,
        'the failure must tell the reader how to seed the hash');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
