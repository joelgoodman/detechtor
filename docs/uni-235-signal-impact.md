# UNI-235 — downstream signal-category impact

This branch (`joelgoodman/uni-235-semantic-category-audit`) makes ~2,942 human-adjudicated
category corrections via `patterns/category-overrides.json`. Eight of the canonical categories
are **signal categories** — `CMS`, `LMS`, `SIS`, `CRM`, `Chatbot`, `Site Search`, `Accessibility`,
`Marketing Automation` (`src/category-mapping.js`, `SIGNAL_CATEGORIES`) — read as ground truth by:

- **benchmark-agent**'s signal gate (what counts as a "detected" technology stack signal per
  institution),
- **speedyu-benchmark**'s API/reporting layer,
- **benchmark-scorecard**, which surfaces detected signal technologies in paid reports.

`src/tiered-detect.js:16` also keys the tiered-detection escalation decision directly on signal
membership:

```js
const isSignal = (tech) => (tech.categories || []).some((c) => SIGNAL_CATEGORIES.has(c));
```

So a category correction is not cosmetic — it can change whether an institution is judged to have
"a signal" at all, which changes whether detection escalates past the homepage. **This change
should not land silently in any downstream consumer.** The corrections are believed correct (a
course catalog is not an SIS), but the step change in signal-category composition below is real
and needs to be visible before/while it lands.

## 1. Technology count and summed institution-detections per signal category

Technology counts and per-technology detection counts are exact (computed from the full pattern
set and `docs/corpus-prevalence.json`, generated 2026-08-10 over the full homepage corpus: 3,879
scannable institutions, 335 unscannable/excluded per UNI-231). "Before" = pristine map
(`loadPatterns({applyOverrides: false})`, i.e. no `category-overrides.json` at all). "After" =
the map this branch ships (all ~2,942 overrides applied, including the I1/I2/I3 fixes made in this
review pass).

| Signal category | Techs (before) | Techs (after) | Δ techs | Detections (before) | Detections (after) | Δ detections |
|---|---:|---:|---:|---:|---:|---:|
| CMS | 448 | 536 | +88 | 4,540 | 4,595 | +55 |
| LMS | 96 | 97 | +1 | 1,761 | 1,680 | -81 |
| SIS | 51 | 47 | -4 | 3,787 | 3,631 | -156 |
| CRM | 6 | 41 | +35 | 2,053 | 2,153 | +100 |
| Chatbot | 305 | 286 | -19 | 503 | 500 | -3 |
| Site Search | 65 | 66 | +1 | 1,146 | 1,175 | +29 |
| Accessibility | 10 | 31 | +21 | 1,117 | 1,158 | +41 |
| Marketing Automation | 14 | 204 | +190 | 748 | 827 | +79 |

"Detections" = sum, across every technology now filed under that category, of the number of
scannable homepages on which it fired (`corpus-prevalence.json:counts`). It is a floor, not a
distinct-institution count — an institution running two CMS-classified technologies is counted
twice. Note the CRM and Marketing Automation technology-count jumps (6→41, 14→204) far outpace
their detection-count moves (+100, +79): most of the newly-reclassified technologies in those two
categories are rare or non-firing on this corpus, i.e. correctly filed but low-prevalence, not a
sign the corpus is suddenly awash in new CRM/MA detections.

## 2. Institutions whose signal set goes from non-empty to EMPTY

This is the number that matters for `tiered-detect.js`'s escalation decision: an institution
whose signal-category set flips from non-empty to empty after this change would stop escalating
past the homepage on that basis alone.

**Measured on a 600-institution sample** (not the full ~4,215-directory corpus — a full two-engine
pass, run serially, took several minutes per 100 institutions; sharded the same way as
`scripts/corpus-prevalence.js` across 12 forked shards, it completed the 600-institution sample in
7.6 minutes). Method: for each scannable homepage, ran `matchPatterns` against both the pristine
engine and the overrides-applied engine (`evidenceFromHtml` + `classifyCapture`'s UNI-231
scannable filter, mirroring `scripts/corpus-prevalence.js`), and checked whether any matched
technology's resolved categories intersect `SIGNAL_CATEGORIES`.

| | Count |
|---|---:|
| Scanned (scannable) | 554 |
| Unscannable (excluded, UNI-231) | 46 |
| **Non-empty → EMPTY (the number that matters)** | **0** |
| Non-empty → non-empty | 540 |
| Empty → empty | 14 |
| Empty → non-empty | 0 |

**Headline: 0 of 554 sampled institutions lost their entire signal set.** This is consistent with
the category-count table above — the net effect of this branch's overrides is a large net
*addition* to signal-category technology coverage (CMS, CRM, Accessibility, Marketing Automation
all gained technologies; only SIS and Chatbot lost a modest number), so an institution would need
to have relied *exclusively* on technologies that got reclassified out of a signal category, with
nothing else overlapping — evidently rare on this sample. This is a sampled measurement, not a
full-corpus guarantee: the true full-corpus count could be non-zero even though it is 0 here. If
this number needs to be exact before the change ships downstream, run
`node /path/to/i4-signal-impact-sharded.js` (recreatable from this methodology) with no `--limit`
against the full corpus.

## Bottom line

The corrections themselves are believed correct — recategorising by what a pattern actually
detects, not by vendor self-description, is the right call. But `CRM` +35 technologies,
`Marketing Automation` +190 technologies, and `Chatbot` -19 technologies is a real step change in
what benchmark-agent's signal gate, speedyu-benchmark, and the scorecard will count going forward.
Coordinate the rollout — don't let this land as a silent data shift underneath those three repos.
