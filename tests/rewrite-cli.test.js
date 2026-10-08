// tests/rewrite-cli.test.js -- scripts/rewrite-unbounded-wildcards.js end to end, as a dry run: it must
// find an offender in a CANDIDATE artifact (the import flow), measure it on a corpus, and say what it
// would write, without writing anything.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

test('dry run over a candidate artifact: classifies, reports, and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-cli-'));
  try {
    fs.mkdirSync(path.join(dir, 'corpus/1'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'corpus/2'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'corpus/1/home__aaaaaaaaaaaa.html'), '<p>zqfixt and then, some ways on, zqure</p>');
    fs.writeFileSync(path.join(dir, 'corpus/2/home__bbbbbbbbbbbb.html'), '<p>nothing here</p>');
    const candidate = path.join(dir, 'candidate.json');
    fs.writeFileSync(candidate, JSON.stringify({ 'Fixture Tech': { cats: [1], html: ['zqfixt.*zqure'] } }));
    const layerBefore = fs.readFileSync(path.join(ROOT, 'patterns/pattern-rewrites.json'), 'utf8');

    const r = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts/rewrite-unbounded-wildcards.js'),
      '--corpus', path.join(dir, 'corpus'), '--candidate', candidate, '--only', 'zqfixt', '--workers', '2', '--no-cpu',
    ], { encoding: 'utf8', timeout: 120000 });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 distinct wildcard patterns to rewrite/);
    assert.match(r.stdout, /"IDENTICAL":1/);
    assert.match(r.stdout, /dry run: nothing written/);
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'patterns/pattern-rewrites.json'), 'utf8'), layerBefore, 'a dry run must not touch the rewrite layer');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('without --corpus it refuses and says how to run it', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/rewrite-unbounded-wildcards.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--corpus/);
});
