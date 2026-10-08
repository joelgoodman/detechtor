// tests/page-selection.test.js — UNI-225.
//
// Measured signal-category yield over 506 archived pages / 29 institutions (2026-08-01):
//   program 93% > admissions 88% = student-life 88% > home 83% > cost-aid 81%
// The effect is modest -- ~10 points on the FIRST attempt. Escalation (tiered-detect), not
// ordering, is what recovers the 14 institutions homepage-only scanning missed.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { orderPages } = require(path.resolve(__dirname, '../src/page-selection.js'));
const config = require(path.resolve(__dirname, '../src/config.js'));

const p = (pageType) => ({ pageType, html: '' });
const types = (pages) => pages.map((x) => x.pageType);

test('the highest-yield available page is ordered first', () => {
  const ordered = orderPages([p('home'), p('cost-aid'), p('program')], config.pagePreference);
  assert.strictEqual(types(ordered)[0], 'program');
});

test('ordering falls back gracefully when preferred types are missing', () => {
  // Not every institution has an `admissions` capture; the order must degrade, never assume.
  const ordered = orderPages([p('cost-aid'), p('home')], config.pagePreference);
  assert.deepStrictEqual(types(ordered), ['home', 'cost-aid']);
});

test('unknown page types are kept, ordered after every known type', () => {
  const ordered = orderPages([p('athletics'), p('home')], config.pagePreference);
  assert.deepStrictEqual(types(ordered), ['home', 'athletics']);
});

test('pages of the same type keep their input order', () => {
  const a = { pageType: 'home', html: 'A' };
  const b = { pageType: 'home', html: 'B' };
  assert.deepStrictEqual(orderPages([a, b], config.pagePreference).map((x) => x.html), ['A', 'B']);
});

test('the input array is not mutated', () => {
  const input = [p('home'), p('program')];
  orderPages(input, config.pagePreference);
  assert.deepStrictEqual(types(input), ['home', 'program']);
});

test('config ships the measured preference order', () => {
  assert.deepStrictEqual(config.pagePreference,
    ['program', 'admissions', 'student-life', 'home', 'cost-aid', 'faq']);
});

// ---------------------------------------------------------------------------------------------
// `_` vs `-`. The page archive names its page types with underscores (`cost_aid`, `student_life`);
// config.pagePreference is written with hyphens (`cost-aid`, `student-life`). Compared as strings
// they never met, so those two preferences silently never applied -- 2 of 300 institutions in the
// cohort-140 offline run began on a different first page, and 2 changed technology set.
// ---------------------------------------------------------------------------------------------
test('archive page types (underscores) rank exactly like their hyphenated preference entries', () => {
  // student-life is preferred over home; cost-aid is preferred below home.
  const a = orderPages([p('home'), p('student_life'), p('cost_aid')], config.pagePreference);
  assert.deepStrictEqual(types(a), ['student_life', 'home', 'cost_aid']);

  // Not merely "not last": student_life must sit at its measured rank, between admissions and home.
  const b = orderPages([p('faq'), p('home'), p('student_life'), p('admissions'), p('cost_aid'), p('program')],
    config.pagePreference);
  assert.deepStrictEqual(types(b), ['program', 'admissions', 'student_life', 'home', 'cost_aid', 'faq']);
});

test('the hyphenated form still works, and the two forms interleave without a rank collision', () => {
  const ordered = orderPages([p('cost-aid'), p('student_life'), p('home'), p('student-life')], config.pagePreference);
  // Equal rank (the same page type spelled two ways) keeps input order.
  assert.deepStrictEqual(types(ordered), ['student_life', 'student-life', 'home', 'cost-aid']);
});

test('a preference list written with underscores matches hyphenated pages too', () => {
  const ordered = orderPages([p('home'), p('student-life')], ['student_life', 'home']);
  assert.deepStrictEqual(types(ordered), ['student-life', 'home']);
});

test('the caller\'s own page type spelling is returned unchanged', () => {
  const ordered = orderPages([p('home'), p('cost_aid')], config.pagePreference);
  assert.deepStrictEqual(types(ordered), ['home', 'cost_aid'], 'orderPages must not rewrite pageType');
  assert.deepStrictEqual(config.pagePreference,
    ['program', 'admissions', 'student-life', 'home', 'cost-aid', 'faq'], 'the config is not rewritten either');
});

test('a missing or non-string pageType is treated as unknown, not a crash', () => {
  const ordered = orderPages([{ html: '' }, p('home'), { pageType: null, html: '' }], config.pagePreference);
  assert.strictEqual(types(ordered)[0], 'home');
  assert.strictEqual(ordered.length, 3);
});
