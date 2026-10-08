// tests/import-guard.test.js -- the importer cannot write an artifact that brings the construct back.
//
// patterns/generated/webappanalyzer-merged.json is rewritten wholesale from upstream. Upstream is full of
// `a.*b.*c`. This runs the whole import offline against fixture "upstream" data and proves that an
// offender stops the import BEFORE anything is written, that the candidate can be kept for the
// rewriter, and that a wildcard the rewrite layer already covers does not block a re-import.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { main } = require('../scripts/import-webappanalyzer.js');
const { ImportGuardError } = require('../scripts/lib/import-guard.js');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-guard-'));
  return { dir, outputPath: path.join(dir, 'generated', 'merged.json'), reportPath: path.join(dir, 'report.json'), keep: path.join(dir, 'candidate.json') };
}

async function quietly(fn) {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}

test('an upstream pattern with `a.*b.*c` stops the import, lists the offender, and writes nothing', async () => {
  const sb = sandbox();
  const upstream = { 'Fixture Tech': { cats: [1], html: ['a.*b.*c'], website: 'https://example.com' } };
  await assert.rejects(
    quietly(() => main({ download: async () => upstream, outputPath: sb.outputPath, reportPath: sb.reportPath, rethrow: true })),
    (err) => {
      assert.ok(err instanceof ImportGuardError, `got ${err && err.constructor.name}: ${err && err.message}`);
      assert.match(err.message, /Fixture Tech/);
      assert.match(err.message, /html/);
      assert.match(err.message, /a\.\*b\.\*c/);
      assert.match(err.message, /Nothing was written/);
      return true;
    },
  );
  assert.ok(!fs.existsSync(sb.outputPath), 'the artifact must not be written');
  assert.ok(!fs.existsSync(sb.reportPath), 'the import report (which records the artifact hash) must not be written');
  fs.rmSync(sb.dir, { recursive: true, force: true });
});

test('--keep-candidate saves what would have been written, for the rewriter to work on', async () => {
  const sb = sandbox();
  const upstream = { 'Fixture Tech': { cats: [1], scriptSrc: ['cdn\\.example\\.com/.+/x\\.js'] } };
  await assert.rejects(quietly(() => main({ download: async () => upstream, outputPath: sb.outputPath, reportPath: sb.reportPath, keepCandidate: sb.keep, rethrow: true })), ImportGuardError);
  const kept = JSON.parse(fs.readFileSync(sb.keep, 'utf8'));
  assert.deepStrictEqual(kept['Fixture Tech'].scriptSrc, ['cdn\\.example\\.com/.+/x\\.js']);
  assert.ok(!fs.existsSync(sb.outputPath));
  fs.rmSync(sb.dir, { recursive: true, force: true });
});

test('a clean upstream imports normally', async () => {
  const sb = sandbox();
  const upstream = { 'Fixture Tech': { cats: [1], html: ['fixture[^<>\\n]{0,80}marker'], scriptSrc: ['/fixture\\.js'] } };
  await quietly(() => main({ download: async () => upstream, outputPath: sb.outputPath, reportPath: sb.reportPath, rethrow: true }));
  assert.ok(fs.existsSync(sb.outputPath));
  assert.ok(JSON.parse(fs.readFileSync(sb.reportPath, 'utf8')).artifactSha256);
  fs.rmSync(sb.dir, { recursive: true, force: true });
});

test('a wildcard the rewrite layer already covers does not block a re-import (it survives the artifact being rewritten)', async (t) => {
  const layer = require('../patterns/pattern-rewrites.json').rewrites || {};
  let pick = null;
  for (const [tech, fields] of Object.entries(layer)) {
    for (const field of ['html', 'scriptSrc', 'scripts']) {
      if (fields[field] && fields[field].length) { pick = { tech, field, from: fields[field][0].from }; break; }
    }
    if (pick) break;
  }
  if (!pick) { t.skip('no generated-technology rewrite in the layer yet'); return; }
  const sb = sandbox();
  // Upstream brings the ORIGINAL unbounded text back; the layer rewrites it at load.
  const upstream = { [pick.tech]: { cats: [1], [pick.field]: [pick.from] } };
  await quietly(() => main({ download: async () => upstream, outputPath: sb.outputPath, reportPath: sb.reportPath, rethrow: true }));
  const written = JSON.parse(fs.readFileSync(sb.outputPath, 'utf8'));
  assert.deepStrictEqual(written[pick.tech][pick.field], [pick.from], 'the artifact itself still holds the upstream text');
  fs.rmSync(sb.dir, { recursive: true, force: true });
});
