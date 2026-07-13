# Validation Research Briefs

Self-contained research prompts for delegating pattern-validation legwork to Claude subagents. Each brief is designed to be pasted into a fresh agent with zero context from this project. Deliverables are CSV/JSON fragments that merge into `docs/reference-site-ledger.csv` or directly inform pattern cleanup.

All research tasks operate on the technologies enumerated in `docs/reference-site-ledger.csv`. Prioritize rows where `priority=high` first (40 techs), then `priority=medium` (171 techs). Tier-C pattern rows in `docs/pattern-validation-ledger.csv` are the highest-leverage cleanup targets — invented patterns are disproportionately there.

---

## Brief 1 — Find customer reference URLs for high-priority tech (40 techs)

**Goal:** For each high-priority technology, identify at least two publicly accessible `.edu` (or equivalent) sites that are known to run it, plus the vendor's public demo or customer-login subdomain pattern.

**Deliverable:** A CSV fragment with columns `technology,vendor_demo_url,vendor_docs_url,customer_url_1,customer_url_2,customer_url_3,notes`. Only include a URL if you have evidence (vendor case study, RFP document, job posting, LinkedIn mention, or prior technical confirmation).

**Rules of evidence (in order of preference):**

1. Vendor-published customer case study or customer list page (highest trust).
2. University RFP, contract, or committee minutes naming the product and the institution.
3. LinkedIn job posts from the institution explicitly naming the product as a required skill.
4. News coverage or press release confirming adoption.
5. Unofficial wikis or forum threads — lowest trust, flag in notes.

**Skip if:** No public evidence exists after a reasonable search. Set `unverifiable_public=true` and move on. Do not guess.

**Tech list to focus on:** all rows in `docs/reference-site-ledger.csv` where `priority=high`. Names include Anthology Student, Modern Campus CMS, Slate, Element451, EAB Navigate, Watermark, Campus Labs, CBORD, Academic Works, Mindmax, HelioCampus, Civitas Learning, CampusLogic, AwardSpring, Regent Education, D2L Brightspace, Instructure Canvas Catalog, Ex Libris Alma, Ex Libris Primo, Ellucian Colleague, Jenzabar, Populi, Veracross, Rediker, CampusVue, Campus Management Suite, PowerCampus, Tribal Student Management, and all rebrands tracked via `_legacy_names`.

---

## Brief 2 — Surface authoritative vendor developer docs per tech

**Goal:** For each higher-ed technology, find the canonical developer / admin documentation URL, API reference, or theme/template reference. The purpose is to cite specific pattern sources later (e.g., "CBORD's admin guide documents the `/cbord-connect/` URL prefix").

**Deliverable:** A CSV fragment with columns `technology,vendor_docs_url,vendor_dev_portal_url,theme_reference_url,notes`. If the vendor gates documentation behind a customer portal, note that in `notes` and surface any publicly indexed pages (help center, community forum, public GitHub).

**Priority hints:**

- Vendors with known portals: Ellucian (`docs.ellucian.com`), Instructure (`community.canvaslms.com`), Blackboard (`help.blackboard.com`), D2L (`documentation.brightspace.com`), Oracle PeopleSoft, Workday.
- Open-source: Moodle (`docs.moodle.org`), Sakai (`sakailms.org/docs`), Open edX (`docs.openedx.org`), Koha, FOLIO, Totara.
- SaaS with public help centers: Slate (`technolutions.com`, limited public), Turnitin, Qualtrics, Kaltura, Panopto, Mediasite.

**Skip if:** Product has no discoverable documentation surface. Note in `notes` so Phase 4 knows to rely exclusively on captured evidence.

---

## Brief 3 — Identify product rebrands and legacy identifiers

**Goal:** Catch rebrands that aren't yet tracked via `_legacy_names` in the pattern files, so we don't miss legacy installs emitting old identifiers.

**Deliverable:** A JSON fragment mapping current tech name to the list of prior names and any legacy HTML/DOM/JS identifiers still observable in the wild. Format:

```json
{
  "Current Name": {
    "previous_names": ["Old Name 1", "Old Name 2"],
    "rebrand_year": 2022,
    "legacy_identifiers": ["old-class-name", "OldJsObject", "/old-path/"],
    "source": "vendor announcement URL or news coverage"
  }
}
```

**Focus on M&A-heavy segments:** Ellucian (Banner/Colleague/Recruit/Elevate lineage), Anthology (Campus Management, Campus Labs, iModules, Blackboard consumer-edu acquisition), Instructure (Bridge, MasteryConnect, Concentric Sky/Badgr), Ex Libris (now Clarivate), D2L, PowerSchool (consumed Schoology, Infinite Campus separate), Modern Campus (OmniUpdate + DestinyOne + Presence), Blackbaud.

**Skip if:** The tech is clearly single-lineage (e.g., Drupal, Moodle).

---

## Brief 4 — Verify pattern sources against vendor documentation (deep validation)

**Goal:** For a single technology at a time, read vendor documentation and confirm that each pattern in `docs/pattern-validation-ledger.csv` for that tech is either documented by the vendor or is a reasonable derivation from documented structure. Flag patterns that look invented.

**Input:** One technology name plus the subset of ledger rows for that tech.

**Deliverable:** A marked-up table with verdict per pattern:

- **documented** — pattern directly appears in vendor docs (cite URL and section).
- **derived** — pattern is a reasonable inference from documented structure (e.g., docs say "all Canvas routes start with /courses/" so a `courses/` HTML pattern is a derivation).
- **plausible** — pattern makes sense but can't be directly cited; needs live-site confirmation in Phase 3.
- **invented** — no documented basis and no obvious derivation. Flag for removal.

**Run order:** Start with techs that have the most tier-C patterns — those are where invented patterns concentrate. Query `docs/pattern-validation-ledger.csv` for techs with `tier=C` row counts above the median before starting.

**Skip:** Any tech the researcher can't access docs for. Record that and move on.

---

## Brief 5 — Build the initial false-positive test corpus

**Goal:** Expand `tests/fixtures/known-sites.json`'s `false_positive_tests` section with sites known to use similar-but-different tech, so regression tests catch pattern collisions (e.g., a Drupal site incorrectly matching TerminalFour).

**Deliverable:** JSON fragment in the existing `false_positive_tests` schema. For each entry: a URL, the actual tech in use, a list of `must_not_match` techs from our higher-ed catalog that a naive pattern might trigger on, and a one-line rationale.

**Target collision pairs to probe:**

1. Drupal sites — must not match TerminalFour, Modern Campus CMS, Finalsite.
2. WordPress sites — must not match Finalsite, SchoolMessenger.
3. Sitecore / AEM sites — must not match Modern Campus CMS, Cascade CMS.
4. Generic React apps — must not match Canvas LMS, Blackboard Ultra.
5. Bootstrap-heavy marketing sites — must not match Element451, Slate.

**Source sites from:** known higher-ed redesigns documented in UMN/UofM/RIT/MIT/Stanford/UT Austin case studies, and from vendor case studies for non-higher-ed-specific tech.

---

## How to hand these off

Each brief is self-contained. Paste the brief plus the relevant CSV/JSON snippets into a subagent (or run locally with Claude). Merge deliverables back into the working ledgers. Keep a running diff of changes so the final `docs/PATTERN_VALIDATION_REPORT.md` can cite where each piece of evidence came from.

Order of execution: Brief 3 (rebrands — unblocks Brief 1 and Brief 4), then Brief 1 (customer URLs — unblocks evidence capture), then Brief 2 (vendor docs — unblocks Brief 4), then Brief 4 (per-tech deep validation), then Brief 5 (false positives — final regression hardening).
