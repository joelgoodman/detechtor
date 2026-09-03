'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildDictionary } = require(path.resolve(__dirname, '../scripts/emit-dictionary.js'));
const { CANONICAL_CATEGORIES, SIGNAL_CATEGORIES } = require(path.resolve(__dirname, '../src/category-mapping.js'));

test('dictionary carries every loaded technology with canonical categories only', () => {
  const d = buildDictionary({ version: 'test' });
  assert.equal(d.detechtor_version, 'test');
  assert.equal(d.pattern_count, d.technologies.length);
  assert.ok(d.technologies.length > 6000);
  for (const t of d.technologies) {
    for (const c of t.categories) assert.ok(CANONICAL_CATEGORIES.has(c), `${t.name}: ${c} not canonical`);
    assert.ok(!t.categories.includes('Unknown'));
    assert.equal(t.is_signal, t.categories.some((c) => SIGNAL_CATEGORIES.has(c)));
  }
});

test('overrides, higher_ed and aliases are reflected', () => {
  const d = buildDictionary({ version: 'test' });
  const byName = Object.fromEntries(d.technologies.map((t) => [t.name, t]));
  assert.deepEqual(byName['Accessibility Toolbar Plugin'].categories, ['Accessibility']); // category override
  assert.equal(byName['TerminalFour'].is_higher_ed, true);
  assert.equal(byName['WordPress'].is_higher_ed, false);   // promoted into higher-ed-cms.json but NOT specialist
  assert.equal(byName['WordPress'].curated, true);
  assert.equal(d.aliases['Omni CMS'], 'Modern Campus CMS');
  assert.ok(!byName['Omni CMS'], 'alias names are not technologies');
  assert.equal(d.categories.length, CANONICAL_CATEGORIES.size);
});
