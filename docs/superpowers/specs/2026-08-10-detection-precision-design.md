# Detection precision — engine repairs and a measured breadth gate (UNI-237, phase 1)

**Status:** design approved 2026-08-10 · **Ticket:** UNI-237 (child of UNI-138)
**Branch base:** `joelgoodman/uni-235-semantic-category-audit` (PR #15, unmerged — this work needs
the category-override layer and `docs/corpus-prevalence.json`)

## The problem

UNI-235 established that every technology sits in the right *category*. It is structurally blind to
whether a technology's *pattern* fires correctly. `Ghost` is genuinely a CMS; its pattern is
`html:["ghost"]`, which matches the CSS class `btn-ghost`, and it "fires" on 613 universities.

Measurement on 2026-08-10 (460-institution attributed sample; 3,879-institution prevalence corpus;
BuiltWith `institutions.tech_profile` over 5,704 institutions as an independent oracle) found the
defect is substantially larger than UNI-237 describes, and located somewhere different.

### What the ticket got wrong

| UNI-237 claims | Measured |
| --- | --- |
| 311 patterns can never fire | **183** |
| …58 of them in signal categories | **9** |
| 173 rely only on `html`/`text` | **39** html-only; `text` is read by *nothing* |
| `html`/`text` is "the weakest evidence" | **Field type is the wrong axis** |

The 311 counted `scripts` (704 patterns) as non-evidence; the engine reads it at
`src/detechtor.js:991`. And `text` (60 patterns) is not a weak signal — it is an *unread* one.

The field-type framing fails on its own examples. `Yoast SEO Premium` is html-only and its pattern is
`<!-- This site is optimized with the Yoast SEO Premium plugin v([^\s]+) `, which is close to
unfalsifiable evidence. `Ghost` is bare `"ghost"`. Same field, opposite quality. **Specificity is the
axis; field type is not.**

### What is actually wrong

Of 10,400 detections in the attributed sample, **3,550 (34%) rested on a sole `html` substring
match**, and 61% of those on a two-word wildcard that matches ordinary English prose:

| Technology | Pattern | Homepages matched |
| --- | --- | --- |
| Bootstrap | `class=".*row"` | 69.8% |
| Localist | `event.*calendar` | 47.6% |
| Bootstrap | `class=".*col-"` | 40.9% |
| Microsoft Power BI | `power.*bi` | 32.4% |
| GIS Cloud | `gis.*cloud` | 17.4% |
| Ghost | `ghost` | 16.3% |
| Veracross | `vera.*cross` | 12.4% |
| Google Workspace | `g.*suite` | 9.8% |
| Ready Education | `ready.*education` | 9.1% |

52 patterns across 47 technologies match above 2% of homepages this way; **20 are in signal
categories**. Share of each signal category's detections resting on such a pattern:

| SIS | LMS | CMS | Site Search | CRM | Accessibility | Marketing Automation | Chatbot |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **72%** | **60%** | **24%** | 13% | 8% | 0% | 0% | 0% |

The four clean categories are exactly the four pattern files UNI-156 fixed. The debt is in
`higher-ed-infra.json` (1,180 contaminated detections), `higher-ed-sis.json` (340) and
`higher-ed-lms.json` (155) — **files we hand-wrote** — plus 15 upstream technologies. This is not an
upstream-import problem.

Prose collision is the largest class but not the only one. Two others were found by inspecting the
corpus directly, and neither is visible to any structural heuristic:

- **Minified-identifier collision.** `TargetX`'s `html:["targetx"]` matches `targetUrl:d,targetXP:l`
  in a minified analytics bundle, `const targetX=digitPos*…` in canvas code, and an SVG attribute
  list containing `"targetx","targety"` — 35 of its 122 detections. A seven-character distinctive
  vendor string, so it passes every length and stopword test.
- **Editorial mention.** `Element451` fires on an institution whose homepage carries the headline
  "…Receives Element451 2026 Leadership of the Year Award". The vendor is named, not installed.

Both are caught by the excess metric in component 1 and by nothing else, which is why the gate is
built on measured excess rather than on pattern shape.

**Every one of the 47 technologies already carries a good signal beside the bad pattern.** `Localist`
has `localist\.com`, `scripts:localist` and `js:{Localist}` as well as `event.*calendar`. `Ghost` has
`meta:{generator:"Ghost"}`. Zero require pattern mining; the fix is deletion.

### Measurement caveat, stated up front

The corpus stores bare rendered HTML. `evidenceFromHtml` synthesises `jsObjects` only when
`jsGlobals` is supplied, and supplies no cookies or headers — so during measurement the `js` (3,062
patterns), `cookies` (314) and `headers` (580) channels were **inert**. A true-positive `Localist`
would also match `js:{Localist}` in production and would not count as sole-html.

Therefore **34% is an upper bound on sole-html reliance, not a production figure**, and
"sole-evidence rate" is unsuitable as a gate metric. Per-pattern match rate is unaffected by the
disabled channels and is what this design uses. The finding itself is unaffected: `class=".*row"`
matches a site with no Bootstrap regardless of which channels are probed.

## Goal

Make the corpus figures trustworthy as *detections*, not merely as categorisations, and make it
impossible to reintroduce a prose-collision pattern without the build failing.

## Architecture

Five components plus one hand-off. Each is independently testable and lands on its own.

### 1. `scripts/pattern-breadth.js` — the instrument

A sharded corpus pass (same `child_process.fork` structure and the same crash-accounting invariants
as `scripts/corpus-prevalence.js`: exit code checked, "did it ever send a result" checked, merged
totals reconciled against the directory count, artifact not written on any failure).

Runs with `config.includeEvidence = true`. `evaluatePattern` already records which field produced
each match (`src/detechtor.js:1189`); UNI-235's run simply did not ask for it.

Emits `docs/pattern-breadth.json`. **The block below defines the shape; its numbers are illustrative
placeholders, not measurements** — per-pattern total match counts do not exist yet, which is the
whole reason this script is being written.

```json
{
  "generated": "…", "scanned": 0, "unscannable": 0,
  "channelsNotProbed": ["js", "cookies", "headers"],
  "patterns": {
    "<technology name>": {
      "fires": 0,
      "strongest": { "field": "scripts", "pattern": "<regex>", "matched": 0 },
      "html": [
        { "pattern": "<regex>", "matched": 0, "excess": 0 }
      ]
    }
  }
}
```

For scale, the one figure that *is* measured: in the 460-institution attributed sample `Bootstrap`
fired on 452 homepages, and `class=".*row"` alone accounted for 321 of them as sole evidence.

`matched` is how many scannable homepages that individual pattern matched. `strongest` is the
highest-matching pattern among the technology's independent signals (`scripts`/`scriptSrc`/`dom`/
`meta`, i.e. the channels the corpus *can* evaluate — `js`/`cookies`/`headers` are excluded and the
artifact records that they were not probed). `excess = max(0, matched − strongest.matched)` is the
collision mass: homepages where this html pattern claimed the technology and nothing else agreed.

### 2. `scripts/lint-pattern-breadth.js` — the gate

> **⚠️ REVISED 2026-08-11 after calibration against the full corpus. The design below this callout
> — measured excess alone — was tried and FAILED. Read this first.**
>
> On the full 3,879-institution artifact, excess-alone flagged three known-good patterns:
> `Yoast SEO Premium`'s anchored comment (excess 239 of 239 fires), `Canvas LMS`'s
> `instructure\.com` (435 of 440), and `Algolia`'s `algolia` (299 of 321).
>
> **Why:** `strongest` counts only non-html channels, and the corpus cannot evaluate `js`,
> `cookies` or `headers`. A technology whose real marker is an html-delivered vendor domain
> therefore has `strongest ≈ 0`, and every pattern it owns reads as pure collision mass. This is
> the same conflation of "delivered via html" with "unsupported" that this document criticises
> three sections above, reintroduced in the metric.
>
> **And no threshold fixes it.** Comparing each html pattern to the technology's *other* html
> patterns ranks the two decisive cases backwards: `Bootstrap`'s bad `class=".*row"` is 2.4× its
> good `bootstrap` (3,754 vs 1,595), while `Canvas LMS`'s *good* `instructure\.com` is 87× its
> `canvas-lms` (435 vs 5). The counts are the same shape; the difference is whether the pattern
> text is a vendor string or a prose wildcard.
>
> **Revised rule — shape proposes, measurement disposes.** A pattern fails only when BOTH stages
> agree:
>
> 1. **Specificity screen.** Using a vendored copy of `/usr/share/dict/words` (~234k entries — a
>    real dictionary, NOT a hand-maintained stoplist), a pattern is *suspect* if it wildcards
>    (`.*`/`.+`) between dictionary words, or is a bare token whose every alphabetic run is a
>    dictionary word. `event.*calendar` and `ghost` are suspect; `instructure\.com`, `algolia`,
>    `omniupdate` and the Yoast comment are not.
> 2. **Measured excess**, exactly as described below, decides whether a suspect is doing damage.
>
> Measured on the full corpus: **82 patterns across 70 technologies, 39 in signal categories.**
> Both stages are load-bearing — 112 shaped-but-harmless patterns are spared by the measurement,
> and 80 high-excess-but-specific ones are spared by the screen.
>
> **The word list must be vendored into the repo, not read from `/usr/share/dict/words`.** A gate
> whose verdict depends on which machine runs it is not a gate; `/usr/share/dict/words` is absent
> on most Linux CI images and is a symlink to `web2` on macOS.
>
> **Two known imperfections, recorded rather than hidden.** `bootstrap` is itself a dictionary
> word, so Bootstrap's own legitimate pattern is flagged and needs one allowlist entry. `targetx`
> is caught by neither stage despite 35 of its 122 detections being false positives
> (`targetUrl:d,targetXP:l` in a minified bundle); it must be fixed by hand in Task 7 and the gap
> logged, per the no-silent-caps rule.

Fails `npm test` when an html pattern's `excess` exceeds **either** threshold, unless the pattern is
listed in `patterns/breadth-allowlist.json`:

- **absolute** — `excess` above 2% of scanned homepages (≈78 institutions), which catches the
  high-volume prose collisions; and
- **relative** — `excess / fires` above 25%, with `fires >= 20` to suppress small-sample noise.

Both are needed, and `TargetX` is why. 35 of its 122 detections are false positives — `targetXP`, a
minified analytics variable (`targetUrl:d,targetXP:l`), plus `const targetX=digitPos*…` canvas code
and an SVG attribute list containing `"targetx","targety"`. Its excess is 0.9% of homepages, well
under the absolute floor, but **29% of its own detections**. The trigger is neither prose nor short:
`targetx` is a seven-character distinctive vendor string that passes every structural heuristic. Only
the excess comparison sees it.

**Both thresholds are provisional and must be calibrated during implementation** against a labelled
set — the 52 measured prose patterns plus `TargetX` as known-bad, and the anchored-comment and
vendor-domain patterns (`Yoast SEO Premium`, `Modern Campus CMS`, `Slate`, `Algolia`) as known-good.
The calibration, including any threshold that had to move and why, is recorded in the PR. Numbers
that cannot yet be validated must not be treated as settled.

The allowlist mirrors `patterns/category-overrides.json` in shape and rigour: one entry per
`technology → pattern`, each carrying `reason` and `decided`, and validated for staleness — an entry
naming a technology or pattern that no longer exists fails the build, exactly as a stale category
override does today. A no-op entry (one whose pattern is already under threshold) also fails, so the
allowlist cannot silently accumulate dead weight.

2% is chosen from the measured distribution: the 52 known-bad patterns all sit above it and the
anchored-comment and vendor-domain patterns all sit far below. It replaces the hand-maintained
`STOPWORDS` list in `scripts/lint-patterns.js`, which cannot distinguish `ghost` (5 chars, bad) from
`algolia` (7 chars, good) because breadth is empirical, not lexical.

The gate is also the reason this holds: the next over-broad pattern anyone adds fails on arrival.

### 3. Pattern deletions

Remove the 52 offending html patterns across the 47 technologies. **The authoritative list is the
gate's own failure output from component 2, not a list copied into this document** — a hand-copied
list would drift the moment the corpus changes, and the deletions must be justified by the same
measurement that enforces them afterwards.

Each technology keeps its independent signal, so this is a precision fix with no intended recall cost
— verified by re-measuring prevalence per technology before and after and recording both.

**12 of the 52 cannot simply be deleted in place.** They live in `patterns/webappanalyzer-merged.json`,
which `scripts/import-webappanalyzer.js:152` **overwrites wholesale** on every import
(`{ ...webappPatterns }`, with the curated higher-ed files overlaid afterwards at whole-technology
granularity). An in-place edit there is silently reverted the next time anyone re-imports — the exact
failure that forced `patterns/category-overrides.json` to exist in UNI-235. The affected patterns are
the worst offenders in the set:

> `Bootstrap` (`class=".*row"`, `class=".*col-"`, `class=".*btn-"`), `Ghost` (`ghost`), `jQuery`
> (`jquery`), `TYPO3` (`typo3`), `Angular` (`ng-app`), `Google Tag Manager` (`GTM-`),
> `Blackboard Transact` (`campus.*card`, `bb.*transact`), `Campus Labs` (`campus.*labs`),
> `PeopleSoft Campus Solutions` (`campus.*solutions`)

So component 3 needs a load-time layer, not an edit:

**`patterns/pattern-overrides.json` + `src/pattern-overrides.js`** — deliberately the same shape,
placement and rigour as the category-override layer it sits beside. Applied in `loadPatterns()` after
`resolveIdentities()`; removes named evidence patterns from a technology's `html`/`scripts`/
`scriptSrc` arrays; records `was` and `reason` per entry; `loadPatterns({applyOverrides:false})`
still yields the pristine map so the audit scripts can diff against it. Validation rejects a rule
naming a technology that no longer exists, a pattern string no longer present (the override is
stale), and a no-op — identical to the category layer, for the identical reason.

The 40 patterns in `higher-ed-{infra,sis,lms,cms}.json` are ours and are edited directly. Using the
override layer for those too would be indirection with no benefit: nothing regenerates them.

Two patterns need judgement rather than deletion and are called out so no implementer guesses:

- `Jenzabar` `/ICS` and `/ICS/` — a real Jenzabar path fragment, but `/ICS` unanchored also matches
  ordinary URLs. Tighten to `/ICS/` with a following path segment rather than deleting.
- `Funnelback` `squiz.*search` — below the 2% measurement threshold but structurally identical to
  the others. Delete it, keep `funnelback` and `js:{Funnelback}`, and **add
  `funnelback\.squiz\.cloud`**, which is the marker that actually identifies the product: the
  typical integration is a plain search input whose typeahead calls
  `<institution>-search.funnelback.squiz.cloud/s/suggest.json`, with the query itself handed to a
  separate Funnelback search page. Corpus evidence: 47 institutions carry a Funnelback marker
  (autocomplete host, or Drupal integration classes `funnelback-block-search-form` /
  `funnelbackIdentifier`), but exactly **one** exposes a `<form action>` pointing at Funnelback.
  Institutions that proxy search through their own domain are therefore undetectable from the
  homepage — a UNI-225 recall limit, not a pattern defect. BuiltWith sees 6; our 47 is the better
  number.

### 4. Engine repairs

The engine consumes seven pattern fields — `html`, `scripts`/`scriptSrc`, `headers`, `meta`, `dom`,
`js`, `cookies`. **Fifteen more are declared across the pattern set and read by nothing.** Not
"weakly supported" — absent from `src/` entirely.

| Defect | Fix |
| --- | --- |
| `pattern.scripts \|\| pattern.scriptSrc` (`detechtor.js:991`) — 85 patterns declare both, **54 with different content**, and the `scriptSrc` half is silently discarded | Union the two lists |
| `excludes` (45 patterns, 5 currently firing) never read | Honour it — see the tie-break rule below |
| `url` (76) and `xhr` (100) never read | Read them; both are already on the evidence object |
| `text` (60) never read | Delete the field; it duplicates `html` |

**`excludes` needs a tie-break rule, because the declared pairs are mutual.** `Underscore.js`
(256 fires) excludes `Lodash`, and `Lodash` (106) excludes `Underscore.js`; likewise `AngularJS`
(16) ↔ `Angular`, and `Piwik PRO Core` (29) ↔ `Matomo Analytics`. Naive application either
suppresses both or is order-dependent. Rule: **when two technologies exclude each other and both
match, the higher-confidence match survives and the lower is suppressed; on an exact tie both are
kept and the collision is logged.** Suppressing both loses a real detection; picking by file order
makes the result depend on load sequence.

Deliberately **not** enabled, each for a stated reason:

| Field | Patterns | Why not |
| --- | ---: | --- |
| `requires` | 610 (170 firing) | **Blocked on UNI-141, and actively harmful before it.** Almost all are WordPress plugins declaring `requires:["WordPress"]`. We detect WordPress on 42.5% of institutions against BuiltWith's 61.8% — so enabling `requires` today would suppress ~170 plugin technologies on the ~1,900 sites that genuinely run WordPress and that we simply fail to detect. It converts one recall bug into a cascade of them. Enable only after WordPress recall is fixed |
| `requiresCategory` | 89 | Same class as `requires`, same dependency |
| `implies` | 970 | *Adds* inferred detections rather than removing false ones — recall/inference, not precision. UNI-237 already notes the side effect: `Amazon Web Services` would surface via `implies` from `Amazon S3`, making one detection read as two |
| `confidence` | 296 | A per-pattern score override, moot once the floor is removed in component 5. Document as unread |
| `dns` (75), `certIssuer` (6), `probe` (2), `network` (2), `robots` (1) | 86 | Need DNS and certificate machinery in the scan path, for parcel carriers and mail providers no university runs |

After `url`/`xhr` land, recount the 183 never-fireable patterns and delete whatever remains dead.
144 of the 183 are dead *only* because the engine ignores a field they declare, including
signal-category `Miso`, `Newt`, `Kiliba` and `Business Website Builder`.

### 4a. One product-facing finding, recorded and handed on

`signal_polarity: "negative"` is set on six technologies in `higher-ed-accessibility.json` —
`accessiBe`, `AudioEye`, `UserWay`, `EqualWeb`, `Recite Me`, `WP Accessibility Helper` — and **is
read by nothing.** These are accessibility *overlay* vendors, and the field exists because their
presence is a red flag rather than a credential. Unread, any consumer counting Accessibility
detections scores an overlay as an accessibility positive, which inverts the intended meaning.

This is a vocabulary and consumer problem, not a detection one: the patterns fire correctly. It goes
to **UNI-238** with the other vocabulary gaps rather than being fixed here, but it must not be lost —
`UserWay` alone fires on 4.3% of institutions.

**Decision: polarity does not belong at the detection level, and the field is not implemented.**
Detection records what is present. Whether a thing is good is a consumer judgement that changes with
the consumer — an accessibility overlay is a negative for accessibility maturity and a *positive*
buying signal for sales. Implementing `signal_polarity` in the engine would hard-code one reading of
that into the layer every consumer shares.

So: leave the six-vendor list in place as curated data (it is real knowledge — someone identified
those six as overlays), document the field as unread in the table above, and let UNI-238 re-encode it
**factually** rather than evaluatively — an `Accessibility Overlay` distinction states what the
product *is*; `"negative"` states what someone thinks of it. The scorecard then applies polarity from
its own configuration. Nothing is deleted and nothing is silently believed.

### 4b. The regenerated file must stop being mistakable for an editable one

`patterns/webappanalyzer-merged.json` is a **build artifact that looks exactly like a source file** —
tracked, hand-readable, sitting beside eleven files that *are* hand-edited. This has now caused the
same wasted work more than once, and a comment at the top of `category-overrides.js` has not
prevented it. Documentation is the wrong instrument; the confusion has to be made structurally
impossible.

Three changes, because they fail differently:

1. **Move it to `patterns/generated/webappanalyzer-merged.json`.** The path itself then says "build
   artifact" in every file tree, every `grep -rn` result and every diff header. Update the path in
   `src/config.js`'s pattern list and in `scripts/import-webappanalyzer.js`.
2. **Stamp `_generated: true`** on every definition loaded from a `patterns/generated/` path,
   alongside the existing `_curated` and `_sourceFile` marks. Anything inspecting a technology —
   a script, a test, an agent answering "where does this pattern live?" — sees it without knowing
   the convention.
3. **Gate it.** `scripts/import-webappanalyzer.js` records the artifact's SHA-256 in
   `patterns/import-report.json` at import time; a check in `npm test` recomputes it and **fails on
   any mismatch**, with an error that names `patterns/pattern-overrides.json` as the correct place
   to make the change.

Only the third actually stops the mistake — the first two stop the confusion that leads to it. A
reader who ignores the directory name and the `_generated` flag still cannot land the edit.

### 5. `minConfidence` neutralised

`src/config.js:87` sets `minConfidence: 30`. The weakest possible single match is an `html` substring
at **40** (`detechtor.js:977`); script is 60, dom/meta/js 70–100. **No single match can score below
the floor, so the floor has never rejected anything.** It was introduced under UNI-138 as a precision
control and does not function as one.

Remove the comparison at `detechtor.js:954` and replace it with a comment stating plainly that
filtering happens at authoring time via the breadth gate, not at runtime by score. `confidence`
remains on the match object as a reported signal-strength value.

Raising the floor instead is rejected: at 41 every html-only detection dies, including the 39
legitimate ones (`Yoast SEO Premium`, `Redis Object Cache`, `Vue.js`, `React`).

## Out of scope, and where it goes

**Recall.** BuiltWith agreement, rate-normalised, is the largest finding of the measurement and it
belongs to UNI-141 (`pattern mining + validation harness from BuiltWith+HTML`). It must be handed
over **split by cause**, or UNI-141 will mine patterns that already exist:

- *Genuine pattern gaps* — no deTECHtor pattern at all, and **confirmed by a second source**:
  `Sitefinity` (BuiltWith 1.1%; WhatCMS 21 institutions) and `HubSpot CMS` (BuiltWith 2.5%; WhatCMS
  19). Also `Sakai` (0.2%), `Ingeniux` (0.1%), `TrustArc` (0.4%), single-sourced to BuiltWith.
- *Genuine recall weakness* — pattern exists, under-fires: `Google Custom Search` (14.6% → 8.2%),
  `UserWay` (8.1% → 4.3%), `OneTrust` (5.7% → 2.6%), `Squarespace`, `Wix`, `Sitecore`, `Joomla`,
  `Contentful`, `ExpressionEngine`.

  **`WordPress` and `Drupal` are NOT on this list, on the evidence of a third source.**
  `scans.whatcms_cms` is populated for 3,131 of the 4,459 institutions in cohort 107 — a one-off
  WhatCMS run, 70% coverage, and the only independent CMS oracle besides BuiltWith:

  | | deTECHtor | WhatCMS (of 3,131 identified) | WhatCMS (of all 4,459) | BuiltWith |
  | --- | ---: | ---: | ---: | ---: |
  | WordPress | 42.5% | **44.1%** | 31.0% | 61.8% |
  | Drupal | 17.7% | **20.0%** | 14.1% | 23.8% |
  | Modern Campus / Omni CMS | 10.0% | **12.2%** | 8.6% | 9.8% |
  | TerminalFour | 2.2% | **2.6%** | 1.8% | 0.4% |

  deTECHtor sits between WhatCMS's two denominators on every row and almost exactly on its upper
  bound. **BuiltWith is the outlier, not us** — it counts subdomains, historical traces and
  department blogs running WordPress beneath a site whose actual CMS is Omni CMS or Drupal. The
  "~1,900 missing WordPress installs" was largely an artefact of trusting a single oracle.

  This also settles `TerminalFour`, whose 5× BuiltWith ratio looked like an over-fire: WhatCMS says
  2.6% against our 2.2%. We were right and BuiltWith was thin.

  Caveats: cohort 107 predates 130/131, so the comparison is time-shifted; WhatCMS returns a single
  primary CMS per site and cannot see a second; 30% of the cohort got no answer at all.
- *Not a pattern problem — scope* — pattern is sound, the technology is not on the homepage or not in
  static HTML: `Moodle` (8.8% → 0.2%, lives at `moodle.<institution>.edu`), `Osano` (6.7% → 0.4%,
  async-injected), `Blackboard (Anthology)` (10.3% → 2.6%). These are UNI-225 (tiered/multi-page
  detection), not UNI-141.

Also record what BuiltWith gets *wrong*, so its authority is not overstated. Its CRM rollup tracks
four vendors total, and its Site Search rollup seven, which is why `TargetX`, `Element451`, `Slate`
and `Funnelback` appear to over-fire by 4–90×. Checked individually against the corpus:

- `Slate` — **genuine**. 566 homepages contain the literal `technolutions`, 549 contain
  `mx.technolutions.net`. BuiltWith's 205 is short, not us long.
- `Funnelback` — **genuine**, 47 institutions with a real marker against BuiltWith's 6.
- `Element451` — **genuine bar one**: a news headline, "…Receives Element451 2026 Leadership of the
  Year Award". An editorial mention, not an installation.
- `TargetX` — **29% false positive**, per the `targetXP` collision above. The only real over-fire of
  the four, and it is caught by the relative threshold rather than by BuiltWith.

Where both sources are sound they agree closely — `Modern Campus` 1.02, `Siteimprove` 0.96, `Canvas`
0.92, `Monsido` 0.90, `Algolia` 0.83. **A BuiltWith ratio is a prompt to go and look at the corpus,
never a verdict on its own.**

**The per-category human pass** over each signal category's firing members, which UNI-237's "done
when" also asks for, becomes its own ticket and runs after this one — reviewing detections through a
repaired engine, with `pattern-breadth.json` in hand.

## Regenerated artifacts

These deletions change headline figures published in PR #15, so both must be regenerated as the
final task and the deltas recorded:

- `docs/corpus-prevalence.json` — `Bootstrap` at 98.0% and the SIS figures become wrong the moment
  the deletions land.
- `docs/category-coverage.md` — via `npm run audit:coverage`.

Nothing is written to Supabase. `technology_detections` already holds stale deTECHtor rows and is
UNI-222's purge; this work strengthens the case for it but does not perform it.

## Testing

- **Unit** — engine repairs each get a test: a pattern with differing `scripts` and `scriptSrc` must
  match on either; a `url`/`xhr` pattern must fire; an `excludes` hit must suppress; **two
  mutually-excluding technologies must resolve to the higher-confidence one, and to both on an exact
  tie.**
- **Pattern-override layer** — an override removes only the named pattern and leaves the
  technology's other evidence intact; `loadPatterns({applyOverrides:false})` still returns the
  pristine map; a rule naming a missing technology, a pattern string no longer present, or a no-op
  each fails validation. **A regeneration test is mandatory**: re-running the importer over
  `webappanalyzer-merged.json` must not resurrect an overridden pattern — that is the entire reason
  the layer exists, and it is the one property a unit test on the override function alone would not
  catch.
- **Gate** — `lint-pattern-breadth.js` must fail on a fixture pattern exceeding the absolute
  threshold, and separately on one exceeding only the relative threshold (the `TargetX` shape); both
  must pass once allowlisted; a stale allowlist entry and a no-op allowlist entry must each fail.
- **Regression** — the UNI-224 shape-contract guard and the existing 136 tests must stay green.
- **Empirical** — per-technology prevalence before and after, recorded in the PR. Any technology
  losing more than a token number of detections is a deletion that went too far and is reverted.
  `Bootstrap`, `Localist`, `Ghost`, `TargetX` and `Microsoft Power BI` are expected to fall
  substantially; anything else moving is a finding, not a result.

## Success criteria

1. `minConfidence` no longer pretends to filter.
2. The 52 prose-collision patterns are gone and cannot come back without failing `npm test` —
   including the 12 in the regenerated upstream file, proven by re-running the importer.
3. `scripts`/`scriptSrc`, `excludes`, `url` and `xhr` are honoured; `text` is deleted; every field
   left unread is documented as such with its reason, so the next reader does not rediscover it.
4. Never-fireable patterns are recounted after the repairs, and the residue deleted.
5. `corpus-prevalence.json` and `category-coverage.md` regenerated, with the before/after delta for
   every affected technology recorded in the PR.
6. UNI-141 and UNI-225 carry the recall findings, split by cause; UNI-238 carries `signal_polarity`.
7. A hand-edit to the generated pattern file fails `npm test` with an error naming the override
   layer — the regeneration trap can no longer cost anyone a second afternoon.
