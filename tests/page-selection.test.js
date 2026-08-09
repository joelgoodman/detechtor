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
