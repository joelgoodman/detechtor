# Changelog

All notable changes to deTECHtor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Unbounded wildcards: a gate, a corpus-verified rewriter, and the rewrite (2026-10-08)

An unbounded `.*` / `.+` / `[^x]*` / `\s*` / `\w+` in a detection regex is a runtime-cost bug (V8 retries it
from every start position, so it is quadratic on a minified one-line page). It had been "fixed" at least four
times by judging the pattern's text; nothing measured runtime cost and nothing banned the construct, so it kept
coming back (`i.*clicker` passed every lint with a seven-letter literal). 906 regexes in the effective pattern
set still carried it after the last fix.

**Added — the gate** (`scripts/lint-pattern-cost.js`, in `npm test`; `docs/WILDCARD_GATE.md`).
- Loads what the engine actually loads (generated artifact + curated files + identity merge + override and
  rewrite layers) and checks every regex in every channel the engine compiles.
- Static rules from a real regex parser (`scripts/lib/regex-shape.js`): unbounded `*` `+` `{n,}` over `.`, a
  negated class, `\s \S \w \W \D`, `[\s\S]`, a class as wide as `\w` or a repeated group of single-character
  alternatives, except terminal or in a `^`-anchored branch; more than one per match path; ambiguous nested
  repeats (judged by whether the inner repeat can absorb what comes next, so version idioms like
  `(?:\d+\.)+` pass); ambiguous alternation; a leading unbounded run; a bound over 1000; an unbounded
  repeat of a group that contains a span-eater.
- Measured: every distinct regex against two 1 MB single-line adversarial inputs in a child process under a
  250 ms budget, with a vm timeout inside and a SIGKILL watchdog outside (a catastrophic regex fails the
  build instead of hanging it). 6,342 regexes in ~13 s. `--exhaustive` adds unbroken-run inputs.
- Hygiene: `patterns/wildcard-allowlist.json` with a ratchet (reason, measured span and cost; stale, no-op
  and duplicate entries fail; its length is capped in a test; it is empty); stale rewrite rules fail; an
  unclassified definition field fails, and a test fails if `src/detechtor.js` gains a `new RegExp(` site
  with no channel.
- The importer evaluates the effective set WITH the candidate artifact before writing anything and refuses,
  listing the offenders, if it would carry the construct (`--keep-candidate FILE` saves it for the rewriter).

**Added — the rewriter** (`scripts/rewrite-unbounded-wildcards.js`). Measures the shortest gap each wildcard
needs on 22,297 archived pages, sets `bound = max(80, 2 x observed max)` (250 when never seen, 80 with several
wildcards on a path), drops a wildcard that is the first or last thing in a branch (redundant for `test()`),
and writes a rewrite only when old and new are identical over the whole corpus on page verdicts and match
starts. Anything else needs a decision (`patterns/wildcard-decisions.json`), which applies only if no page
gains a match and no more than the reviewed number lose one. `patterns/wildcard-review.tsv` lists what still
wants a human eye.

**Changed — the patterns.** 902 distinct wildcard patterns rewritten: 750 identical over the corpus, 27 in
channels the corpus cannot observe (url, xhr, headers), 118 where the bound the cost target allows is smaller
than the evidence asked for (the pattern only matched by spanning far-apart words; 99 of these change some
page verdicts and are listed with their numbers), 7 reviewed replacements. Curated technologies are edited in
place; generated ones through `patterns/pattern-rewrites.json`, a new load-time layer (`src/pattern-rewrites.js`)
that names the exact original text, so a re-import that brings it back is fixed again at load.

Note for consumers: a detection's `evidence` strings carry the pattern text, which changes for every
rewritten pattern.

### Linear-time vendor patterns + underscore page types (2026-10-08)

An offline run over 300 archived cohort-140 institutions found two defects.

**Fixed — match cost.** Four `html` rules carried an unanchored `.*` that rescans to the end of the
line from every start letter. Archived pages are minified onto one line, so the cost was quadratic in
page size: `iClicker` alone was 67% of all match CPU and `Screencast-O-Matic` 8%; one 3.35 MB page took
206 s. Every wildcard in these technologies' `html`/`scripts` rules is now bounded or a literal form:
- `iClicker`: `i.*clicker` -> `\bi(?:&gt;|[\s_>-])?clicker` (the "i>clicker" branding is `i&gt;clicker`
  in rendered HTML); `reef.*iclicker` -> `reef[^<>\n]{0,80}iclicker`; script `reef` ->
  `reef-education\.com` (the bare substring fired on every Craft Freeform `freeform.js`).
- `Screencast-O-Matic`: `screencast.*o.*matic` -> `screencast[\s_-]?o[\s_-]?matic`.
- `PowerSchool SIS`: `powerschool.*sis`, `powerschool.*student`, `ps.*powerschool` (html and scripts)
  -> `[^<>\n]{0,80}` between the literals.
- `Unit4 Student Management`: the bare `coda` script substring is dropped (it fired inside a Slate
  beacon URL's random id; `unit4` already covers the vendor's script hosts).

The generated artifact `patterns/generated/webappanalyzer-merged.json` still carries the old text of
these entries. It is not regenerated here: a re-import downloads current upstream WebAppAnalyzer
data, which is unrelated churn, and the curated entries replace same-named generated ones whole at
load (pinned by `tests/pattern-cost.test.js`, which checks the LOADED definitions).

**Fixed — page types.** The page archive names its types with underscores (`cost_aid`,
`student_life`); `config.pagePreference` uses hyphens, so those two preferences never matched.
`orderPages` now compares `_` and `-` as the same character (`src/page-selection.js`). The caller's
own `pageType` spelling is returned unchanged.

**Added**
- `tests/pattern-cost.test.js` (+ `tests/helpers/pattern-cost-child.js`): no unbounded quantifier in
  these technologies' loaded rules, and each evaluates five 1 MB single-line adversarial pages in a
  child process with a hard timeout.
- `tests/vendor-patterns.test.js`: positive and negative fixtures per vendor, the negatives being the
  real false positives from the run.
- `_` vs `-` cases in `tests/page-selection.test.js` and `tests/tiered-detect.test.js`.

### UNI-223 — dictionary export + eight absorbed categories (2026-09-02)

**Added**
- `scripts/emit-dictionary.js` — the category + technology dictionary as JSON. The shared DB's
  `categories`/`technologies`/`technology_aliases` are regenerated from it on every re-pin, so the
  vocabulary cannot drift from the engine. Categories are canonical, overrides applied.
- Eight categories absorbed from the BuiltWith-curated taxonomy (`Authentication`, `Forms`,
  `Event Management`, `Tag Management`, `Feedback & UX`, `Maps & Virtual Tours`,
  `Personalization & CRO`, `AI Tools`), non-signal. deTECHtor owns the vocabulary; BuiltWith and
  WhatCMS data is mapped into it.

**Changed**
- `Microsoft SharePoint` now files under **both** `Business Software` and `CMS` (was
  `Business Software` alone since 2026-08-10). SharePoint hosts public university sites; alone it
  IS the CMS (R30/R31, Joel 2026-09-03), beside another CMS it is a portal/intranet. Dropping the
  CMS category made the first case undetectable, which is the worse error — the "only when alone"
  half of the rule belongs to the store, which ranks it last-resort
  (`technologies.last_resort`, UNI-223 R30). Category override, not a pattern edit.

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

