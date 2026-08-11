# Detection Precision Implementation Plan (UNI-237 phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deTECHtor's corpus figures trustworthy as *detections* — remove 52 prose-collision patterns, repair four engine defects, and add a measured breadth gate so an over-broad pattern cannot be reintroduced without failing the build.

**Architecture:** A load-time pattern-override layer (mirroring the existing category-override layer) removes evidence patterns from the upstream-regenerated file without editing it. A sharded corpus pass measures every html pattern's individual match rate and its *excess* over the technology's strongest independent signal; a lint gate fails `npm test` on excess above either an absolute or a relative threshold. Engine repairs restore four silently-ignored behaviours.

**Tech Stack:** Node ≥18, CommonJS, `node:test` + `node:assert`, `cheerio`, `child_process.fork`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-10-detection-precision-design.md`

## Global Constraints

- **Never edit `patterns/generated/webappanalyzer-merged.json` by hand.** `scripts/import-webappanalyzer.js` overwrites it wholesale, and after Task 0 `npm test` fails on any hand-edit. Changes to technologies in it go through `patterns/pattern-overrides.json`. (Task 0 moves it there from `patterns/`; before Task 0 lands, the old path is correct.)
- **An override removes evidence patterns only.** It must never add, rewrite or reorder evidence, and must never touch `categories`/`cats` — that is the category layer's job. Keeping the two layers disjoint is what makes UNI-224's dom-clobbering hazard structurally impossible.
- **Never fabricate a measurement.** If a number is not produced by a script in this plan, do not write it into a doc, a commit message, or a PR body. Missing means unavailable.
- **Fail loud, never partial.** Any script writing an artifact must refuse to write it if any shard failed or if input accounting does not reconcile. Follow the invariants already in `scripts/corpus-prevalence.js`.
- **`node --test tests/*.test.js` must stay green**, currently 136 tests.
- **One deliberate exception to green:** Task 6 wires the breadth gate into `npm test` while the ~52 violations it detects are still present, so `npm test` FAILS at the end of Task 6 and is repaired by Task 7. This is the intended sequence — the gate has to exist before the worklist it produces can be cleared. **Task 6's reviewer must not treat that red build as a defect, and must not accept allowlisting the violations to force it green.** Every other task ends green.
- **Scripted, reviewed changes to the generated artifact are allowed; hand-edits are not.** Tasks 2 and 8 modify `patterns/generated/webappanalyzer-merged.json` through a script and then re-record its hash in the same commit. That is the guard working as designed. What the guard exists to stop is an edit made directly in an editor and never reconciled — which the next import silently reverts.
- **Tracked generated files must be committed in the same commit as the script that changes them**, or `npm test` dirties a clean checkout.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Branch: `joelgoodman/uni-237-detection-precision`. Do not merge or rebase onto `main`; it is stacked on `joelgoodman/uni-235-semantic-category-audit`.

## File Structure

| File | Responsibility |
| --- | --- |
| `patterns/generated/webappanalyzer-merged.json` (moved) | The upstream build artifact, relocated so its path says so |
| `scripts/lint-generated.js` (new) | Fails the build if the generated artifact was hand-edited |
| `src/pattern-overrides.js` (new) | Pure functions: remove named evidence patterns; validate rules against the pristine map |
| `patterns/pattern-overrides.json` (new) | The 12 upstream-file pattern removals, with `was`/`reason`/`decided` |
| `patterns/breadth-allowlist.json` (new) | Reviewed exemptions from the breadth gate, one reason each |
| `scripts/pattern-breadth.js` (new) | Sharded corpus pass → `docs/pattern-breadth.json` |
| `scripts/lint-pattern-breadth.js` (new) | The gate; reads the artifact + allowlist, exits non-zero on violations |
| `src/detechtor.js` (modify) | Wire the override layer; four engine repairs |
| `src/config.js` (modify) | Remove `minConfidence` |
| `patterns/higher-ed-{infra,sis,lms,cms}.json` (modify) | Delete the 40 prose patterns we own |
| `tests/pattern-overrides.test.js` (new) | Override layer + regeneration-survival |
| `tests/engine-fields.test.js` (new) | scripts/scriptSrc union, url, xhr, excludes tie-break, no floor |
| `tests/generated-guard.test.js` (new) | `_generated` stamping; the hand-edit guard fires and names the fix |

---

### Task 0: Make the generated pattern file unmistakable

**Files:**
- Move: `patterns/webappanalyzer-merged.json` → `patterns/generated/webappanalyzer-merged.json`
- Modify: `src/config.js` (pattern path list), `src/detechtor.js` (`_generated` stamp), `scripts/import-webappanalyzer.js` (output path + hash), `patterns/import-report.json`
- Create: `scripts/lint-generated.js`
- Create: `tests/generated-guard.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `def._generated === true` on every definition from a `patterns/generated/` path. Task 7 uses it to decide whether a violation is fixed by editing the file or by an override rule.
- Produces: `node scripts/lint-generated.js --gate`, exit 1 on a hand-edit.

**Context:** `patterns/webappanalyzer-merged.json` is a build artifact that looks exactly like a source file — tracked, hand-readable, sitting beside eleven files that *are* hand-edited. It has caused the same wasted work more than once. A comment at the top of `src/category-overrides.js` has not prevented it, so this task makes it structural instead. Grep for the old path across the repo before moving; several scripts reference it by literal string (`scripts/category-id-audit.js:8` at least).

- [ ] **Step 1: Find every reference to the old path**

```bash
grep -rn "webappanalyzer-merged" --include=*.js --include=*.json --include=*.md . | grep -v node_modules
```

Note every hit; all must be updated in Step 2.

- [ ] **Step 2: Move the file and update every reference**

```bash
mkdir -p patterns/generated
git mv patterns/webappanalyzer-merged.json patterns/generated/webappanalyzer-merged.json
```

Update each path found in Step 1 from `patterns/webappanalyzer-merged.json` to `patterns/generated/webappanalyzer-merged.json` (and `../patterns/webappanalyzer-merged.json` to `../patterns/generated/webappanalyzer-merged.json` in `src/config.js`'s list).

- [ ] **Step 3: Verify nothing broke**

Run: `npm test`
Expected: PASS with the same test count as before the move. A "Pattern file not found" warning means a path was missed — `config.verbose` is off by default, so also check the loaded count:

```bash
node -e 'const E=require("./src/detechtor.js");console.log(Object.keys(new E().patterns).length,"patterns loaded")'
```
Expected: 6,498 (unchanged)

- [ ] **Step 4: Write the failing test**

Create `tests/generated-guard.test.js`:

```js
// tests/generated-guard.test.js — UNI-237.
//
// patterns/generated/webappanalyzer-merged.json is a BUILD ARTIFACT that looks like a source file.
// Editing it in place is reverted by the next import, and that mistake has cost real time more than
// once. Three defences: the path says so, every definition says so, and the build fails on a hand
// edit. This pins the second and third.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'patterns/generated/webappanalyzer-merged.json');

test('definitions from patterns/generated are stamped _generated', () => {
  const patterns = new DeTECHtor().patterns;
  const fromGenerated = Object.entries(patterns)
    .filter(([n, d]) => n !== '_metadata' && d && d._sourceFile === 'webappanalyzer-merged.json');
  assert.ok(fromGenerated.length > 5000, `expected the bulk of patterns, got ${fromGenerated.length}`);
  const unstamped = fromGenerated.filter(([, d]) => d._generated !== true).map(([n]) => n);
  assert.deepStrictEqual(unstamped.slice(0, 5), [], `${unstamped.length} generated defs are unstamped`);
});

test('hand-written pattern files are NOT stamped _generated', () => {
  const patterns = new DeTECHtor().patterns;
  const wrong = Object.entries(patterns)
    .filter(([n, d]) => n !== '_metadata' && d && /^higher-ed-/.test(d._sourceFile || '') && d._generated)
    .map(([n]) => n);
  assert.deepStrictEqual(wrong, [], `curated defs wrongly stamped _generated: ${wrong.join(', ')}`);
});

test('the guard passes on the committed artifact', () => {
  execFileSync('node', [path.join(ROOT, 'scripts/lint-generated.js'), '--gate'], { cwd: ROOT, stdio: 'pipe' });
});

test('the guard FAILS on a hand-edit, and names the override layer', () => {
  const original = fs.readFileSync(GENERATED, 'utf8');
  const tampered = JSON.parse(original);
  tampered.__tamper_probe__ = { html: ['x'], cats: [1] };
  fs.writeFileSync(GENERATED, JSON.stringify(tampered, null, 2) + '\n');
  try {
    execFileSync('node', [path.join(ROOT, 'scripts/lint-generated.js'), '--gate'], { cwd: ROOT, stdio: 'pipe' });
    assert.fail('guard passed on a tampered artifact');
  } catch (e) {
    assert.strictEqual(e.status, 1);
    assert.match(String(e.stdout || ''), /pattern-overrides\.json/,
      'the failure must tell the reader where the edit belongs, not just that it is wrong');
  } finally {
    fs.writeFileSync(GENERATED, original);   // always restore, even if an assertion threw
  }
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --test tests/generated-guard.test.js`
Expected: FAIL — no `_generated` stamp, no `scripts/lint-generated.js`

- [ ] **Step 6: Stamp `_generated`**

In `src/detechtor.js`'s `loadPatterns`, beside the existing `def._curated` / `def._sourceFile` assignments:

```js
              // UNI-237: anything under patterns/generated/ is a build artifact —
              // scripts/import-webappanalyzer.js rewrites it wholesale. Stamped so any script,
              // test or reader inspecting a definition knows an in-place edit will be reverted.
              def._generated = /(^|[\\/])generated[\\/]/.test(patternPath);
```

- [ ] **Step 7: Write the guard**

Create `scripts/lint-generated.js`:

```js
#!/usr/bin/env node
/**
 * Generated-artifact guard (UNI-237)
 * ==================================
 * patterns/generated/webappanalyzer-merged.json is produced by scripts/import-webappanalyzer.js and
 * rewritten wholesale on every import. Editing it by hand looks like it works and is silently
 * reverted the next time anyone re-imports. That has cost real time more than once, so the build
 * catches it rather than relying on a comment being read.
 *
 * The import records the artifact's SHA-256 in patterns/import-report.json. This recomputes it.
 *
 * Usage:
 *   node scripts/lint-generated.js           # report
 *   node scripts/lint-generated.js --gate    # exit 1 on mismatch
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const GATE = process.argv.includes('--gate');
const ARTIFACT = path.join(ROOT, 'patterns/generated/webappanalyzer-merged.json');
const REPORT = path.join(ROOT, 'patterns/import-report.json');

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

if (!fs.existsSync(ARTIFACT)) {
  console.error(`FATAL: ${ARTIFACT} is missing.`);
  process.exit(1);
}

const report = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {};
const recorded = report.artifactSha256;

if (!recorded) {
  console.error(
    'FATAL: patterns/import-report.json records no artifactSha256.\n' +
    'Run `npm run update-patterns` to regenerate the artifact and its hash.'
  );
  process.exit(GATE ? 1 : 0);
}

const actual = sha256(ARTIFACT);
if (actual === recorded) {
  console.log('generated artifact matches its recorded hash — no hand-edits');
  process.exit(0);
}

console.error(
  '\nFATAL: patterns/generated/webappanalyzer-merged.json has been modified since it was imported.\n' +
  `  recorded ${recorded}\n  actual   ${actual}\n\n` +
  'This file is a BUILD ARTIFACT. scripts/import-webappanalyzer.js rewrites it wholesale, so an\n' +
  'edit here is silently reverted by the next import.\n\n' +
  'To change a technology that lives in it:\n' +
  '  • to REMOVE an evidence pattern -> add a rule to patterns/pattern-overrides.json\n' +
  '  • to change its CATEGORY        -> add a rule to patterns/category-overrides.json\n' +
  '  • to change it any other way    -> move the technology into a curated patterns/higher-ed-*.json\n\n' +
  'If you genuinely re-imported, run `npm run update-patterns` so the hash is re-recorded.\n'
);
process.exit(GATE ? 1 : 0);
```

- [ ] **Step 8: Record the hash at import time**

In `scripts/import-webappanalyzer.js`, after the artifact is written to `outputPath` (line ~152) and before the import report is written, add:

```js
    // UNI-237: record the artifact's hash so scripts/lint-generated.js can detect a hand-edit.
    // Must be computed AFTER the file is written, from the file itself — hashing the in-memory
    // object would not catch an edit made to the file on disk, which is the whole point.
    const crypto = require('crypto');
    const artifactSha256 = crypto.createHash('sha256')
      .update(require('fs').readFileSync(outputPath))
      .digest('hex');
```

and include `artifactSha256` in the object written to `patterns/import-report.json`.

- [ ] **Step 9: Seed the hash for the current artifact**

The committed artifact predates the hash, so record it once without re-importing (a re-import would pull upstream changes unrelated to this work):

```bash
node -e '
const fs=require("fs"), crypto=require("crypto");
const p="patterns/import-report.json";
const r=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):{};
r.artifactSha256=crypto.createHash("sha256").update(fs.readFileSync("patterns/generated/webappanalyzer-merged.json")).digest("hex");
r.artifactShaRecordedBy="UNI-237 seed (not a re-import)";
fs.writeFileSync(p, JSON.stringify(r,null,2)+"\n");
console.log("recorded", r.artifactSha256);
'
```

⚠️ Tasks 2 and 8 modify this artifact (stripping `text`, deleting dead technologies). **Each of those tasks must re-run this seed command and commit the new hash**, or `npm test` fails on their own change. That is the guard working, not a bug — but it must be in those tasks' steps.

- [ ] **Step 10: Run the tests**

Run: `node --test tests/generated-guard.test.js`
Expected: PASS, 4 tests. Confirm the artifact is byte-identical afterwards: `git diff --stat patterns/generated/` should be empty — the tamper test must restore it.

- [ ] **Step 11: Wire into `npm test`**

In `package.json`, add `lint:generated` and put it **first** in `test`, before the other gates — a hand-edited artifact makes every downstream measurement suspect:

```json
    "test": "node scripts/lint-generated.js --gate && node scripts/lint-patterns.js --fail-curated && node scripts/lint-dom-rules.js --gate && node scripts/category-audit.js --gate && node --test tests/*.test.js && node scripts/test-patterns.js",
    "lint:generated": "node scripts/lint-generated.js",
```

(Task 6 inserts `lint-pattern-breadth.js --gate` into this same string later.)

- [ ] **Step 12: Commit**

```bash
git add -A patterns/ src/config.js src/detechtor.js scripts/import-webappanalyzer.js scripts/lint-generated.js tests/generated-guard.test.js package.json
git commit -m "feat(uni-237): make the generated pattern file unmistakable

webappanalyzer-merged.json is a build artifact that looks exactly like a
source file, and editing it in place has cost real time more than once. A
comment in category-overrides.js did not prevent it, so this is structural:

- moved to patterns/generated/, so the path says 'build artifact' in every
  tree, grep result and diff header
- every definition loaded from there is stamped _generated: true
- the import records the artifact's SHA-256 and npm test fails on a mismatch,
  with an error naming pattern-overrides.json as where the edit belongs

Only the third actually stops the mistake; the first two stop the confusion
that leads to it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Pattern-override layer

**Files:**
- Create: `src/pattern-overrides.js`
- Create: `patterns/pattern-overrides.json`
- Create: `tests/pattern-overrides.test.js`
- Modify: `src/detechtor.js` (the `loadPatterns` override block, currently ~line 137)

**Interfaces:**
- Consumes: `loadPatterns(options)` already accepts `{applyOverrides: false}` for a pristine map — reuse that same flag, do not add a second one.
- Produces: `applyPatternOverrides(patterns, overrides)` → new pattern map; `validatePatternOverrides(patterns, overrides)` → `Array<{name, problem}>`. Task 6 calls `validatePatternOverrides`; Task 7 writes the rules.

**Context:** `src/category-overrides.js` is the model to follow — same file layout, same `_comment` skip, same "never invent a technology" stance, same `{name, problem}` validation shape. Read it before starting. The difference: this layer *removes strings from evidence arrays* rather than replacing `categories`.

- [ ] **Step 1: Write the failing test**

Create `tests/pattern-overrides.test.js`:

```js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/pattern-overrides.test.js`
Expected: FAIL — `Cannot find module '../src/pattern-overrides.js'`

- [ ] **Step 3: Write the implementation**

Create `src/pattern-overrides.js`:

```js
// src/pattern-overrides.js — UNI-237. Evidence-pattern removals, applied at load.
//
// WHY A LAYER AND NOT AN EDIT. Same reason as src/category-overrides.js: 6,202 of the 6,504
// technologies live in `patterns/generated/webappanalyzer-merged.json`, which the importer
// regenerates wholesale (`{ ...webappPatterns }`). An in-place deletion there is silently reverted
// by the next import.
//
// ⚠️ This layer REMOVES evidence patterns and does nothing else. It never adds, rewrites or
// reorders evidence, and it never touches `categories`/`cats` — that is category-overrides.js.
// Keeping the two disjoint is what makes the UNI-224 dom-clobbering hazard structurally impossible
// rather than merely tested against.
'use strict';

// Only these may be targeted. `dom` is deliberately absent: its rules are pre-compiled into
// `_domRules` at load, so removing a raw `dom` entry would leave the compiled rule live and the two
// out of sync. A bad dom rule is fixed in the pattern file, not here.
const EVIDENCE_FIELDS = ['html', 'scripts', 'scriptSrc', 'url', 'xhr', 'text'];
const OBJECT_FIELDS = ['meta', 'headers', 'cookies', 'js'];

function isArrayField(f) { return EVIDENCE_FIELDS.includes(f); }
function isObjectField(f) { return OBJECT_FIELDS.includes(f); }

/** Every evidence entry a definition currently carries, counted across both shapes. */
function evidenceCount(def) {
  let n = 0;
  for (const f of EVIDENCE_FIELDS) if (Array.isArray(def[f])) n += def[f].length;
  for (const f of OBJECT_FIELDS) if (def[f] && typeof def[f] === 'object') n += Object.keys(def[f]).length;
  return n;
}

/**
 * Apply evidence-pattern removals.
 *
 * @param {object} patterns name -> definition
 * @param {object} [overrides] name -> {remove: {field: string[]}, reason?, decided?}
 * @returns {object} a new pattern map; the input and its definitions are not mutated.
 */
function applyPatternOverrides(patterns, overrides = {}) {
  const out = { ...patterns };

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;
    const def = out[name];
    // Never invent a technology. A stale rule is reported by validatePatternOverrides and gated in
    // CI; at runtime it is simply inert.
    if (!def || typeof def !== 'object') continue;
    if (!rule || !rule.remove || typeof rule.remove !== 'object') continue;

    const next = { ...def };
    const removed = {};

    for (const [field, values] of Object.entries(rule.remove)) {
      if (!Array.isArray(values) || values.length === 0) continue;

      if (isArrayField(field) && Array.isArray(def[field])) {
        const drop = new Set(values);
        const kept = def[field].filter((p) => !drop.has(p));
        if (kept.length !== def[field].length) {
          next[field] = kept;
          removed[field] = [...values];
        }
      } else if (isObjectField(field) && def[field] && typeof def[field] === 'object') {
        const copy = { ...def[field] };
        const hit = [];
        for (const k of values) if (k in copy) { delete copy[k]; hit.push(k); }
        if (hit.length) { next[field] = copy; removed[field] = hit; }
      }
    }

    if (Object.keys(removed).length === 0) continue;

    next._patternOverride = {
      removed,
      reason: rule.reason ?? null,
      decided: rule.decided ?? null,
    };
    out[name] = next;
  }

  return out;
}

/**
 * Structural problems with the override file. Gated by scripts/lint-pattern-breadth.js so that a
 * reimport which reverts a decision, or a stale rule, fails the build instead of rotting.
 *
 * @returns {Array<{name: string, problem: string}>}
 */
function validatePatternOverrides(patterns, overrides = {}) {
  const problems = [];

  for (const [name, rule] of Object.entries(overrides)) {
    if (name === '_comment') continue;

    if (!rule || !rule.remove || typeof rule.remove !== 'object' || Array.isArray(rule.remove)) {
      problems.push({ name, problem: 'malformed: `remove` must be an object of field -> string[]' });
      continue;
    }

    let malformed = false;
    for (const [field, values] of Object.entries(rule.remove)) {
      if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== 'string')) {
        problems.push({ name, problem: `malformed: remove.${field} must be a non-empty array of strings` });
        malformed = true;
        continue;
      }
      if (!isArrayField(field) && !isObjectField(field)) {
        problems.push({ name, problem: `"${field}" is not an evidence field this layer may remove` });
        malformed = true;
      }
    }
    if (malformed) continue;

    const def = patterns[name];
    if (!def || typeof def !== 'object') {
      problems.push({ name, problem: 'no such technology — the override is stale' });
      continue;
    }

    // A rule naming a pattern the technology no longer carries has silently stopped doing anything.
    // That is exactly the drift this layer exists to catch, so it fails rather than passing quietly.
    for (const [field, values] of Object.entries(rule.remove)) {
      const present = isArrayField(field)
        ? new Set(Array.isArray(def[field]) ? def[field] : [])
        : new Set(def[field] && typeof def[field] === 'object' ? Object.keys(def[field]) : []);
      for (const v of values) {
        if (!present.has(v)) {
          problems.push({ name, problem: `remove.${field} "${v}" is not present — the override is stale` });
        }
      }
    }

    // Removing a technology's last evidence makes it permanently undetectable. If that is genuinely
    // wanted, delete the technology; do not hollow it out and leave a corpse that looks alive.
    const after = applyPatternOverrides({ [name]: def }, { [name]: rule })[name];
    if (evidenceCount(after) === 0) {
      problems.push({ name, problem: 'would leave no evidence at all — delete the technology instead' });
    }
  }

  return problems;
}

module.exports = { applyPatternOverrides, validatePatternOverrides, evidenceCount, EVIDENCE_FIELDS, OBJECT_FIELDS };
```

Create `patterns/pattern-overrides.json` — starts empty; Task 7 fills it:

```json
{
  "_comment": "UNI-237. Evidence-pattern removals for technologies in the upstream-regenerated webappanalyzer-merged.json. See src/pattern-overrides.js. Each rule: {remove: {field: [pattern, ...]}, reason, decided}.",
  "overrides": {}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/pattern-overrides.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Wire it into `loadPatterns`**

In `src/detechtor.js`, add to the requires near `CATEGORY_OVERRIDES`:

```js
const PATTERN_OVERRIDES = require('../patterns/pattern-overrides.json');
const { applyPatternOverrides } = require('./pattern-overrides');
```

Then, immediately **after** the existing `applyCategoryOverrides` block inside `loadPatterns` (the block guarded by `if (options.applyOverrides !== false)`), inside that same guard, append:

```js
      // UNI-237: evidence-pattern removals, applied after the category layer. Order does not matter
      // — the two layers touch disjoint fields — but keeping them adjacent keeps the "what does a
      // pristine load mean" answer in one place.
      const patternRules = PATTERN_OVERRIDES.overrides || {};
      resolved = applyPatternOverrides(resolved, patternRules);
      if (config.verbose) {
        const n = Object.keys(patternRules).filter((k) => k !== '_comment' && resolved[k]).length;
        if (n) console.log(`Applied ${n} pattern override(s)`);
      }
```

- [ ] **Step 6: Write the regeneration-survival test**

This is the property a unit test on `applyPatternOverrides` alone cannot prove. Append to `tests/pattern-overrides.test.js`:

```js
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
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — 136 existing tests plus the new ones, all gates exit 0

- [ ] **Step 8: Commit**

```bash
git add src/pattern-overrides.js patterns/pattern-overrides.json tests/pattern-overrides.test.js src/detechtor.js
git commit -m "feat(uni-237): pattern-override layer for the regenerated upstream file

12 of the 52 prose-collision patterns live in webappanalyzer-merged.json,
which import-webappanalyzer.js overwrites wholesale -- an in-place deletion
is reverted by the next import. Same architecture as category-overrides.js,
disjoint fields: this layer only REMOVES evidence, never touches categories.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Engine repairs — scripts/scriptSrc union, url, xhr, drop text

**Files:**
- Modify: `src/detechtor.js` (script matching at ~line 991; new url/xhr blocks in `evaluatePattern`)
- Modify: `patterns/higher-ed-*.json` and via override where `text` appears
- Create: `tests/engine-fields.test.js`

**Interfaces:**
- Consumes: `matchPatterns(evidence)` from Task 1's unchanged signature.
- Produces: nothing new for later tasks; behaviour only.

**Context:** `evidence.finalUrl` is the page URL and `evidence.networkHosts` is an array of hostnames seen during the scan (`detechtor.js:340`). **`evidenceFromHtml` sets `networkHosts: []` and no `finalUrl`, so url/xhr can only fire on the live browser path, never in the corpus pass.** That is expected — test them with synthetic evidence objects, and do not expect the corpus measurement in Task 5 to change because of them.

- [ ] **Step 1: Write the failing test**

Create `tests/engine-fields.test.js`:

```js
// tests/engine-fields.test.js — UNI-237.
//
// The engine consumed 7 pattern fields and silently ignored 15 more. These tests pin the four
// repairs: scripts/scriptSrc union, `url`, `xhr`, and the excludes tie-break (Task 3).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

function engineWith(patterns) {
  const e = new DeTECHtor();
  e.patterns = patterns;
  e.domPlan = e.buildDomPlan();
  return e;
}

const EVIDENCE = (over = {}) => ({
  html: '', headers: {}, scripts: [], meta: {}, cookies: [],
  dom: { jsObjects: {} }, domNodes: {}, apiEndpoints: [], networkHosts: [],
  versionInfo: {}, jsProbed: false, finalUrl: 'https://example.edu/',
  ...over,
});

test('a pattern declaring BOTH scripts and scriptSrc matches on either', () => {
  // 85 patterns declare both, 54 with differing content, and `scripts || scriptSrc` discarded the
  // scriptSrc half entirely.
  const e = engineWith({
    Widget: { scripts: ['alpha\\.js'], scriptSrc: ['beta\\.js'], categories: ['Analytics'] },
  });
  const viaScripts = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/alpha.js' }] }));
  const viaScriptSrc = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/beta.js' }] }));
  assert.deepStrictEqual(viaScripts.map((m) => m.name), ['Widget']);
  assert.deepStrictEqual(viaScriptSrc.map((m) => m.name), ['Widget'], 'scriptSrc half was discarded');
});

test('a url pattern fires against the final page URL', () => {
  const e = engineWith({ Coldfusion: { url: ['\\.cfm(?:$|\\?)'], categories: ['Unclassified'] } });
  const hit = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/index.cfm' }));
  const miss = e.matchPatterns(EVIDENCE({ finalUrl: 'https://example.edu/apply/' }));
  assert.deepStrictEqual(hit.map((m) => m.name), ['Coldfusion']);
  assert.deepStrictEqual(miss.map((m) => m.name), []);
});

test('an xhr pattern fires against network hosts', () => {
  const e = engineWith({ AMP: { xhr: ['cdn\\.ampproject\\.org'], categories: ['Unclassified'] } });
  const hit = e.matchPatterns(EVIDENCE({ networkHosts: ['cdn.ampproject.org'] }));
  const miss = e.matchPatterns(EVIDENCE({ networkHosts: ['cdn.example.edu'] }));
  assert.deepStrictEqual(hit.map((m) => m.name), ['AMP']);
  assert.deepStrictEqual(miss.map((m) => m.name), []);
});

test('a missing finalUrl or networkHosts never throws', () => {
  const e = engineWith({
    A: { url: ['x'], categories: ['Unclassified'] },
    B: { xhr: ['y'], categories: ['Unclassified'] },
  });
  const ev = EVIDENCE();
  delete ev.finalUrl;
  delete ev.networkHosts;
  assert.deepStrictEqual(e.matchPatterns(ev).map((m) => m.name), []);
});

test('no pattern file declares `text` any more', () => {
  // `text` was declared on 60 patterns and read by nothing — an unread field, not a weak one.
  const e = new DeTECHtor();
  const withText = Object.entries(e.patterns)
    .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object' && d.text)
    .map(([n]) => n);
  assert.deepStrictEqual(withText, [], `still declaring text: ${withText.slice(0, 5).join(', ')}`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/engine-fields.test.js`
Expected: FAIL on the scriptSrc-union, url, xhr and text tests (4 of 5)

- [ ] **Step 3: Union scripts and scriptSrc**

In `src/detechtor.js`, replace line 991:

```js
    const scriptPatterns = pattern.scripts || pattern.scriptSrc || [];
```

with:

```js
    // UNI-237: `||` discarded scriptSrc entirely whenever scripts was also present — 85 patterns
    // declare both and 54 of those with DIFFERENT content, so half their evidence never ran.
    const scriptPatterns = [
      ...(Array.isArray(pattern.scripts) ? pattern.scripts : []),
      ...(Array.isArray(pattern.scriptSrc) ? pattern.scriptSrc : []),
    ];
```

- [ ] **Step 4: Add url and xhr matching**

In `src/detechtor.js`, immediately after the cookie-matching block in `evaluatePattern` (ends ~line 1172), insert:

```js
    // UNI-237: `url` (76 patterns) and `xhr` (100) were declared and read by nothing. Both are
    // live-path only — evidenceFromHtml supplies neither finalUrl nor networkHosts, so these never
    // fire during a corpus pass. That is expected, not a bug.
    if (Array.isArray(pattern.url) && typeof evidence.finalUrl === 'string') {
      for (const urlPattern of pattern.url) {
        try {
          if (new RegExp(urlPattern, 'i').test(evidence.finalUrl)) {
            confidence += 70;
            matchEvidence.push(`URL: ${urlPattern}`);
          }
        } catch { /* invalid regex; lint-patterns gates these */ }
      }
    }

    if (Array.isArray(pattern.xhr) && Array.isArray(evidence.networkHosts)) {
      for (const xhrPattern of pattern.xhr) {
        try {
          const re = new RegExp(xhrPattern, 'i');
          if (evidence.networkHosts.some((h) => re.test(String(h)))) {
            confidence += 70;
            matchEvidence.push(`XHR: ${xhrPattern}`);
          }
        } catch { /* invalid regex; lint-patterns gates these */ }
      }
    }
```

- [ ] **Step 5: Strip `text` from the pattern files**

`text` is declared on 60 technologies and read by nothing. Strip it from **every** pattern file, not only the upstream one — the test in Step 1 asserts across all loaded patterns, and assuming they are all in one file is exactly the kind of guess that makes a test fail for a confusing reason. Because the upstream file is regenerated, also strip at **import**.

Write and run this one-off, then delete it:

```bash
node -e '
const fs=require("fs"), path=require("path");
let total=0;
for(const f of fs.readdirSync("patterns").filter(x=>x.endsWith(".json"))){
  const p=path.join("patterns",f);
  let j; try{ j=JSON.parse(fs.readFileSync(p,"utf8")); }catch{ continue; }
  let n=0;
  for(const v of Object.values(j)) if(v&&typeof v==="object"&&!Array.isArray(v)&&v.text!==undefined){delete v.text;n++;}
  if(n){ fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n"); console.log("  "+f+": stripped "+n); total+=n; }
}
console.log("stripped text from",total,"technologies");
'
```

Expected: 60 in total. A different number is a finding — report it rather than proceeding.

Then in `scripts/import-webappanalyzer.js`, inside the per-technology loop at line 143 (`for (const [name, def] of Object.entries(mergedPatterns))`), add:

```js
      // UNI-237: `text` is read by nothing in src/ and duplicates `html`. Strip at import so a
      // re-import does not resurrect 60 dead declarations.
      if (def && typeof def === 'object' && def.text !== undefined) delete def.text;
```

- [ ] **Step 6: Re-record the generated-artifact hash**

Stripping `text` modified `patterns/generated/webappanalyzer-merged.json`, so Task 0's guard will now
fail — correctly. Re-record the hash (this is a deliberate, reviewed change to the artifact, not a
hand-edit sneaking through):

```bash
node -e '
const fs=require("fs"), crypto=require("crypto");
const p="patterns/import-report.json";
const r=JSON.parse(fs.readFileSync(p,"utf8"));
r.artifactSha256=crypto.createHash("sha256").update(fs.readFileSync("patterns/generated/webappanalyzer-merged.json")).digest("hex");
r.artifactShaRecordedBy="UNI-237 Task 2: stripped unread `text` field";
fs.writeFileSync(p, JSON.stringify(r,null,2)+"\n");
console.log("re-recorded", r.artifactSha256);
'
```

- [ ] **Step 7: Run the tests**

Run: `node --test tests/engine-fields.test.js`
Expected: PASS, 5 tests (the excludes tie-break test arrives in Task 3)

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. If `scripts/test-patterns.js` or `golden-pages.test.js` now report *additional* detections, that is the recovered `scriptSrc` half firing — inspect each, confirm it is a real marker, and record the list in the commit message. Do not update a golden file without saying which technology changed and why.

- [ ] **Step 9: Commit**

```bash
git add src/detechtor.js scripts/import-webappanalyzer.js patterns/generated/webappanalyzer-merged.json patterns/import-report.json tests/engine-fields.test.js
git commit -m "fix(uni-237): union scripts+scriptSrc, read url and xhr, drop unread text

- scripts || scriptSrc discarded the scriptSrc half on 85 patterns, 54 of
  which declare different content in each.
- url (76) and xhr (100) were declared and read by nothing. Live-path only;
  evidenceFromHtml supplies neither, so corpus passes are unaffected.
- text (60) duplicated html and was read by nothing. Stripped, and stripped
  at import so a re-import cannot resurrect it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Honour `excludes`, with a tie-break for mutual pairs

**Files:**
- Modify: `src/detechtor.js` (`matchPatterns`, ~line 947–962)
- Modify: `tests/engine-fields.test.js`

**Interfaces:**
- Consumes: `matchPatterns(evidence)` returning `Array<{name, confidence, ...}>` sorted by confidence descending.
- Produces: same, with suppressed entries removed.

**Context:** 45 patterns declare `excludes`; 5 currently fire. **The declared pairs are mutual** — `Underscore.js` (256 fires) excludes `Lodash`, and `Lodash` (106) excludes `Underscore.js`; likewise `AngularJS` ↔ `Angular` and `Piwik PRO Core` ↔ `Matomo Analytics`. Applying naively either suppresses both or depends on load order.

- [ ] **Step 1: Write the failing test**

Append to `tests/engine-fields.test.js`:

```js
test('excludes suppresses the excluded technology', () => {
  const e = engineWith({
    'Piwik PRO Core': { scripts: ['piwik\\.pro'], excludes: ['Matomo Analytics'], categories: ['Analytics'] },
    'Matomo Analytics': { html: ['matomo'], categories: ['Analytics'] },
  });
  const names = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/piwik.pro.js' }],
    html: '<div>matomo</div>',
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Piwik PRO Core']);
});

test('mutual excludes resolve to the higher-confidence match, not to neither', () => {
  // Underscore.js excludes Lodash AND Lodash excludes Underscore.js. Suppressing both loses a real
  // detection; picking by file order makes the answer depend on load sequence.
  const e = engineWith({
    'Underscore.js': { scripts: ['underscore'], excludes: ['Lodash'], categories: ['JavaScript Library'] },
    Lodash: { html: ['lodash'], excludes: ['Underscore.js'], categories: ['JavaScript Library'] },
  });
  const names = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/underscore.js' }],   // script = 60
    html: '<div>lodash</div>',                              // html   = 40
  })).map((m) => m.name);
  assert.deepStrictEqual(names, ['Underscore.js'], 'higher-confidence match must survive');
});

test('mutual excludes at an exact tie keep both', () => {
  const e = engineWith({
    A: { html: ['aaa'], excludes: ['B'], categories: ['Unclassified'] },
    B: { html: ['bbb'], excludes: ['A'], categories: ['Unclassified'] },
  });
  const names = e.matchPatterns(EVIDENCE({ html: '<div>aaa bbb</div>' })).map((m) => m.name).sort();
  assert.deepStrictEqual(names, ['A', 'B'], 'an exact tie must keep both rather than pick arbitrarily');
});

test('excludes naming an absent technology is inert', () => {
  const e = engineWith({ Solo: { html: ['solo'], excludes: ['Nonexistent'], categories: ['Unclassified'] } });
  assert.deepStrictEqual(e.matchPatterns(EVIDENCE({ html: 'solo' })).map((m) => m.name), ['Solo']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/engine-fields.test.js`
Expected: FAIL on the three excludes tests

- [ ] **Step 3: Implement suppression in `matchPatterns`**

In `src/detechtor.js`, replace the body of `matchPatterns` (the loop plus `return detected.sort(...)` at ~947–962) so the sort happens first and suppression runs on the sorted list:

```js
  matchPatterns(evidence) {
    const detected = [];

    for (const [techName, pattern] of Object.entries(this.patterns)) {
      try {
        const match = this.evaluatePattern(techName, pattern, evidence);
        if (match.confidence > 0) {
          detected.push(match);
        }
      } catch (error) {
        if (config.verbose) {
          console.warn(`Error evaluating pattern for ${techName}: ${error.message}`);
        }
      }
    }

    detected.sort((a, b) => b.confidence - a.confidence);
    return this.applyExcludes(detected);
  }

  /**
   * UNI-237: `excludes` was declared on 45 patterns and read by nothing.
   *
   * The declared pairs are MUTUAL — Underscore.js excludes Lodash and Lodash excludes
   * Underscore.js, likewise AngularJS/Angular and Piwik PRO Core/Matomo Analytics. A naive pass
   * suppresses both, or picks whichever the loop happened to reach first, making the result depend
   * on pattern-file load order. So: the higher-confidence match wins and suppresses the other; an
   * exact tie keeps both, because there is no principled way to choose and dropping a real
   * detection is worse than reporting two.
   *
   * @param {Array<{name: string, confidence: number}>} sorted confidence-descending matches
   */
  applyExcludes(sorted) {
    const byName = new Map(sorted.map((m) => [m.name, m]));
    const suppressed = new Set();

    for (const match of sorted) {
      if (suppressed.has(match.name)) continue;
      const rules = this.patterns[match.name] && this.patterns[match.name].excludes;
      if (!Array.isArray(rules)) continue;

      for (const victimName of rules) {
        const victim = byName.get(victimName);
        if (!victim || victim.name === match.name) continue;
        if (victim.confidence === match.confidence) continue; // exact tie: keep both
        if (victim.confidence < match.confidence) suppressed.add(victimName);
      }
    }

    return sorted.filter((m) => !suppressed.has(m.name));
  }
```

Note the loop condition also changes from `match.confidence >= config.minConfidence` to `match.confidence > 0`. Task 4 removes `minConfidence` from config; doing the swap here keeps the tree green in between, and `> 0` is the honest predicate — a match with no matching field scores zero and was never a detection.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/engine-fields.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. `Lodash` and `Underscore.js` may now be mutually exclusive where both previously fired — note any golden-page change in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/detechtor.js tests/engine-fields.test.js
git commit -m "fix(uni-237): honour excludes, with a tie-break for mutual pairs

45 patterns declared excludes and nothing read it. The declared pairs are
mutual (Underscore.js<->Lodash, AngularJS<->Angular, Piwik<->Matomo), so a
naive pass suppresses both or depends on load order. Higher confidence wins;
an exact tie keeps both.

Also swaps the detection predicate from >= config.minConfidence to > 0 ahead
of Task 4 removing the floor; no single match could ever score below 30, so
this changes nothing today.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Remove the inert confidence floor

**Files:**
- Modify: `src/config.js:87`
- Modify: `tests/engine-fields.test.js`

**Interfaces:**
- Consumes: `matchPatterns` from Task 3.
- Produces: `config.minConfidence` no longer exists. Nothing may read it.

**Context:** `minConfidence: 30`, and the weakest possible single match is an `html` substring at **40** (`detechtor.js:977`); script is 60, dom/meta/js 70–100. No single match can score below the floor, so it has never rejected anything. Raising it is rejected: at 41 every html-only detection dies, including the 39 legitimate ones (`Yoast SEO Premium`, `Redis Object Cache`, `Vue.js`, `React`).

- [ ] **Step 1: Write the failing test**

Append to `tests/engine-fields.test.js`:

```js
test('config declares no confidence floor', () => {
  // minConfidence was 30 while the weakest single match scores 40, so it rejected nothing. Keeping
  // an inert knob is worse than having none: it reads as a precision control that is not one.
  const config = require(path.resolve(__dirname, '../src/config.js'));
  assert.strictEqual('minConfidence' in config, false,
    'minConfidence is inert — filtering happens at authoring time via the breadth gate');
});

test('nothing in src/ or scripts/ still READS config.minConfidence', () => {
  // Match the read form `config.minConfidence`, not the bare token — the explanatory comment left
  // in config.js names the setting on purpose, and a bare-token search would fail on that comment.
  const fs = require('fs');
  const dirs = ['../src', '../scripts'].map((d) => path.resolve(__dirname, d));
  const offenders = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      if (/config\.minConfidence/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) offenders.push(f);
    }
  }
  assert.deepStrictEqual(offenders, [], `still read config.minConfidence: ${offenders.join(', ')}`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/engine-fields.test.js`
Expected: FAIL on both new tests

- [ ] **Step 3: Remove the setting**

In `src/config.js`, delete the line:

```js
  minConfidence: 30,
```

and replace it with:

```js
  // UNI-237: there is deliberately NO confidence floor. minConfidence was 30 while the weakest
  // single match — an html substring, detechtor.js:977 — scores 40, so it rejected nothing and had
  // never rejected anything since UNI-138 introduced it. Precision is enforced at authoring time by
  // scripts/lint-pattern-breadth.js, which fails the build on a pattern whose measured match rate
  // exceeds what its technology's real signal supports. `confidence` remains on each match as a
  // reported signal-strength value; it is not a filter.
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/engine-fields.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, no detection-count change (the floor never filtered anything, so this is provably a no-op — if any golden page changes, something else is wrong and must be investigated before committing)

- [ ] **Step 6: Commit**

```bash
git add src/config.js tests/engine-fields.test.js
git commit -m "fix(uni-237): remove the inert confidence floor

minConfidence was 30; the weakest single match (an html substring) scores 40.
No possible single match could score below it, so it rejected nothing and has
rejected nothing since UNI-138 introduced it as a precision control. Removed
rather than raised: at 41 every html-only detection dies, including the 39
legitimate ones (Yoast SEO Premium, Redis Object Cache, Vue.js, React).

Detection counts are unchanged, by construction.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `scripts/pattern-breadth.js` — the measurement instrument

**Files:**
- Create: `scripts/pattern-breadth.js`
- Create: `docs/pattern-breadth.json` (generated)
- Modify: `package.json` (add `"breadth": "node scripts/pattern-breadth.js"`)

**Interfaces:**
- Consumes: `engine.matchPatterns(evidenceFromHtml(html, engine.domPlan))` returning matches with `.name`, `.confidence` and `.evidence` (an array of strings shaped `"HTML: <regex>"`, `"Script: <regex>"`, `"DOM: <selector>"`, `"Meta: <name>"`). `config.includeEvidence` is already `true` by default in `src/config.js` — do not set it.
- Produces: `docs/pattern-breadth.json`, consumed by Task 6:

```json
{
  "generated": "<ISO timestamp>",
  "ticket": "UNI-237",
  "scanned": 0,
  "unscannable": 0,
  "readFailures": 0,
  "classifyFailures": 0,
  "matchFailures": 0,
  "channelsNotProbed": ["js", "cookies", "headers", "url", "xhr"],
  "patterns": {
    "<technology>": {
      "fires": 0,
      "strongest": 0,
      "html": { "<regex>": 0 }
    }
  }
}
```

`fires` is homepages where the technology was detected at all. `html["<regex>"]` is homepages where that individual html regex matched. `strongest` is the highest single-pattern match count among the technology's **non-html** channels (Script / DOM / Meta) — the channels the corpus can actually evaluate.

**Context:** Copy the sharding, crash-accounting and refuse-to-write-partial structure from `scripts/corpus-prevalence.js` exactly — read that file first. It is the house pattern and it exists because a shard that dies silently produces a plausible, merely-smaller artifact. `channelsNotProbed` must be written into the artifact so no reader mistakes a corpus zero for a production zero.

- [ ] **Step 1: Write the script**

Create `scripts/pattern-breadth.js`:

```js
#!/usr/bin/env node
/**
 * Per-pattern breadth measurement (UNI-237)
 * =========================================
 * corpus-prevalence.js answers "how many institutions run X". This answers the question that
 * actually finds false positives: "which of X's patterns claimed it, and did anything else agree?"
 *
 * For each html regex we record how many homepages it matched. For each technology we record the
 * best match count among its NON-html channels. The difference —
 *
 *     excess = max(0, htmlPatternMatches - strongestNonHtmlMatches)
 *
 * — is collision mass: homepages where an html substring asserted the technology and no independent
 * signal backed it up. `Bootstrap`'s `class=".*row"` matches ~70% of homepages while its script
 * marker matches far fewer; that gap is the false positives.
 *
 * ⚠️ Corpus captures are bare rendered HTML. evidenceFromHtml supplies no jsGlobals, cookies,
 * headers, finalUrl or networkHosts, so the js/cookies/headers/url/xhr channels CANNOT fire here.
 * That is recorded in the artifact as channelsNotProbed. A zero in this file means "not measurable
 * from a static capture", never "absent in production".
 *
 * ⚠️ A crashed or killed shard must never look like a valid, merely-smaller result — every shard's
 * exit is checked and the totals reconciled, exactly as in corpus-prevalence.js.
 *
 * Usage:
 *   node scripts/pattern-breadth.js [--limit N] [--shards N]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORPUS = path.resolve(ROOT, process.env.CORPUS_DIR || 'corpus');
const CHANNELS_NOT_PROBED = ['js', 'cookies', 'headers', 'url', 'xhr'];

function listDirs() {
  return fs.readdirSync(CORPUS)
    .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
    .sort();
}

// ---------- child ----------
if (process.env.BREADTH_SHARD !== undefined) {
  const DeTECHtor = require('../src/detechtor.js');
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const { classifyCapture } = require('../src/capture-quality.js');

  const shard = Number(process.env.BREADTH_SHARD);
  const shards = Number(process.env.BREADTH_SHARDS);
  const limit = Number(process.env.BREADTH_LIMIT || 0);

  const engine = new DeTECHtor();
  let dirs = listDirs();
  if (limit) dirs = dirs.slice(0, limit);
  dirs = dirs.filter((_, i) => i % shards === shard);

  // tech -> { fires, html: {regex: n}, other: {label: n} }
  const acc = Object.create(null);
  let scanned = 0, unscannable = 0, readFailures = 0, classifyFailures = 0, matchFailures = 0;

  for (const d of dirs) {
    let html;
    try {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      if (!f) { readFailures++; continue; }
      html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    } catch { readFailures++; continue; }

    let quality;
    try { quality = classifyCapture(html); } catch { classifyFailures++; continue; }
    if (!quality.scannable) { unscannable++; continue; }
    scanned++;

    let matches;
    try { matches = engine.matchPatterns(evidenceFromHtml(html, engine.domPlan)); }
    catch { matchFailures++; continue; }

    for (const m of matches) {
      const a = acc[m.name] || (acc[m.name] = { fires: 0, html: Object.create(null), other: Object.create(null) });
      a.fires++;
      // Count each distinct pattern at most once per homepage: we are measuring "on how many pages
      // did this regex match", not "how many times did it match on a page".
      const seen = new Set();
      for (const ev of m.evidence || []) {
        const s = String(ev);
        const i = s.indexOf(': ');
        if (i === -1) continue;
        const kind = s.slice(0, i);
        const body = s.slice(i + 2);
        const key = JSON.stringify([kind, body]);
        if (seen.has(key)) continue;
        seen.add(key);
        if (kind === 'HTML') a.html[body] = (a.html[body] || 0) + 1;
        else a.other[key] = (a.other[key] || 0) + 1;
      }
    }
  }

  process.send(
    { scanned, unscannable, readFailures, classifyFailures, matchFailures, acc },
    () => process.exit(0)
  );
} else {
  // ---------- parent ----------
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const LIMIT = li === -1 ? 0 : Number(args[li + 1]);
  const si = args.indexOf('--shards');
  const SHARDS = si === -1 ? Math.max(1, Math.min(os.cpus().length - 2, 12)) : Number(args[si + 1]);

  if (!Number.isInteger(SHARDS) || SHARDS < 1) {
    console.error(`FATAL: --shards must be a positive integer, got ${JSON.stringify(args[si + 1])}.`);
    process.exit(1);
  }
  if (li !== -1 && (!Number.isFinite(LIMIT) || LIMIT < 1)) {
    console.error(`FATAL: --limit must be a positive number, got ${JSON.stringify(args[li + 1])}.`);
    process.exit(1);
  }
  if (!fs.existsSync(CORPUS)) {
    console.error(`FATAL: no corpus at ${CORPUS}. Set CORPUS_DIR or fetch it with scripts/wasabi-corpus.js.`);
    process.exit(1);
  }

  const total = LIMIT || listDirs().length;
  console.log(`pattern breadth — ${total} captures across ${SHARDS} shards\n`);

  const merged = {
    scanned: 0, unscannable: 0, readFailures: 0, classifyFailures: 0, matchFailures: 0,
    acc: Object.create(null),
  };
  let done = 0;
  let anyFailure = false;

  for (let i = 0; i < SHARDS; i++) {
    let gotMessage = false;
    let settled = false;

    const child = fork(__filename, [], {
      env: { ...process.env, BREADTH_SHARD: String(i), BREADTH_SHARDS: String(SHARDS), BREADTH_LIMIT: String(LIMIT) },
    });

    const settle = () => {
      if (settled) return;
      settled = true;
      done++;
      console.log(`  shard ${done}/${SHARDS} settled`);
      if (done === SHARDS) finish();
    };

    child.on('message', (m) => {
      gotMessage = true;
      merged.scanned += m.scanned;
      merged.unscannable += m.unscannable;
      merged.readFailures += m.readFailures;
      merged.classifyFailures += m.classifyFailures;
      merged.matchFailures += m.matchFailures;
      for (const [tech, a] of Object.entries(m.acc)) {
        const t = merged.acc[tech] || (merged.acc[tech] = { fires: 0, html: Object.create(null), other: Object.create(null) });
        t.fires += a.fires;
        for (const [k, v] of Object.entries(a.html)) t.html[k] = (t.html[k] || 0) + v;
        for (const [k, v] of Object.entries(a.other)) t.other[k] = (t.other[k] || 0) + v;
      }
    });

    child.on('error', (err) => {
      console.error(`FATAL: shard ${i} process error: ${err.message}`);
      anyFailure = true;
      settle();
    });

    child.on('exit', (code) => {
      if (code !== 0 || !gotMessage) {
        console.error(
          `FATAL: shard ${i} exited with code ${code}${gotMessage ? '' : ' and sent no result'} — its contribution is lost.`
        );
        anyFailure = true;
      }
      settle();
    });
  }

  function finish() {
    if (anyFailure) {
      console.error('\nFATAL: one or more shards failed — refusing to write a partial artifact.');
      process.exit(1);
    }

    const accounted = merged.scanned + merged.unscannable + merged.readFailures + merged.classifyFailures;
    if (accounted !== total) {
      console.error(
        `FATAL: accounted directories (${accounted}) != intended directories (${total}) — ` +
        'some input was silently dropped. Refusing to write a partial artifact.'
      );
      process.exit(1);
    }

    const patterns = Object.create(null);
    for (const tech of Object.keys(merged.acc).sort()) {
      const a = merged.acc[tech];
      const strongest = Object.values(a.other).reduce((m, v) => (v > m ? v : m), 0);
      const htmlSorted = Object.create(null);
      for (const k of Object.keys(a.html).sort()) htmlSorted[k] = a.html[k];
      patterns[tech] = { fires: a.fires, strongest, html: htmlSorted };
    }

    const out = {
      generated: new Date().toISOString(),
      ticket: 'UNI-237',
      scanned: merged.scanned,
      unscannable: merged.unscannable,
      readFailures: merged.readFailures,
      classifyFailures: merged.classifyFailures,
      matchFailures: merged.matchFailures,
      channelsNotProbed: CHANNELS_NOT_PROBED,
      patterns,
    };

    const dest = path.join(ROOT, 'docs/pattern-breadth.json');
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
    console.log(`\nwrote ${dest}`);
    console.log(`${merged.scanned} scanned · ${Object.keys(patterns).length} technologies with at least one match`);
    if (merged.matchFailures) console.log(`⚠️  ${merged.matchFailures} match failures — counts are a floor`);
  }
}
```

- [ ] **Step 2: Smoke-test on a slice**

Run: `node scripts/pattern-breadth.js --limit 200 --shards 4`
Expected: exits 0, prints `wrote …/docs/pattern-breadth.json`, and `scanned + unscannable + readFailures + classifyFailures === 200`.

- [ ] **Step 3: Verify the crash guard actually guards**

Deliberately break a shard and confirm the artifact is *not* written:

```bash
cp docs/pattern-breadth.json /tmp/breadth-backup.json
BREADTH_CRASHTEST=1 node -e '
const cp=require("child_process");
const p=cp.spawn("node",["scripts/pattern-breadth.js","--limit","200","--shards","4"],{stdio:"inherit"});
// Kill one grandchild of THIS process only. Never pgrep by script name: the matcher will match the
// killing command itself and take down the wrong process (this bit us twice already).
setTimeout(()=>{
  let out=[];
  try{ out=cp.execSync(`pgrep -P ${p.pid}`).toString().trim().split("\n").filter(Boolean); }
  catch{ console.error("no shard children yet — raise the delay"); return; }
  if(out[0]) process.kill(Number(out[0]),"SIGKILL");
},1500);
p.on("exit",c=>{console.log("exit code",c);process.exit(c===0?1:0)});
'
```

Expected: non-zero exit, `FATAL: shard … exited with code null and sent no result`, and `docs/pattern-breadth.json` unchanged from the backup. Restore with `cp /tmp/breadth-backup.json docs/pattern-breadth.json` if it did change (that would be a bug to fix before proceeding).

- [ ] **Step 4: Run the full corpus**

Run: `node scripts/pattern-breadth.js`
Expected: ~4,215 captures, several minutes. Confirm `scanned` matches `corpus-prevalence.json`'s `scanned` (3,879) — a different number means the two scripts disagree about what is scannable, which must be resolved before the gate is built on it.

- [ ] **Step 5: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "breadth": "node scripts/pattern-breadth.js",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/pattern-breadth.js docs/pattern-breadth.json package.json
git commit -m "feat(uni-237): per-pattern breadth instrument

Measures how many homepages each individual html regex matched, and the best
match count among the technology's non-html channels. The gap between them is
collision mass: pages where an html substring asserted the technology and no
independent signal agreed.

Records channelsNotProbed (js/cookies/headers/url/xhr) in the artifact --
corpus captures are bare HTML, so a zero here means 'not measurable from a
static capture', never 'absent in production'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The breadth gate, calibrated

**Files:**
- Create: `scripts/lint-pattern-breadth.js`
- Create: `patterns/breadth-allowlist.json`
- Create: `tests/breadth-gate.test.js`
- Modify: `package.json` (`test` script + `lint:breadth`)

**Interfaces:**
- Consumes: `docs/pattern-breadth.json` from Task 5; `validatePatternOverrides` from Task 1.
- Produces: `node scripts/lint-pattern-breadth.js --gate` exits non-zero on any violation. Task 7 uses its plain (non-gate) output as the authoritative deletion worklist.

**Context:** Two thresholds, because one is not enough. **Absolute:** excess > 2% of scanned homepages, which catches `Bootstrap`/`Localist`/`Ghost`. **Relative:** excess/fires > 25% with fires ≥ 20, which catches `TargetX` — 35 of its 122 detections are `targetXP` in a minified analytics bundle, an excess of only 0.9% of homepages but 29% of its own detections.

**Both thresholds are provisional.** Step 4 calibrates them against a labelled set and records the result. If a threshold has to move, move it and say why in the commit message — do not quietly keep a number that does not separate the classes.

- [ ] **Step 1: Write the gate**

Create `scripts/lint-pattern-breadth.js`:

```js
#!/usr/bin/env node
/**
 * Measured breadth gate (UNI-237)
 * ===============================
 * Replaces the hand-maintained STOPWORDS list in scripts/lint-patterns.js, which cannot tell
 * `ghost` (5 chars, matches btn-ghost on 16% of homepages) from `algolia` (7 chars, a distinctive
 * vendor string). Breadth is empirical, not lexical.
 *
 * An html pattern fails when its EXCESS over the technology's strongest independent signal is:
 *   - absolute: more than ABS_PCT of scanned homepages, or
 *   - relative: more than REL_PCT of the technology's own detections (with a MIN_FIRES floor).
 *
 * Both are needed. Bootstrap's `class=".*row"` fails the absolute test. TargetX's `targetx` --
 * matching `targetUrl:d,targetXP:l` in a minified bundle on 35 of its 122 detections -- is only
 * 0.9% of homepages and fails solely on the relative test.
 *
 * Exemptions live in patterns/breadth-allowlist.json, one reason each, and are themselves validated:
 * a stale or no-op entry fails the build, so the allowlist cannot silently accumulate dead weight.
 *
 * Usage:
 *   node scripts/lint-pattern-breadth.js           # report
 *   node scripts/lint-pattern-breadth.js --gate    # exit 1 on any violation
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ABS_PCT = 0.02;   // of scanned homepages
const REL_PCT = 0.25;   // of the technology's own detections
const MIN_FIRES = 20;   // below this, the relative test is noise

const GATE = process.argv.includes('--gate');

// --breadth / --allowlist let tests point the gate at fixtures without copying the whole repo into
// a temp dir. src/detechtor.js requires ~12 pattern files by relative path, so a symlinked copy in
// a scratch directory cannot load — the gate must run in place.
function argPath(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? path.join(ROOT, fallback) : path.resolve(process.argv[i + 1]);
}

const breadthPath = argPath('--breadth', 'docs/pattern-breadth.json');
if (!fs.existsSync(breadthPath)) {
  console.error(`FATAL: ${breadthPath} missing. Run \`npm run breadth\` first.`);
  process.exit(1);
}
const breadth = JSON.parse(fs.readFileSync(breadthPath, 'utf8'));
const allowlist = JSON.parse(fs.readFileSync(argPath('--allowlist', 'patterns/breadth-allowlist.json'), 'utf8'));
const allowed = allowlist.allow || {};

// A gate whose input is empty passes trivially. That is indistinguishable from "nothing is wrong",
// so refuse it: an artifact with no scanned pages or no patterns is a broken measurement.
if (!breadth.scanned || !breadth.patterns || Object.keys(breadth.patterns).length === 0) {
  console.error('FATAL: pattern-breadth.json reports no scanned pages or no patterns — the measurement is broken.');
  process.exit(1);
}

const absLimit = breadth.scanned * ABS_PCT;
const violations = [];
const allowHits = new Set();

for (const [tech, p] of Object.entries(breadth.patterns)) {
  for (const [regex, matched] of Object.entries(p.html || {})) {
    const excess = Math.max(0, matched - (p.strongest || 0));
    const failsAbs = excess > absLimit;
    const failsRel = p.fires >= MIN_FIRES && excess / p.fires > REL_PCT;
    if (!failsAbs && !failsRel) continue;

    const key = JSON.stringify([tech, regex]);
    if (Array.isArray(allowed[tech]) && allowed[tech].some((e) => e.pattern === regex)) {
      allowHits.add(key);
      continue;
    }
    violations.push({
      tech, regex, matched, strongest: p.strongest || 0, fires: p.fires, excess,
      why: [failsAbs && 'absolute', failsRel && 'relative'].filter(Boolean).join('+'),
    });
  }
}

// Allowlist hygiene: an entry that no longer names a real technology, or that no longer exempts
// anything, is dead weight that reads as a considered decision.
const allowProblems = [];
for (const [tech, entries] of Object.entries(allowed)) {
  if (tech === '_comment') continue;
  const p = breadth.patterns[tech];
  if (!p) { allowProblems.push(`${tech}: no such technology in the breadth artifact — stale`); continue; }
  for (const e of entries) {
    if (!e || typeof e.pattern !== 'string' || typeof e.reason !== 'string' || !e.reason.trim()) {
      allowProblems.push(`${tech}: every entry needs {pattern, reason}`);
      continue;
    }
    if (!(e.pattern in (p.html || {}))) {
      allowProblems.push(`${tech}: pattern ${JSON.stringify(e.pattern)} is no longer declared — stale`);
      continue;
    }
    if (!allowHits.has(JSON.stringify([tech, e.pattern]))) {
      allowProblems.push(`${tech}: pattern ${JSON.stringify(e.pattern)} no longer exceeds either threshold — no-op`);
    }
  }
}

// The override layer is validated here too, so a reimport that reverts a decision fails the build.
const DeTECHtor = require('../src/detechtor.js');
const { validatePatternOverrides } = require('../src/pattern-overrides.js');
const PATTERN_OVERRIDES = require('../patterns/pattern-overrides.json');
const pristine = new DeTECHtor().loadPatterns({ applyOverrides: false });
const overrideProblems = validatePatternOverrides(pristine, PATTERN_OVERRIDES.overrides || {});

violations.sort((a, b) => b.excess - a.excess);

console.log(`breadth gate — ${breadth.scanned} homepages · absolute >${absLimit.toFixed(0)} · relative >${REL_PCT * 100}% (min ${MIN_FIRES} fires)\n`);
if (violations.length) {
  console.log('VIOLATIONS');
  for (const v of violations) {
    console.log(
      `  ${String(v.excess).padStart(5)} excess  ${(v.excess / v.fires * 100).toFixed(0).padStart(3)}%  ` +
      `[${v.why}]  ${v.tech} :: ${JSON.stringify(v.regex)}  (matched ${v.matched}, strongest ${v.strongest}, fires ${v.fires})`
    );
  }
  console.log('');
}
for (const p of allowProblems) console.log(`ALLOWLIST  ${p}`);
for (const p of overrideProblems) console.log(`OVERRIDE   ${p.name}: ${p.problem}`);

const failures = violations.length + allowProblems.length + overrideProblems.length;
console.log(`\n${violations.length} violation(s) · ${allowProblems.length} allowlist problem(s) · ${overrideProblems.length} override problem(s)`);

if (GATE && failures > 0) process.exit(1);
```

Create `patterns/breadth-allowlist.json`:

```json
{
  "_comment": "UNI-237. Reviewed exemptions from scripts/lint-pattern-breadth.js. Each entry needs a pattern and a reason. A stale entry (technology or pattern gone) and a no-op entry (no longer over threshold) both FAIL the build — this list may not accumulate dead weight.",
  "allow": {}
}
```

- [ ] **Step 2: Write the gate's own tests**

Create `tests/breadth-gate.test.js`:

```js
// tests/breadth-gate.test.js — UNI-237. The gate must fail on each threshold independently, and
// must reject a stale or no-op allowlist entry.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// The gate must run IN PLACE: src/detechtor.js requires ~12 pattern files by relative path, so a
// copy or symlink in a scratch directory cannot load. --breadth/--allowlist point it at fixtures.
function runGate(breadth, allow) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'breadth-'));
  const bPath = path.join(dir, 'breadth.json');
  const aPath = path.join(dir, 'allow.json');
  fs.writeFileSync(bPath, JSON.stringify(breadth));
  fs.writeFileSync(aPath, JSON.stringify({ allow }));
  try {
    const out = execFileSync(
      'node',
      [path.join(ROOT, 'scripts/lint-pattern-breadth.js'), '--gate', '--breadth', bPath, '--allowlist', aPath],
      { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }
    );
    return { code: 0, out: String(out) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') };
  }
}

// absLimit = 2% of 1000 = 20; excess = 800 - 100 = 700. Fails absolute (and relative).
const ABS_CASE = {
  scanned: 1000,
  patterns: { Bootstrap: { fires: 900, strongest: 100, html: { 'class=".*row': 800 } } },
};
// The TargetX shape, sized so ONLY the relative test can fire:
//   absLimit = 2% of 5000 = 100; excess = 122 - 87 = 35, which is UNDER it.
//   relative = 35/122 = 28.7%, which is OVER the 25% line.
// If this fixture ever trips the absolute test too, the test proves nothing — raise `scanned`.
const REL_CASE = {
  scanned: 5000,
  patterns: { TargetX: { fires: 122, strongest: 87, html: { targetx: 122 } } },
};

test('the absolute threshold fails an over-broad pattern', () => {
  const r = runGate(ABS_CASE, {});
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /absolute/);
});

test('the relative threshold fails a pattern that is under the absolute one', () => {
  const r = runGate(REL_CASE, {});
  assert.strictEqual(r.code, 1);
  // Must say `relative` ALONE. If it says `absolute+relative` the fixture is mis-sized and the test
  // is not proving the thresholds are independent.
  assert.match(r.out, /\[relative\]/, r.out);
  assert.doesNotMatch(r.out, /absolute/, 'fixture must not trip the absolute threshold');
});

test('an allowlisted pattern passes', () => {
  const r = runGate(ABS_CASE, { Bootstrap: [{ pattern: 'class=".*row', reason: 'reviewed' }] });
  assert.strictEqual(r.code, 0, r.out);
});

test('a stale allowlist entry naming a missing technology fails', () => {
  const r = runGate(ABS_CASE, {
    Bootstrap: [{ pattern: 'class=".*row', reason: 'reviewed' }],
    Nonexistent: [{ pattern: 'x', reason: 'r' }],
  });
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /stale/);
});

test('a no-op allowlist entry fails', () => {
  const clean = { scanned: 1000, patterns: { Algolia: { fires: 300, strongest: 300, html: { algolia: 300 } } } };
  const r = runGate(clean, { Algolia: [{ pattern: 'algolia', reason: 'distinctive vendor string' }] });
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /no-op/);
});

test('an empty breadth artifact fails rather than passing trivially', () => {
  const r = runGate({ scanned: 0, patterns: {} }, {});
  assert.strictEqual(r.code, 1);
});
```

- [ ] **Step 3: Run the gate's tests**

Run: `node --test tests/breadth-gate.test.js`
Expected: PASS, 6 tests. If the `REL_CASE` fixture happens to trip the absolute threshold too, adjust its numbers until only the relative one fires — the point of that test is to prove the thresholds are independent.

- [ ] **Step 4: Calibrate against the labelled set**

Run: `node scripts/lint-pattern-breadth.js > /tmp/breadth-report.txt; cat /tmp/breadth-report.txt`

Check the report against the labelled set:

**Must appear as violations (known-bad):** `Bootstrap` (`class=".*row"`, `class=".*col-"`, `class=".*btn-"`), `Localist` (`event.*calendar`), `Microsoft Power BI` (`power.*bi`), `GIS Cloud` (`gis.*cloud`), `Ghost` (`ghost`), `Veracross` (`vera.*cross`), `Google Workspace` (`g.*suite`), `Ready Education` (`ready.*education`), `TargetX` (`targetx`).

**Must NOT appear (known-good):** `Yoast SEO Premium` (`<!-- This site is optimized with the Yoast SEO Premium plugin v([^\s]+) `), `Modern Campus CMS` (any), `Slate (Technolutions)` (any), `Algolia` (`algolia`), `Canvas LMS` (`instructure\.com`).

If a known-bad is missing or a known-good appears, **change the threshold, not the label** — then re-run and re-check. Record in `/tmp/breadth-report.txt` and quote the final numbers in the commit message. If no threshold pair separates the two sets, stop and report: that means excess is the wrong metric and the design needs revisiting, which is a decision for the human, not a number to fudge.

- [ ] **Step 5: Wire into `npm test`**

In `package.json`, add `lint:breadth` and insert the gate into `test` **after** `category-audit.js --gate`:

```json
    "test": "node scripts/lint-patterns.js --fail-curated && node scripts/lint-dom-rules.js --gate && node scripts/category-audit.js --gate && node scripts/lint-pattern-breadth.js --gate && node --test tests/*.test.js && node scripts/test-patterns.js",
    "lint:breadth": "node scripts/lint-pattern-breadth.js",
```

- [ ] **Step 6: Confirm the gate currently FAILS**

Run: `npm test`
Expected: **FAIL**, listing the ~52 violations. This is correct and expected — Task 7 fixes them. Do not allowlist them to make the build green, and do not defer wiring the gate until after Task 7: a gate that has never been seen to fail has not been shown to work. Task 6 is the one task in this plan that ends with a red build, and its Global Constraints entry says so.

- [ ] **Step 7: Commit**

```bash
git add scripts/lint-pattern-breadth.js patterns/breadth-allowlist.json tests/breadth-gate.test.js package.json
git commit -m "feat(uni-237): measured breadth gate, replacing the hand-maintained stoplist

Two thresholds, because one is not enough: absolute excess >2% of homepages
catches Bootstrap/Localist/Ghost; relative excess >25% of a technology's own
detections (min 20 fires) catches TargetX, whose 35 targetXP false positives
are only 0.9% of homepages but 29% of its detections.

Calibrated against a labelled set -- see the commit body for final numbers.
The allowlist is itself gated: a stale or no-op entry fails the build.

npm test now FAILS with ~52 violations. That is the worklist, not a
regression; Task 7 clears it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Clear the violations

**Files:**
- Modify: `patterns/higher-ed-infra.json`, `patterns/higher-ed-sis.json`, `patterns/higher-ed-lms.json`, `patterns/higher-ed-cms.json`
- Modify: `patterns/pattern-overrides.json`
- Regenerate: `docs/pattern-breadth.json`

**Interfaces:**
- Consumes: the violation list from `node scripts/lint-pattern-breadth.js` (Task 6) — **that output is the authoritative worklist**, not any list in the spec or this plan.
- Produces: a green `npm test`.

**Context:** All 47 affected technologies already carry a good signal beside the bad pattern, so every fix is a removal. Which mechanism depends on the file:

- Technologies in `patterns/higher-ed-*.json` — **edit the JSON directly.** Nothing regenerates those files.
- Technologies stamped `_generated: true` (i.e. in `patterns/generated/`) — **add a rule to `patterns/pattern-overrides.json`.** Editing that file is reverted by the next import. Check with: `node -e "const e=new (require('./src/detechtor.js'))(); const d=e.patterns['NAME']; console.log(d._sourceFile, d._generated ? '-> use pattern-overrides.json' : '-> edit the file directly')"`.

- [ ] **Step 1: Handle the two judgement cases first**

`Jenzabar` (`higher-ed-sis.json`) declares `/ICS` and `/ICS/`. `/ICS` unanchored also matches ordinary URLs. **Do not delete both** — replace the pair with a single anchored form requiring a following path segment:

```json
    "html": ["/ICS/[A-Za-z]"]
```

`Funnelback` (`higher-ed-infra.json`) — delete `squiz.*search` from both `html` and `scripts`, keep `funnelback`, and **add the autocomplete host**, which is the marker that actually survives the product's architecture (the search query is handed to a separate page, so only the typeahead is visible on a homepage):

```json
    "html": ["funnelback", "funnelback\\.squiz\\.cloud"],
    "scripts": ["funnelback", "funnelback\\.squiz\\.cloud"],
```

- [ ] **Step 2: Clear the curated-file violations**

For each violation whose `_sourceFile` is a `higher-ed-*.json`, delete the offending string from that technology's `html` (and from `scripts` if the identical prose string appears there too — several do, e.g. `Localist`'s `event.*calendar`).

After each file, confirm nothing lost all its evidence:

```bash
node -e '
const E=require("./src/detechtor.js"); const e=new E();
const F=["html","scripts","scriptSrc","meta","dom","js","headers","cookies"];
const ne=v=>v&&(Array.isArray(v)?v.length:Object.keys(v).length);
const dead=Object.entries(e.patterns).filter(([n,d])=>n!=="_metadata"&&d&&typeof d==="object"&&/higher-ed-/.test(d._sourceFile||"")&&!F.some(f=>ne(d[f])));
console.log(dead.length?"LOST ALL EVIDENCE: "+dead.map(d=>d[0]).join(", "):"ok: every curated technology still has evidence");
'
```

Expected: `ok: …`

- [ ] **Step 3: Clear the upstream-file violations via the override layer**

For each violation whose definition is stamped `_generated: true`, add a rule to `patterns/pattern-overrides.json`. Example shape — write one entry per technology, with a reason naming what the pattern actually matches:

```json
{
  "_comment": "UNI-237. Evidence-pattern removals for technologies in the upstream-regenerated webappanalyzer-merged.json. See src/pattern-overrides.js. Each rule: {remove: {field: [pattern, ...]}, reason, decided}.",
  "overrides": {
    "Bootstrap": {
      "remove": { "html": ["class=\".*row", "class=\".*col-", "class=\".*btn-"] },
      "reason": "matches any class attribute followed anywhere by row/col-/btn-; matched 70% of homepages against a far smaller script-marker count",
      "decided": "2026-08-11"
    },
    "Ghost": {
      "remove": { "html": ["ghost"] },
      "reason": "bare token matches the btn-ghost CSS class; meta generator and powered-by remain",
      "decided": "2026-08-11"
    }
  }
}
```

- [ ] **Step 4: Re-measure**

```bash
cp docs/pattern-breadth.json /tmp/breadth-before.json
cp docs/corpus-prevalence.json /tmp/prevalence-before.json
npm run breadth
```

- [ ] **Step 5: Confirm the gate is green**

Run: `npm test`
Expected: PASS. Any residual violation is either a real one still to fix, or a case for the allowlist with a written reason — never allowlist to silence something you have not understood.

- [ ] **Step 6: Record the before/after delta**

```bash
node -e '
const b=require("/tmp/breadth-before.json"), a=require("./docs/pattern-breadth.json");
const rows=[];
for(const [t,p] of Object.entries(b.patterns)){
  const now=(a.patterns[t]||{}).fires||0;
  if(now!==p.fires) rows.push({t, before:p.fires, after:now, delta:now-p.fires});
}
rows.sort((x,y)=>x.delta-y.delta);
console.log("technology".padEnd(34),"before  after   delta");
for(const r of rows) console.log(r.t.padEnd(34), String(r.before).padStart(6), String(r.after).padStart(6), String(r.delta).padStart(7));
console.log("\n"+rows.length+" technologies changed");
' | tee /tmp/breadth-delta.txt
```

Expect `Bootstrap`, `Localist`, `Ghost`, `TargetX` and `Microsoft Power BI` to fall substantially. **Anything else moving is a finding, not a result** — investigate it before committing, and if a technology fell to zero, that deletion went too far and must be reverted.

- [ ] **Step 7: Commit**

```bash
git add patterns/ docs/pattern-breadth.json
git commit -m "fix(uni-237): remove the prose-collision patterns

Curated files edited directly; upstream-file technologies handled through the
pattern-override layer so a re-import cannot revert them.

Two judgement cases rather than deletions:
- Jenzabar /ICS and /ICS/ collapsed to /ICS/[A-Za-z], which needs a following
  path segment.
- Funnelback loses squiz.*search but GAINS funnelback\\.squiz\\.cloud. The
  product hands the query to a separate search page, so the typeahead host is
  the only marker visible on a homepage; 47 institutions carry one and exactly
  one exposes a <form action>.

Per-technology before/after in the PR body.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Recount dead patterns, regenerate artifacts, hand off

**Files:**
- Modify: `patterns/*.json` (delete the residual never-fireable technologies)
- Regenerate: `docs/corpus-prevalence.json`, `docs/category-coverage.md`
- Create: `docs/uni-237-handoff.md`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: the final artifacts and the hand-off document. Nothing depends on this task.

**Context:** 183 technologies had no evidence field the engine reads. 144 of them were dead *only* because `url`/`xhr` were ignored, which Task 2 fixed. Recount and delete whatever is still dead. Then regenerate the two published artifacts, whose figures PR #15 quotes and which Task 7's deletions have invalidated.

- [ ] **Step 1: Recount the dead**

```bash
node -e '
const E=require("./src/detechtor.js"); const e=new E();
const {mapCategory,SIGNAL_CATEGORIES}=require("./src/category-mapping.js");
const F=["html","scripts","scriptSrc","headers","meta","dom","js","cookies","url","xhr"];
const ne=v=>v!==undefined&&v!==null&&!(Array.isArray(v)&&v.length===0)&&!(typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===0);
const dead=[];
for(const [n,d] of Object.entries(e.patterns)){
  if(n==="_metadata"||!d||typeof d!=="object") continue;
  if(!F.some(f=>ne(d[f]))){
    const cats=[...new Set((d.categories||d.cats||[]).map(mapCategory))];
    dead.push({n, cats:cats.join("/"), sig:cats.some(c=>SIGNAL_CATEGORIES.has(c)), src:(d._sourceFile||"").split("/").pop()});
  }
}
console.log("still never-fireable:",dead.length,"| in signal categories:",dead.filter(d=>d.sig).length);
for(const d of dead.filter(x=>x.sig)) console.log("  SIGNAL",d.n,"["+d.cats+"]",d.src);
require("fs").writeFileSync("/tmp/dead.json",JSON.stringify(dead,null,2));
'
```

- [ ] **Step 2: Delete them**

Delete each still-dead technology from its pattern file. For any stamped `_generated: true`, the override layer **cannot** help — it removes patterns, not technologies — so instead add the deletion to `scripts/import-webappanalyzer.js` alongside the `text` strip from Task 2, keyed by an explicit name list, so a re-import does not resurrect them:

```js
      // UNI-237: technologies with no evidence field the engine reads. They can never fire, and a
      // re-import would otherwise bring them back. The list is generated, not hand-curated — see
      // Task 8 of docs/superpowers/plans/2026-08-11-detection-precision.md.
      if (NEVER_FIREABLE.has(name)) { delete mergedPatterns[name]; continue; }
```

with `NEVER_FIREABLE` declared near the top of the file as a `new Set([...])` of the names from `/tmp/dead.json`.

- [ ] **Step 2b: Re-record the generated-artifact hash**

Deleting technologies modified `patterns/generated/webappanalyzer-merged.json`, so Task 0's guard
will fail until the hash is re-recorded. This is a reviewed change, not a hand-edit slipping through:

```bash
node -e '
const fs=require("fs"), crypto=require("crypto");
const p="patterns/import-report.json";
const r=JSON.parse(fs.readFileSync(p,"utf8"));
r.artifactSha256=crypto.createHash("sha256").update(fs.readFileSync("patterns/generated/webappanalyzer-merged.json")).digest("hex");
r.artifactShaRecordedBy="UNI-237 Task 8: deleted never-fireable technologies";
fs.writeFileSync(p, JSON.stringify(r,null,2)+"\n");
console.log("re-recorded", r.artifactSha256);
'
```

- [ ] **Step 3: Regenerate both published artifacts**

```bash
npm run prevalence
npm run audit:coverage
```

- [ ] **Step 4: Record the prevalence delta**

```bash
node -e '
const b=require("/tmp/prevalence-before.json"), a=require("./docs/corpus-prevalence.json");
const keys=[...new Set([...Object.keys(b.counts),...Object.keys(a.counts)])];
const rows=keys.map(k=>({k,before:b.counts[k]||0,after:a.counts[k]||0})).filter(r=>r.before!==r.after);
rows.sort((x,y)=>(x.after-x.before)-(y.after-y.before));
console.log("technology".padEnd(34),"before  after   delta");
for(const r of rows) console.log(r.k.padEnd(34),String(r.before).padStart(6),String(r.after).padStart(6),String(r.after-r.before).padStart(7));
console.log("\n"+rows.length+" technologies changed · scanned "+b.scanned+" -> "+a.scanned);
' | tee /tmp/prevalence-delta.txt
```

`scanned` must be identical before and after. A change there means the corpus or the scannability classifier moved, which has nothing to do with this work and must be explained before proceeding.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all gates green

- [ ] **Step 6: Write the hand-off document**

Create `docs/uni-237-handoff.md` containing, with no invented numbers — every figure copied from `/tmp/breadth-delta.txt`, `/tmp/prevalence-delta.txt` or `/tmp/dead.json`:

1. **What changed** — the before/after table, and the four engine repairs.
2. **To UNI-141 (recall), split by cause.** *Genuine pattern gaps* — we have no pattern at all, and two are confirmed by a second source: `Sitefinity` (BuiltWith 1.1%, WhatCMS 21 institutions) and `HubSpot CMS` (BuiltWith 2.5%, WhatCMS 19); plus `Sakai`, `Ingeniux`, `TrustArc`, single-sourced to BuiltWith. *Genuine recall weakness* — `Google Custom Search` (14.6% vs 8.2%), `UserWay` (8.1% vs 4.3%), `OneTrust` (5.7% vs 2.6%), `Squarespace`, `Wix`, `Sitecore`, `Joomla`, `Contentful`, `ExpressionEngine`.

   **`WordPress` and `Drupal` are deliberately NOT on this list.** A third source settles it: `scans.whatcms_cms` is populated for 3,131 of the 4,459 institutions in cohort 107. WordPress — deTECHtor 42.5%, WhatCMS 44.1% of the 3,131 it identified (31.0% of all 4,459), BuiltWith 61.8%. Drupal — 17.7% / 20.0% / 14.1% / 23.8%. deTECHtor sits on WhatCMS's upper bound on every row; **BuiltWith is the outlier**, counting subdomains, historical traces and department blogs under a site whose real CMS is something else. Do not spend UNI-141 chasing 1,900 WordPress installs that are not missing. The same source vindicates `TerminalFour` (WhatCMS 2.6% vs our 2.2% vs BuiltWith 0.4%) and `Modern Campus` (12.2% / 10.0% / 9.8%). Caveats: cohort 107 predates 130/131; WhatCMS returns one primary CMS per site; 30% of the cohort got no answer.
3. **To UNI-225 (scope, NOT pattern defects)** — `Moodle` (8.8% vs 0.2%; lives at `moodle.<institution>.edu`), `Osano` (6.7% vs 0.4%; async-injected), `Blackboard (Anthology)` (10.3% vs 2.6%), `Funnelback` (search proxied to a separate page). These patterns are already correct; mining new ones would waste the effort.
4. **To UNI-238 (vocabulary)** — `signal_polarity: "negative"` on `accessiBe`, `AudioEye`, `UserWay`, `EqualWeb`, `Recite Me`, `WP Accessibility Helper` is read by nothing, so a consumer scores an accessibility *overlay* as an accessibility positive. `UserWay` alone fires on 4.3% of institutions.
5. **Blocked, with the reason** — `requires` (610 patterns, 170 firing) stays off until UNI-141 fixes WordPress recall. Almost all are WordPress plugins declaring `requires:["WordPress"]`; enabling it while we miss WordPress on ~1,900 sites would suppress those plugins there too, turning one recall bug into a cascade. Same for `requiresCategory` (89). `implies` (970) stays off because it adds inferred detections rather than removing false ones.
6. **How to re-run any of it** — `npm run breadth`, `npm run lint:breadth`, `npm run prevalence`, `npm run audit:coverage`.
7. **What this still does not tell you** — the corpus cannot exercise `js`, `cookies`, `headers`, `url` or `xhr`; a zero there means "not measurable from a static capture", never "absent in production". BuiltWith is a thin oracle in HE-specialist categories (its CRM rollup tracks four vendors) and a ratio from it is a prompt to inspect the corpus, never a verdict.

- [ ] **Step 7: Commit**

```bash
git add patterns/ patterns/import-report.json scripts/import-webappanalyzer.js docs/corpus-prevalence.json docs/category-coverage.md docs/uni-237-handoff.md
git commit -m "chore(uni-237): delete residual dead patterns, regenerate artifacts, hand off

Recounted never-fireable technologies after url/xhr support landed and deleted
what remains, with an import-time guard so a re-import cannot resurrect them.

Regenerated corpus-prevalence.json and category-coverage.md: PR #15 quoted
Bootstrap at 98.0% and SIS figures that the deletions have invalidated.

docs/uni-237-handoff.md splits the recall findings between UNI-141 (real
pattern gaps and weakness) and UNI-225 (scope limits whose patterns are
already correct), sends signal_polarity to UNI-238, and records why requires
and implies stay off.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
