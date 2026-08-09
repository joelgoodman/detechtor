# Stripping the Wappalyzer modifiers: measured impact (UNI-226)

**Measured 2026-08-09** over the full Phase A corpus — one archived homepage per institution.
Reproduce with `node scripts/modifier-impact.js` (~40 min); per-technology results in
`docs/modifier-impact.full.json`.

The run is deterministic — it was executed twice and reproduced every figure below exactly, which is
worth knowing before anyone re-measures and wonders whether a difference is real.

Stripping `\;confidence:NN` / `\;version:\1` revives **939 previously-dead pattern values at once**.
That is a large, sudden behaviour change, and the lesson of UNI-224 is that a revived pattern is
exactly as capable of being wrong as it is of being right. So it was measured before being trusted.

## Method

The engine runs twice over the same pages — once with definitions normalized, once with the raw
on-disk definitions — so the two runs differ in exactly one variable. Both engines are restricted to
the 1,166 technologies that carry a modifier; every other definition is byte-identical in both runs,
so nothing that could change is excluded. (That restriction is what makes the run feasible: it cut
the full-corpus pass from ~15 hours to ~40 minutes.)

## Headline

| | |
|---|---|
| Pages scanned | **3,879** |
| Unscannable (blocked/undersized) | **335** — see below |
| Technologies whose detection count changed | **192** |
| Technologies that **lost** detections | **0** |
| **Signal-category** technologies changed | **7** |

**Zero losses is the expected shape and a useful check on the change itself**: a regex broken by a
literal `;confidence:80` requirement can only start matching, never stop. A loss would have meant
the strip was damaging patterns rather than repairing them.

## Signal-category impact: small, and plausible

Signal categories (CMS/LMS/SIS/CRM/Chatbot/Site Search/Accessibility/Marketing Automation) are what
the product actually trusts. All seven changes are in the long tail:

| Rate | Before → after | Technology |
|---|---|---|
| 0.2% | 0 → 7 | Cornerstone |
| 0.1% | 0 → 4 | **Contensis** |
| 0.1% | 0 → 3 | Mura CMS |
| 0.3% | 8 → 10 | Concrete CMS |
| 0.1% | 0 → 2 | Grav |
| 0.1% | 3 → 4 | ThimPress LearnPress |
| 0.0% | 0 → 1 | RockRMS |

**Contensis is the one to notice.** It is a Zengenti product concentrated in **UK higher education** —
precisely the population where BuiltWith goes blind and where the T4 work already showed our own
detection carrying the load. Four institutions is small, but it is four we were structurally unable
to see, on a corpus that is 80% `.edu`.

No signal-category technology moved by more than 7 institutions. **There is no false-positive flood.**

## The large movers are all generic front-end libraries

| Before → after | Rate | Technology |
|---|---|---|
| 0 → 1,266 | 32.6% | jQuery Migrate |
| 620 → 1,275 | 32.9% | Font Awesome |
| 0 → 377 | 9.7% | Modernizr |
| 180 → 541 | 13.9% | Slick |
| 0 → 330 | 8.5% | imagesLoaded |
| 0 → 256 | 6.6% | Underscore.js |
| 0 → 219 | 5.6% | FitVids.JS |
| 0 → 204 | 5.3% | Popper |

These are `scriptSrc` patterns on distinctively-named vendor files, and the prevalences are what you
would expect: jQuery Migrate ships with WordPress, and roughly a third of university homepages
running it is unremarkable. **Only jQuery Migrate gained more than 25 points**, and it is the most
plausible entry in the list.

Note Font Awesome fires here via `scriptSrc`/`html`, which is legitimate — distinct from its `dom`
rule `[class*='fa']`, which stays denied for breadth (it matches "de**fa**ult"). The two paths are
independent and the denial still holds.

### A flaw in the first version of this measurement

The initial suspicious-technology filter keyed on **absolute prevalence** (`rate > 25%`) and flagged
**Facebook Pixel at 55.8%** — whose delta was **+1 institution**. It was already at 55.8% before the
change. Filtering on prevalence answers "is this technology common?"; the question is "did *this
change* cause it?" The filter now keys on `delta / scanned`, which flags jQuery Migrate alone.

## Incidental finding: 335 unscannable homepages (8.0%)

335 of the 4,214 archived homepages are blocked or undersized captures — **8.0% of the corpus**,
under the same `capture-quality` classifier written for UNI-225.

This is far larger than the 5-of-29 seen in the TerminalFour sample and it means **any prevalence
figure computed over "the corpus" has been quietly dividing by pages nobody could read**. Every
denominator in the Phase A dom-rule ledger is affected. It does not invalidate the relative
comparisons here — both runs skip the same pages — but it is a standing measurement bias and the
bot-blocking behind it still has no ticket.

## Verdict

**Ship it.** The change is purely additive, the signal-category effect is a handful of genuine
long-tail CMSes including one real UK HE product, and the only large mover is a jQuery compatibility
shim at an entirely ordinary prevalence.
