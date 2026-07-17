const { test } = require('node:test');
const assert = require('node:assert');
const DeTECHtor = require('../src/detechtor.js');

test('curated partial patterns are stamped curated; base patterns are not', () => {
  const d = new DeTECHtor();
  d.loadPatterns();
  // a known curated CMS tech and a known base-only tech
  assert.strictEqual(d.patterns['Finalsite']._curated, true);
  assert.strictEqual(d.patterns['Finalsite']._sourceFile.includes('higher-ed-cms'), true);
  assert.ok(d.patterns['WooCommerce']); // base tech present
  assert.notStrictEqual(d.patterns['WooCommerce']._curated, true);
});

test('mergeTechnologies ORs curated across contributing detections and keeps a sourceFile', () => {
  const d = new DeTECHtor();

  const merged = d.mergeTechnologies([
    { name: 'Finalsite', confidence: 40, categories: ['CMS'], evidence: ['a'], curated: false, sourceFile: null },
    { name: 'Finalsite', confidence: 60, categories: ['CMS'], evidence: ['b'], curated: true, sourceFile: 'higher-ed-cms.json' }
  ]);

  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].curated, true);
  assert.strictEqual(merged[0].sourceFile, 'higher-ed-cms.json');
});
