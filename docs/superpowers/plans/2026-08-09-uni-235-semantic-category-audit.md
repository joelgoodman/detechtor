# UNI-235 Semantic Category Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag technology→category mismatches across all 6,504 technologies and all 56 categories, ranked by measured institutional impact, with human-confirmed decisions recorded in a load-time override layer that survives a base-pattern reimport.

**Architecture:** A new `patterns/category-overrides.json` is applied by `src/category-overrides.js` inside `DeTECHtor.loadPatterns()`, immediately after `resolveIdentities()`. An override rewrites the `categories` field and nothing else, so evidence fields (`dom`, `js`, `scriptSrc`, …) are structurally untouchable. Candidates reaching a human come from three sources: a high-precision name-token screen, a full-corpus prevalence measurement, and a two-model local-LLM sweep combined by union.

**Tech Stack:** Node ≥18 (CommonJS), `node --test` + `node:assert`, Ollama HTTP API at `127.0.0.1:11434`, `child_process.fork` for corpus parallelism. No new npm dependencies.

## Global Constraints

- **Node ≥18, CommonJS.** `require`, not `import`. Match surrounding style.
- **No new npm dependencies.** Ollama is reached over plain `http`.
- **An override rewrites `categories` only.** Never `dom`, `js`, `scriptSrc`, `html`, `meta`, `headers`, `cookies`, `text`, `url`, `network`, `implies`, `requires`. This is the UNI-224 regression guard.
- **Never auto-apply a model verdict.** Models produce a review queue; only a human writes to `patterns/category-overrides.json`.
- **Model confidence is recorded but never gates anything** — measured at 0.9–1.0 on every answer including wrong ones.
- **The model's `verdict` is trusted; its `correct_category` is advisory metadata only.**
- **Union combiner:** flag if *either* model objects. Never require agreement.
- **UNI-231:** any corpus pass must filter on `classifyCapture(html).scannable` before counting an institution.
- **Prevalence is homepage-only.** Inert means *deprioritised*, never *proven absent*. State this in output.
- Category vocabulary is **frozen** for this ticket. No renames, no new categories.
- Run `npm test` before every commit; all 123 existing tests stay green.

---

### Task 1: The override module

**Files:**
- Create: `src/category-overrides.js`
- Test: `tests/category-overrides.test.js`

**Interfaces:**
- Consumes: `CANONICAL_CATEGORIES` from `src/category-mapping.js`
- Produces: `applyCategoryOverrides(patterns, overrides) -> object` (new pattern map); `validateOverrides(patterns, overrides) -> Array<{name, problem}>`

- [ ] **Step 1: Write the failing test**

Create `tests/category-overrides.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/category-overrides.test.js`
Expected: FAIL — `Cannot find module '.../src/category-overrides.js'`

- [ ] **Step 3: Write the implementation**

Create `src/category-overrides.js`:

```js
// src/category-overrides.js — UNI-235. Human-adjudicated category corrections, applied at load.
//
// WHY A LAYER AND NOT AN EDIT. `webappanalyzer-merged.json` holds 6,202 of the 6,504 technologies
// and is downloaded from upstream and regenerated by scripts/import-webappanalyzer.js. Editing
// those entries in place means the next import silently reverts every decision a human made.
//
// ⚠️ An override rewrites `categories` and NOTHING else. Evidence fields are never in scope here,
// which makes the UNI-224 dom-clobbering hazard structurally impossible rather than merely tested
// against. Keep it that way: if you ever find yourself wanting to override evidence, that belongs
// in a pattern file, not here.
'use strict';
const { CANONICAL_CATEGORIES, mapCategory } = require('./category-mapping');

/**
 * Apply human-adjudicated category corrections.
 *
 * @param {object} patterns  name -> definition
 * @param {object} [overrides] name -> {categories: string[], was?, reason?, decided?}
 * @returns {object} a new pattern map; the input and its definitions are not mutated.
 */
function applyCategoryOverrides(patterns, overrides = {}) {
  const out = { ...patterns };

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;
    const def = out[name];
    // Never invent a technology. An override whose target is gone is reported by
    // validateOverrides and gated in CI; at runtime it is simply inert.
    if (!def || typeof def !== 'object') continue;
    if (!rule || !Array.isArray(rule.categories)) continue;

    const next = { ...def, categories: [...rule.categories] };
    // Remove the numeric form rather than relying on `categories || cats` precedence at
    // detechtor.js:1162 — a consumer reading `cats` directly would otherwise see the old value.
    delete next.cats;
    next._categoryOverride = {
      was: rule.was ?? null,
      reason: rule.reason ?? null,
      decided: rule.decided ?? null,
    };
    out[name] = next;
  }

  return out;
}

/** Resolved category names for a definition, matching how the engine reads them. */
function resolvedCategories(def) {
  const raw = (def && (def.categories || def.cats)) || [];
  return Array.isArray(raw) ? raw.map(mapCategory) : [];
}

/**
 * Structural problems with the override file. Used by scripts/category-audit.js --gate so that a
 * reimport which reverts a decision, or a stale override, fails the build instead of rotting.
 *
 * @returns {Array<{name: string, problem: string}>}
 */
function validateOverrides(patterns, overrides = {}) {
  const problems = [];

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;

    if (!rule || !Array.isArray(rule.categories) || rule.categories.length === 0) {
      problems.push({ name, problem: 'malformed: `categories` must be a non-empty array' });
      continue;
    }

    for (const c of rule.categories) {
      if (!CANONICAL_CATEGORIES.has(c)) {
        problems.push({ name, problem: `"${c}" is not a canonical category` });
      }
    }

    const def = patterns[name];
    if (!def || typeof def !== 'object') {
      problems.push({ name, problem: 'no such technology — the override is stale' });
      continue;
    }

    const current = resolvedCategories(def);
    const wanted = rule.categories;
    if (current.length === wanted.length && current.every((c, i) => c === wanted[i])) {
      problems.push({ name, problem: 'no-op: the technology already carries exactly these categories' });
    }
  }

  return problems;
}

module.exports = { applyCategoryOverrides, validateOverrides, resolvedCategories };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/category-overrides.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/LLM/detechtor
git add src/category-overrides.js tests/category-overrides.test.js
git commit -m "feat(uni-235): category override layer — categories only, evidence untouchable

Decisions cannot live in webappanalyzer-merged.json: it holds 6,202 of the 6,504 technologies
and is regenerated from upstream, so an in-place edit is reverted on the next import.

An override rewrites \`categories\` and nothing else, so the UNI-224 dom-clobbering hazard is
structurally impossible here rather than merely tested against. Pinned by a regression test that
asserts every evidence field is byte-identical across the call."
```

---

### Task 2: Wire the layer into pattern loading

**Files:**
- Create: `patterns/category-overrides.json`
- Modify: `src/detechtor.js` (imports near line 11; `loadPatterns()` after the `resolveIdentities` call at line 127)
- Test: `tests/category-overrides.test.js` (append)

**Interfaces:**
- Consumes: `applyCategoryOverrides` from Task 1
- Produces: a `DeTECHtor` instance whose `.patterns` already has overrides applied, so every consumer (`detectTechnologies`, `tiered-detect.js`, all `scripts/*`) sees corrected categories with no further change.

- [ ] **Step 1: Create the empty override file**

Create `patterns/category-overrides.json`:

```json
{
  "_comment": "UNI-235. Human-adjudicated category corrections, applied at load by src/category-overrides.js AFTER identity resolution. Rewrites `categories` ONLY — never evidence fields. Lives here rather than in the pattern files because webappanalyzer-merged.json is regenerated from upstream and would silently revert edits. Validated by `node scripts/category-audit.js --gate`, which runs in `npm test`.",
  "overrides": {}
}
```

- [ ] **Step 2: Write the failing integration test**

Append to `tests/category-overrides.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/category-overrides.test.js`
Expected: FAIL — `loadPatterns` does not accept options, so `applyOverrides: false` is ignored and the second test throws or the first finds no applied overrides once Task 4 adds entries.

- [ ] **Step 4: Wire it into `src/detechtor.js`**

Add after line 11 (`const ALIASES = require(...)`):

```js
const { applyCategoryOverrides } = require('./category-overrides');
const CATEGORY_OVERRIDES = require('../patterns/category-overrides.json');
```

Change the `loadPatterns()` signature at line 82 from `loadPatterns() {` to:

```js
  // options.applyOverrides — set false to obtain the pristine, pre-override map. Only the
  // override validator wants this; everything else must see corrected categories.
  loadPatterns(options = {}) {
```

Then replace lines 126-130 (the `resolveIdentities` block) with:

```js
    const before = Object.keys(patterns).length;
    let resolved = resolveIdentities(patterns, ALIASES.aliases || {});
    if (config.verbose && before !== Object.keys(resolved).length) {
      console.log(`Collapsed ${before - Object.keys(resolved).length} duplicate technology name(s)`);
    }

    // UNI-235: human-adjudicated category corrections, applied AFTER identity resolution so an
    // override names the surviving canonical technology rather than a name that just got merged
    // away. Rewrites `categories` only — see src/category-overrides.js.
    if (options.applyOverrides !== false) {
      const rules = CATEGORY_OVERRIDES.overrides || {};
      resolved = applyCategoryOverrides(resolved, rules);
      if (config.verbose) {
        const n = Object.keys(rules).filter((k) => k !== '_comment' && resolved[k]).length;
        if (n) console.log(`Applied ${n} category override(s)`);
      }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/category-overrides.test.js && npm test`
Expected: PASS — new tests green, 123 existing tests still green.

- [ ] **Step 6: Commit**

```bash
cd ~/LLM/detechtor
git add patterns/category-overrides.json src/detechtor.js tests/category-overrides.test.js
git commit -m "feat(uni-235): apply category overrides at load, after identity resolution

Ordering matters: overrides run AFTER resolveIdentities so a rule names the surviving canonical
technology rather than a spelling variant that was just merged away.

loadPatterns() gains {applyOverrides:false} for the validator, which needs the pristine map — a
valid override read against an already-overridden map looks like a no-op."
```

---

### Task 3: Gate the override file in CI

**Files:**
- Modify: `scripts/category-audit.js` (imports near line 38; report and `--gate` block near lines 289-300)

**Interfaces:**
- Consumes: `validateOverrides` from Task 1
- Produces: `findings.OVERRIDE_INVALID` in `docs/category-audit.json`; a non-zero exit from `--gate` on any invalid override.

- [ ] **Step 1: Add the check to `scripts/category-audit.js`**

After line 38's requires, add:

```js
const { validateOverrides } = require('../src/category-overrides.js');
const CATEGORY_OVERRIDES = require('../patterns/category-overrides.json');
```

After the `findings` object is populated (immediately before the `--- report ---` banner at line 149), add:

```js
// --- OVERRIDE_INVALID ------------------------------------------------------------------------
// A decision recorded in patterns/category-overrides.json must still make sense against the
// patterns actually on disk. This is what makes the override layer durable: an upstream reimport
// that renames or drops a technology, or that folds our decision into the base, fails the build
// here instead of leaving a stale rule nobody notices.
const pristine = new DeTECHtor().loadPatterns({ applyOverrides: false });
findings.OVERRIDE_INVALID = validateOverrides(pristine, CATEGORY_OVERRIDES.overrides || {});
```

In the report block, after the `UNKNOWN_CATEGORY` line (line 158), add:

```js
console.log(`OVERRIDE_INVALID    ${findings.OVERRIDE_INVALID.length}`);
```

And before the `MISSING_SIGNAL` console line, leave ordering as-is. Then after the `UNKNOWN_CATEGORY` detail block (line 193), add:

```js
if (findings.OVERRIDE_INVALID.length) {
  console.log(`\nOVERRIDE_INVALID — patterns/category-overrides.json disagrees with the patterns on disk:`);
  for (const f of findings.OVERRIDE_INVALID) console.log(`   ${f.name.padEnd(34)} ${f.problem}`);
}
```

- [ ] **Step 2: Add it to the gate**

Replace the `--gate` block (lines 289-300) with:

```js
if (GATE) {
  const fail = signalCollisions.length + findings.SIGNAL_CASE_DROP.length +
    findings.CATEGORY_CASE.length + findings.DUPLICATE_CATEGORY.length +
    findings.OVERRIDE_INVALID.length;
  if (fail) {
    console.error(`\nFAIL: ${signalCollisions.length} signal-differing collisions, ` +
      `${findings.SIGNAL_CASE_DROP.length} case-dropped signals, ` +
      `${findings.CATEGORY_CASE.length} miscased categories, ` +
      `${findings.DUPLICATE_CATEGORY.length} duplicate categories, ` +
      `${findings.OVERRIDE_INVALID.length} invalid overrides`);
    process.exit(1);
  }
  console.log('\nOK: no mechanical category defects.');
}
```

- [ ] **Step 3: Verify the gate passes on an empty override file**

Run: `node scripts/category-audit.js --gate`
Expected: `OVERRIDE_INVALID    0` and `OK: no mechanical category defects.`, exit 0.

- [ ] **Step 4: Verify the gate actually bites**

Run:

```bash
cd ~/LLM/detechtor
python3 - <<'PY'
import json
p='patterns/category-overrides.json'
d=json.load(open(p))
d['overrides']['Ghost Technology That Does Not Exist']={"categories":["CRM"]}
json.dump(d,open(p,'w'),indent=2)
PY
node scripts/category-audit.js --gate; echo "exit=$?"
git checkout patterns/category-overrides.json
```

Expected: `exit=1` with `1 invalid overrides`, then the file is restored.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd ~/LLM/detechtor
npm test
git add scripts/category-audit.js
git commit -m "feat(uni-235): gate the override file — a stale decision fails the build

The point of the override layer is durability across a webappanalyzer reimport. That only holds
if drift is loud: an override naming a technology that no longer exists, targeting a
non-canonical category, or that has become a no-op now exits 1 from category-audit.js --gate,
which npm test already runs."
```

---

### Task 4: Name-token pre-pass

**Files:**
- Create: `scripts/category-nametoken-audit.js`
- Modify: `package.json` (add `audit:nametoken` script)
- Create (generated): `docs/category-nametoken-queue.json`

**Interfaces:**
- Consumes: `DeTECHtor`, `mapCategory`, `CANONICAL_CATEGORIES`
- Produces: `docs/category-nametoken-queue.json` shaped `{generated, ticket, note, candidates: [{name, token, current, curated, source, description}]}`

- [ ] **Step 1: Write the script**

Create `scripts/category-nametoken-audit.js`:

```js
#!/usr/bin/env node
/**
 * Name-token category screen (UNI-235)
 * ====================================
 * The existing MISSING_SIGNAL check in category-audit.js matches DESCRIPTIONS and is mostly noise:
 * 293 candidates of which 5 mattered. A vendor mentioning "CRM" in prose is not thereby a CRM.
 *
 * Matching the NAME is a far stronger claim, and measurably so — 31 candidates across all 6,504
 * technologies, at high apparent precision. All 15 products with "CRM" in the name sit in
 * `Business Software`; all 6 with "Accessibility" in the name sit in `JavaScript Framework`, and
 * `Accessibility` holds only 10 technologies in total, so that is a live false-negative pool
 * containing real higher-ed vendors (eSSENTIAL Accessibility, Accessible360).
 *
 * Reports; never rewrites. `Blackbaud CRM` is currently `Fundraising` and is genuinely both;
 * `Rapid Search` may be ecommerce product search rather than site search. A human settles those.
 *
 * Usage:
 *   node scripts/category-nametoken-audit.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DeTECHtor = require('../src/detechtor.js');
const { mapCategory } = require('../src/category-mapping.js');

// Word-boundary tokens matched against the technology NAME only.
const TOKENS = {
  CRM: /\bCRM\b/i,
  CMS: /\bCMS\b/i,
  LMS: /\bLMS\b/i,
  SIS: /\bSIS\b/i,
  Chatbot: /\b(chat|chatbot)\b/i,
  'Site Search': /\bsearch\b/i,
  Accessibility: /\b(accessib\w*|a11y)\b/i,
  'Marketing Automation': /\bmarketing\b/i,
};

const engine = new DeTECHtor();
const techs = Object.entries(engine.patterns)
  .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object');

const candidates = [];
for (const [name, def] of techs) {
  const current = ((def.categories || def.cats) || []).map(mapCategory);
  for (const [category, re] of Object.entries(TOKENS)) {
    if (!re.test(name)) continue;
    if (current.includes(category)) continue;
    candidates.push({
      name,
      token: category,
      current,
      curated: !!def._curated,
      source: def._sourceFile || null,
      description: (def.description || '').slice(0, 200),
    });
  }
}

const byToken = new Map();
for (const c of candidates) byToken.set(c.token, (byToken.get(c.token) || 0) + 1);

console.log(`name-token screen — ${candidates.length} candidates across ${techs.length} technologies\n`);
console.log('TOKEN IN NAME'.padEnd(24), 'NOT FILED THERE');
for (const [k, v] of [...byToken].sort((a, b) => b[1] - a[1])) {
  console.log(k.padEnd(24), String(v).padStart(5));
}
for (const token of Object.keys(TOKENS)) {
  const sub = candidates.filter((c) => c.token === token);
  if (!sub.length) continue;
  console.log(`\n--- ${token} (${sub.length}) ---`);
  for (const c of sub) {
    console.log(`   ${c.curated ? 'CURATED' : '       '} ${c.name.padEnd(40)} ${JSON.stringify(c.current)}`);
  }
}

const out = path.resolve(__dirname, '../docs/category-nametoken-queue.json');
fs.writeFileSync(out, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  ticket: 'UNI-235',
  note: 'Technologies whose NAME contains a category token but which are not filed there. A SCREEN, ' +
        'not a verdict — adjudicate each. Confirmed decisions go to patterns/category-overrides.json.',
  candidates,
}, null, 2));
console.log(`\nwrote ${out}`);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after the `"audit:categories"` line, add:

```json
    "audit:nametoken": "node scripts/category-nametoken-audit.js",
```

- [ ] **Step 3: Run it**

Run: `npm run audit:nametoken`
Expected: ~31 candidates; `CRM 15`, `Accessibility 6`, `Marketing Automation 5`, `Site Search 3`, plus one each for `Chatbot` and `CMS`. Writes `docs/category-nametoken-queue.json`.

- [ ] **Step 4: Commit the tool and its output**

```bash
cd ~/LLM/detechtor
npm test
git add scripts/category-nametoken-audit.js package.json docs/category-nametoken-queue.json
git commit -m "audit(uni-235): name-token category screen — 31 candidates at high precision

The existing MISSING_SIGNAL screen matches descriptions: 293 candidates, 5 that mattered. The
NAME is a much stronger claim — 31 candidates total. All 15 products with CRM in the name sit in
Business Software; all 6 with Accessibility in the name sit in JavaScript Framework, against a
category holding only 10 technologies, so that pool is a live false negative containing real
higher-ed vendors.

Reports rather than rewrites: Blackbaud CRM is genuinely both CRM and Fundraising."
```

- [ ] **Step 5: HUMAN GATE — adjudicate the 31**

Present `docs/category-nametoken-queue.json` to Joel as a table. For each confirmed
reassignment, add an entry to `patterns/category-overrides.json`:

```json
    "Ellucian CRM Recruit": {
      "categories": ["CRM"],
      "was": ["Business Software", "HR / Recruiting"],
      "reason": "Ellucian's admissions CRM. HR/Recruiting is employee recruiting — a different thing.",
      "decided": "2026-08-09"
    }
```

Then run `npm test` (the Task 3 gate validates every entry) and commit:

```bash
git add patterns/category-overrides.json
git commit -m "fix(uni-235): land confirmed name-token category reassignments"
```

---

### Task 5: Gold-set fixture and model calibration

**Files:**
- Create: `tests/fixtures/category-gold-set.json`
- Create: `scripts/category-llm-audit.js` (calibrate mode only; the sweep lands in Task 7)
- Modify: `package.json` (add `audit:llm:calibrate`)

**Interfaces:**
- Produces: `askModel(model, packet) -> Promise<{verdict, correct_category, known, confidence, reason}|{error}>`, `buildPrompt(entry) -> string`, `SYSTEM_PROMPT`, and `scoreGoldSet(model) -> Promise<{correct, falseFlags, missedFlags, seconds}>` — all reused by Task 7.

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/category-gold-set.json`. Every case is a real UNI-233 outcome — 4 pre-fix
states that must be flagged, 8 current-correct that must not, three of them deliberate traps:

```json
{
  "_comment": "UNI-235 model calibration. Cases are REAL UNI-233 decisions, not invented ones. expect=FLAG means the listed categories are wrong; expect=OK means they are right. A qualifying model scores >=10/12 with ZERO missed flags — recall matters more than precision here because every flag reaches a human anyway.",
  "cases": [
    { "name": "Slate", "cats": ["Chatbot", "Business Software"], "desc": "Technolutions Slate — higher-ed admissions/enrollment platform. Fingerprinted via the technolutions.net host.", "expect": "FLAG", "want": "CRM", "note": "pre-fix state; UNI-233 decided CRM" },
    { "name": "Salesforce Education Cloud", "cats": ["Chatbot", "Business Software"], "desc": "Customer relationship management platform", "expect": "FLAG", "want": "CRM", "note": "pre-fix state" },
    { "name": "HubSpot for Education", "cats": ["JavaScript Framework", "Chatbot"], "desc": "HubSpot CRM optimized for education", "expect": "FLAG", "want": "CRM", "note": "pre-fix state" },
    { "name": "Ellucian CRM Recruit", "cats": ["Business Software", "HR / Recruiting"], "desc": "Ellucian CRM Recruit is a comprehensive solution that supports your entire recruiting and admissions lifecycle.", "expect": "FLAG", "want": "CRM", "note": "LIVE known mismatch, 18 institutions. cogito:70b missed this one — it is the single most important case in the set." },
    { "name": "HubSpot CMS Hub", "cats": ["CMS"], "desc": "HubSpot CMS Hub — the content-hosting product, distinct from generic HubSpot marketing/forms/chat embeds (tracked separately as Marketing Automation).", "expect": "OK", "want": "CMS", "note": "TRAP: description mentions marketing and chat" },
    { "name": "TargetX", "cats": ["CRM"], "desc": "TargetX — Salesforce-native admissions/recruitment CRM built for higher education (now part of Liaison International).", "expect": "OK", "want": "CRM", "note": "TRAP: Salesforce-native, may be pulled to Business Software" },
    { "name": "accessiBe", "cats": ["Accessibility"], "desc": "accessiBe accessibility overlay, loaded from acsbapp.com / accessibe.com.", "expect": "OK", "want": "Accessibility", "note": "TRAP: is a JS widget/overlay" },
    { "name": "Modern Campus CMS", "cats": ["CMS"], "desc": "Modern Campus CMS (formerly OU Campus / OmniCMS by OmniUpdate) content management system for higher education.", "expect": "OK", "want": "CMS" },
    { "name": "Slate (Technolutions)", "cats": ["CRM"], "desc": "Technolutions Slate — the dominant higher-ed admissions/enrollment CRM.", "expect": "OK", "want": "CRM" },
    { "name": "LiveChat", "cats": ["Chatbot"], "desc": "LiveChat (Text s.c.) live-chat widget, loaded from cdn.livechatinc.com.", "expect": "OK", "want": "Chatbot", "note": "Known contested: models object that live chat is not a chatbot. That is a dispute with our category NAME, tracked as a follow-on, not a model failure." },
    { "name": "Ellucian Banner", "cats": ["SIS"], "desc": "Ellucian Banner is a comprehensive student information system used by higher education institutions.", "expect": "OK", "want": "SIS" },
    { "name": "Cloudflare", "cats": ["CDN"], "desc": "Cloudflare is a web infrastructure and website security company providing CDN and DDoS mitigation.", "expect": "OK", "want": "CDN" }
  ]
}
```

- [ ] **Step 2: Write the script with calibrate mode**

Create `scripts/category-llm-audit.js`:

```js
#!/usr/bin/env node
/**
 * Local-model category adjudication (UNI-235)
 * ===========================================
 * Asks whether a technology is FILED under the right category. Runs entirely against local Ollama
 * models — no API, no cost.
 *
 * Four measurements from the design pass govern this file. Do not undo them without re-measuring:
 *
 *  1. UNION, NOT INTERSECTION. cogito:70b scored best overall (11/12) yet missed Ellucian CRM
 *     Recruit — the one live mismatch that matters. Requiring model agreement would delete exactly
 *     the findings worth having. Flag if EITHER model objects; disagreement is `contested`.
 *  2. CONFIDENCE IS WORTHLESS. Every answer came back 0.9–1.0, including all four wrong ones.
 *     Recorded, never gated on.
 *  3. VERDICT IS RELIABLE, PROPOSED CATEGORY IS NOT. Both models flagged Slate correctly and both
 *     proposed SIS. `correct_category` is advisory metadata for the human, never applied.
 *  4. THE NAME BEATS THE DESCRIPTION. Evidence packets lead with name and detection hosts;
 *     description comes last.
 *
 * Usage:
 *   node scripts/category-llm-audit.js --calibrate --models mistral-small3.2:24b,nemotron-3-nano:30b
 *   node scripts/category-llm-audit.js --sweep     --models mistral-small3.2:24b,nemotron-3-nano:30b
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { CANONICAL_CATEGORIES } = require('../src/category-mapping.js');

const OLLAMA = { host: process.env.OLLAMA_HOST || '127.0.0.1', port: Number(process.env.OLLAMA_PORT || 11434) };

const SYSTEM_PROMPT = `You classify web technologies into categories for a higher-education website scanner.

Allowed categories: ${[...CANONICAL_CATEGORIES].sort().join(', ')}

You are given a technology's name, its current assigned categories, the hosts and markers it is
detected by, and a description. Decide whether the CURRENT categories correctly describe what this
product IS.

Rules:
- Judge the product's PRIMARY function, not incidental features it also has.
- A product BUILT ON another vendor's platform is categorised by what it DOES, not what it runs on.
- The detection hosts are strong evidence of the real vendor. Trust them over marketing prose.
- If you do not recognise the product, set "known": false and verdict "OK". Never guess.
- Reply with ONLY a JSON object, no prose:
{"verdict":"OK"|"FLAG","correct_category":"<one allowed category>","known":true|false,"confidence":0.0-1.0,"reason":"<15 words max>"}`;

/** One Ollama chat call. Never throws — a failure is returned as {error} so a sweep continues. */
function askModel(model, userPrompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      stream: false,
      format: 'json',
      // ⚠️ REASONING MODELS. num_predict must cover thinking tokens AS WELL AS the JSON, because
      // they share the budget. nemotron-3-nano:30b emits ~900 thinking chars and at 600 it
      // truncated mid-JSON on exactly the two hardest FLAG cases — which scored as misses and
      // would have silently disqualified a good model. 3000 is comfortable for every model tested.
      options: { temperature: 0, num_predict: 3000 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      keep_alive: '30m',
    });
    const req = http.request({
      host: OLLAMA.host, port: OLLAMA.port, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(JSON.parse(s).message.content)); }
        catch (err) { resolve({ error: `unparseable response: ${String(err).slice(0, 80)}` }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(180000, () => { req.destroy(); resolve({ error: 'timeout after 180s' }); });
    req.write(body);
    req.end();
  });
}

/** Evidence packet. Order matters: name first, description last — the name is the stronger feature. */
function buildPrompt(entry) {
  const lines = [`Technology: ${entry.name}`, `Current categories: ${JSON.stringify(entry.cats)}`];
  if (entry.hosts && entry.hosts.length) lines.push(`Detected by: ${entry.hosts.slice(0, 6).join(', ')}`);
  if (entry.cooccurs && entry.cooccurs.length) lines.push(`Commonly appears alongside: ${entry.cooccurs.slice(0, 5).join(', ')}`);
  if (typeof entry.institutions === 'number') lines.push(`Seen on ${entry.institutions} institution homepages`);
  lines.push(`Description: ${entry.desc || '(none)'}`);
  return lines.join('\n');
}

async function scoreGoldSet(model) {
  const fixture = require(path.resolve(__dirname, '../tests/fixtures/category-gold-set.json'));
  let correct = 0, falseFlags = 0, missedFlags = 0;
  const rows = [];
  const t0 = Date.now();
  for (const c of fixture.cases) {
    const r = await askModel(model, buildPrompt({ name: c.name, cats: c.cats, desc: c.desc }));
    const verdict = (r.verdict || 'ERR').toUpperCase();
    const ok = verdict === c.expect;
    if (ok) correct++;
    else if (verdict === 'FLAG') falseFlags++;
    else missedFlags++;   // 'OK' when FLAG expected, or ERR — both mean a real mismatch went unseen
    rows.push({ name: c.name, expect: c.expect, got: verdict, ok, reason: r.reason || r.error || '' });
    console.log(`  ${ok ? '✅' : '❌'} ${c.name.padEnd(28)} want=${c.expect.padEnd(4)} got=${verdict.padEnd(4)} ${(r.reason || r.error || '').slice(0, 50)}`);
  }
  const seconds = (Date.now() - t0) / 1000;
  return { model, correct, total: fixture.cases.length, falseFlags, missedFlags, seconds, rows };
}

async function main() {
  const args = process.argv.slice(2);
  const mi = args.indexOf('--models');
  const models = mi === -1 ? ['mistral-small3.2:24b'] : args[mi + 1].split(',');

  if (args.includes('--calibrate')) {
    const results = [];
    for (const m of models) {
      console.log(`\n${'='.repeat(90)}\nCALIBRATE: ${m}\n${'='.repeat(90)}`);
      const r = await scoreGoldSet(m);
      results.push(r);
      console.log(`\n  ${r.correct}/${r.total}  falseFlags=${r.falseFlags}  missedFlags=${r.missedFlags}  ` +
        `${r.seconds.toFixed(0)}s (${(r.seconds / r.total).toFixed(1)}s each)`);
      console.log(`  extrapolated over 6,504 technologies: ${((r.seconds / r.total) * 6504 / 3600).toFixed(1)} h`);
    }
    const out = path.resolve(__dirname, '../docs/category-llm-calibration.json');
    fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), results }, null, 2));
    console.log(`\nwrote ${out}`);

    // The bar is on the PAIR, not each model. The combiner is a union, so what matters is that
    // BETWEEN them every FLAG case is caught; an individual model missing one is tolerable.
    //
    // This is not a loosened standard, it is the right one. Measured: nemotron-3-nano:30b and
    // cogito:70b BOTH miss Ellucian CRM Recruit with identical reasoning ("primary function is
    // recruitment/admissions" → HR / Recruiting). mistral-small3.2:24b catches it. Scoring models
    // individually would have rejected a model whose real contribution is covering the cases the
    // anchor misses.
    //
    // Each model must still clear >=9/12 so we never pair the anchor with a dud.
    const fixture = require(path.resolve(__dirname, '../tests/fixtures/category-gold-set.json'));
    const flagCases = fixture.cases.filter((c) => c.expect === 'FLAG').map((c) => c.name);
    const caughtByUnion = flagCases.filter((name) =>
      results.some((r) => r.rows.find((row) => row.name === name && row.got === 'FLAG')));
    const weak = results.filter((r) => r.correct < 9);

    console.log(`\nUNION RECALL: ${caughtByUnion.length}/${flagCases.length} flag cases caught by at least one model`);
    const missedByAll = flagCases.filter((n) => !caughtByUnion.includes(n));
    if (missedByAll.length) console.error(`  MISSED BY EVERY MODEL: ${missedByAll.join(', ')}`);

    if (missedByAll.length || weak.length) {
      console.error(`\n⚠️  NOT QUALIFIED: ` +
        (missedByAll.length ? `${missedByAll.length} flag case(s) no model caught. ` : '') +
        (weak.length ? `${weak.map((w) => w.model).join(', ')} below 9/12. ` : '') +
        `Add or swap a model before sweeping.`);
      process.exit(1);
    }
    console.log(`\nOK: the pair qualifies — union catches every flag case.`);
    return;
  }

  console.error('Nothing to do. Pass --calibrate (or --sweep, added in Task 7).');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { askModel, buildPrompt, scoreGoldSet, SYSTEM_PROMPT };
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after `"audit:nametoken"`, add:

```json
    "audit:llm:calibrate": "node scripts/category-llm-audit.js --calibrate --models mistral-small3.2:24b,nemotron-3-nano:30b",
```

- [ ] **Step 4: Calibrate the anchor model**

Run: `node scripts/category-llm-audit.js --calibrate --models mistral-small3.2:24b`
Expected: 10/12, `missedFlags=0`, exit 0. This reproduces the design-pass measurement.

- [ ] **Step 5: Calibrate the second model**

Run: `node scripts/category-llm-audit.js --calibrate --models nemotron-3-nano:30b`

If it scores ≥10/12 with 0 missed flags, it qualifies. If not, try `qwen3:30b-a3b`
(`ollama pull qwen3:30b-a3b` first) and use whichever qualifies. Record the qualifying pair —
Task 7's sweep uses it. Do not proceed to Task 7 with an unqualified model.

- [ ] **Step 6: Commit**

```bash
cd ~/LLM/detechtor
npm test
git add tests/fixtures/category-gold-set.json scripts/category-llm-audit.js package.json docs/category-llm-calibration.json
git commit -m "feat(uni-235): gold-set fixture + model calibration mode

Twelve cases, all real UNI-233 decisions — 4 pre-fix states that must be flagged, 8 current-correct
including three traps. Ellucian CRM Recruit is the load-bearing case: cogito:70b missed it while
scoring highest overall, which is why the bar is >=10/12 with ZERO missed flags rather than raw
accuracy. Recall matters more here because every flag reaches a human but a miss is invisible.

Makes swapping a model or editing the prompt a measurement instead of a guess."
```

---

### Task 6: Full-corpus prevalence

**Files:**
- Create: `scripts/corpus-prevalence.js`
- Modify: `package.json` (add `prevalence`)
- Create (generated): `docs/corpus-prevalence.json`

**Interfaces:**
- Produces: `docs/corpus-prevalence.json` shaped `{generated, scanned, unscannable, note, counts: {tech: n}, cooccurs: {tech: [names]}}`. Task 7 reads `counts` and `cooccurs`.

- [ ] **Step 1: Write the script**

Create `scripts/corpus-prevalence.js`:

```js
#!/usr/bin/env node
/**
 * Full-corpus technology prevalence (UNI-235)
 * ===========================================
 * How many institution homepages each technology actually fires on. This is what makes a 6,504-row
 * review queue finite: on a 133-institution sample only 424 technologies fired at all, and 19
 * categories fired zero times. A miscategorised technology on 100 institutions matters; one that
 * never fires does not.
 *
 * ⚠️ Homepage corpus only. A technology may appear on interior pages (UNI-225 tiered detection) or
 * be present but undetected. Zero here means DEPRIORITISED, never "proven absent".
 *
 * ⚠️ UNI-231: unscannable (bot-blocked) captures are excluded from the denominator. Dividing by
 * unreadable pages understates every prevalence figure.
 *
 * Usage:
 *   node scripts/corpus-prevalence.js [--limit N] [--shards N]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORPUS = path.resolve(ROOT, process.env.CORPUS_DIR || 'corpus');

function listDirs() {
  return fs.readdirSync(CORPUS)
    .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
    .sort();
}

// ---------- child ----------
if (process.env.PREVALENCE_SHARD !== undefined) {
  const DeTECHtor = require('../src/detechtor.js');
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const { classifyCapture } = require('../src/capture-quality.js');

  const shard = Number(process.env.PREVALENCE_SHARD);
  const shards = Number(process.env.PREVALENCE_SHARDS);
  const limit = Number(process.env.PREVALENCE_LIMIT || 0);

  const engine = new DeTECHtor();
  let dirs = listDirs();
  if (limit) dirs = dirs.slice(0, limit);
  dirs = dirs.filter((_, i) => i % shards === shard);

  const counts = Object.create(null);
  const cooc = Object.create(null);
  let scanned = 0, unscannable = 0;

  for (const d of dirs) {
    let html;
    try {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      if (!f) continue;
      html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    } catch { continue; }

    if (!classifyCapture(html).scannable) { unscannable++; continue; }
    scanned++;

    let names;
    try {
      names = engine.matchPatterns(evidenceFromHtml(html, engine.domPlan)).map((h) => h.name);
    } catch { continue; }

    const uniq = [...new Set(names)];
    for (const n of uniq) counts[n] = (counts[n] || 0) + 1;
    for (const n of uniq) {
      if (!cooc[n]) cooc[n] = Object.create(null);
      for (const m of uniq) if (m !== n) cooc[n][m] = (cooc[n][m] || 0) + 1;
    }
  }

  process.send({ scanned, unscannable, counts, cooc });
  process.exit(0);
}

// ---------- parent ----------
const args = process.argv.slice(2);
const li = args.indexOf('--limit');
const LIMIT = li === -1 ? 0 : Number(args[li + 1]);
const si = args.indexOf('--shards');
const SHARDS = si === -1 ? Math.max(1, Math.min(os.cpus().length - 2, 12)) : Number(args[si + 1]);

if (!fs.existsSync(CORPUS)) {
  console.error(`FATAL: no corpus at ${CORPUS}. Set CORPUS_DIR or fetch it with scripts/wasabi-corpus.js.`);
  process.exit(1);
}

const total = LIMIT || listDirs().length;
console.log(`corpus prevalence — ${total} captures across ${SHARDS} shards\n`);

const merged = { scanned: 0, unscannable: 0, counts: Object.create(null), cooc: Object.create(null) };
let done = 0;
const t0 = Date.now();

for (let i = 0; i < SHARDS; i++) {
  const child = fork(__filename, [], {
    env: { ...process.env, PREVALENCE_SHARD: String(i), PREVALENCE_SHARDS: String(SHARDS), PREVALENCE_LIMIT: String(LIMIT) },
  });
  child.on('message', (m) => {
    merged.scanned += m.scanned;
    merged.unscannable += m.unscannable;
    for (const [k, v] of Object.entries(m.counts)) merged.counts[k] = (merged.counts[k] || 0) + v;
    for (const [k, inner] of Object.entries(m.cooc)) {
      if (!merged.cooc[k]) merged.cooc[k] = Object.create(null);
      for (const [k2, v] of Object.entries(inner)) merged.cooc[k][k2] = (merged.cooc[k][k2] || 0) + v;
    }
  });
  child.on('exit', () => {
    done++;
    console.log(`  shard ${done}/${SHARDS} complete`);
    if (done === SHARDS) finish();
  });
}

function finish() {
  // Keep only the top 8 co-occurring technologies each — the full matrix is ~900x900 and nothing
  // downstream reads past the head of it.
  const cooccurs = {};
  for (const [k, inner] of Object.entries(merged.cooc)) {
    cooccurs[k] = Object.entries(inner).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
  }

  const out = path.resolve(ROOT, 'docs/corpus-prevalence.json');
  fs.writeFileSync(out, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    ticket: 'UNI-235',
    scanned: merged.scanned,
    unscannable: merged.unscannable,
    note: 'Institutions on which each technology fires, over the homepage corpus. Unscannable ' +
          'captures excluded per UNI-231. Homepage-only: absence here means DEPRIORITISED, never ' +
          'proven absent — a technology may live on interior pages (UNI-225) or be undetected.',
    counts: merged.counts,
    cooccurs,
  }, null, 2));

  const secs = (Date.now() - t0) / 1000;
  console.log(`\nscanned ${merged.scanned} scannable (${merged.unscannable} unscannable) in ${(secs / 60).toFixed(1)} min`);
  console.log(`distinct technologies firing: ${Object.keys(merged.counts).length}`);
  console.log(`wrote ${out}`);
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after `"audit:llm:calibrate"`, add:

```json
    "prevalence": "node scripts/corpus-prevalence.js",
```

- [ ] **Step 3: Smoke-test on a slice**

Run: `node scripts/corpus-prevalence.js --limit 60 --shards 4`
Expected: completes in well under a minute; reports a non-zero scanned count and writes
`docs/corpus-prevalence.json`.

- [ ] **Step 4: Run the full corpus**

Run: `npm run prevalence`
Expected: ~4,214 captures, roughly 10–20 minutes across shards, several hundred distinct
technologies firing. Confirm `scanned + unscannable` is close to the corpus size and that
`unscannable` is around 8–11% (consistent with UNI-231).

- [ ] **Step 5: Commit**

```bash
cd ~/LLM/detechtor
npm test
git add scripts/corpus-prevalence.js package.json docs/corpus-prevalence.json
git commit -m "feat(uni-235): full-corpus prevalence, sharded across cores

What makes a 6,504-row review queue finite. On a 133-institution sample only 424 technologies
fired at all and 19 categories fired zero times, so ranking by institutions affected is the
difference between a workable queue and an unworkable one.

Excludes unscannable captures per UNI-231. Homepage-only, and the output says so: zero prevalence
means deprioritised, never proven absent."
```

---

### Task 7: The sweep

**Files:**
- Modify: `scripts/category-llm-audit.js` (add `--sweep`)
- Modify: `package.json` (add `audit:llm:sweep`)
- Create (generated): `docs/category-llm-verdicts.jsonl`

**Interfaces:**
- Consumes: `askModel`, `buildPrompt` (Task 5); `docs/corpus-prevalence.json` (Task 6)
- Produces: `docs/category-llm-verdicts.jsonl`, one JSON object per line:
  `{name, cats, institutions, verdicts: {<model>: {verdict, correct_category, known, confidence, reason}}}`

- [ ] **Step 1: Add the sweep to `scripts/category-llm-audit.js`**

Insert before `async function main()`:

```js
/** Detection hosts/markers — the strongest evidence after the name. */
function evidenceHosts(def) {
  const out = [];
  const push = (v) => { if (typeof v === 'string') out.push(v.replace(/\\\\/g, '').slice(0, 60)); };
  for (const f of ['scriptSrc', 'url', 'html', 'text', 'network']) {
    const v = def[f];
    if (Array.isArray(v)) v.forEach(push);
    else push(v);
  }
  for (const f of ['js', 'meta', 'headers', 'cookies']) {
    if (def[f] && typeof def[f] === 'object') out.push(...Object.keys(def[f]).slice(0, 4));
  }
  if (def.dom) out.push(...(Array.isArray(def.dom) ? def.dom : Object.keys(def.dom)).slice(0, 3).map(String));
  return [...new Set(out)].filter(Boolean);
}

/** Already-completed technologies, so an interrupted multi-hour run resumes instead of restarting. */
function loadCheckpoint(file) {
  const done = new Map();
  if (!fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); done.set(r.name, r); } catch { /* truncated final line */ }
  }
  return done;
}

async function sweep(models, opts = {}) {
  // Prevalence floor at which a technology earns the slower models' opinions. 1 = anything that
  // fires at all. Raise it to shorten a run; the anchor still covers everything.
  const SECOND_MIN = opts.secondMin ?? 1;
  const PILOT = opts.pilot ?? 0;
  const DeTECHtor = require('../src/detechtor.js');
  const { mapCategory } = require('../src/category-mapping.js');
  const engine = new DeTECHtor();

  const prevPath = path.resolve(__dirname, '../docs/corpus-prevalence.json');
  if (!fs.existsSync(prevPath)) {
    console.error('FATAL: docs/corpus-prevalence.json missing. Run `npm run prevalence` first — ' +
      'without it the queue cannot be ranked and is unworkable.');
    process.exit(1);
  }
  const prevalence = JSON.parse(fs.readFileSync(prevPath, 'utf8'));

  const techs = Object.entries(engine.patterns)
    .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object')
    // Highest-impact first, so an interrupted run has still covered what matters.
    .sort((a, b) => (prevalence.counts[b[0]] || 0) - (prevalence.counts[a[0]] || 0));

  const ranked = PILOT ? techs.slice(0, PILOT) : techs;
  const outFile = path.resolve(__dirname,
    PILOT ? '../docs/category-llm-verdicts-pilot.jsonl' : '../docs/category-llm-verdicts.jsonl');
  const done = loadCheckpoint(outFile);
  console.log(`${PILOT ? `PILOT (top ${PILOT} by prevalence)` : 'sweep'} — ${ranked.length} technologies, ` +
    `${done.size} already done, models: ${models.join(', ')}`);

  const stream = fs.createWriteStream(outFile, { flags: 'a' });
  let n = 0;
  const t0 = Date.now();

  for (const [name, def] of ranked) {
    n++;
    if (done.has(name)) continue;

    const cats = ((def.categories || def.cats) || []).map(mapCategory);
    const packet = {
      name,
      cats,
      hosts: evidenceHosts(def),
      cooccurs: prevalence.cooccurs[name] || [],
      institutions: prevalence.counts[name] || 0,
      desc: (def.description || '').slice(0, 300),
    };
    const prompt = buildPrompt(packet);

    // TIERED. EVERY technology is judged by the anchor (models[0]); the slower models are spent
    // only where a mistake can change a result — technologies firing on >= SECOND_MIN institutions.
    //
    // Measured on the real corpus (not the sample): 1,028 of 6,504 technologies fire at all.
    //   mistral-small3.2:24b  2.0s x 6,504  = 3.6h   (all)
    //   nemotron-3-nano:30b   8.3s x 1,028  = 2.4h   (firing only)
    //   gpt-oss:20b           2.8s x 1,028  = 0.8h   (firing only)
    //                                        ~6.8h total, ~53 GB resident — one overnight run.
    //
    // THREE models rather than two, because the calibration exposed a single point of failure:
    // union recall on Ellucian CRM Recruit rested entirely on the anchor, whose stated reason was
    // "Product name includes 'CRM'" — possibly substring matching rather than comprehension, and
    // n=4 FLAG cases cannot tell those apart. A third independent opinion on everything that fires
    // means no single model's blind spot is load-bearing. The inert tail still gets full
    // single-model coverage, so nothing goes unjudged.
    //
    // Which models ran is recorded per row so the queue can distinguish "all agreed" from
    // "only one looked".
    const useSecond = packet.institutions >= SECOND_MIN;
    const active = useSecond ? models : models.slice(0, 1);

    const verdicts = {};
    for (const m of active) verdicts[m] = await askModel(m, prompt);

    stream.write(JSON.stringify({
      name, cats, institutions: packet.institutions,
      curated: !!def._curated, source: def._sourceFile || null,
      description: packet.desc, models: active, verdicts,
    }) + '\n');

    if (n % 50 === 0) {
      const rate = (Date.now() - t0) / 1000 / n;
      console.log(`  ${n}/${ranked.length}  ~${((ranked.length - n) * rate / 60).toFixed(0)} min remaining`);
    }
  }

  stream.end();
  console.log(`\nwrote ${outFile}`);
}
```

Then in `main()`, before the final `console.error`, add:

```js
  if (args.includes('--sweep')) {
    const smi = args.indexOf('--second-min');
    const pli = args.indexOf('--pilot');
    await sweep(models, {
      secondMin: smi === -1 ? 1 : Number(args[smi + 1]),
      // --pilot N adjudicates only the N highest-prevalence technologies, so the sweep's output
      // can be judged in ~20 minutes instead of after a full overnight run. Writes to a separate
      // file so a pilot never pollutes the real sweep's checkpoint.
      pilot: pli === -1 ? 0 : Number(args[pli + 1]),
    });
    return;
  }
```

- [ ] **Step 1b: Two prompt additions, grounded in owner feedback**

Both come from real corrections and are NOT fixture tuning. Add them to `SYSTEM_PROMPT`, then
**re-run `--calibrate` and confirm the models still qualify** — changing the prompt invalidates the
previous calibration, so it must be re-measured before any sweep runs.

1. **State the higher-education context.** Correctness here is context-dependent: Workday is HR and
   finance software in general but an SIS in higher ed, so a model reasoning from world knowledge
   will confidently flag `Workday Student → SIS` as wrong when it is right. Without this, the sweep
   false-flags precisely the HE-specific vendors that matter most. Say the scanner covers
   higher-education institution websites and that categories should be judged as they apply in
   that sector.

2. **Add a distinct verdict for a name that over-claims.** `Zendesk` is filed as `Chatbot`; the
   pattern is precise (it detects the Zendesk *web widget*), but the entry is named plainly
   `Zendesk`, so the record reads "Zendesk is a chatbot" — false, since Zendesk is helpdesk
   software. The fix is a rename, not a recategorisation, and nothing in the audit could express
   that. Extend the JSON contract with `"name_overclaims": true|false` — set when the category fits
   what the pattern detects but the technology's NAME implies something broader than that. Keep it
   reported, never gated.

- [ ] **Step 2: Add the npm scripts**

In `package.json`, after `"prevalence"`, add both — the pilot exists so a bad sweep is discovered
in twenty minutes rather than after an overnight run:

```json
    "audit:llm:pilot": "node scripts/category-llm-audit.js --sweep --pilot 200 --models mistral-small3.2:24b,nemotron-3-nano:30b,gpt-oss:20b",
    "audit:llm:sweep": "caffeinate -i node scripts/category-llm-audit.js --sweep --models mistral-small3.2:24b,nemotron-3-nano:30b,gpt-oss:20b",
```

`caffeinate -i` keeps the Mac awake for the duration. The run is resumable, but resuming at 3am
helps nobody.

- [ ] **Step 3: Verify resume works before spending hours**

```bash
cd ~/LLM/detechtor
rm -f docs/category-llm-verdicts.jsonl
timeout 90 node scripts/category-llm-audit.js --sweep --models mistral-small3.2:24b
FIRST=$(wc -l < docs/category-llm-verdicts.jsonl)
timeout 90 node scripts/category-llm-audit.js --sweep --models mistral-small3.2:24b
SECOND=$(wc -l < docs/category-llm-verdicts.jsonl)
echo "first=$FIRST second=$SECOND"
```

Expected: `second > first`, and the second run logs a non-zero "already done" count — proving it
resumed rather than redoing work. Confirm the highest-prevalence technologies appear first in the
file.

- [ ] **Step 4: Set memory guards and run the full sweep**

```bash
cd ~/LLM/detechtor
rm -f docs/category-llm-verdicts.jsonl
OLLAMA_MAX_LOADED_MODELS=2 npm run audit:llm:sweep
```

**First, the pilot — do not skip it.** `npm run audit:llm:pilot` adjudicates the top 200 by
prevalence in ~20 minutes and writes `docs/category-llm-verdicts-pilot.jsonl`. Run Task 8's queue
builder over it and show the flags to the repo owner **before** starting the overnight run. A sweep
that produces noise is much cheaper to discover now.

One thing the pilot specifically tests: `Marketo Forms` is filed `["Widget", "Payment Processor"]`,
is plainly wrong, and has **no category token in its name** — so it is unreachable by the
name-token screen. Whether the models catch it is the live test of whether this sweep can find
token-less misfiles at all, which is the whole reason it exists beyond the cheap screen. Report
explicitly whether they did.

**Then the full run:** `OLLAMA_MAX_LOADED_MODELS=3 npm run audit:llm:sweep`.

Expected ~6.8 hours against measured rates — anchor 2.0 s over all 6,504 (3.6 h), nemotron 8.3 s
over the 1,028 that fire (2.4 h), gpt-oss 2.8 s over the same 1,028 (0.8 h). ~53 GB resident. If
interrupted, rerun the same command — it resumes from the JSONL.

To shorten it, raise the floor: `--second-min 5` cuts the slow models' set from 1,028 to 614,
saving roughly 2 hours. The anchor still covers all 6,504 either way, so coverage never drops —
only the depth of second opinion, and only on the least prevalent technologies.

- [ ] **Step 5: Commit the tool (not the raw verdicts)**

Add `docs/category-llm-verdicts.jsonl` to `.gitignore` — it is a large regenerable intermediate;
the reviewed queue from Task 8 is the artifact worth tracking.

```bash
cd ~/LLM/detechtor
echo "docs/category-llm-verdicts.jsonl" >> .gitignore
npm test
git add scripts/category-llm-audit.js package.json .gitignore
git commit -m "feat(uni-235): two-model sweep with union combiner and resume

Union, not intersection: cogito:70b scored best overall yet missed Ellucian CRM Recruit, the one
live mismatch that mattered. Requiring agreement deletes exactly the findings worth having, so a
flag from EITHER model counts and disagreement is recorded as contested.

Ordered by prevalence so an interrupted run has still covered the technologies that matter, and
checkpointed per verdict because a multi-hour run will be interrupted."
```

---

### Task 8: Review queue and honest-coverage report

**Files:**
- Create: `scripts/category-review-queue.js`
- Modify: `package.json` (add `audit:queue`)
- Create (generated): `docs/category-review-queue.json`

**Interfaces:**
- Consumes: `docs/category-llm-verdicts.jsonl` (Task 7)
- Produces: `docs/category-review-queue.json` shaped
  `{generated, ticket, models, coverage, flags: [...], contested: [...]}` — the artifact a human works.

- [ ] **Step 1: Write the script**

Create `scripts/category-review-queue.js`:

```js
#!/usr/bin/env node
/**
 * Review queue from sweep verdicts (UNI-235)
 * ==========================================
 * Turns docs/category-llm-verdicts.jsonl into the ranked list a human actually works, plus an
 * honest statement of what was NOT settled.
 *
 * Combiner is UNION: a flag from either model counts. Requiring agreement would have deleted the
 * Ellucian CRM Recruit finding, which was the only live mismatch in the calibration set.
 *
 * Coverage reporting is not decoration. UNI-233 closed with the semantic layer at 4 of 994 while
 * reading as "done"; this file exists so that cannot happen quietly again.
 *
 * Usage:
 *   node scripts/category-review-queue.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { SIGNAL_CATEGORIES } = require('../src/category-mapping.js');

const IN = path.resolve(__dirname, '../docs/category-llm-verdicts.jsonl');
if (!fs.existsSync(IN)) {
  console.error(`FATAL: ${IN} missing. Run \`npm run audit:llm:sweep\` first.`);
  process.exit(1);
}

const rows = fs.readFileSync(IN, 'utf8').split('\n')
  .filter((l) => l.trim())
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

const models = [...new Set(rows.flatMap((r) => Object.keys(r.verdicts || {})))];

/** Models that actually ran for this row. The sweep is tiered, so it is not always all of them. */
const ranFor = (r) => (Array.isArray(r.models) && r.models.length ? r.models : Object.keys(r.verdicts || {}));

const flags = [];
const contested = [];
const coverage = { total: rows.length, flagged: 0, contested: 0, abstained: 0, errored: 0, agreedOk: 0, inert: 0 };

for (const r of rows) {
  const ran = ranFor(r);
  const vs = ran.map((m) => r.verdicts[m] || {});
  if (!vs.length || vs.every((v) => v.error)) { coverage.errored++; continue; }
  // A model that does not recognise a product has told us nothing. Never a flag (calibration rule).
  if (vs.every((v) => v.known === false)) { coverage.abstained++; continue; }

  const objects = vs.filter((v) => String(v.verdict).toUpperCase() === 'FLAG' && v.known !== false);
  if (!objects.length) { coverage.agreedOk++; continue; }
  if (r.institutions === 0) coverage.inert++;

  const entry = {
    name: r.name,
    current: r.cats,
    institutions: r.institutions,
    curated: r.curated,
    source: r.source,
    signal: (r.cats || []).some((c) => SIGNAL_CATEGORIES.has(c)),
    // Advisory only — the calibration showed verdicts are reliable but proposed categories are not
    // (both models flagged Slate correctly and both proposed SIS).
    suggested: [...new Set(objects.map((v) => v.correct_category).filter(Boolean))],
    reasons: objects.map((v) => v.reason).filter(Boolean),
    description: r.description,
  };

  // "Contested" requires that more than one model actually LOOKED and they disagreed. On the
  // inert tail only the anchor runs, so a lone objection there is a flag, not a disagreement —
  // calling it contested would invent a second opinion that was never sought.
  entry.judgedBy = ran;
  if (objects.length === ran.length) { flags.push(entry); coverage.flagged++; }
  else { contested.push(entry); coverage.contested++; }
}

const byPrevalence = (a, b) => b.institutions - a.institutions || a.name.localeCompare(b.name);
flags.sort(byPrevalence);
contested.sort(byPrevalence);

const out = path.resolve(__dirname, '../docs/category-review-queue.json');
fs.writeFileSync(out, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  ticket: 'UNI-235',
  models,
  note: 'Union combiner: a flag from EITHER model lands here. `flags` = every model objected; ' +
        '`contested` = they disagreed. `suggested` is ADVISORY — verdicts proved reliable in ' +
        'calibration, proposed categories did not. Confirmed decisions go to ' +
        'patterns/category-overrides.json. Prevalence is homepage-only: 0 means deprioritised, ' +
        'never proven absent.',
  coverage,
  flags,
  contested,
}, null, 2));

console.log(`review queue — ${rows.length} adjudicated by ${models.join(' + ')}\n`);
console.log(`  flagged (all models object)   ${coverage.flagged}`);
console.log(`  contested (models disagree)   ${coverage.contested}`);
console.log(`  agreed OK                     ${coverage.agreedOk}`);
console.log(`  abstained (unrecognised)      ${coverage.abstained}`);
console.log(`  errored                       ${coverage.errored}`);
console.log(`\n  of the flagged, ${coverage.inert} fire on 0 institutions (real but inert)`);

console.log(`\nTOP 30 FLAGS BY INSTITUTIONS AFFECTED\n`);
for (const f of flags.slice(0, 30)) {
  console.log(`   ${String(f.institutions).padStart(4)}  ${f.signal ? '★' : ' '} ${f.name.padEnd(34)} ` +
    `${JSON.stringify(f.current).padEnd(40)} → ${f.suggested.join('/') || '?'}`);
}
console.log(`\nwrote ${out}`);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after `"audit:llm:sweep"`, add:

```json
    "audit:queue": "node scripts/category-review-queue.js",
```

- [ ] **Step 3: Run it**

Run: `npm run audit:queue`
Expected: coverage counts summing to the row total, and a top-30 table ranked by institutions.

- [ ] **Step 4: Commit**

```bash
cd ~/LLM/detechtor
npm test
git add scripts/category-review-queue.js package.json docs/category-review-queue.json
git commit -m "feat(uni-235): ranked review queue with honest-coverage reporting

Coverage reporting is the point, not decoration. UNI-233 closed reading as done while the semantic
layer stood at 4 of 994; this output states adjudicated / contested / abstained / errored / inert
so that cannot happen quietly again.

Contested cases are quarantined rather than dropped — models disagreeing is information, and on
LiveChat it surfaced a dispute with our category NAME rather than a product error."
```

- [ ] **Step 5: HUMAN GATE — work the queue**

Present the top flags to Joel, highest prevalence first. Confirmed reassignments go into
`patterns/category-overrides.json` in the Task 4 shape. `npm test` validates every entry via the
Task 3 gate. Commit in batches:

```bash
git add patterns/category-overrides.json
git commit -m "fix(uni-235): land adjudicated category corrections (batch N)"
```

- [ ] **Step 6: Re-measure the effect**

After landing a batch, rerun `npm run prevalence` and compare signal-category coverage against the
pre-audit figures (Chatbot 11.5%, CRM 38.9% over 645 institutions). Record the before/after in the
UNI-235 Linear comment, as UNI-233 did — the deltas are what tell you the audit was worth running.

---

## Self-Review

**Spec coverage.** §4 override layer → Tasks 1–2. §5 Stage 0 → Task 4. Stage 1 → Task 6. Stage 2 →
Tasks 5, 7. Stage 3 → Tasks 4.5, 8.5. §6 data model → Task 2 Step 1, Task 4 Step 5. §7 gating and
testing → Tasks 1, 2, 3, 5. §8 honest coverage → Task 8. §9 risks: interruption → Task 7 Step 3;
false flags → Task 8 ranking; reimport → Task 3; correlated models → Task 5; memory → Task 7
Step 4; homepage-only → Task 6 output note. §10 follow-ons are out of scope by design.

**Type consistency.** `applyCategoryOverrides(patterns, overrides)` and
`validateOverrides(patterns, overrides)` keep the same signatures in Tasks 1, 2 and 3.
`askModel(model, userPrompt)` and `buildPrompt(entry)` are defined in Task 5 and reused unchanged
in Task 7. The override file is `{_comment, overrides:{}}` throughout, and every consumer reads
`.overrides`. `docs/corpus-prevalence.json` exposes `counts` and `cooccurs`, which is exactly what
Task 7 reads.

**Known gap, deliberate.** Task 7's sweep is ~5–6 h and is not parallelised across technologies.
Ollama serialises per model, so request-level concurrency would need `OLLAMA_NUM_PARALLEL` tuning
and reintroduces exactly the memory pressure Joel objected to. Two mitigations instead: the sweep
is tiered (the slow model only sees technologies that fire), and everything is prevalence-ordered,
so the run can be stopped at any point with most of the value banked.

**Calibration findings folded in after the plan was first written.** All three came from actually
running the models rather than reasoning about them:

1. `num_predict` must cover **thinking tokens** — nemotron-3-nano:30b is a reasoning model and at
   600 it truncated mid-JSON on precisely the two hardest FLAG cases. Raised to 3000.
2. The qualifying bar moved from per-model to **per-pair**, because nemotron-3-nano:30b and
   cogito:70b miss Ellucian CRM Recruit **identically** while mistral-small3.2:24b catches it.
   Judging models individually would reject the one whose value is covering the anchor's blind
   spots.
3. That correlated miss is itself a finding: "the product does an X-adjacent thing, so an adjacent
   category is acceptable" is a *systematic* LLM failure mode here. The Task 4 name-token screen
   catches exactly this class by a completely different mechanism, which makes it a real
   independent safety net rather than merely a convenient head start.
