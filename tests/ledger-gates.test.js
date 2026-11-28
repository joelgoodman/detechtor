// tests/ledger-gates.test.js -- the script negative-corpus gate and the ledger category review gate
// (scripts/lib/ledger-gates.js). Each case is one defect class that shipped in b9be898 and passed every
// earlier gate: `Script: force` matching `workforce` / `wilberforce`, a bare `salesforce` token on a
// host that is not Salesforce's, and Merit Pages / Feathr reaching the ledger as Marketing Automation.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { fromPatternMap } = require('../scripts/lib/pattern-channels.js');
const { parseRow, anchorOf, runNegCorpus, negCorpusVerdict, checkCategoryTable } = require('../scripts/lib/ledger-gates.js');

const ROOT = path.resolve(__dirname, '..');
const row = (d, src, fp = 0, n = 1) => parseRow(`${d}\t${n}\t${fp}\t${src}`);
const anchor = (pattern, src, vendors = []) => anchorOf(row('x', src), new RegExp(pattern, 'gi'), vendors);

test('a match is anchored only when it names the vendor host or comes from a vendor domain', () => {
  assert.strictEqual(anchor('js\\.hs-scripts\\.com', 'https://js.hs-scripts.com/123.js'), 'host');
  assert.strictEqual(anchor('force', 'https://www.wilberforce.edu/js/a.js'), null, 'mid-label word');
  assert.strictEqual(anchor('force', 'https://cdn.example.edu/pages/workforce/main.js'), null, 'word in the path');
  assert.strictEqual(anchor('force\\.com', 'https://www.workforce.com/x.js'), null, 'no left label boundary');
  assert.strictEqual(anchor('salesforce', 'https://c.salesforceliveagent.com/content/g/js/48.0/deployment.js'), null,
    'covers part of the registrable label only');
  assert.strictEqual(anchor('salesforce', 'https://c.salesforceliveagent.com/x.js', ['salesforceliveagent.com']), 'vendor');
  assert.strictEqual(anchor('technolutions', 'https://slate-technolutions-net.cdn.technolutions.net/ping.js'), 'host',
    'a later occurrence that names the host anchors the match');
  assert.strictEqual(anchor('force', '/sites/all/themes/force/x.js'), null, 'relative src has no host to name');
});

const ROWS = [
  row('wilberforce.edu', 'https://www.wilberforce.edu/js/app.js', 1),
  row('roanestate.edu', '/pages/workforce/workforceMain.js', 1),
  row('example.edu', 'https://cdn.example.edu/forcefield.js', 1),
  row('force.com', 'https://acme.my.force.com/lightning/lightning.out.js', 0),
  row('hs-scripts.com', 'https://js.hs-scripts.com/123.js', 0),
];
const PATTERNS = fromPatternMap({
  'Salesforce Education Cloud': { categories: ['CRM'], website: 'https://www.salesforce.com', _hosts: ['force.com'], scripts: ['force', 'lightning'] },
  HubSpot: { categories: ['Marketing Automation'], website: 'https://www.hubspot.com', scripts: ['js\\.hs-scripts\\.com'] },
  'Not In The Ledger': { categories: ['JavaScript Library'], scripts: ['force'] },
});

test('a bare word fails on unrelated domains; a host-anchored rule passes; other categories are not run', () => {
  const { results, technologies } = runNegCorpus(PATTERNS, ROWS);
  assert.strictEqual(technologies, 2);
  const by = Object.fromEntries(results.map((r) => [r.pattern, r]));
  assert.strictEqual(by.force.off, 3, 'wilberforce.edu, roanestate.edu, example.edu');
  assert.strictEqual(by.force.anchoredVendor, 1, 'acme.my.force.com is on the declared vendor domain');
  assert.strictEqual(by.lightning.off, 0);
  assert.strictEqual(by['js\\.hs-scripts\\.com'].off, 0);
  const { fails, problems } = negCorpusVerdict(results, [], 0);
  assert.deepStrictEqual(fails.map((f) => f.pattern), ['force']);
  assert.deepStrictEqual(problems, []);
});

test('the allowlist exempts up to its ceiling, and a stale or no-op entry fails', () => {
  const { results } = runNegCorpus(PATTERNS, ROWS);
  const entry = (pattern, maxOffDomains, technology = 'Salesforce Education Cloud') =>
    ({ technology, pattern, maxOffDomains, decided: '2026-11-27', reason: 'test fixture: a reviewed self-hosted path' });
  assert.strictEqual(negCorpusVerdict(results, [entry('force', 3)], 0).fails.length, 0);
  assert.strictEqual(negCorpusVerdict(results, [entry('force', 2)], 0).fails.length, 1, 'broader than its ceiling fails again');
  const noop = negCorpusVerdict(results, [entry('force', 3), entry('lightning', 2)], 0).problems;
  assert.ok(noop.some((p) => /lightning.*no-op/.test(p)), noop.join('\n'));
  const stale = negCorpusVerdict(results, [entry('force', 3), entry('gone', 2)], 0).problems;
  assert.ok(stale.some((p) => /gone.*stale/.test(p)), stale.join('\n'));
  const shape = negCorpusVerdict(results, [{ technology: 'Salesforce Education Cloud', pattern: 'force', maxOffDomains: 3 }], 0).problems;
  assert.ok(shape.some((p) => /reason/.test(p)) && shape.some((p) => /decided/.test(p)), shape.join('\n'));
});

const CAT_PATTERNS = fromPatternMap({
  'Merit Pages': { categories: ['Marketing Automation'], scripts: ['meritpages\\.com'] },
  Feathr: { categories: ['Marketing Automation'], scripts: ['feathr\\.co'] },
  HubSpot: { categories: ['Marketing Automation'], scripts: ['js\\.hs-scripts\\.com'] },
  'Html Only': { categories: ['CMS'], html: ['generator-ish'] },
  RockRMS: { categories: ['CMS'], meta: { generator: '^Rock v' } },
  jQuery: { categories: ['JavaScript Library'], scripts: ['jquery'] },
});
const reviewed = (cats, extra = {}) => ({ ledger_categories: cats, status: 'reviewed', what_it_is: 'x', reviewer: 'test', date: '2026-11-27', ...extra });

test('a technology re-categorised into the ledger with no entry fails as NEW; a recorded "no" fails as MISMATCH', () => {
  const table = { HubSpot: reviewed(['Marketing Automation']), Feathr: reviewed([]), RockRMS: reviewed(['CMS']) };
  const { problems } = checkCategoryTable(CAT_PATTERNS, table);
  assert.deepStrictEqual(problems.NEW.map((s) => s.split(':')[0]), ['Merit Pages'], 'an html-only technology is not required');
  assert.deepStrictEqual(problems.MISMATCH.map((s) => s.split(':')[0]), ['Feathr']);
});

test('known_mismatch reports instead of failing, and is stale once the engine agrees', () => {
  const base = { HubSpot: reviewed(['Marketing Automation']), 'Merit Pages': reviewed(['Marketing Automation']), Feathr: reviewed(['Marketing Automation']) };
  const r1 = checkCategoryTable(CAT_PATTERNS, { ...base, RockRMS: reviewed([], { known_mismatch: 'correction pending' }) });
  assert.strictEqual(r1.problems.MISMATCH.length, 0);
  assert.strictEqual(r1.known.length, 1);
  const r2 = checkCategoryTable(CAT_PATTERNS, { ...base, RockRMS: reviewed(['CMS'], { known_mismatch: 'correction pending' }) });
  assert.ok(r2.problems.STALE.some((s) => /RockRMS.*known_mismatch/.test(s)));
});

test('an observed technology that is still unreviewed fails; a malformed or unloaded entry is stale', () => {
  const table = {
    HubSpot: { ledger_categories: ['Marketing Automation'], status: 'unreviewed' },
    'Merit Pages': { ledger_categories: ['Marketing Automation'], status: 'unreviewed' },
    Feathr: { ledger_categories: ['Marketing Automation'], status: 'agent-reviewed' },
    RockRMS: reviewed(['CMS']),
    Gone: reviewed(['CMS']),
  };
  const { problems } = checkCategoryTable(CAT_PATTERNS, table, new Map([['HubSpot', 212]]));
  assert.deepStrictEqual(problems.UNREVIEWED.map((s) => s.split(' ')[0]), ['HubSpot']);
  assert.ok(problems.STALE.some((s) => /^Feathr: an entry with status agent-reviewed needs/.test(s)));
  assert.ok(problems.STALE.some((s) => /^Gone: no such technology/.test(s)));
});

test('the breadth gate fails a loaded html regex with no measurement (coverage), and a stale backlog entry', () => {
  const fs = require('fs');
  const os = require('os');
  const { loadEffective, enumerateRegexes } = require('../scripts/lib/pattern-channels.js');
  const html = [];
  const seen = new Set();
  for (const r of enumerateRegexes(loadEffective())) {
    if (r.channel !== 'html') continue;
    const k = JSON.stringify([r.tech, r.pattern]);
    if (!seen.has(k)) { seen.add(k); html.push({ technology: r.tech, pattern: r.pattern }); }
  }
  assert.ok(html.length > 100);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-'));
  const write = (name, doc) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(doc)); return f; };
  const breadth = write('b.json', { scanned: 1000, patterns: { Zzz: { fires: 1, strongest: 0, html: { zzz: 0 } } } });
  const allow = write('a.json', { allow: {} });
  const run = (backlog) => {
    try {
      execFileSync('node', [path.join(ROOT, 'scripts/lint-pattern-breadth.js'), '--gate', '--coverage', '--breadth', breadth,
        '--allowlist', allow, '--unmeasured', write('u.json', { entries: backlog })], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
      return { code: 0, out: '' };
    } catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
  };
  assert.strictEqual(run(html).code, 0, 'everything unmeasured is in the backlog');
  const missing = run(html.slice(1));
  assert.strictEqual(missing.code, 1);
  assert.match(missing.out, /COVERAGE .*has no measurement/);
  const stale = run([...html, { technology: 'Zzz', pattern: 'zzz' }]);
  assert.strictEqual(stale.code, 1);
  assert.match(stale.out, /backlog entry Zzz .*no longer loaded/);
});
