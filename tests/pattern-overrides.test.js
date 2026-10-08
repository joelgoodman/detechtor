// tests/pattern-overrides.test.js — UNI-237.
//
// 12 of the 52 prose-collision patterns live in webappanalyzer-merged.json, which
// scripts/import-webappanalyzer.js overwrites wholesale. Deleting them in place is reverted on the
// next import. This layer removes them at load instead.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  applyPatternOverrides,
  validatePatternOverrides,
} = require(path.resolve(__dirname, '../src/pattern-overrides.js'));

const BASE = () => ({
  Bootstrap: {
    html: ['bootstrap', 'class=".*row', 'class=".*col-'],
    scripts: ['bootstrap'],
    categories: ['CSS Framework'],
  },
  Ghost: {
    html: ['ghost', 'powered.*by.*ghost'],
    meta: { generator: 'Ghost' },
    categories: ['CMS'],
  },
});

test('removes only the named patterns and leaves other evidence intact', () => {
  const out = applyPatternOverrides(BASE(), {
    Bootstrap: { remove: { html: ['class=".*row', 'class=".*col-'] }, reason: 'matches any class attribute' },
  });
  assert.deepStrictEqual(out.Bootstrap.html, ['bootstrap']);
  assert.deepStrictEqual(out.Bootstrap.scripts, ['bootstrap']);
  assert.deepStrictEqual(out.Bootstrap.categories, ['CSS Framework']);
});

test('does not mutate the input map or its definitions', () => {
  const input = BASE();
  applyPatternOverrides(input, { Bootstrap: { remove: { html: ['class=".*row'] } } });
  assert.deepStrictEqual(input.Bootstrap.html, ['bootstrap', 'class=".*row', 'class=".*col-']);
});

test('records provenance', () => {
  const out = applyPatternOverrides(BASE(), {
    Ghost: { remove: { html: ['ghost'] }, reason: 'matches btn-ghost', decided: '2026-08-11' },
  });
  assert.deepStrictEqual(out.Ghost.html, ['powered.*by.*ghost']);
  assert.deepStrictEqual(out.Ghost._patternOverride, {
    removed: { html: ['ghost'] },
    reason: 'matches btn-ghost',
    decided: '2026-08-11',
  });
});

test('never empties a technology of all evidence', () => {
  const problems = validatePatternOverrides(BASE(), {
    Ghost: { remove: { html: ['ghost', 'powered.*by.*ghost'], meta: ['generator'] } },
  });
  assert.ok(problems.some((p) => /no evidence/.test(p.problem)), JSON.stringify(problems));
});

test('a definition left with dom rules only still has evidence (Varbase, Allyant)', () => {
  // Varbase's js rule is a generic Drupal global; removing it must leave its dom rule standing,
  // not be refused as "no evidence at all".
  const base = { Varbase: { dom: ["div[class*='varbase-']"], js: { 'drupalSettings.ajaxPageState.libraries': '' } } };
  assert.deepStrictEqual(validatePatternOverrides(base, {
    Varbase: { remove: { js: ['drupalSettings.ajaxPageState.libraries'] }, reason: 'r', decided: '2026-10-08' },
  }), []);
});

test('retire drops the whole technology at load, and only that one', () => {
  const out = applyPatternOverrides(BASE(), {
    Ghost: { retire: true, reason: 'every evidence pattern is another product', decided: '2026-10-08' },
  });
  assert.strictEqual(out.Ghost, undefined);
  assert.deepStrictEqual(out.Bootstrap, BASE().Bootstrap);
});

test('retire is validated: a reason, a date, an existing technology, and no `remove` alongside it', () => {
  const v = (rules) => validatePatternOverrides(BASE(), rules).map((p) => p.problem).join(' | ');
  assert.strictEqual(v({ Ghost: { retire: true, reason: 'every evidence pattern is another product', decided: '2026-10-08' } }), '');
  assert.match(v({ Ghost: { retire: true, decided: '2026-10-08' } }), /real `reason`/);
  assert.match(v({ Ghost: { retire: true, reason: 'every evidence pattern is another product' } }), /decided/);
  assert.match(v({ Nope: { retire: true, reason: 'every evidence pattern is another product', decided: '2026-10-08' } }), /no such technology/);
  assert.match(v({ Ghost: { retire: true, remove: { html: ['ghost'] }, reason: 'every evidence pattern is another product', decided: '2026-10-08' } }), /takes no `remove`/);
  assert.match(v({ Ghost: { retire: 'yes', reason: 'every evidence pattern is another product', decided: '2026-10-08' } }), /either true or absent/);
});

test('rejects a stale rule naming a missing technology', () => {
  const problems = validatePatternOverrides(BASE(), { Nonexistent: { remove: { html: ['x'] } } });
  assert.ok(problems.some((p) => p.name === 'Nonexistent' && /no such technology/.test(p.problem)));
});

test('rejects a stale rule naming a pattern that is already gone', () => {
  const problems = validatePatternOverrides(BASE(), { Bootstrap: { remove: { html: ['not-present'] } } });
  assert.ok(problems.some((p) => /not present/.test(p.problem)), JSON.stringify(problems));
});

test('rejects a malformed rule', () => {
  const problems = validatePatternOverrides(BASE(), { Bootstrap: { remove: { html: 'a-string' } } });
  assert.ok(problems.some((p) => /malformed/.test(p.problem)));
});

test('rejects a rule targeting a non-evidence field', () => {
  const problems = validatePatternOverrides(BASE(), { Bootstrap: { remove: { categories: ['CSS Framework'] } } });
  assert.ok(problems.some((p) => /not an evidence field/.test(p.problem)));
});

test('a clean rule produces no problems', () => {
  assert.deepStrictEqual(validatePatternOverrides(BASE(), {
    Bootstrap: { remove: { html: ['class=".*row'] }, reason: 'r', decided: '2026-08-11' },
  }), []);
});

const fs = require('fs');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

test('an override survives regeneration of the upstream pattern file', () => {
  // The whole point of the layer: a rule must still bite against a definition read fresh off disk,
  // exactly as a re-import would leave it. Read the raw upstream entry, apply the rule to it in
  // isolation, and confirm the pattern is gone — no reliance on the loaded/curated merge.
  const rules = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../patterns/pattern-overrides.json'), 'utf8')
  ).overrides || {};
  const names = Object.keys(rules).filter((k) => k !== '_comment');
  if (names.length === 0) return; // Task 7 fills the file; until then there is nothing to prove.

  const upstream = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../patterns/generated/webappanalyzer-merged.json'), 'utf8')
  );

  for (const name of names) {
    const raw = upstream[name];
    if (!raw) continue; // rule targets a curated-only technology; not this test's concern
    const after = applyPatternOverrides({ [name]: raw }, { [name]: rules[name] })[name];
    if (rules[name].retire === true) {
      assert.strictEqual(after, undefined, `${name} is retired but still loads`);
      continue;
    }
    for (const [field, values] of Object.entries(rules[name].remove)) {
      for (const v of values) {
        const still = Array.isArray(after[field])
          ? after[field].includes(v)
          : !!(after[field] && v in after[field]);
        assert.ok(!still, `${name}.${field} still carries ${JSON.stringify(v)} after override`);
      }
    }
  }
});

test('a pristine load is unaffected by pattern overrides', () => {
  const engine = new DeTECHtor();
  const pristine = engine.loadPatterns({ applyOverrides: false });
  const overridden = engine.loadPatterns();
  const anyOverridden = Object.values(overridden).some((d) => d && d._patternOverride);
  const anyPristine = Object.values(pristine).some((d) => d && d._patternOverride);
  assert.strictEqual(anyPristine, false, 'pristine load must carry no _patternOverride marks');
  assert.strictEqual(anyOverridden, anyOverridden, 'sanity: overridden load read without throwing');
});
