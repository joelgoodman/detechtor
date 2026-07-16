const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mapCategory, isSignalCategory, SIGNAL_CATEGORIES } = require('../src/category-mapping.js');

test('SIGNAL_CATEGORIES is the protected set', () => {
  for (const c of ['CMS', 'LMS', 'SIS', 'CRM', 'Chatbot', 'Site Search', 'Accessibility']) {
    assert.ok(isSignalCategory(c), `${c} must be a signal category`);
  }
  assert.ok(!isSignalCategory('Ecommerce'));
  assert.ok(!isSignalCategory('Widget'));
});

test('mis-mapped ids no longer land plugins/widgets in CMS/LMS', () => {
  const cat = (ids) => ids.map(mapCategory);
  assert.ok(!cat([6, 87]).some(isSignalCategory), 'WooCommerce [6,87] must not be a signal category');
  assert.ok(!cat([5, 87]).some(isSignalCategory), 'Email Encoder [5,87] must not be a signal category');
  assert.ok(!cat([96]).some(isSignalCategory), 'Juicer [96] must not be a signal category');
  assert.ok(!cat([89]).some(isSignalCategory), 'Weglot [89] must not be a signal category');
});

test('real CMS id still resolves to CMS', () => {
  assert.strictEqual(mapCategory(1), 'CMS');
});

test('named polluters resolve to sane non-signal buckets', () => {
  assert.strictEqual(mapCategory(87), 'WordPress Plugin');
  assert.strictEqual(mapCategory(96), 'Widget');
  assert.strictEqual(mapCategory(89), 'Localization');
  assert.strictEqual(mapCategory(5), 'Widget');
});

test('base id 111 (fundraising) no longer resolves to a signal category', () => {
  const name = mapCategory(111);
  assert.ok(!isSignalCategory(name), `mapCategory(111)='${name}' must not be a signal category`);
});

test('curated Accessibility gets a dedicated id, not the fundraising id', () => {
  const dedicated = Object.keys(require('../src/category-mapping.js').categoryMapping)
    .find((id) => require('../src/category-mapping.js').categoryMapping[id] === 'Accessibility' && id !== '111');
  assert.ok(dedicated, 'a dedicated Accessibility id (not 111) must exist in categoryMapping');
  assert.strictEqual(mapCategory(Number(dedicated)), 'Accessibility');
  assert.ok(isSignalCategory(mapCategory(Number(dedicated))));

  const accessibilityPatterns = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../patterns/higher-ed-accessibility.json'), 'utf8')
  );
  for (const [name, def] of Object.entries(accessibilityPatterns)) {
    if (name === '_metadata') continue;
    assert.deepStrictEqual(def.cats, [Number(dedicated)], `${name} must carry the dedicated Accessibility id`);
  }
});

test('Chatbot id 52 is untouched', () => {
  assert.strictEqual(mapCategory(52), 'Chatbot');
});

test('Web Server id 6 is untouched', () => {
  assert.strictEqual(mapCategory(6), 'Web Server');
});

// --- Fix pass: curated-id collisions resolved (29=Site Search, 21=LMS, 98=Ecommerce Marketing, drop 82) ---

test('id 29 is the canonical Site Search id', () => {
  assert.strictEqual(mapCategory(29), 'Site Search');
  assert.ok(isSignalCategory('Site Search'));
});

test('curated search vendors in higher-ed-infra.json resolve to Site Search via id 29', () => {
  const infra = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../patterns/higher-ed-infra.json'), 'utf8')
  );
  const searchVendor = infra.SearchStax || infra.Algolia;
  assert.ok(searchVendor, 'expected SearchStax or Algolia in higher-ed-infra.json');
  assert.ok(searchVendor.cats.includes(29), 'search vendor must carry cats id 29');
  assert.ok(
    searchVendor.cats.map(mapCategory).includes('Site Search'),
    'search vendor cats must resolve to Site Search'
  );
});

test('id 21 is LMS', () => {
  assert.strictEqual(mapCategory(21), 'LMS');
});

test('id 98 is Ecommerce Marketing, not a signal category', () => {
  assert.strictEqual(mapCategory(98), 'Ecommerce Marketing');
  assert.ok(!isSignalCategory(mapCategory(98)));
});

test('id 82 is dropped — mapCategory returns Unknown, a non-signal category', () => {
  assert.strictEqual(mapCategory(82), 'Unknown');
  assert.ok(!isSignalCategory(mapCategory(82)));
  assert.ok(!Object.prototype.hasOwnProperty.call(require('../src/category-mapping.js').categoryMapping, 82));
});
