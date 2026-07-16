# UNI-156 — Signal-Category Pattern Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the curated `higher-ed-*.json` partials the authoritative, data-mined source for the big signal categories (CMS, LMS, SIS, CRM, Chatbot/AI, Site Search, Accessibility) and stop the un-audited Wappalyzer base from polluting them — via a correct category taxonomy, data-mined tight patterns, and a provenance-aware product gate.

**Architecture:** Three root causes, fixed in order. (1) `src/category-mapping.js` mis-resolves the base's numeric `cats` ids, dumping ecommerce/widget/translation/social tools into CMS/LMS — fix the taxonomy (ours to redefine; deTECHtor is a fork of a fork of the last OSS Wappalyzer, no upstream contract). (2) The base's differently-named entries always fire because `loadPatterns` (`src/detechtor.js:32`) is a flat name-keyed `Object.assign` that discards source provenance — re-introduce provenance at the merge and emit it per detection. (3) Curated signal-category patterns are thin/over-broad — data-mine tight patterns against a **Wasabi-backed local HTML corpus** (cohort-128 rendered HTML, keyed by `scan_pages.content_archive_key`) using BuiltWith (`institutions.tech_profile`) as the positive oracle. The product-facing floor lives in **benchmark-agent** (`filter_by_confidence`, default 50), not detechtor — so the final suppression gate is enforced there, made category+provenance-aware.

**Tech Stack:** deTECHtor (Node ≥18, JS, no build step, `npm test` = `lint-patterns --fail-curated && test-patterns`) · benchmark-agent (Ruby 3.1, `aws-sdk-s3` via `lib/integrations/wasabi_storage.rb`) · shared Supabase `jlnpqppnyuevdpuvpsiz` (Postgres, read via Supabase MCP / SQL editor) · Wasabi S3 (`benchmark-scans`, endpoint `https://s3.eu-west-3.wasabisys.com`, `forcePathStyle`).

## Global Constraints

- **No fabricated data.** Every mined pattern must carry a `_validation` note citing real recall / spot-check evidence from the corpus. Missing evidence → `no-evidence`/`suspect`, never a guessed pattern. (User standing rule.)
- **Shared Supabase is small & fragile.** Read-only. Bounded queries only: null-checked COUNTs, `LIMIT`-ed samples, no full-table `content` detoast. Never run a heavy 500k-row query during a live weekly scan. (memory: supabase-bulk-op-safety.)
- **No schema changes** in this work. If any task appears to need a migration, STOP and consult `supabase-schema-guardian`. All DB access here is read-only SELECT.
- **Curated patterns must pass `npm test`** (`lint-patterns --fail-curated`): no bare literal ≤3 chars, no broad wildcard whose longest literal run ≤4, no whole-pattern stopword. Run before every commit that touches a `patterns/*.json` file.
- **`js`/`meta`/`headers`/`cookies` fields are key-scoped and not linted; `html`/`scripts` are.** Prefer key-scoped evidence (meta generator, headers, dedicated script hosts) over bare `html` substrings.
- **Signal categories** (the set the whole plan protects), defined once in Task 1.3 and imported everywhere: `CMS, LMS, SIS, CRM, Chatbot, Site Search, Accessibility`.
- **Wappalyzer base stays authoritative for the long tail** (analytics, JS libs, CDN, servers, programming languages). Only signal categories are curated + gated.
- **Confidence semantics:** runtime confidence is *accumulated from evidence* in `evaluatePattern` (html +40, script +60, network +70, header +80, meta +100, dom +70, js +80, cookie +70; capped 100) — NOT the pattern's declared `confidence` field. Reason about over-firing in those terms.

---

## File Structure

**deTECHtor (`/Users/Argyle/LLM/detechtor`):**
- `src/category-mapping.js` — MODIFY. Redefined taxonomy + `SIGNAL_CATEGORIES` export + `isSignalCategory()`.
- `src/detechtor.js` — MODIFY. `loadPatterns` stamps provenance (`_curated`, `_sourceFile`); `evaluatePattern`/`mergeTechnologies` carry `provenance`/`curated` through to emitted detections.
- `src/config.js` — MODIFY (only if a new curated partial filename is added, e.g. `higher-ed-crm.json`, `higher-ed-search.json`, `higher-ed-chat.json`).
- `patterns/higher-ed-cms.json`, `higher-ed-lms.json`, `higher-ed-sis.json`, `higher-ed-infra.json`, `higher-ed-accessibility.json` — MODIFY (curate/retag).
- `patterns/higher-ed-crm.json`, `patterns/higher-ed-search.json`, `patterns/higher-ed-chat.json` — CREATE (new signal-category partials).
- `scripts/wasabi-corpus.js` — CREATE. Node S3 fetch+gunzip of cohort-128 HTML by `content_archive_key` → local corpus dir.
- `scripts/mine-local.js` — CREATE. Local-corpus signature miner (recall / spot-check) — the offline replacement for `mine-signature.js`'s inline-SQL match, since inline HTML is offloaded.
- `scripts/category-id-audit.js` — CREATE. Empirical id→category audit of `webappanalyzer-merged.json` (drives Task 1's remap).
- `scripts/residual-audit.js` — CREATE. Samples raw Wasabi `detechtor.json` (or re-runs local corpus) to measure base over-firing in signal categories after Task 1+3 — the go/no-go for Task 4's provenance gate.
- `tests/category-mapping.test.js`, `tests/provenance.test.js` — CREATE (node:test).
- `tests/fixtures/known-sites.json` — MODIFY (add the named polluters as `must_not_match` FP tests).
- `tests/detval/` — CREATE (rehome the surviving 20-institution on/off harness `run.sh`/`analyze.js`/`floored.js` from the dead session scratchpad into the repo).

**benchmark-agent (`/Users/Argyle/LLM/benchmark-agent`):**
- `lib/integrations/detechtor_integration.rb` — MODIFY. `filter_by_confidence` → category+provenance-aware `gate_signal_categories` (signal-category detections require `curated == true` OR a higher confidence bar). Only if Task 4's residual measurement says it's material.
- `spec/` (or existing test dir) — MODIFY/CREATE a spec for the gate.

---

## Phase 0 — Verify corpus liveness & ground the remap

### Task 0.1: Confirm inline HTML is offloaded (the "verify" gate before building the fetcher)

**Files:** none (read-only DB probe via Supabase MCP / SQL editor).

**Interfaces:**
- Produces: a decision — `INLINE_DEAD = true|false` — consumed by Task 2 (whether the Wasabi fetcher is required or `mine-signature.js` inline mode still works).

- [ ] **Step 1: Run the bounded liveness count** (Supabase MCP `execute_sql`, or SQL editor). Exactly this, no full detoast:

```sql
SELECT
  count(*)                                                        AS scan_pages_total,
  count(*) FILTER (WHERE content ? 'html' AND length(content->>'html') > 0) AS inline_html_rows,
  count(*) FILTER (WHERE content_archive_key IS NOT NULL)         AS archived_rows
FROM scan_pages;
```

- [ ] **Step 2: Interpret.** If `inline_html_rows` ≈ 0 and `archived_rows` is large → `INLINE_DEAD = true` → the Wasabi fetcher (Task 2) is REQUIRED and `mine-signature.js` cannot be used as-is. If `inline_html_rows` is large → inline mining still works; Task 2 still adds value (full-population, no TOAST sampling cap) but is not strictly required. Record the three numbers in the PR description.

- [ ] **Step 3: Commit** the recorded numbers into this plan file as a note under Task 0.1 (no code).

> **RESULT (2026-07-16, run via Supabase MCP execute_sql):** `scan_pages_total = 23140`, `inline_html_rows = 0`, `archived_rows = 20877`. Inline HTML is **completely offloaded (0 rows)** → **`INLINE_DEAD = true`**. Phase 2 (Wasabi fetcher) is **REQUIRED**; `mine-signature.js` inline mode is dead and must be replaced by `mine-local.js` against the fetched corpus.

### Task 0.2: Document the real confidence-floor seam (already located — capture as a test-anchoring note)

**Files:** none (documentation of verified facts).

- [ ] **Step 1: Record** the verified seam so later tasks target the right place:
  - Product floor = benchmark-agent `lib/integrations/detechtor_integration.rb:79-80` → `ENV['DETECHTOR_MIN_CONFIDENCE'] || '50'`; applied in `filter_by_confidence` (`:88-97`) to the DB-bound copy.
  - Raw unfiltered detechtor output is persisted to Wasabi first (`benchmark-agent/agent.rb:311, 380-386`).
  - deTECHtor's own internal floor = `src/config.js:75` `minConfidence: 30`, applied at `src/detechtor.js:798`.
  - There is NO `--confidence` passed by benchmark-agent; do not change the CLI default.

### Task 0.3: Empirically audit base category-id usage (drives the remap)

**Files:** Create `scripts/category-id-audit.js`.

**Interfaces:**
- Consumes: `patterns/webappanalyzer-merged.json`.
- Produces: `docs/category-id-audit.json` — `{ "<id>": { count, sampleTechs: [top 15 by name], currentName } }` for every numeric id used in the base. Consumed by Task 1.2 to decide each id's correct bucket.

- [ ] **Step 1: Write the audit script.**

```js
#!/usr/bin/env node
// scripts/category-id-audit.js — empirical id -> real category inference.
// For each numeric cats id used in webappanalyzer-merged.json, list how many
// techs carry it and a sample of their names, plus the CURRENT mapped name.
const fs = require('fs');
const path = require('path');
const { categoryMapping } = require('../src/category-mapping.js');
const base = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../patterns/webappanalyzer-merged.json'), 'utf8'));
const byId = {};
for (const [name, def] of Object.entries(base)) {
  if (name === '_metadata' || !def || !Array.isArray(def.cats)) continue;
  for (const id of def.cats) {
    (byId[id] ||= { count: 0, sampleTechs: [] });
    byId[id].count++;
    if (byId[id].sampleTechs.length < 15) byId[id].sampleTechs.push(name);
  }
}
const out = {};
for (const id of Object.keys(byId).sort((a, b) => byId[b].count - byId[a].count)) {
  out[id] = { ...byId[id], currentName: categoryMapping[id] || 'Unknown' };
}
fs.writeFileSync(path.resolve(__dirname, '../docs/category-id-audit.json'), JSON.stringify(out, null, 2));
console.table(Object.entries(out).map(([id, v]) => ({ id, count: v.count, currentName: v.currentName, sample: v.sampleTechs.slice(0, 5).join(', ') })));
```

- [ ] **Step 2: Run it.**

Run: `node scripts/category-id-audit.js`
Expected: a table of every id, its count, current mapped name, and 5 sample techs; `docs/category-id-audit.json` written. Confirm the known offenders appear: id `6` sample includes WooCommerce/Shopify/Magento (→ Ecommerce, currently "Web Server"); id `87` heavy WordPress-plugin names (currently "CMS"); id `5` widget names (currently "LMS"); ids `89`/`96` translation/social (currently "CMS").

- [ ] **Step 3: Commit.**

```bash
cd /Users/Argyle/LLM/detechtor
git add scripts/category-id-audit.js docs/category-id-audit.json
git commit -m "chore(uni-156): empirical base category-id audit"
```

---

## Phase 1 — Fix the category taxonomy (the single biggest lever)

### Task 1.1: Failing test — the named polluters must NOT resolve to signal categories

**Files:**
- Test: `tests/category-mapping.test.js` (CREATE)
- Read: `src/category-mapping.js`

**Interfaces:**
- Consumes: `mapCategory(id)`, and NEW exports `SIGNAL_CATEGORIES` (Set/array of strings), `isSignalCategory(name)` — defined in Task 1.3.
- Produces: the passing contract later tasks rely on.

- [ ] **Step 1: Write the failing test.** Uses the real base `cats` arrays for the named polluters (from `docs/category-id-audit.json` / the merged file): WooCommerce `[6,87]`, "Email Encoder for Wordpress" `[5,87]`, Juicer `[96]`, Weglot `[89]`.

```js
const { test } = require('node:test');
const assert = require('node:assert');
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
```

- [ ] **Step 2: Run to verify it fails.**

Run: `node --test tests/category-mapping.test.js`
Expected: FAIL — `isSignalCategory`/`SIGNAL_CATEGORIES` are not exported yet, and `mapCategory(87)` currently returns `'CMS'`.

### Task 1.2: Decide each id's correct bucket from the audit

**Files:** Read `docs/category-id-audit.json` (from Task 0.3).

**Interfaces:**
- Produces: `docs/category-remap.md` — a table `id → oldName → newName` with a one-line justification per changed id, citing the sample techs. Consumed by Task 1.3.

- [ ] **Step 1: For every id in the audit, assign the correct bucket.** Rules: an id whose sample techs are dominated by ecommerce carts → `Ecommerce`; WordPress plugins → `WordPress Plugin`; embeddable widgets → `Widget`; translation → `Localization`; social feeds → `Social`; keep genuine CMS/LMS/SIS/CRM/Chatbot ids as-is. **Do not** leave any signal-category name on an id whose techs are not that thing. Write each decision + justification into `docs/category-remap.md`.

- [ ] **Step 2: Commit** `docs/category-remap.md`.

```bash
git add docs/category-remap.md && git commit -m "docs(uni-156): category-id remap decisions from empirical audit"
```

### Task 1.3: Rewrite `category-mapping.js` — correct map + signal-category API

**Files:** Modify `src/category-mapping.js`.

**Interfaces:**
- Produces: `categoryMapping` (corrected), `mapCategory(idOrString)`, `SIGNAL_CATEGORIES` (a `Set` of the 7 protected names), `isSignalCategory(name)` (case-insensitive). Consumed by Tasks 1.1, 4.x, and benchmark-agent Task 4.3 (which re-implements the set in Ruby from the same source of truth).

- [ ] **Step 1: Apply the remap** from `docs/category-remap.md` to `categoryMapping`. Add a `Site Search` id (new, ours to define — pick an unused integer, e.g. `200`) and any missing signal buckets (`Localization`, `Widget`, `WordPress Plugin`, `Social`, `Ecommerce`). Keep `1 → 'CMS'`, `111 → 'Accessibility'`, `52 → 'Chatbot'`, the CRM ids, LMS/SIS ids.

- [ ] **Step 2: Add the signal-category API** at the bottom of `src/category-mapping.js`:

```js
const SIGNAL_CATEGORIES = new Set(['CMS', 'LMS', 'SIS', 'CRM', 'Chatbot', 'Site Search', 'Accessibility']);
function isSignalCategory(name) {
  return typeof name === 'string' && SIGNAL_CATEGORIES.has(
    // normalize to the canonical casing used in categoryMapping values
    [...SIGNAL_CATEGORIES].find(c => c.toLowerCase() === name.toLowerCase()) || name
  );
}
module.exports = { categoryMapping, mapCategory, SIGNAL_CATEGORIES, isSignalCategory };
```

Note: `mapCategory` already lowercases string cats (`category-mapping.js:115-123`) — leave numeric-sourced names in their canonical map casing and make `isSignalCategory` case-insensitive (above) so the inconsistency can't cause a missed gate.

- [ ] **Step 3: Run the Task 1.1 test to verify it passes.**

Run: `node --test tests/category-mapping.test.js`
Expected: PASS (all three tests).

- [ ] **Step 4: Run the full suite to confirm no regression.**

Run: `cd /Users/Argyle/LLM/detechtor && npm test`
Expected: PASS (lint-patterns + test-patterns unaffected by the map change).

- [ ] **Step 5: Commit.**

```bash
git add src/category-mapping.js tests/category-mapping.test.js
git commit -m "fix(uni-156): correct category taxonomy; ecommerce/widget/plugin no longer CMS/LMS; add Site Search + signal-category API"
```

---

## Phase 2 — Wasabi-backed local corpus + local miner

> Build only if Task 0.1 → `INLINE_DEAD = true` (expected). If inline HTML survives, `scripts/mine-signature.js` still works and Task 2 is an optimization — still recommended (removes the 250-pos/600-neg TOAST sampling cap), but reclassify as non-blocking.

### Task 2.1: Wasabi corpus fetcher

**Files:** Create `scripts/wasabi-corpus.js`. Reference (read, do not import — different language): `benchmark-agent/lib/integrations/wasabi_storage.rb:56-102,203-244`.

**Interfaces:**
- Consumes: a JSON manifest on stdin/file — `[{ institution_id, content_archive_key }]` (produced by Task 3.1's SQL) — plus env `WASABI_ACCESS_KEY`, `WASABI_SECRET_KEY`, `WASABI_BUCKET` (default `benchmark-scans`), `WASABI_ENDPOINT` (default `https://s3.eu-west-3.wasabisys.com`).
- Produces: local files `corpus/<institution_id>/<sha12>.html` (gunzipped), and `corpus/index.json` mapping institution_id → local html paths. Consumed by Task 2.2 (`mine-local.js`) and Task 3.

- [ ] **Step 1: Add the S3 dep.** deTECHtor has no S3 client today.

Run: `cd /Users/Argyle/LLM/detechtor && npm install @aws-sdk/client-s3`
Expected: adds `@aws-sdk/client-s3` to `package.json` dependencies.

- [ ] **Step 2: Write the fetcher.**

```js
#!/usr/bin/env node
// scripts/wasabi-corpus.js — fetch cohort-128 rendered HTML from Wasabi by content_archive_key.
// Keys look like: content/{institution_id}/{slug}/{sha12}.html.gz  (gzipped raw HTML)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.WASABI_BUCKET || 'benchmark-scans';
const ENDPOINT = process.env.WASABI_ENDPOINT || 'https://s3.eu-west-3.wasabisys.com';
const REGION = (ENDPOINT.match(/s3\.([a-z0-9-]+)\.wasabisys/) || [, 'eu-west-3'])[1];
const CORPUS_DIR = process.env.CORPUS_DIR || path.resolve(__dirname, '../corpus');

const s3 = new S3Client({
  region: REGION, endpoint: ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.WASABI_ACCESS_KEY, secretAccessKey: process.env.WASABI_SECRET_KEY },
});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function main() {
  if (!process.env.WASABI_ACCESS_KEY || !process.env.WASABI_SECRET_KEY) {
    console.error('FATAL: WASABI_ACCESS_KEY / WASABI_SECRET_KEY not set'); process.exit(1); // fail loud, no fallback
  }
  const manifestPath = process.argv[2];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const index = {};
  let ok = 0, miss = 0;
  for (const { institution_id, content_archive_key } of manifest) {
    if (!content_archive_key) { miss++; continue; }
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: content_archive_key }));
      const gz = await streamToBuffer(res.Body);
      const html = zlib.gunzipSync(gz).toString('utf8');
      const sha12 = (content_archive_key.match(/([0-9a-f]{12})\.html\.gz$/) || [, 'nohash'])[1];
      const dir = path.join(CORPUS_DIR, String(institution_id));
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, `${sha12}.html`);
      fs.writeFileSync(p, html);
      (index[institution_id] ||= []).push(p);
      ok++;
    } catch (e) { miss++; console.error(`miss ${content_archive_key}: ${e.name}`); }
  }
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CORPUS_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`fetched ${ok}, missed ${miss}, institutions ${Object.keys(index).length}`);
}
main();
```

- [ ] **Step 3: Smoke test with a 3-key manifest.** Build a tiny manifest by hand from one Task-3.1 SQL result (3 known keys) and run:

Run: `WASABI_ACCESS_KEY=… WASABI_SECRET_KEY=… node scripts/wasabi-corpus.js /tmp/smoke-manifest.json`
Expected: `fetched 3, missed 0, institutions N`; `corpus/<id>/<sha12>.html` files exist and contain real HTML (`grep -l "<html" corpus/*/*.html`).

- [ ] **Step 4: Commit.**

```bash
git add scripts/wasabi-corpus.js package.json package-lock.json
git commit -m "feat(uni-156): Wasabi corpus fetcher (content_archive_key -> local HTML)"
```

### Task 2.2: Local-corpus signature miner

**Files:** Create `scripts/mine-local.js`. Reference the metric definitions in `scripts/mine-signature.js` (recall vs BuiltWith positives; the oracle caveat — BuiltWith is a good POSITIVE / bad NEGATIVE oracle, so neg-hit% is NOT precision).

**Interfaces:**
- Consumes: `--signature <regex>` (repeatable), `--pos-ids <file>` (BuiltWith-positive institution ids, JSON array), `corpus/index.json` (all fetched HTML). Optional `--field html|scripts` (default html; `scripts` extracts `<script src>`).
- Produces: stdout scorecard — `pos_total, pos_with_html, pos_hit, recall_pct, neg_with_html, neg_hit, neg_hit_pct` — plus `--spotcheck` listing up to 12 neg-hit institution ids (candidate BuiltWith misses to eyeball) and 12 pos-miss ids (recall gaps).

- [ ] **Step 1: Write the miner.**

```js
#!/usr/bin/env node
// scripts/mine-local.js — offline recall/spot-check of a candidate signature against the local corpus.
// Mirrors mine-signature.js metrics but matches locally (inline DB HTML is offloaded post-UNI-119).
// ORACLE CAVEAT: BuiltWith is a GOOD POSITIVE, BAD NEGATIVE oracle. neg_hit_pct is NOT precision —
// a dedicated vendor host with a few % neg-hits is almost always finding BuiltWith's OWN misses.
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { signatures: [], field: 'html' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--signature') a.signatures.push(argv[++i]);
    else if (argv[i] === '--pos-ids') a.posIds = argv[++i];
    else if (argv[i] === '--field') a.field = argv[++i];
    else if (argv[i] === '--spotcheck') a.spotcheck = true;
  }
  return a;
}
const scriptSrcs = (html) => [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).join('\n');
function instMatches(htmlPaths, res, field) {
  return htmlPaths.some(p => {
    const html = fs.readFileSync(p, 'utf8');
    const hay = field === 'scripts' ? scriptSrcs(html) : html;
    return res.some(re => re.test(hay));
  });
}
function main() {
  const a = parseArgs(process.argv);
  const res = a.signatures.map(s => new RegExp(s, 'i'));
  const index = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../corpus/index.json'), 'utf8'));
  const posIds = new Set(JSON.parse(fs.readFileSync(a.posIds, 'utf8')).map(String));
  let posTotal = 0, posHtml = 0, posHit = 0, negHtml = 0, negHit = 0;
  const negHits = [], posMiss = [];
  for (const [id, paths] of Object.entries(index)) {
    const isPos = posIds.has(String(id));
    const hit = instMatches(paths, res, a.field);
    if (isPos) { posTotal++; posHtml++; if (hit) posHit++; else posMiss.push(id); }
    else { negHtml++; if (hit) { negHit++; negHits.push(id); } }
  }
  // pos ids with no corpus HTML at all:
  for (const id of posIds) if (!index[id]) posTotal++;
  const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
  console.table([{ pos_total: posTotal, pos_with_html: posHtml, pos_hit: posHit, recall_pct: pct(posHit, posHtml),
    neg_with_html: negHtml, neg_hit: negHit, neg_hit_pct: pct(negHit, negHtml) }]);
  if (a.spotcheck) {
    console.log('NEG-HITS (eyeball: BuiltWith miss vs real FP):', negHits.slice(0, 12));
    console.log('POS-MISS (recall gaps):', posMiss.slice(0, 12));
  }
}
main();
```

- [ ] **Step 2: Sanity-run** against a known-good signature on a corpus already fetched (e.g. `omniupdate` for Modern Campus CMS positives). Confirm recall is high and the scorecard prints.

Run: `node scripts/mine-local.js --signature 'omniupdate' --pos-ids /tmp/moderncampus-pos.json --spotcheck`
Expected: a scorecard with non-null `recall_pct`; spot-check lists ids.

- [ ] **Step 3: Commit.**

```bash
git add scripts/mine-local.js
git commit -m "feat(uni-156): offline local-corpus signature miner (recall + spotcheck)"
```

---

## Phase 3 — Exhaustive data-mining of the signal categories

> This phase produces DATA-DRIVEN artifacts (curated patterns). Pattern *contents* are discovered from the corpus, not authored a priori — so tasks specify the exact procedure + acceptance gates, and each committed pattern carries a `_validation` note with real numbers. Run per signal category: **CMS, CRM, Chatbot, Site Search, Accessibility** (LMS/SIS already curated by UNI-138…142 — re-validate, don't rebuild).

### Task 3.1: Build per-vendor positive/negative corpora

**Files:** none new (uses Task 2 tooling + Supabase MCP).

**Interfaces:**
- Consumes: `institutions.tech_profile` (BuiltWith positives; membership predicate from `mine-signature.js:99-117`), `scan_pages.content_archive_key` + `scans` join.
- Produces: per target vendor X — `/tmp/uni156/<vendor>-pos.json` (positive institution ids) and a fetched local `corpus/` covering both positives and a bounded random negative sample.

- [ ] **Step 1: Enumerate target vendors per category** from `institutions.tech_profile` (bounded, read-only):

```sql
-- Vendors present in a signal category, by prevalence (pick the top ~15 per category to mine):
SELECT cat.key AS category, v->>'name' AS vendor, count(*) AS n
FROM institutions i,
     jsonb_each(i.tech_profile->'categories') cat,
     jsonb_array_elements(cat.value->'current') v
WHERE i.tech_profile ? 'categories'
  AND cat.key IN ('CMS','CRM','Site Search','Chatbot','Accessibility & QA','Accessibility')
GROUP BY 1, 2 ORDER BY 1, 3 DESC;
```

- [ ] **Step 2: For each target vendor, pull positive ids + their archive keys** (bounded; cap positives at e.g. 300, negatives sampled at 800):

```sql
-- positives for vendor X in category C:
SELECT DISTINCT i.id
FROM institutions i
WHERE i.tech_profile ? 'categories'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.tech_profile->'categories'->'<C>'->'current') e
              WHERE e->>'name' = '<X>' OR (e->'raw_names') ? '<X>')
LIMIT 300;

-- archive keys for a set of institution ids (positives + a random negative sample):
SELECT s.institution_id, sp.content_archive_key
FROM scan_pages sp JOIN scans s ON s.id = sp.scan_id
WHERE s.institution_id = ANY(:ids) AND sp.content_archive_key IS NOT NULL;
```

- [ ] **Step 3: Fetch the corpus** for those keys via `scripts/wasabi-corpus.js` (Task 2.1). Write `<vendor>-pos.json` (the positive id list). Record corpus size.

- [ ] **Step 4: Commit** the vendor target list (`docs/signal-mining-targets.md`) — NOT the corpus (gitignore `corpus/`).

```bash
printf "corpus/\n" >> /Users/Argyle/LLM/detechtor/.gitignore
git add docs/signal-mining-targets.md .gitignore
git commit -m "docs(uni-156): signal-category mining targets + gitignore corpus"
```

### Task 3.2: Mine a tight signature per vendor and record evidence

**Files:** the relevant `patterns/higher-ed-<cat>.json` (MODIFY or CREATE per File Structure).

**Interfaces:**
- Consumes: `scripts/mine-local.js`, per-vendor corpora.
- Produces: one curated entry per vendor with correct `cats`, tight `html`/`scripts`/`meta`/`headers`/`js`, `higher_ed: true`, a realistic `confidence`, and a `_validation` string citing recall + neg-hit% + spot-check outcome.

- [ ] **Step 1: For each vendor, derive candidate signatures** by inspecting positives' HTML for dedicated vendor hosts (e.g. `\.searchstax\.com`, `acsbapp\.com`), unique DOM/asset paths, `meta generator`, or vendor headers. Prefer key-scoped fields (meta/headers/dedicated script host) over bare `html` substrings.

- [ ] **Step 2: Score each candidate** with `mine-local.js`. Acceptance per signature:
  - `recall_pct` ≥ 70 on positives-with-HTML (lower is acceptable only with a `_detection_note` explaining why, e.g. decoupled/headless vendor).
  - `--spotcheck` neg-hits are manually confirmed to be BuiltWith misses (real installs) OR the signature is tightened until prose/plugin false hits are gone. **neg_hit_pct is never used as precision** (oracle caveat).
  - The signature passes `lint-patterns` (no bare ≤3-char literal, no broad wildcard with ≤4-char literal run).

- [ ] **Step 3: Write the curated entry** with correct category and a real `_validation` note, e.g.:

```json
"SearchStax": {
  "cats": [200],
  "description": "SearchStax managed Solr site-search for higher education.",
  "scripts": ["\\.searchstax\\.com"],
  "html": ["searchstax"],
  "higher_ed": true,
  "confidence": 90,
  "website": "https://www.searchstax.com",
  "_validation": "Data-mined vs BuiltWith Site Search (UNI-156, 2026-07-16). 'searchstax.com' scriptSrc = <R>% recall over <N> positives, <k> neg-hits all confirmed BuiltWith misses via --spotcheck."
}
```

- [ ] **Step 4: Lint + regression after each category batch.**

Run: `cd /Users/Argyle/LLM/detechtor && npm test && npm run test:regression:dry`
Expected: lint PASS; regression fixtures load.

- [ ] **Step 5: Commit per category.**

```bash
git add patterns/higher-ed-*.json src/config.js
git commit -m "feat(uni-156): data-mined tight <CATEGORY> signal patterns (correct cats + validation)"
```

### Task 3.3: Retag / tighten the named over-firers

**Files:** `patterns/webappanalyzer-merged.json` (targeted edits only) + curated partials.

**Interfaces:**
- Produces: the named polluters carrying correct `cats` and non-prose patterns.

- [ ] **Step 1: Fix WordPress bare-word.** In `webappanalyzer-merged.json`, remove the bare `"wordpress"` literal from `WordPress.html` (keep `wp-content`, `wp-includes`, `meta generator`, `js wp`). Verify recall holds with `mine-local.js` (`wp-content|wp-includes` recall vs a WordPress-positive set).

- [ ] **Step 2: Retag WooCommerce/Email Encoder/Juicer/Weglot** to correct `cats` (post-Task-1 map these already resolve out of signal categories, but fix the ids too so intent is explicit): WooCommerce → `Ecommerce`, Email Encoder → `WordPress Plugin`, Juicer → `Social`/`Widget`, Weglot → `Localization`.

- [ ] **Step 3: Add them as `must_not_match` regression fixtures** in `tests/fixtures/known-sites.json` (a WooCommerce store URL that must not match a signal-category CMS; a Weglot site that must not match CMS). Run `npm run test:regression` (needs network+Chrome) if available, else `:dry`.

- [ ] **Step 4: Lint + commit.**

```bash
cd /Users/Argyle/LLM/detechtor && npm test
git add patterns/webappanalyzer-merged.json patterns/higher-ed-*.json tests/fixtures/known-sites.json
git commit -m "fix(uni-156): de-prose WordPress; retag plugin/widget/ecommerce out of signal categories"
```

---

## Phase 4 — Provenance emission + measured suppression gate

> Provenance emission (Task 4.1–4.2) is unconditional (cheap, harmless, enables measurement). The **product gate** (Task 4.3, benchmark-agent) is built ONLY if Task 4.2's residual measurement shows material base over-firing in signal categories after Phase 1+3. Joel's call: "decide after mining."

### Task 4.1: Stamp provenance at the merge (Seam A) and emit it per detection

**Files:** Modify `src/detechtor.js` (`loadPatterns` ~`:24-49`; `evaluatePattern` ~`:975-990`; `mergeTechnologies` ~`:403-427`). Test: `tests/provenance.test.js` (CREATE).

**Interfaces:**
- Produces: each detection object gains `curated: boolean` and `sourceFile: string`. Consumed by benchmark-agent Task 4.3 and by `residual-audit.js` (Task 4.2).

- [ ] **Step 1: Write the failing test.**

```js
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
```

- [ ] **Step 2: Run to verify it fails.**

Run: `node --test tests/provenance.test.js`
Expected: FAIL — `_curated`/`_sourceFile` undefined.

- [ ] **Step 3: Stamp provenance in `loadPatterns`.** Replace the bare `Object.assign(patterns, data)` at `src/detechtor.js:32` with a keyed loop that records origin; curated = any `higher-ed-*` file (and the other curated partials per `config.js`), computed from the filename.

```js
const CURATED_RE = /(higher-ed-|general-analytics-extensions|fediverse-social)/;
const curated = CURATED_RE.test(patternPath);
const sourceFile = path.basename(patternPath);
for (const [name, def] of Object.entries(data)) {
  if (name === '_metadata') continue;
  if (def && typeof def === 'object') { def._curated = curated; def._sourceFile = sourceFile; }
  patterns[name] = def; // later (curated) files still override earlier (base) on name collision
}
```

- [ ] **Step 4: Carry provenance into emitted detections.** In `evaluatePattern` return (`~:982-990`) add `curated: pattern._curated || false, sourceFile: pattern._sourceFile || null`. In `mergeTechnologies` (`~:403-427`) OR the merged detections `curated` (true if any contributing pattern was curated) and keep first non-null `sourceFile`.

- [ ] **Step 5: Run tests to verify pass.**

Run: `node --test tests/provenance.test.js && cd /Users/Argyle/LLM/detechtor && npm test`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/detechtor.js tests/provenance.test.js
git commit -m "feat(uni-156): stamp+emit pattern provenance (curated/sourceFile) through detections"
```

### Task 4.2: Measure residual base over-firing in signal categories (the go/no-go)

**Files:** Create `scripts/residual-audit.js`.

**Interfaces:**
- Consumes: either the local `corpus/` (re-run detechtor per page) OR a bounded sample of raw `detechtor.json` from Wasabi (`compressed/{inst}/scan-{n}/detechtor.json` — unfiltered). Prefer re-running detechtor locally on the corpus so it reflects the NEW category map + provenance.
- Produces: `docs/residual-audit.md` — for each signal category: count of detections at confidence ≥50 that are `curated:false` (base-origin), with the top offending tech names. Consumed by the Task 4.3 decision.

- [ ] **Step 1: Write the audit** — run `DeTECHtor.detectTechnologies` (or the local-HTML path) over a bounded corpus sample, filter to `categories ∩ SIGNAL_CATEGORIES`, `confidence >= 50`, `curated === false`; tally by tech name.

- [ ] **Step 2: Run and record.**

Run: `node scripts/residual-audit.js`
Expected: `docs/residual-audit.md` with per-category base-origin counts.

- [ ] **Step 3: DECISION.** If material base over-firing remains (e.g. any signal category has ≥N base-origin detections ≥50 that are wrong on spot-check) → proceed to Task 4.3. If negligible (Phase 1+3 already cleaned it) → STOP the gate; record "gate not needed" in `docs/residual-audit.md` and skip 4.3. Commit `docs/residual-audit.md` either way.

### Task 4.3: Category+provenance-aware product gate (benchmark-agent) — CONDITIONAL

**Files:** Modify `benchmark-agent/lib/integrations/detechtor_integration.rb` (`filter_by_confidence` `:88-97`, `confidence_floor` `:79-80`). Test: benchmark-agent spec.

**Interfaces:**
- Consumes: detection hashes now carrying `curated` + `categories` (from Task 4.1). Signal-category names re-declared in Ruby (mirror `SIGNAL_CATEGORIES` — single source of truth is `category-mapping.js`; add a code comment cross-referencing it).
- Produces: the DB-bound tech set with signal-category detections requiring `curated == true` OR `confidence >= SIGNAL_HIGH_BAR` (env `DETECHTOR_SIGNAL_BAR`, default e.g. 80). Non-signal categories keep the existing `>= 50` floor. Raw Wasabi copy unchanged (still fully raw).

- [ ] **Step 1: Write a failing spec** — a base-origin `{name:'WooCommerce', confidence:60, categories:['CMS'], curated:false}` is dropped; a curated `{name:'Finalsite', confidence:60, categories:['CMS'], curated:true}` is kept; a non-signal `{name:'Cloudflare', confidence:60, categories:['CDN'], curated:false}` is kept.

- [ ] **Step 2: Run to verify it fails.** (base-origin CMS currently kept.)

- [ ] **Step 3: Implement `gate_signal_categories`** alongside/replacing `filter_by_confidence`: keep existing floor for non-signal; for signal categories require `curated || confidence >= signal_bar`. Log kept/dropped as the existing method does. Wire it at `agent.rb:386` (replace the `filter_by_confidence` call).

- [ ] **Step 4: Run spec to verify pass.**

Run: `cd /Users/Argyle/LLM/benchmark-agent && <rspec/test cmd for this repo>`
Expected: PASS.

- [ ] **Step 5: Commit** (benchmark-agent repo, on branch `joelgoodman/uni-156-…`).

```bash
cd /Users/Argyle/LLM/benchmark-agent
git add lib/integrations/detechtor_integration.rb agent.rb spec/
git commit -m "feat(uni-156): category+provenance-aware signal gate (curated-or-high-bar) for product tech set"
```

---

## Phase 5 — Regression harness

### Task 5.1: Rehome the 20-institution on/off harness into the repo

**Files:** Create `tests/detval/{run.sh,analyze.js,floored.js}` by copying from the surviving scratchpad `/private/tmp/claude-501/-Users-Argyle-LLM-BenchmarkCentral/dcb12638-3c68-462d-8a8f-035d1ed3f75c/scratchpad/detval/` (session-scoped, could be GC'd — copy NOW).

**Interfaces:**
- Produces: a committed, reproducible on/off recall harness. `analyze.js` big-signal set must be updated to the Task 1.3 `SIGNAL_CATEGORIES` (incl. `Site Search`).

- [ ] **Step 1: Copy the three files** into `tests/detval/`. Update the hardcoded `$HOME/LLM/detechtor/cli.js` path to a repo-relative one. Update `analyze.js`/`floored.js` big-signal arrays to `['CMS','LMS','SIS','CRM','Chatbot','Site Search','Accessibility']`.

- [ ] **Step 2: Run the floored comparison** at the product floor (50) to capture post-fix recall (needs network+Chrome; if unavailable in the exec env, record as a manual step for Connolly).

Run: `bash tests/detval/run.sh && node tests/detval/floored.js 50`
Expected: floored on/off recall table; **base plugin/widget names (WooCommerce/Juicer/Weglot) no longer appear under CMS**; signal recall ≥ the 2026-07-16 baseline (CMS 94 / Analytics 95 / Chat 73 / CRM 67 / a11y 75).

- [ ] **Step 3: Commit.**

```bash
git add tests/detval/
git commit -m "test(uni-156): rehome 20-institution on/off recall harness; signal-category set"
```

### Task 5.2: Full regression + final gate

- [ ] **Step 1: Run the full deTECHtor suite + regression.**

Run: `cd /Users/Argyle/LLM/detechtor && npm test && npm run test:regression`
Expected: lint PASS; all `known-sites.json` FP (incl. new WooCommerce/Weglot must-not-match) and TP tests PASS.

- [ ] **Step 2: Re-run `scripts/residual-audit.js`** and confirm the signal-category base-origin count dropped to ~0 (or to the gated-away set).

Run: `node scripts/residual-audit.js`
Expected: `docs/residual-audit.md` shows negligible base-origin signal detections.

- [ ] **Step 3: Update Linear UNI-156** with the before/after recall numbers and mark the deliverables done. Update the handoff memory (`detechtor-pattern-precision-handoff.md`) to reflect completion.

---

## Self-Review

**Spec coverage** (Linear UNI-156 deliverables):
1. *Curate data-mined tight patterns with correct categories* → Phase 1 (categories) + Phase 3 (mining) + Task 3.3 (retag). ✔
2. *Suppress the base for signal categories (real mechanism, not just Object.assign override)* → Task 4.1 (provenance emission) + Task 4.3 (category+provenance gate), gated by Task 4.2 measurement. ✔ (Joel: decide-after-mining.)
3. *Regression via regression-test.js + 20-inst on/off harness* → Phase 5. ✔
4. *Corpus = UNI-119 + UNI-155 Wasabi* → Phase 2 (fetcher) + Task 3.1. ✔ (Verify-first per Task 0.1.)
5. *BuiltWith positive oracle, oracle caveat* → Task 2.2 / 3.2, caveat baked into `mine-local.js`. ✔
6. *Site Search (named, absent from taxonomy)* → Task 1.3 (add category) + Task 3.2 (mine). ✔ (Joel: add now.)

**Open items the executor must resolve live (not placeholders — data-gathering steps with defined method):** Task 0.1 numbers; the per-id remap decisions (Task 1.2, from real audit output); the exact mined signatures + recall (Task 3.2, from corpus); the residual go/no-go (Task 4.2). Each has an exact procedure and acceptance gate.

**Cross-repo note:** benchmark-agent changes (Task 4.3) touch the product tech write-path but **no schema** — no `supabase-schema-guardian` needed. If any task drifts into DDL, STOP and consult it.
