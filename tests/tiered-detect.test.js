// tests/tiered-detect.test.js — UNI-225, the deliverable.
//
// Escalation, not page ordering, is what recovers the 14 institutions that homepage-only scanning
// missed. And an institution whose every capture is blocked must report `unknown` -- reporting it
// as "no CMS" would be fabricating absence for a site we never actually saw.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { detectTiered, isLoadableMatch, loadableCategories } = require(path.resolve(__dirname, '../src/tiered-detect.js'));
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

// A page built from vendor tags, padded past the scannability floor. Each tag below is evidence the
// ledger loader grades `anchored` (a Script on the vendor's host) or `link` (a link to it).
const URL = 'https://www.example.edu/';
const page = (pageType, ...tags) => ({ pageType, url: URL,
  html: pad(`<html><head><title>${pageType}</title></head><body>${tags.join('')}</body></html>`) });
const TAG = {
  CRM: '<script src="https://technolutions.net/ping.js"></script>',                // Slate (Technolutions)
  'Marketing Automation': '<script src="https://js.hs-scripts.com/123456.js"></script>', // HubSpot
  Chatbot: '<script src="https://js.driftt.com/include/123/abc.js"></script>',      // Drift
  Accessibility: '<script src="https://cdn.userway.org/widget.js"></script>',       // UserWay
  'Site Search': '<script src="https://customer.cludo.com/scripts/search.js"></script>', // Cludo
  CMS: '<a href="https://a.cms.omniupdate.com/11/?skin=oucampus">Last updated</a>', // Modern Campus CMS (link)
  // Not loadable: two html-only rules (confidence 80, CRM) and a link-only LMS hit (Canvas LMS@40).
  weakCrm: '<p>Our Salesforce Education Cloud portal</p>',
  lmsOnly: '<a href="https://school.instructure.com/">Canvas</a>',
};
const ALL_SIX = ['CMS', 'CRM', 'Marketing Automation', 'Chatbot', 'Accessibility', 'Site Search'].map((c) => TAG[c]);

test('tier 1 stops only when every ledger category has loadable evidence', () => {
  const r = detectTiered(engine, [page('program', ...ALL_SIX), CLEAN_HOME]);
  assert.strictEqual(r.tier, 1);
  assert.strictEqual(r.status, 'detected');
  assert.deepStrictEqual(r.pagesEvaluated, ['program'], 'must not parse pages it does not need');
  assert.deepStrictEqual(r.pendingCategories, []);
});

test('one signal-category technology on tier 1 no longer stops escalation for the other categories', () => {
  // Before: Modern Campus CMS on the program page stopped all six categories, and the CRM on the
  // cost-aid page was never read.
  const r = detectTiered(engine, [OMNI_PROGRAM, page('cost-aid', TAG.CRM)]);
  assert.strictEqual(r.tier, 2);
  assert.deepStrictEqual(r.pagesEvaluated, ['program', 'cost-aid']);
  assert.ok(names(r).includes('Slate (Technolutions)'), `got: ${names(r).join(', ')}`);
});

test('evidence the loader would not load does not stop escalation', () => {
  const weak = page('program', TAG.weakCrm, TAG.lmsOnly);
  const r0 = detectTiered(engine, [weak]);
  const sf = r0.technologies.find((t) => t.name === 'Salesforce');
  assert.ok(sf && sf.confidence >= 50, 'the html-only CRM hit clears the old 50 floor, so a floor alone would stop here');
  assert.ok(names(r0).includes('Canvas LMS'));

  const r = detectTiered(engine, [weak, page('admissions', TAG.CRM)]);
  assert.strictEqual(r.tier, 2);
  assert.deepStrictEqual(r.pagesEvaluated, ['program', 'admissions']);
  assert.ok(names(r).includes('Slate (Technolutions)'));
});

test('escalation stops at the page that covers the last pending category', () => {
  const r = detectTiered(engine, [page('program'), page('admissions', TAG.CRM), page('cost-aid', TAG.Chatbot)],
    { categories: ['CRM'] });
  assert.strictEqual(r.tier, 2);
  assert.deepStrictEqual(r.pagesEvaluated, ['program', 'admissions']);
  assert.deepStrictEqual(r.pendingCategories, []);
});

test('pending categories are reported when the pages run out', () => {
  const r = detectTiered(engine, [page('program', TAG.CRM), page('admissions', TAG.Chatbot)]);
  assert.deepStrictEqual(r.pagesEvaluated, ['program', 'admissions']);
  assert.deepStrictEqual(r.pendingCategories, ['CMS', 'Marketing Automation', 'Accessibility', 'Site Search']);
});

test('loadable evidence: Meta, or a Script / DOM match on the vendor host; never html-only or first-party', () => {
  assert.strictEqual(isLoadableMatch({ channel: 'Meta' }), true);
  assert.strictEqual(isLoadableMatch({ channel: 'Script', vendorHost: true }), true);
  assert.strictEqual(isLoadableMatch({ channel: 'DOM', vendorHost: true, link: true }), true);
  assert.strictEqual(isLoadableMatch({ channel: 'HTML' }), false);
  assert.strictEqual(isLoadableMatch({ channel: 'JS' }), false);
  assert.strictEqual(isLoadableMatch({ channel: 'Script', vendorHost: false, firstParty: true }), false);
  assert.strictEqual(isLoadableMatch({ channel: 'DOM', vendorHost: null }), false);
  assert.deepStrictEqual(
    loadableCategories({ categories: ['LMS', 'CRM', 'CMS'], matches: [{ channel: 'Script', vendorHost: true }] }),
    ['CMS', 'CRM'], 'in ledger-category order; LMS is not a ledger category');
  assert.deepStrictEqual(loadableCategories({ categories: ['CRM'], matches: [{ channel: 'HTML' }] }), []);
  assert.deepStrictEqual(loadableCategories({ categories: ['CRM'] }), [], 'no matches, nothing loadable');
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

test('archive page types (cost_aid, student_life) steer tier 1 the same as the hyphenated names', () => {
  // The archive spells these with underscores; config.pagePreference with hyphens. Before they were
  // normalised, `student_life` was an unknown type, sorted last, and this institution escalated.
  const STUDENT_LIFE = { pageType: 'student_life', html: pad(fixture('omni-cms.html')) };
  const r = detectTiered(engine, [CLEAN_HOME, STUDENT_LIFE]);
  assert.strictEqual(r.pagesEvaluated[0], 'student_life', 'student_life outranks home and is read first');
  assert.ok(names(r).includes('Modern Campus CMS'));
  assert.deepStrictEqual(r.technologies.find((t) => t.name === 'Modern Campus CMS').pages, ['student_life'],
    'the archive\'s own page_type spelling is reported back unchanged');
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
