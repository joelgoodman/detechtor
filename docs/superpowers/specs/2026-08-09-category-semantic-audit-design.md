# Per-category semantic audit of technology→category assignments

**Date:** 2026-08-09
**Origin:** UNI-233 (mechanical layer done, merged as [detechtor#14](https://github.com/joelgoodman/detechtor/pull/14)); this spec covers the semantic layer it deliberately left open.
**Status:** design approved, ready for planning.

---

## 1. Why

UNI-233 fixed the *mechanical* correctness of category data — name collisions, casing, duplicate
categories, unknown vocabulary — and gated all five checks in `npm test`. It did not, and could
not, answer the semantic question: **is this technology filed under the category it actually
belongs to?**

That layer stands at **4 of 994 signal technologies adjudicated (~0.4%)**. The four were forced by
a visible symptom (Chatbot reading 44.8% when the real figure was 11.5%). Nothing has looked
systematically at the other 990, nor at the ~5,500 technologies in non-signal categories that feed
UNI-223's consolidation.

Category assignment is not cosmetic. Signal categories are what the product acts on and what
tiered detection's escalation decision keys on, so a misfiled technology changes whether we
believe we detected anything at all.

## 2. Goals

Flag technology→category mismatches across **all 6,504 technologies and all 56 categories**,
ranked by measured institutional impact, and record decisions durably enough to survive a
base-pattern reimport.

### Non-goals

Each is parked deliberately, not overlooked:

- **Changing the category vocabulary.** The `Chatbot` → `Chat` rename and a vendor-level AI/LLM
  capability attribute are a separate ticket (§10). Renaming a signal category alters
  `SIGNAL_CATEGORIES` and ripples into speedyu-benchmark, the scorecard, and UNI-223 — that
  deserves its own blast-radius review, not a ride-along on an audit.
- **Pattern coverage.** CRM having only 6 patterns is a *coverage* gap, not a categorisation gap:
  the base CRM patterns exist and simply don't fire on higher-ed sites. Fixing it is data-mining in
  the shape of UNI-156.
- **Auto-applying reassignments.** Every change is human-confirmed.

## 3. What we measured before designing

Four measurements shaped this design. They are recorded because each one overturned an assumption,
and re-deriving them costs hours.

### 3.1 Most technologies are inert

Over a 133-institution sample (150 sampled, 17 unscannable per UNI-231), **424 of 6,504
technologies fire at all**. Per signal category:

| Category | Techs | Fire | Curated |
|---|---:|---:|---:|
| CMS | 448 | 18 | 20 |
| Chatbot | 305 | 12 | 27 |
| LMS | 96 | 15 | 45 |
| Site Search | 65 | 12 | 16 |
| SIS | 51 | 26 | 50 |
| Marketing Automation | 14 | 8 | 14 |
| Accessibility | 10 | 7 | 10 |
| CRM | 6 | 6 | 6 |

Nineteen categories fire zero times. This is why flags must be **ranked by prevalence**: a
miscategorised technology on 100 institutions matters, one that never fires does not.

Risk concentrates where curation is thinnest — **Chatbot is 305 technologies of which 27 are
curated**, and CMS is 448 of which 20 are curated. Those pools are base-inherited and have never
been looked at.

### 3.2 The name is a far stronger feature than the description

The existing `MISSING_SIGNAL` screen matches **descriptions** and produced 293 candidates of which
5 mattered. A word-boundary token match on the **name** produces **31 candidates** across all 6,504
technologies, at visibly high precision:

| Token in name | Not filed there |
|---|---:|
| CRM | 15 |
| Accessibility | 6 |
| Marketing Automation | 5 |
| Site Search | 3 |
| Chatbot / CMS | 2 |

All 15 CRMs (Agile CRM, Insightly CRM, Freshworks CRM, Ellucian CRM Recruit…) sit in
`Business Software`. All 6 accessibility tools (eSSENTIAL Accessibility, Accessible360, All in One
Accessibility) sit in `JavaScript Framework` — and **Accessibility currently holds only 10
technologies**, so this is a live false-negative pool containing real higher-ed vendors.

Not auto-applied: `Blackbaud CRM` is currently `Fundraising` and is genuinely both; `Rapid Search`
may be ecommerce product search rather than site search.

### 3.3 Local models are sufficient, and bigger is not better

Twelve-case gold set drawn from UNI-233's actual decisions — 4 known-wrong (pre-fix states), 8
known-right including three traps.

| Model | Correct | False flags | **Missed flags** | s/tech |
|---|---:|---:|---:|---:|
| `mistral-small3.2:24b` | 10/12 | 2 | **0** | 2.3 |
| `gpt-oss:20b` | 9/12 | 1 | 0 *(2 JSON truncations at `num_predict:200`)* | 2.8 |
| `cogito:70b` | 11/12 | 0 | **1** | 5.4 |

Four conclusions:

1. **Self-reported confidence is worthless.** Every answer returned 0.9–1.0, including all four
   wrong ones. Any design gating on model confidence is unfounded.
2. **Union, not intersection.** `cogito:70b` scored highest overall but its single miss was
   *Ellucian CRM Recruit* — the one live mismatch that matters (18 institutions). Requiring model
   agreement would have deleted it. The models fail in opposite directions: the 24B over-flags, the
   70B under-flags.
3. **Bigger did not help.** `cogito:70b` did not miss Ellucian from ignorance — it identified the
   product as "student recruitment" and reasoned that `HR / Recruiting` was therefore acceptable.
   That is a judgement error; parameter count does not fix it. **Diversity of prior beats size.**
4. **Verdict is reliable; proposed category is not.** Both `mistral` and `cogito` correctly flagged
   `Slate` and both proposed `SIS`. Ask "is this filed wrongly?" — do not trust "what should it be".

### 3.4 A full-corpus prevalence run is affordable

1.25 s/institution × 4,214 captures ≈ **88 minutes single-threaded**, materially less across the
M4 Max's 12 performance cores.

## 4. Architecture: the override layer

`webappanalyzer-merged.json` holds 6,202 of the 6,504 technologies and is **downloaded from
upstream and regenerated** by `scripts/import-webappanalyzer.js`. Editing those entries in place
means the next import silently reverts every decision.

Confirmed decisions therefore land in a new **`patterns/category-overrides.json`**, applied at
load in `src/detechtor.js` immediately after `resolveIdentities()` (currently line 127) — the same
layering `technology-aliases.json` already uses.

**An override rewrites `categories` and nothing else.** It never touches `dom`, `js`, `scriptSrc`
or any evidence field. The hazard that bit UNI-233's first attempt — clobbering the `dom` rule
UNI-224 recovered Omni CMS with — is therefore *structurally impossible* here rather than merely
tested against. This is the main reason to prefer an override layer over in-place edits even for
curated files.

## 5. Pipeline

### Stage 0 — name-token pre-pass

`scripts/category-nametoken-audit.js`. Word-boundary token match on the technology **name** against
category synonyms. Emits ~31 candidates to `docs/category-nametoken-queue.json` for human
confirmation; confirmed decisions seed `category-overrides.json`.

Runs first so the full sweep starts from a cleaner baseline, and so the sweep re-deriving these as
already-correct serves as a free accuracy check on the models.

### Stage 1 — full-corpus prevalence

`scripts/corpus-prevalence.js`. All 4,214 captures, **all** patterns (not signal-only), UNI-231
`classifyCapture().scannable` filter so unreadable pages never enter a denominator. Parallel across
worker processes.

Emits `docs/corpus-prevalence.json` — `{technology: institutionCount}` plus co-occurrence sets. A
reusable artifact; UNI-223 and the base-rate work want the same numbers.

### Stage 2 — local model sweep

`scripts/category-llm-audit.js`. Two diverse local models via Ollama, `temperature: 0`,
`format: json`, `num_predict: 600` (200 truncated `gpt-oss`).

**Evidence packet**, ordered by measured value of each feature:

1. Technology name — strongest, per §3.2
2. Current categories, curated flag, source file
3. **Detection-pattern summary** — the hosts and selectors it matches on. `technolutions.net`
   identifies Slate better than any prose does.
4. Top co-occurring technologies and prevalence, from Stage 1
5. Description — weakest

**Combiner: union.** Flag if *either* model objects. Models disagreeing are recorded as
**contested** and reported separately rather than flagged — visible without demanding review time.

**Guards**, all from §3.3: `known: false` never produces a flag; the model's proposed category is
advisory metadata, never applied; confidence is recorded but never gates anything.

**Resumability.** Append-only JSONL written per verdict; a restart skips completed technologies. A
multi-hour run will be interrupted.

**Model selection is a requirement, not a fixed pair.** Any two models qualify that (a) come from
different training lineages and (b) score ≥10/12 with **zero missed flags** on the gold-set fixture
(§7). `mistral-small3.2:24b` already meets the bar and is the anchor.
`nemotron-3-nano:30b` is the leading candidate for the second slot — NVIDIA lineage, so its errors
should be uncorrelated with Mistral's — but it is **not confirmed until it has been scored against
the fixture**; `qwen3:30b-a3b` is the fallback. Record the chosen pair and its scores in the run
output.

**Memory.** `mistral-small3.2:24b` (~15 GB) + a ~30 GB second model ≈ 48 GB resident on
128 GB unified memory, so both stay loaded concurrently and the passes run in parallel.
`OLLAMA_MAX_LOADED_MODELS=2` and an explicit `keep_alive` prevent anything else creeping in.
A 120B-class model (~65 GB plus KV cache, against Metal's ~96 GB working set) was rejected: it fits
but starves the machine for hours.

Outputs `docs/category-llm-verdicts.jsonl` (raw, every verdict) and `docs/category-review-queue.json`
(flags ranked by prevalence).

### Stage 3 — adjudication

Human review of the ranked queue. Decisions written to `patterns/category-overrides.json` with a
reason. Prevalence ranking is what makes this finite: the top of the queue carries most of the
impact, and the inert tail is recorded rather than demanded.

## 6. Data model

`patterns/category-overrides.json`:

```json
{
  "_comment": "Human-adjudicated category corrections. Applied at load, after identity resolution. Rewrites `categories` ONLY — never evidence fields. Survives a webappanalyzer reimport by design.",
  "overrides": {
    "Ellucian CRM Recruit": {
      "categories": ["CRM"],
      "was": ["Business Software", "HR / Recruiting"],
      "reason": "Ellucian's admissions CRM. HR/Recruiting is employee recruiting — a different thing.",
      "institutions": 18,
      "decided": "2026-08-09"
    }
  }
}
```

`institutions` is the prevalence at decision time — provenance for why it was prioritised, not a
live figure.

## 7. Gating and testing

- **Gate extension** in `scripts/category-audit.js --gate`: every override target must be in
  `CANONICAL_CATEGORIES`; no override may be a no-op; no override may name a technology that does
  not exist. A reimport that reverts a decision fails `npm test` rather than regressing silently.
- **Override-layer unit test** pinning that only `categories` changes — every evidence field
  byte-identical before and after. This is the UNI-224 regression guard.
- **Gold-set fixture.** The 12 cases in §3.3 become `tests/fixtures/category-gold-set.json`, with a
  `--calibrate` mode that scores any configured model against it. Swapping a model or editing the
  prompt is then measured, not guessed at. Run it *before* committing to a multi-hour sweep.
- Existing 123 tests stay green.

## 8. Honest-coverage reporting

The run must report what it did **not** settle: technologies where both models abstained, contested
cases, and zero-prevalence entries. Given the standing rule against describing categorisation as
"audited" when it is 0.4%, the output has to make its own coverage legible. A closing summary
states adjudicated / contested / abstained / inert counts per category.

## 9. Risks

| Risk | Handling |
|---|---|
| Multi-hour run interrupted | Append-only JSONL checkpoint, resume skips completed |
| False flags consume review time | Prevalence ranking; contested quarantined separately |
| Reimport reverts decisions | Override layer is precisely the mitigation; gate enforces |
| Models wrong in correlated ways | Two different training lineages; gold-set scoring before the run |
| Memory pressure during the sweep | ~48 GB pairing, `OLLAMA_MAX_LOADED_MODELS=2` |
| Prevalence is homepage-only | Stated explicitly in output. A technology may appear on interior pages (UNI-225 tiered detection) or be present but undetected — inert means *deprioritised*, never *proven absent* |

## 10. Follow-on tickets

- **`Chatbot` → `Chat` rename + vendor-level AI capability attribute.** Two of three models
  objected that LiveChat is "a live-chat widget, not a chatbot" — a dispute with our category
  *name*, not the product. The live-chat/chatbot distinction is dissolving as vendors ship LLM
  options. Proposed: one `Chat` category for what we can detect, plus AI capability as a separate
  **vendor-level** attribute (never per-institution — the same script serves both modes, so
  whether a school enabled the LLM is not visible in homepage HTML, and claiming otherwise would
  assert something unobserved). Feeds the AI Readiness work.
- **`Business Software` (303 technologies) is an admitted grab-bag** and the destination of most
  misfiled CRMs. Worth splitting, but only after the vocabulary question above is settled.
- **CRM pattern coverage** — UNI-156-shaped data mining, per §2.
