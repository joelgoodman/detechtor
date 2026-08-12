# UNI-237 hand-off — detection precision, phase 1

_Measured 2026-08-11 against the 3,879-institution homepage corpus. Every figure here comes from a
script in this repo; rerun them rather than trusting this copy._

## What changed

**Engine — four defects, all silently ignoring declared configuration:**

| Defect | Effect |
| --- | --- |
| `pattern.scripts \|\| pattern.scriptSrc` discarded the `scriptSrc` half | 85 patterns declared both, **54 with different content**. Fixed by unioning through a `Set`; 31 declare identical content and would otherwise double-count |
| `excludes` declared on 45 patterns, read by nothing | Now honoured. Those 45 patterns declare **50 rules**: 44 one-directional, 6 mutual forming 3 pairs. (An earlier draft said "44 of 45", conflating patterns with rules.) |
| `url` (76) and `xhr` (100) declared, read by nothing | Now read. Live-browser path only; `evidenceFromHtml` supplies neither, so corpus passes are unaffected |
| `text` (60) declared, read by nothing | Deleted, and stripped at import so a re-import cannot resurrect it |

**`minConfidence` removed.** At its default of 30 it had never rejected anything, because the weakest
single match — an `html` substring — scores 40. It was **not** inert at a user-supplied value above
40; the `--confidence` CLI flag is what allowed that, and this branch removed the flag too, because
it had become a live no-op that printed `Min Confidence: 95%` while filtering nothing.

The full scale, read from `evaluatePattern` rather than from memory: **html 40 · url 50 · script 60 ·
network/xhr/cookies/dom 70 · headers 80 · js 80 · meta 100**. An earlier version of this document
gave "dom/meta/cookies/xhr 70 · js 80", which omitted `headers` and `network` entirely and put
`meta` at 70 when it is 100.

That scale is load-bearing, because `applyExcludes` resolves mutual pairs by confidence — **and the
`Math.min(confidence, 100)` cap at `src/detechtor.js:1306` defeated it.** 4,012 of 6,347
technologies (63.2%) can reach the cap, so mutual pairs tied there and "exact tie keeps both"
silently no-opped the exclusion. Fixed: the tie-break now resolves on the uncapped score while the
reported `confidence` stays capped.

**Patterns.** Counts are deliberately NOT quoted here. Run:

```
node scripts/uni-237-summary.js
```

The figures in this section were restated three times during the work — 53/11/47/3, then
67/12/55/5, then 76/12/60/11 — not through carelessness but because they move with every commit,
and a number copied into prose stops tracking the thing it describes the moment it is written. The
script computes them from live state and separates alias collapses from real zeroes, which is the
specific distinction an earlier hand-written version got wrong.

**151 never-fireable technologies were deleted** — none had a readable evidence field, none had
ever fired — leaving zero.

**Two new guards in `npm test`:**
- `scripts/lint-generated.js` — the generated artifact's SHA-256 is recorded at import; a hand-edit
  fails the build with an error naming `pattern-overrides.json` as the right place.
- `scripts/lint-pattern-breadth.js` — an html pattern fails if a dictionary-based specificity screen
  **and** measured excess both flag it. 81 violations at introduction, 0 now.

  ⚠️ **Read "81 → 0" precisely: it measures the gate's agreement with itself, not the corpus's
  false-positive rate.** The gate raised the floor on *dictionary-word html patterns* and nothing
  else. Patterns it structurally cannot see remained wrong until found by hand — see Known gaps.

## Prevalence: before → after

`scanned` unchanged at 3,879. For the current totals run `node scripts/uni-237-summary.js` — the
headline moved every time a pattern was tightened, which is exactly why it is not quoted here.

| | before | after | |
| --- | --: | --: | --- |
| Bootstrap | 3,803 | **1,595** | `class=".*row"` matched any class attribute |
| Localist | 1,992 | **78** | `event.*calendar` matched the words in prose |
| Microsoft Power BI | 1,152 | **11** | `power.*bi` matched "em**power**ing **bi**ology" |
| Blackboard Transact | 709 | **3** | `campus.*card` |
| Ghost | 613 | **14** | bare `ghost` matched the `btn-ghost` CSS class |
| Typekit | 710 | **0** | **not a loss** — deduplicated into `Adobe Fonts` (710), which it double-counted |

**1,079 detections were RECOVERED**, not lost, by the `scripts`/`scriptSrc` union — `Linkedin
Insight Tag` 0 → **907** (its `scripts` entry was a JS variable name that could never match a script
URL, while its working `scriptSrc` host was discarded), `Tealium` 0 → 55, `web-vitals` 0 → 41,
`EAB Navigate` 170 → 208, `Active Campaign` 4 → 28.

**Technologies that dropped to zero are listed by `scripts/uni-237-summary.js`, which distinguishes
them from alias collapses.** That distinction matters and an earlier draft of this document got it
wrong: five vanished names — `Typekit`→`Adobe Fonts`, `Navigate`→`EAB Navigate`, `Cybot`→`Cookiebot`,
`CIVIC`→`Cookie Control`, `Starfish Retention Solutions`→`Starfish` — are UNI-235 alias merges where
the canonical target keeps every detection. Counting them as losses overstates the drop.

The genuine zeroes are correct, and each was checked against the corpus rather than assumed:
`veracross`, `giscloud`, `risevision`, `webassign`, `gradelink`, `factsmgt`, `getfast`, `advisortrac`
and `quickschools` appear **zero times in any literal form** across 4,215 captures, so every prior
detection was a prose collision. `Evisions` likewise — all 209 matches were "r**evisions**" and
"tele**visions**".

⚠️ An earlier version of this document claimed `Diaspora`'s 300 matches "were the English word".
**That was asserted without checking and is wrong** — they were Font Awesome's `.fa-diaspora` class,
the same mechanism this document correctly identifies for `Angular` and `TYPO3`.

## To UNI-141 (recall)

**Prioritise technologies with no pattern at all.** A supervised mining prototype
(`scripts/mine-patterns.js`, full write-up in UNI-141's comments) showed that for technologies we
*already* model, the guessed patterns are at the ceiling of what the archive contains — mining
`UserWay` produced `cdn.userway.org` at 62% recall with zero false positives, and the existing
guessed `userway\.org` already detected more. **Guessing cost us coverage, not precision.**

Confirmed gaps, second-source supported: `Sitefinity` (BuiltWith 64 / WhatCMS 21 — mining yields a
clean `data-sf-*` family worth 0 → 24), `HubSpot CMS` (144 / 19). Single-sourced to BuiltWith:
`Sakai`, `Ingeniux`, `TrustArc`.

Genuine weakness in existing patterns: `Google Custom Search` (BuiltWith 14.6% vs our 8.2%),
`UserWay` (8.1 / 4.3), `OneTrust` (5.7 / 2.6), `Squarespace`, `Wix`, `Sitecore`, `Joomla`,
`Contentful`, `ExpressionEngine`.

⚠️ **`WordPress` and `Drupal` are NOT recall gaps. Do not spend effort there.** `scans.whatcms_cms`
on cohort 107 (3,131 of 4,459 institutions) puts WordPress at **44.1%** of those it identified
against our 42.5% and BuiltWith's 61.8%; Drupal 20.0 / 17.7 / 23.8. We sit on WhatCMS's upper bound
and **BuiltWith is the outlier**, counting subdomains and department blogs beneath a site whose real
CMS is something else. The same source vindicates `TerminalFour` (2.6 / 2.2 / 0.4) and
`Modern Campus` (12.2 / 10.0 / 9.8).

## To UNI-225 (scope, NOT pattern defects)

These patterns are already correct; mining them again would waste the effort. They miss because the
evidence is not on the homepage or not in static HTML:

- `Moodle` — BuiltWith 8.8%, we detect 0.2%. Lives at `moodle.<institution>.edu`.
- `Osano` — 6.7% vs 0.4%. Async-injected; mining returned nothing above noise, which is the tell.
- `Blackboard (Anthology)` — 10.3% vs 2.6%.
- `Funnelback` — the query is handed to a separate search page; only 1 of 47 institutions with a
  Funnelback marker exposes a `<form action>` on the homepage.

## To UNI-238 (vocabulary)

`signal_polarity: "negative"` on `accessiBe`, `AudioEye`, `UserWay`, `EqualWeb`, `Recite Me` and
`WP Accessibility Helper` is **read by nothing**, so a consumer counting Accessibility detections
scores an accessibility *overlay* as a positive. `UserWay` alone fires on 4.3% of institutions.

**Decision: it stays unimplemented, deliberately.** Detection records what is present; whether that
is good is a consumer judgement that changes with the consumer — an overlay is a negative for
accessibility maturity and a *positive* buying signal for sales. Re-encode it factually (an
`Accessibility Overlay` distinction states what the product *is*) and let the scorecard apply
polarity from its own configuration.

## Known gaps in what was built

**The gate's baseline is computed from the channel it does not screen.** `scripts/pattern-breadth.js`
derives `strongest` from the non-html channels — precisely the `scripts`/`scriptSrc` surface the gate
never checks — and `excess = matched − strongest`. **So the noisier a technology's script pattern,
the more html breadth it is permitted**: anti-correlated with correctness. `Rave Mobile Safety` is
the clean illustration — its *good* html `getrave` (46) is measured against its *bad* script `rave`
(48, which matches `brave-popup-builder`), yielding excess 0. The script channel is 4,229 regexes
against html's 1,052, so ~80% of the substring surface both escapes screening and sets the yardstick.
**This is the highest-value follow-up**; fixing it (screen the script channel, and compute
`strongest` only from channels that have themselves passed a breadth screen) closes this and the
`scripts`-unscreened gap together.

**A vendor token that is a PREFIX of a common word defeats the specificity screen**, because the
screen tokenises whole words. Found by hand, not by the gate, and all were shipping:

| pattern | matched | genuine | collides with |
| --- | --: | --: | --- |
| `Encoura :: "encoura"` | 513 | 3 | "encour**aged**", "encour**ages**" |
| `Evisions :: "evisions"` | 209 | 0 | "r**evisions**", "tele**visions**" |
| `PowerCampus :: "eCollege"` | 240 | 4 | `dinecollege.edu` |
| `Angular :: "ng-app"` | 134 | 17 | "engineeri**ng-app**lied" |
| `AdAstra :: "ad.*astra"` | 76 | ~17 | the Astra WordPress theme |

All are now tightened. A prefix-aware screen was tested and **rejected**: it catches `encoura` and
`eCollege`, misses `evisions` (because "revisions" is not in the word list — the macOS lexicon is
largely base forms), and falsely flags `Recite Me`'s clean `reciteme\.com` because "recitement" is a
dictionary word. Its hits and misses are accidents of lexicon coverage.

**The replacement, measured and ready for the follow-up: word-boundary survival rate.** The fraction
of a bare token's matches that survive a word-boundary constraint separates the classes cleanly with
no dictionary at all — `evisions` 0%, `encoura` 1%, `ecollege` 1%, `ng-app` 13%, against `workday`
72%, `kaltura` 87%, `instructure` 89%, `reciteme` 97%, `algolia` 98%, `localist` 100%. A 50%
threshold catches every offender with 22 points of margin, spares `reciteme` which the prefix screen
got wrong, and is a corpus measurement rather than a lexicon lookup. It belongs as a second measured
column in `pattern-breadth.js`, which also extends it to the script channel for free.

**Unbounded wildcards collide across minified markup, invisibly to sampling.** `navigate.*eab`
matched 119 files of which only 44 contain `eab.com`, one match spanning 233,893 characters of
minified Wix config. Four allowlist entries had been justified from sampled short-span matches;
all four are now bounded instead, following the `blackboard.{0,60}ultra` fix this branch already
made.

**Two script-channel collisions found by hand and left for the follow-up:** `Rave Mobile Safety`'s
`rave` (61 script srcs against `getrave`'s 46 genuine) and `Evisions`' dead bare `evisions` (0 script
srcs). Both are the unscreened-channel gap above.

**The corpus cannot exercise `js` (3,062 patterns), `cookies` (314), `headers` (580), `url` or
`xhr`.** A zero in `docs/pattern-breadth.json` means "not measurable from a static capture", never
"absent in production" — recorded there as `channelsNotProbed`.

**`bootstrap` is itself a dictionary word**, so Bootstrap's own legitimate pattern carries an
allowlist entry.

**`requires` (610 patterns, 170 firing) and `requiresCategory` (89) stay off**, blocked on UNI-141.
Almost all are WordPress plugins declaring `requires:["WordPress"]`; enabling them while WordPress
recall is imperfect would suppress those plugins on every site we fail to detect — one recall bug
becoming a cascade. `implies` (970) stays off because it adds inferred detections rather than
removing false ones.

## Reproducing any of this

```
npm run breadth          # docs/pattern-breadth.json — per-pattern match counts
npm run lint:breadth     # the gate, human-readable
npm run prevalence       # docs/corpus-prevalence.json
npm run audit:coverage   # docs/category-coverage.md
npm test                 # all gates
node scripts/mine-patterns.js --tech "<name>" --ids <institution ids>
```

## What this still does not tell you

A category audit cannot see a bad detection, and a breadth gate cannot see a bad *category*. This
work verified that firing patterns fire for the right reason; **it did not re-verify that each
technology sits in the right category** — that was UNI-235, and its 2,942 decisions were largely
machine-made. Nor has any per-category human pass over firing members happened yet; that was the
other half of UNI-237's original "done when" and remains open.

BuiltWith is a thin oracle in HE-specialist categories — its CRM rollup tracks four vendors total,
which is why `TargetX`, `Element451`, `Slate` and `Funnelback` appear to over-fire by 4–90×. Only
`TargetX` was real. **A BuiltWith ratio is a prompt to go and look at the corpus, never a verdict.**
