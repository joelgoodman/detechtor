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

test('validateOverrides detects a no-op override with reversed order', () => {
  // Categories are unordered (consumed via .some(), .includes(), Set-union everywhere downstream).
  // An override that merely reorders existing categories is a no-op and must be reported as such.
  const problems = validateOverrides(
    { Thing: { cats: [53, 101] } },
    { Thing: { categories: ['Business Software', 'HR / Recruiting'] } },
  );
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

test('INTEGRATION: the engine applies the override file at load', () => {
  const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
  const OVERRIDES = require(path.resolve(__dirname, '../patterns/category-overrides.json'));
  const engine = new DeTECHtor();

  for (const [name, rule] of Object.entries(OVERRIDES.overrides)) {
    const def = engine.patterns[name];
    assert.ok(def, `${name} is overridden but not present after load — stale override`);
    assert.deepStrictEqual(def.categories, rule.categories,
      `${name} must carry its overridden categories on the loaded engine`);
    assert.ok(!('cats' in def), `${name} must not retain a stale numeric cats`);
  }
});

test('INTEGRATION: the override file is structurally valid against the real patterns', () => {
  const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
  const OVERRIDES = require(path.resolve(__dirname, '../patterns/category-overrides.json'));
  // Validate against a pristine load, since engine.patterns already has overrides applied and a
  // valid override would therefore read as a no-op.
  const raw = new DeTECHtor().loadPatterns({ applyOverrides: false });
  assert.deepStrictEqual(validateOverrides(raw, OVERRIDES.overrides), []);
});

test('WIRING: loadPatterns() actually applies a live override, not just applyCategoryOverrides() in isolation', () => {
  // The two INTEGRATION tests above loop over OVERRIDES.overrides, which is `{}` today (Task 4
  // populates it later) — as written they iterate zero times and prove nothing about the wiring.
  // This test forces the real file's rules non-empty for one pass through the real
  // DeTECHtor.loadPatterns() call path, so the wiring is exercised now, not only once entries land.
  const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
  // Same absolute path as the `require('../patterns/category-overrides.json')` inside
  // src/detechtor.js — Node's module cache means this IS that module's CATEGORY_OVERRIDES object,
  // so mutating `.overrides` here is visible to the engine's loadPatterns() on the next call.
  const OVERRIDES = require(path.resolve(__dirname, '../patterns/category-overrides.json'));

  const engine = new DeTECHtor();
  const raw = engine.loadPatterns({ applyOverrides: false });
  const [name] = Object.keys(raw).filter(
    (n) => n !== '_metadata' && raw[n] && typeof raw[n] === 'object' && (raw[n].categories || raw[n].cats),
  );
  assert.ok(name, 'expected at least one real technology with categories in the loaded patterns');

  const saved = OVERRIDES.overrides;
  OVERRIDES.overrides = { [name]: { categories: ['CRM'] } };
  try {
    const applied = engine.loadPatterns();
    assert.deepStrictEqual(applied[name].categories, ['CRM'],
      'a live override must flow through loadPatterns() into the resulting pattern map');
    assert.ok(!('cats' in applied[name]), 'the override must remove the stale numeric cats');
  } finally {
    OVERRIDES.overrides = saved;
  }
});
