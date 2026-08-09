// tests/tiered-detect.test.js — UNI-225, the deliverable.
//
// Escalation, not page ordering, is what recovers the 14 institutions that homepage-only scanning
// missed. And an institution whose every capture is blocked must report `unknown` -- reporting it
// as "no CMS" would be fabricating absence for a site we never actually saw.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { detectTiered } = require(path.resolve(__dirname, '../src/tiered-detect.js'));
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const engine = new DeTECHtor();
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/pages', name), 'utf8');

// generic-university.html is small by design; pad it past the 5,000-byte scannability floor
// without changing what it matches.
const pad = (html) => html.replace('</body>', `<!--${'p'.repeat(6000)}--></body>`);

const CLEAN_HOME = { pageType: 'home', html: pad(fixture('generic-university.html')) };
// `program` outranks `home` in the preference order; `cost-aid` ranks below it. The two Omni
// pages let a test choose whether escalation is exercised or bypassed.
const OMNI_PROGRAM = { pageType: 'program', html: pad(fixture('omni-cms.html')) };
const OMNI_INTERIOR = { pageType: 'cost-aid', html: pad(fixture('omni-cms.html')) };
const BLOCKED_HOME = { pageType: 'home', html: fixture('blocked-cloudfront.html') };
const BLOCKED_PROGRAM = { pageType: 'program', html: fixture('blocked-cloudfront.html') };

const names = (r) => r.technologies.map((t) => t.name);

test('tier 1 stops as soon as a signal-category technology is found', () => {
  const r = detectTiered(engine, [OMNI_PROGRAM, CLEAN_HOME]);
  assert.strictEqual(r.tier, 1);
  assert.strictEqual(r.status, 'detected');
  assert.deepStrictEqual(r.pagesEvaluated, ['program'], 'must not parse pages it does not need');
  assert.ok(names(r).includes('Modern Campus CMS'));
});

test('a clean tier-1 page escalates and the interior page recovers the CMS', () => {
  // This is the 14-institution recovery in miniature: `home` sorts ahead of `cost-aid`, finds no
  // signal technology, and escalation is what finds the CMS.
  const r = detectTiered(engine, [CLEAN_HOME, OMNI_INTERIOR]);
  assert.strictEqual(r.tier, 2);
  assert.strictEqual(r.status, 'detected');
  assert.deepStrictEqual(r.pagesEvaluated, ['home', 'cost-aid']);
  assert.ok(names(r).includes('Modern Campus CMS'), `expected Modern Campus CMS, got: ${names(r).join(', ')}`);
});

test('an institution whose every capture is blocked reports unknown, never "none"', () => {
  const r = detectTiered(engine, [BLOCKED_HOME, BLOCKED_PROGRAM]);
  assert.strictEqual(r.status, 'unknown');
  assert.strictEqual(r.tier, 0);
  assert.deepStrictEqual(r.technologies, []);
  assert.deepStrictEqual(r.pagesEvaluated, []);
  assert.strictEqual(r.unscannable.length, 2);
});

test('a blocked page is skipped without poisoning a readable sibling', () => {
  const r = detectTiered(engine, [BLOCKED_PROGRAM, OMNI_INTERIOR]);
  assert.strictEqual(r.status, 'detected');
  assert.deepStrictEqual(r.pagesEvaluated, ['cost-aid']);
  assert.deepStrictEqual(r.unscannable, [{ pageType: 'program', reason: 'undersized' }]);
});

test('readable pages with genuinely no signal technology report none, not unknown', () => {
  const r = detectTiered(engine, [CLEAN_HOME]);
  assert.strictEqual(r.status, 'none');
  assert.strictEqual(r.tier, 2, 'a single clean page still exhausts escalation');
  assert.ok(!names(r).includes('Pleroma'), 'the UNI-224 false positive must stay dead');
});

test('a merged technology records every page it fired on and keeps the highest confidence', () => {
  const r = detectTiered(engine, [CLEAN_HOME, OMNI_INTERIOR,
    { pageType: 'faq', html: pad(fixture('omni-cms.html')) }]);
  const omni = r.technologies.find((t) => t.name === 'Modern Campus CMS');
  assert.ok(omni, 'Modern Campus CMS must survive the merge');
  assert.deepStrictEqual(omni.pages.sort(), ['cost-aid', 'faq']);
  assert.ok(omni.confidence > 0);
});

test('an empty page list is unknown, not none', () => {
  const r = detectTiered(engine, []);
  assert.strictEqual(r.status, 'unknown');
});
