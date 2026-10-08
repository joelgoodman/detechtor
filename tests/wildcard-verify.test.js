// tests/wildcard-verify.test.js -- the corpus-verification half of scripts/rewrite-unbounded-wildcards.js,
// on a tiny synthetic corpus whose every outcome is known in advance.
//
// A rewrite is only written when it is IDENTICAL over the whole corpus. This file pins what that word
// means and that the three other outcomes (LOST, GAINED, did-not-finish) are each detected, listed
// with enough context for a human to decide, and never silently counted as a match.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listCorpus, planAndVerify, compareOnPages, measureCpu } = require('../scripts/lib/wildcard-verify.js');

let dir;
const PAGES = {
  // same tag, short gap: matches however it is bounded
  '1/home__aaaaaaaaaaaa.html': '<p>Welcome to canva for schools program</p>',
  // 300-character gap inside one tag: forces the bound well past the 80 floor
  '2/program__bbbbbbbbbbbb.html': `<p class="x">canva ${'word '.repeat(60)}for the schools</p>`,
  // the gap crosses a tag boundary: the OLD regex matches, a tag-local `[^<>\n]` cannot
  '3/home__cccccccccccc.html': '<div>canva</div><div>for the schools</div>',
  // prefilter passes ("schools") but there is no match
  '4/home__dddddddddddd.html': '<p>schools, then canva</p>',
  // nothing relevant
  '5/home__eeeeeeeeee.html': '<p>nothing to see</p>',
  // a long run of "a" so a catastrophic regex cannot finish (the "b" lets a literal prefilter pass)
  '6/home__ffffffffffff.html': `<p>${'a'.repeat(60)}c b</p>`,
  // altcha, for the DROP rewrite
  '7/home__gggggggggggg.html': '<script src="https://cdn.example.com/altcha.js"></script>',
};

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wildcard-verify-'));
  for (const [rel, html] of Object.entries(PAGES)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), html);
  }
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const OPTS = { workers: 0, timeoutMs: 400, startCap: 5000 };
const item = (source, extra = {}) => ({ id: `page::${source}`, kind: 'page', source, channel: 'html', ...extra });

test('listCorpus finds every page, in numeric institution order', () => {
  const pages = listCorpus(dir);
  assert.strictEqual(pages.length, Object.keys(PAGES).length);
  assert.deepStrictEqual(pages.map((p) => p.inst), [1, 2, 3, 4, 5, 6, 7]);
});

test('the bound comes from the spans real pages show, and the first IDENTICAL candidate is chosen', async () => {
  const [r] = await planAndVerify([item('canva.*for.*schools')], listCorpus(dir), OPTS);
  // page 1: gap " " (1) and " " ; page 2: 300-char gap; page 3: crosses tags.
  const w0 = r.observed.find((o) => o.ordinal === 0);
  assert.ok(w0.max >= 300 && w0.max < 320, `observed max ${w0.max}`);
  assert.strictEqual(r.bounds[0].bound >= 2 * w0.max, true, 'bound covers 2 x the observed max');
  // The tag-local form loses page 3 (the span crosses `</div><div>`), so it is NOT chosen...
  const tagLocal = r.candidates.find((c) => c.id === 'tag-local');
  assert.strictEqual(tagLocal.outcome, 'LOST');
  assert.ok(tagLocal.lost.length >= 1);
  const lost = tagLocal.lost[0];
  assert.strictEqual(lost.inst, 3);
  assert.ok(/home__cccccccccccc/.test(lost.page));
  assert.ok(lost.spanLength > 0);
  assert.ok(lost.context.includes('canva') && lost.context.length <= 200 + 40, 'a context window around the match');
  // ...the class-preserving bound is.
  assert.strictEqual(r.outcome, 'IDENTICAL');
  assert.strictEqual(r.chosen.id, 'class');
  assert.match(r.chosen.source, /^canva\.\{0,\d+\}for\.\{0,\d+\}schools$/);
});

test('when the tag-local form loses nothing it is preferred', async () => {
  const [r] = await planAndVerify([item('canva.*for')], listCorpus(dir).filter((p) => p.inst !== 3), OPTS);
  assert.strictEqual(r.outcome, 'IDENTICAL');
  assert.strictEqual(r.chosen.id, 'tag-local');
  assert.match(r.chosen.source, /\[\^<>\\n\]/);
});

test('GAINED is detected when a candidate matches where the original did not', () => {
  // `canva.*for` is strictly wider than `canva.*for.*schools`: page 4 has canva but no "for".
  const pages = listCorpus(dir);
  const out = compareOnPages(item('canva.*for.*schools'), { id: 'x', source: 'canva.*for|canva' }, pages, OPTS);
  assert.ok(out.gained.length >= 1, 'a wider candidate must show as GAINED');
  assert.ok(['GAINED', 'LOST+GAINED'].includes(out.outcome));
});

test('an original that cannot finish is recorded, never counted as a match', async () => {
  const [r] = await planAndVerify([item('(?:a+)+b')], listCorpus(dir), { ...OPTS, timeoutMs: 150 });
  assert.ok(r.oldDidNotFinish >= 1, 'the 60 "a" page must time out');
  assert.strictEqual(r.matchPages, 0, 'a timeout is not a match');
});

test('a pattern no page ever exercises is IDENTICAL but flagged unobserved, with the default bound', async () => {
  const [r] = await planAndVerify([item('zzqx.*zzqy')], listCorpus(dir), OPTS);
  assert.strictEqual(r.outcome, 'IDENTICAL');
  assert.strictEqual(r.bounds[0].unobserved, true);
  assert.strictEqual(r.bounds[0].bound, 250);
});

test('a leading wildcard is DROPPED and judged on the per-page verdict', async () => {
  const [r] = await planAndVerify([item('.*altcha\\.js')], listCorpus(dir), OPTS);
  assert.strictEqual(r.outcome, 'IDENTICAL');
  assert.strictEqual(r.chosen.method, 'drop');
  assert.strictEqual(r.chosen.source, 'altcha\\.js');
});

test('a wildcard inside a negative look-around is never rewritten mechanically', async () => {
  const [r] = await planAndVerify([item('^(?!.*player)x.*y')], listCorpus(dir), OPTS);
  assert.strictEqual(r.outcome, 'NEEDS_REVIEW');
  assert.match(r.reason, /negative look-?around/i);
});

test('the corpus prefilter never changes an outcome', async () => {
  const pages = listCorpus(dir);
  const a = await planAndVerify([item('canva.*for.*schools')], pages, OPTS);
  const b = await planAndVerify([item('canva.*for.*schools')], pages, { ...OPTS, noPrefilter: true });
  assert.deepStrictEqual(a[0].observed, b[0].observed);
  assert.strictEqual(a[0].outcome, b[0].outcome);
  assert.strictEqual(a[0].chosen.source, b[0].chosen.source);
});

test('script-source items are judged on the script URLs, not the page text', async () => {
  const src = { id: 'src::altcha', kind: 'src', source: 'cdn\\.example\\.com/.*/?altcha', channel: 'scriptSrc' };
  const [r] = await planAndVerify([src], listCorpus(dir), OPTS);
  assert.strictEqual(r.matchPages, 1);
  assert.strictEqual(r.outcome, 'IDENTICAL');
});

test('worker processes give the same answer as the in-process run', async () => {
  const pages = listCorpus(dir);
  const solo = await planAndVerify([item('canva.*for.*schools'), item('.*altcha\\.js')], pages, OPTS);
  const pool = await planAndVerify([item('canva.*for.*schools'), item('.*altcha\\.js')], pages, { ...OPTS, workers: 2 });
  for (let i = 0; i < solo.length; i++) {
    assert.deepStrictEqual(pool[i].observed, solo[i].observed);
    assert.strictEqual(pool[i].outcome, solo[i].outcome);
    assert.strictEqual(pool[i].chosen.source, solo[i].chosen.source);
    assert.deepStrictEqual(pool[i].candidates.map((c) => [c.id, c.outcome, c.verdictLost, c.startsLost]),
      solo[i].candidates.map((c) => [c.id, c.outcome, c.verdictLost, c.startsLost]));
  }
});

test('a reviewed decision supplies its own candidate and is verified exactly like a generated one', async () => {
  const pages = listCorpus(dir);
  const tight = item('canva.*for.*schools', { forceCandidate: { id: 'decision', source: 'canva.{0,20}for.{0,20}schools', comparable: true, method: 'decision' } });
  const [lossy] = await planAndVerify([tight], pages, OPTS);
  const c = lossy.candidates.find((x) => x.id === 'decision');
  assert.ok(c.verdictLost >= 1, 'page 2 has a 301-char gap: a bound of 20 changes its verdict');
  assert.strictEqual(lossy.outcome, 'LOST');
  assert.strictEqual(lossy.chosen, null);
  const wide = item('canva.*for.*schools', { forceCandidate: { id: 'decision', source: 'canva.{0,700}for.{0,100}schools', comparable: true, method: 'decision' } });
  const [ok] = await planAndVerify([wide], pages, OPTS);
  assert.strictEqual(ok.outcome, 'IDENTICAL');
  assert.strictEqual(ok.chosen.id, 'decision');
});

test('redundant end wildcards are dropped first, and the middle one is measured on what is left', async () => {
  // `.*canva.*for.*`: the leading and trailing wildcards are redundant for test(); measuring with them
  // in place would make every earlier position a "start" and bury the real gap between canva and for.
  const pages = listCorpus(dir).filter((p) => p.inst !== 3);
  const [r] = await planAndVerify([item('.*canva.*for.*')], pages, OPTS);
  assert.strictEqual(r.outcome, 'IDENTICAL');
  assert.strictEqual(r.chosen.method, 'drop+bound');
  assert.match(r.chosen.source, /^canva\[\^<>\\n\]\{0,\d+\}for$/);
  const w = r.observed[0];
  assert.ok(w.max >= 300 && w.max < 320, `the gap is the real one (${w.max}), not an artefact of the dropped wildcard`);
  assert.ok(r.startsTotal < 40, `measured on the reduced pattern: ${r.startsTotal} starts, not one per earlier position`);
});

test('several unobserved wildcards on one path get the floor: the cost is the product of the bounds', async () => {
  const [r] = await planAndVerify([item('zzqx.*zzqy.*zzqz')], listCorpus(dir), OPTS);
  assert.deepStrictEqual(r.bounds.map((b) => b.bound), [80, 80]);
  assert.match(r.chosen.source, /^zzqx\[\^<>\\n\]\{0,80\}zzqy\[\^<>\\n\]\{0,80\}zzqz$/);
});

test('CPU is measured old vs new on the same pages, a timeout is recorded, and script URLs are timed as one batch', async () => {
  const pages = listCorpus(dir);
  const items = [
    { id: 'page::a', kind: 'page', oldSource: '(?:a+)+b', newSource: 'a{1,5}b' },       // old cannot finish on the 60 "a" page
    { id: 'src::x', kind: 'src', oldSource: 'cdn\\.example\\.com/.*/?altcha', newSource: 'cdn\\.example\\.com/.{0,80}/?altcha' },
  ];
  const r = await measureCpu(items, pages, { workers: 0, cpuCapMs: 150, itemBudgetMs: 5000 });
  const pageRow = r.find((x) => x.id === 'page::a');
  const srcRow = r.find((x) => x.id === 'src::x');
  assert.strictEqual(pageRow.tests, pages.length);
  assert.ok(pageRow.oldTimeouts >= 1, 'the catastrophic original is recorded as a timeout, not dropped');
  assert.ok(pageRow.newMs < pageRow.oldMs, 'bounded form is cheaper');
  assert.strictEqual(pageRow.maxOld.page.includes('6/'), true, 'the slowest page is named');
  assert.strictEqual(srcRow.tests, 1, 'one script URL in the corpus, tested once');
});
