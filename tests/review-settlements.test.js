// tests/review-settlements.test.js -- the verdicts on patterns/wildcard-review.tsv rows live in a
// sidecar (patterns/wildcard-review-settlements.json) because the rewriter regenerates the TSV
// wholesale. This keeps the two in step: every `possible-genuine-loss` row is settled, and no
// settlement names a row the TSV no longer has.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TSV = fs.readFileSync(path.join(ROOT, 'patterns/wildcard-review.tsv'), 'utf8').split('\n').filter(Boolean);
const COLS = TSV[0].split('\t');
const ROWS = TSV.slice(1).map((line) => Object.fromEntries(line.split('\t').map((v, i) => [COLS[i], v])));
const FILE = require(path.join(ROOT, 'patterns/wildcard-review-settlements.json'));

const key = (channel, technology, pattern) => JSON.stringify([channel, technology, pattern]);
const VERDICTS = new Set(['correct-loss', 'no-loss', 'genuine-loss', 'signal-kept-below-floor']);

test('every settlement is well formed', () => {
  assert.ok(typeof FILE._comment === 'string' && FILE._comment.length > 100);
  assert.match(FILE.settled, /^\d{4}-\d{2}-\d{2}$/);
  for (const s of FILE.settlements) {
    const id = key(s.channel, s.technology, s.pattern);
    assert.ok(VERDICTS.has(s.verdict), `${id}: verdict ${s.verdict}`);
    assert.ok(typeof s.what === 'string' && s.what.length >= 20, `${id}: say what the lost matches were`);
    assert.ok(Number.isInteger(s.census_pairs_lost) && s.census_pairs_lost >= 0, `${id}: census_pairs_lost`);
    if (s.verdict === 'genuine-loss' || s.verdict === 'signal-kept-below-floor') {
      assert.ok(typeof s.action === 'string' && s.action.length >= 10, `${id}: a real loss needs the action taken or still open`);
    }
  }
});

test('every possible-genuine-loss row in the review TSV is settled, and every settlement names a row still there', () => {
  const rows = new Set(ROWS.filter((r) => /possible-genuine-loss/.test(r.tags)).map((r) => key(r.channel, r.technologies, r.pattern)));
  const settled = new Set(FILE.settlements.map((s) => key(s.channel, s.technology, s.pattern)));
  const unsettled = [...rows].filter((k) => !settled.has(k));
  const stale = [...settled].filter((k) => !rows.has(k));
  assert.deepStrictEqual(unsettled, [], 'settle these in patterns/wildcard-review-settlements.json');
  assert.deepStrictEqual(stale, [], 'the review TSV no longer has these rows: drop or re-key the settlement');
  assert.strictEqual(settled.size, FILE.settlements.length, 'a row is settled twice');
});
