# Changelog

All notable changes to deTECHtor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

