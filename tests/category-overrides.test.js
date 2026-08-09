// tests/category-overrides.test.js — UNI-235.
//
// UNI-233 fixed MECHANICAL category defects. This layer carries the SEMANTIC decisions a human
// made: "Ellucian CRM Recruit is a CRM, not Business Software + HR/Recruiting".
//
// It lives outside the pattern files because webappanalyzer-merged.json holds 6,202 of the 6,504
// technologies and is regenerated from upstream by scripts/import-webappanalyzer.js — an in-place
// edit is silently reverted on the next import.
//
// ⚠️ An override rewrites `categories` and NOTHING else. UNI-233's first merge attempt destroyed a
// `dom` field by assuming a shape; here the evidence fields are simply never in scope. The
// regression test below is what keeps that true.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { applyCategoryOverrides, validateOverrides } =
  require(path.resolve(__dirname, '../src/category-overrides.js'));

test('an override replaces the resolved categories', () => {
  const patterns = { 'Ellucian CRM Recruit': { cats: [53, 101], description: 'admissions' } };
  const out = applyCategoryOverrides(patterns, {
    'Ellucian CRM Recruit': { categories: ['CRM'], was: ['Business Software', 'HR / Recruiting'] },
  });
  assert.deepStrictEqual(out['Ellucian CRM Recruit'].categories, ['CRM']);
});

test('the stale numeric cats do not survive alongside an override', () => {
  // detechtor.js:1162 reads `pattern.categories || pattern.cats`. Leaving `cats` in place would
  // work today purely by precedence, and break the moment any consumer reads `cats` directly.
  const out = applyCategoryOverrides(
    { Thing: { cats: [53] } },
    { Thing: { categories: ['CRM'] } },
  );
  assert.ok(!('cats' in out.Thing), 'cats must be removed, not merely shadowed');
});

test('REGRESSION: an override touches no evidence field', () => {
  // The UNI-224 hazard in its general form. Omni CMS was undetectable until its dom rule was
  // recovered; anything that rewrites definitions must be provably unable to disturb evidence.
  const def = {
    cats: [53, 101],
    dom: { "a[href*='a.cms.omniupdate.com/11/']": { exists: true } },
    js: { 'Foo.version': '' },
    scriptSrc: ['example\\.com'],
    html: ['<div id="x"'],
    meta: { generator: 'Foo' },
    headers: { 'x-powered-by': 'Foo' },
    cookies: { foo: '' },
    implies: ['Bar'],
    description: 'thing',
  };
  const snapshot = JSON.stringify(def);
  const out = applyCategoryOverrides({ Thing: def }, { Thing: { categories: ['CRM'] } });

  for (const field of ['dom', 'js', 'scriptSrc', 'html', 'meta', 'headers', 'cookies', 'implies', 'description']) {
    assert.deepStrictEqual(out.Thing[field], def[field], `${field} must be byte-identical`);
  }
  assert.strictEqual(JSON.stringify(def), snapshot, 'the input definition must not be mutated');
});

test('an override for an unknown technology is ignored, not invented', () => {
  const out = applyCategoryOverrides({ Real: { cats: [1] } }, { Ghost: { categories: ['CRM'] } });
  assert.ok(!('Ghost' in out), 'an override must never create a technology');
  assert.deepStrictEqual(Object.keys(out), ['Real']);
});

test('provenance is stamped so a reader can see the assignment was overridden', () => {
  const out = applyCategoryOverrides(
    { Thing: { cats: [53] } },
    { Thing: { categories: ['CRM'], was: ['Business Software'], reason: 'it is a CRM' } },
  );
  assert.strictEqual(out.Thing._categoryOverride.reason, 'it is a CRM');
  assert.deepStrictEqual(out.Thing._categoryOverride.was, ['Business Software']);
});

test('validateOverrides rejects a target outside the canonical vocabulary', () => {
  const problems = validateOverrides({ Thing: { cats: [1] } }, { Thing: { categories: ['Kustomer Relations'] } });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].problem, /not a canonical category/);
});

test('validateOverrides rejects a no-op override', () => {
  // A no-op is either a mistake or a decision that has since been folded into the pattern file.
  // Either way it should not silently accumulate.
  const problems = validateOverrides({ Thing: { categories: ['CRM'] } }, { Thing: { categories: ['CRM'] } });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].problem, /no-op/);
});

test('validateOverrides rejects an override naming a technology that does not exist', () => {
  const problems = validateOverrides({ Real: { cats: [1] } }, { Ghost: { categories: ['CRM'] } });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].problem, /no such technology/);
});

test('validateOverrides accepts a well-formed override', () => {
  assert.deepStrictEqual(validateOverrides({ Thing: { cats: [53] } }, { Thing: { categories: ['CRM'] } }), []);
});
