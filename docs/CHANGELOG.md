# Changelog

All notable changes to deTECHtor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### UNI-223 — dictionary export + eight absorbed categories (2026-09-02)

**Added**
- `scripts/emit-dictionary.js` — the category + technology dictionary as JSON. The shared DB's
  `categories`/`technologies`/`technology_aliases` are regenerated from it on every re-pin, so the
  vocabulary cannot drift from the engine. Categories are canonical, overrides applied.
- Eight categories absorbed from the BuiltWith-curated taxonomy (`Authentication`, `Forms`,
  `Event Management`, `Tag Management`, `Feedback & UX`, `Maps & Virtual Tours`,
  `Personalization & CRO`, `AI Tools`), non-signal. deTECHtor owns the vocabulary; BuiltWith and
  WhatCMS data is mapped into it.

### UNI-226 — strip Wappalyzer `\;confidence` / `\;version` modifiers (2026-08-09)

Upstream modifier suffixes were never stripped, so in every regex-tested field the suffix became a
literal requirement no page can satisfy — `/adocean\.pl\;confidence:80/` cannot match
`cdn.adocean.pl/lib.js`. **939 values silently dead** across scriptSrc/meta/headers/html/cookies/
scripts, plus 79 unparseable dom selectors; 1,160 techs affected, 121 signal-category.

Same class as the UNI-224 dom defect — unparsed upstream syntax causing silent death — on a bigger
surface, and found by the validator UNI-224 Phase C added. `lint-patterns.js` could never have found
it: it hunts patterns that are too **broad**, and these are pathologically **narrow**.

**Added**
- `src/pattern-normalize.js` — strips at load; the importer strips at import. Only `confidence` and
  `version` segments are dropped (measured: the only two that occur); anything else is kept rather
  than silently truncated.
- `scripts/modifier-impact.js` — A/B measurement over the real corpus. Full results in
  `docs/uni-226-modifier-impact.md`: **192 techs changed, 0 lost, 7 signal-category** (all long-tail
  CMSes, largest +7 institutions, including **Contensis**, a UK HE CMS we were blind to). The only
  mover above 25 points is jQuery Migrate at 32.6%, which is ordinary.

**Changed**
- `Progress WS_FTP` re-adjudicated from denied to admitted. It was denied in Phase A *only* because
  the modifier made it unparseable. ⚠️ The denylist is keyed on the selector string, so stripping
  alone would have un-denied it silently — the decision is recorded and pinned by a test.
- `lint-dom-rules.js` lints what the engine sees, and counts on-disk modifier debt separately
  (not gated: a stale data file must not fail a build).

**Deliberately not done:** honouring the parsed values. Upstream `confidence:NN` would change scoring
across 1,160 techs and needs its own measurement; `version:\1` is already reimplemented in
`extractVersionInfo`. The bug was the dead regex.

### UNI-225 — tiered multi-page detection (2026-08-09)

Detection now evaluates the union of an institution's archived pages instead of one homepage,
escalating to interior pages only when the first page yields no signal-category technology.

**Added**
- `src/evidence-from-html.js` — engine evidence from archived HTML via cheerio, no browser.
  benchmark-agent already archives ~5 rendered pages per institution (UNI-119), and
  `page.content()` serializes the rendered DOM, so this needs no crawl.
- `src/capture-quality.js` — blocked/undersized captures are `unscannable` and contribute no
  evidence. An institution whose every page is blocked reports `unknown`, never "no CMS".
- `src/page-selection.js` + `config.pagePreference` — page order by measured yield
  (program 93% → cost-aid 81%). Config-driven; the sample was T4-biased and wants re-measuring.
- `src/tiered-detect.js` — the runner. Cost is `N × (1 + 4e)` parses versus `5N`.
- `src/js-probe.js` + `scripts/emit-js-probe.js` — 5,082 JS globals (778 signal-category)
  exported from the patterns so benchmark-agent's probe cannot drift. Contract C12.
- `scripts/tiered-regression.js` — re-measures over the real corpus and prints its own baseline.

**Changed**
- `tests/golden-pages.test.js` now uses `evidenceFromHtml` instead of its own inline cheerio copy.

**Corrected**
- `docs/t4-detection-validation.md`: the "14 recovered from interior pages / 7 blocked" figures do
  not reproduce. Measured with the shipped pattern: **12 of the 29 already detect on the homepage**,
  so escalation recovers **2**, and **5** are fully blocked, not 7 (2099 and 449 have readable
  `program` captures). No structural ceiling and the York finding both stand; the magnitude did not.

**Not included** — carried on UNI-225: the agent-side probe (needs a fleet rebuild), the multi-page
dom-rule re-audit, and response-header archiving.

## [1.0.0] - 2025-01-XX

### Added
- Initial release extracted from benchmark-agent
- Technology detection engine with Puppeteer
- Higher education focused patterns (SIS, LMS, CRM, CMS)
- CLI interface for standalone usage
- Programmatic API for integration
- Pattern management system
- Support for webappanalyzer pattern import

### Features
- Multi-page scanning capability
- Confidence scoring for detected technologies
- Higher education technology categorization
- Evidence collection for each detection
- Technology stack inference
- Strategic page discovery

---

[1.0.0]: https://github.com/speedyu/detechtor/releases/tag/v1.0.0

