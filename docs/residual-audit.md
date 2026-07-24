# Residual base-origin signal over-firers — UNI-156 Task 4.2 (go/no-go)

**Decision: NO hard provenance gate (Joel, 2026-07-17). Keep emitted `curated` provenance as soft metadata.**

## Method
`scripts/residual-audit.js` loads all patterns (with the Task-4.1 `_curated`/`_sourceFile` provenance
stamps), maps `cats` → category names, and counts BASE (non-curated) patterns in the **signal
categories** (CMS, LMS, SIS, CRM, Chatbot, Site Search, Accessibility, Marketing Automation) that
would clear the product floor (≥50) against the local corpus. Offline, a base signal tech only
reaches ≥50 via a `scriptSrc` (+60) or `meta generator` (+100) match (html alone is +40 < 50), so
those are the evidence types checked. Sample: every 10th corpus homepage (422 files).

## Result
Of **657** base signal patterns with ≥50-capable evidence, only **18** fired on ≥1 sampled site:

| Category | Base techs that fired | Examples |
|---|---|---|
| CMS | 9 (18 site-fires) | Squiz DXP (8), DNN, Ektron, Kentico CMS, Silverstripe, Squiz Matrix, TYPO3, Weebly |
| Chatbot | 5 (12) | Tawk.to (5), HubSpot Chat (3), Facebook Chat Plugin (2), Alive5, Pubble |
| SIS | 3 (5) | Qualtrics CoreXM (3), HighLevel, CollegeNET 25Live |
| Site Search | 1 (1) | Addsearch |

## Interpretation → why no gate
1. **Zero plugin/widget/ecommerce pollution in the residual.** No WooCommerce, Juicer, Weglot,
   Email Encoder, or bare-word WordPress. The Phase 1 **category-map fix already eliminated the
   actual pollution** the ticket was filed against. This audit confirms it.
2. **The 18 residual techs are legitimate signals** — real CMS platforms (Squiz, TYPO3, DNN,
   Silverstripe) and real chat (Tawk.to, HubSpot Chat) that simply aren't in our curated set. A hard
   "curated-or-high-bar" gate would **over-suppress real detections** (most fire via scriptSrc = ~60,
   below a sensible high bar), trading real recall for no precision gain.
3. **The apparent case-mismatch dupes are non-issues.** `Tawk.to`/`tawk.to` and `Addsearch`/`AddSearch`
   are separate *pattern* keys, but `mergeTechnologies` keys emitted detections by `name.toLowerCase()`,
   so they **merge to one output detection**, and Task 4.1 makes the merged `curated` flag the OR of
   contributors — so curated provenance wins at the output. No cleanup required.

## What we keep instead of a gate
- The emitted per-detection `curated` / `sourceFile` provenance (Task 4.1) stays as **soft metadata**.
  The scorecard / product (UNI-148) can rank or flag base-origin signal detections without dropping
  them — a softer, safer use of provenance than hard suppression.
- `scripts/residual-audit.js` remains as a reusable audit to re-check residual after future base
  imports or curated additions.
