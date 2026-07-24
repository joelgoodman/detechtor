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

  // Collect all entries with category id 29
  const searchVendors = Object.entries(infra)
    .filter(([name, def]) => def.cats && def.cats.includes(29))
    .map(([name, def]) => ({ name, ...def }));

  // Assert there are at least 16 curated search vendors
  assert.ok(
    searchVendors.length >= 16,
    `expected at least 16 search vendors with id 29, found ${searchVendors.length}`
  );

  // Assert every search vendor resolves to 'Site Search'
  for (const vendor of searchVendors) {
    const mappedCategories = vendor.cats.map(mapCategory);
    assert.ok(
      mappedCategories.includes('Site Search'),
      `${vendor.name} cats ${JSON.stringify(vendor.cats)} must resolve to 'Site Search', got ${JSON.stringify(mappedCategories)}`
    );
  }
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

// --- UNI-156: Marketing Automation as 8th signal category ---

test('id 307 is Marketing Automation', () => {
  assert.strictEqual(mapCategory(307), 'Marketing Automation');
});

test('Marketing Automation is a signal category', () => {
  assert.ok(isSignalCategory('Marketing Automation'));
});

test('SIGNAL_CATEGORIES now has 8 members', () => {
  assert.strictEqual(SIGNAL_CATEGORIES.size, 8);
});

// --- UNI-156 Phase 3: dedicated CRM id (303), replacing the remapped 54-56 ---

test('id 303 is CRM', () => {
  assert.strictEqual(mapCategory(303), 'CRM');
});

test('CRM is a signal category', () => {
  assert.ok(isSignalCategory('CRM'));
});

// --- UNI-156 review fix: dedicated SIS id (302), base 53 declassified to Business Software, proctoring->304 ---

test('id 302 is the dedicated SIS id', () => {
  assert.strictEqual(mapCategory(302), 'SIS');
  assert.ok(isSignalCategory('SIS'));
});

test('base id 53 is declassified to Business Software, no longer a signal category', () => {
  assert.strictEqual(mapCategory(53), 'Business Software');
  assert.ok(!isSignalCategory(mapCategory(53)));
});

test('id 304 is Proctoring, not a signal category', () => {
  assert.strictEqual(mapCategory(304), 'Proctoring');
  assert.ok(!isSignalCategory('Proctoring'));
});

test('all curated SIS entries in higher-ed-sis.json carry id 302, not 53', () => {
  const sisPatterns = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../patterns/higher-ed-sis.json'), 'utf8')
  );
  for (const [name, def] of Object.entries(sisPatterns)) {
    if (name === '_metadata') continue;
    assert.ok(def.cats.includes(302), `${name} must carry SIS id 302, got ${JSON.stringify(def.cats)}`);
    assert.ok(!def.cats.includes(53), `${name} must not carry the declassified id 53, got ${JSON.stringify(def.cats)}`);
  }
});
