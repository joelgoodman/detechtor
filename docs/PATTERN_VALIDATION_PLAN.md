# Pattern Validation Plan

**Goal:** Prove every pattern in the four higher-ed pattern files was derived from the real product's observable footprint. Delete or rework anything that can't be sourced to captured evidence or authoritative vendor documentation.

**Scope:** 223 technologies across `patterns/higher-ed-cms.json` (7), `patterns/higher-ed-lms.json` (54), `patterns/higher-ed-sis.json` (50), and `patterns/higher-ed-infra.json` (112). The WebAppAnalyzer base (`webappanalyzer-merged.json`) is out of scope — it's community-maintained.

**Why now:** The existing `scripts/audit-patterns.js` catches *shape* problems — short strings, common English words, broad regex. It does not catch "this pattern was invented." The gap is a pattern-to-evidence reconciliation: each pattern needs a traceable source, either a captured DOM/header/script fragment from a real install or a citation in the vendor's developer docs. Patterns without either are liabilities — false positives, silent misses, or both.

## Phase 1 — Inventory and triage

Extract every pattern in the four higher-ed files into a single ledger (`docs/pattern-validation-ledger.csv`) with one row per pattern. Columns: technology, file, field (html/scripts/headers/js/cookies/meta), pattern, auto-tier (A/B/C per `docs/PATTERN_GUIDELINES.md`), `higher_ed` flag, legacy-names flag, source evidence (blank), verification status (blank). Run `npm run test:audit` and pre-flag any tier-C or anti-pattern rows so effort concentrates on what can be salvaged.

## Phase 2 — Reference-site ledger

For each technology, pin at least two ground-truth URLs. Ideal set: a vendor-owned demo or documentation host (e.g., `community.canvaslms.com`, `help.blackboard.com`, `docs.ellucian.com`), a known customer's public site (vendor case studies, RFP documents, LinkedIn job posts mentioning the system are the best sources), and where relevant a vendor customer-login subdomain pattern (`*.instructure.com`, `*.elluciancloud.com`, `*.t4cms.*`). Extend `tests/fixtures/known-sites.json` as this ledger fills out — it already has the right schema for true-positive and false-positive tests, so this doubles as regression coverage. Technologies with no public reference get marked `unverifiable_public` and face higher scrutiny in Phase 4.

## Phase 3 — Ground-truth evidence capture

Write `scripts/capture-evidence.js` that reuses `DeTECHtor.collectEvidence()` against each reference URL and dumps raw HTML, headers, scripts, cookies, meta tags, JS globals, and DOM snippets to `tests/evidence/<tech-slug>/<host>.json`. Commit the snapshots. Now every future pattern check is offline, deterministic, and diff-able — no more flaky network runs against live sites, and future additions can be evidence-driven by default.

## Phase 4 — Reconcile patterns against evidence

Write `scripts/validate-patterns.js` that loads every pattern and tests it against the captured evidence corpus. Three outcomes per pattern:

- **Verified** — fires on its own tech's reference sites and nowhere else. Record the evidence citation inline as a `_source` note.
- **False positive** — fires on an unrelated tech's reference sites. Fix (narrow) or delete.
- **Suspect** — never fires. Either the regex is wrong, the pattern was invented, or the reference site choice is bad. Tiebreaker: vendor developer docs, admin guide, theme reference, or demo instance. If the identifier isn't documented and isn't observable, delete it.

## Phase 5 — Triage, cleanup, report

Produce `docs/PATTERN_VALIDATION_REPORT.md` with per-file summaries: tech count, patterns verified/needs-work/removed, coverage gaps (techs with no public reference). Commit the known-sites expansion so regression tests exercise the newly verified catalog. Any tech ending with zero verified patterns is removed from the active files and archived under `patterns/_archive/` with a rationale note.

## Priorities

Rebranded tech first — legacy patterns rot fastest. The main candidates: Modern Campus CMS (formerly OmniCMS/OmniUpdate), Anthology Student (formerly Campus Management CampusNexus), D2L Brightspace (legacy `valence`/`lore`/`desire2learn` identifiers), Instructure Canvas Catalog, Ex Libris Alma/Primo (post-ProQuest/Clarivate acquisitions).

Then the single-vendor long tail where invented patterns are most likely: Slate, Element451, EAB Navigate, Watermark, Campus Labs, CBORD, Academic Works, Mindmax, HelioCampus, Civitas Learning, CampusLogic, AwardSpring, Regent Education.

Canvas, Blackboard Learn, Banner, Workday Student, Moodle, and Drupal are well-documented and should validate quickly — use them as the Phase 3 pipeline dry-run.

## Output artifacts

- `docs/PATTERN_VALIDATION_PLAN.md` — this document.
- `docs/pattern-validation-ledger.csv` — the working pattern ledger, regenerable from `scripts/generate-validation-ledger.js`.
- `docs/reference-site-ledger.csv` — the per-tech URL ledger (seed for `known-sites.json`).
- `docs/VALIDATION_RESEARCH_BRIEFS.md` — self-contained prompts for delegating research subtasks.
- `scripts/generate-validation-ledger.js` — inventory generator.
- `scripts/capture-evidence.js` — Phase 3 harness (to be written).
- `scripts/validate-patterns.js` — Phase 4 harness (to be written).
- `tests/evidence/` — committed raw-evidence snapshots.
- `docs/PATTERN_VALIDATION_REPORT.md` — Phase 5 output.
