# UNI-237 hand-off — detection precision, phase 1

_Measured 2026-08-11 against the 3,879-institution homepage corpus. Every figure here comes from a
script in this repo; rerun them rather than trusting this copy._

## What changed

**Engine — four defects, all silently ignoring declared configuration:**

| Defect | Effect |
| --- | --- |
| `pattern.scripts \|\| pattern.scriptSrc` discarded the `scriptSrc` half | 85 patterns declared both, **54 with different content**. Fixed by unioning through a `Set`; 31 declare identical content and would otherwise double-count |
| `excludes` declared on 45 patterns, read by nothing | Now honoured. 44 of 45 rules are one-directional and 3 pairs mutual — see below |
| `url` (76) and `xhr` (100) declared, read by nothing | Now read. Live-browser path only; `evidenceFromHtml` supplies neither, so corpus passes are unaffected |
| `text` (60) declared, read by nothing | Deleted, and stripped at import so a re-import cannot resurrect it |

**`minConfidence` removed.** It was 30 while the weakest single match — an `html` substring — scores
40, so it had never rejected anything since UNI-138 introduced it as a precision control. Removed
rather than raised: at 41 every html-only detection dies, including the legitimate ones
(`Yoast SEO Premium`, `Redis Object Cache`, `Vue.js`, `React`). The confidence scale is now
**html 40 · url 50 · script 60 · dom/meta/cookies/xhr 70 · js 80**, and it is load-bearing for the
first time because `applyExcludes` resolves mutual pairs by highest confidence.

**Patterns.** 53 html and 11 script patterns removed across 47 technologies, 3 tightened, 23
allowlisted with sampled corpus evidence on each entry. **151 never-fireable technologies deleted**
(none had readable evidence, none had ever fired), leaving **zero**. 6,346 technologies remain.

**Two new guards in `npm test`:**
- `scripts/lint-generated.js` — the generated artifact's SHA-256 is recorded at import; a hand-edit
  fails the build with an error naming `pattern-overrides.json` as the right place.
- `scripts/lint-pattern-breadth.js` — an html pattern fails if a dictionary-based specificity screen
  **and** measured excess both flag it. 81 violations at introduction, 0 now.

## Prevalence: before → after

`scanned` unchanged at 3,879. Total detections **86,645 → 72,035 (−16.9%)** across 68 technologies.

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

**13 technologies dropped to zero, and that is correct.** `veracross`, `giscloud`, `risevision`,
`webassign`, `gradelink`, `factsmgt`, `getfast`, `advisortrac` and `quickschools` appear **zero times
in any literal form** across 4,215 captures — every prior detection was a prose collision.
`Diaspora`'s 300 were the English word.

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

- **The breadth gate screens `html` patterns only.** A `scripts` pattern collides unscreened.
  Proof: `Cengage`'s `scripts:["cengage"]` matched `civicengagement` — 11 corpus files, 2 real.
  Fixed by hand to `cengage\.com`; the gate would never have caught it. **Extend the gate to
  `scripts` before a large batch of mined patterns lands.**
- **The corpus cannot exercise `js` (3,062 patterns), `cookies` (314), `headers` (580), `url` or
  `xhr`.** A zero in `docs/pattern-breadth.json` means "not measurable from a static capture", never
  "absent in production". Recorded in the artifact as `channelsNotProbed`. This is why `strongest`
  reads 0 for technologies whose marker arrives in markup, and why the gate needs the specificity
  screen rather than measurement alone.
- **`bootstrap` is itself a dictionary word**, so Bootstrap's own legitimate pattern is flagged and
  carries an allowlist entry.
- **`requires` (610 patterns, 170 firing) and `requiresCategory` (89) stay off**, blocked on UNI-141.
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
