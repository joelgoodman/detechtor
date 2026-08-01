# TerminalFour detection — corpus + BuiltWith validation (2026-08-01)

Check of the curated `TerminalFour` pattern (`higher-ed-cms.json`) against the full cohort-128
corpus (**4,214 institutions**, one rendered homepage each) and then against **BuiltWith**
(`institutions.tech_profile`) as an independent source.

T4 carries **no `dom` field**, so this is not a UNI-224 dom-recall case. It tests existing detection
on a CMS where BuiltWith is known to struggle.

## The watermark

`<meta name="generator" content="Terminalfour">` — present on 47 institutions:

| Count | Generator content |
|---|---|
| 31 | `Terminalfour` |
| 11 | `TERMINALFOUR` (with/without leading space) |
| 2 | `Terminalfour` (leading space) |
| 2 | `T4 Site Core` |
| 1 | `TerminalFour Site Manager` |

Zero collisions. But the watermark alone finds only **47 of 87** detected sites (54%) — many strip
it. The markup tells (`terminalfour`, `data-t4-`, `/terminalfour/`, `t4-*` classes like
`t4-bodycontainer`, `t4-site-root`, `t4-tag-content-item`) close that gap.

A broad `\bt4_[a-z]` probe was tested and **rejected**: its 4 extra hits were all false — `.t4_BEt`
(hashed CSS class) and `T4_umgu` (Drupal `itok` image hash). UNI-156's deliberate narrowing of this
pattern is vindicated; the ad-hoc widening was the noisy one.

## ⚠️ Correction: the first "100% recall" figure was circular

An earlier revision of this document reported **100% recall, 0 false positives**. That number was
measured against ground truth *derived from the same corpus tells being tested* — it could not, by
construction, find a T4 site that carries no tell. It should not have been stated as recall.

**BuiltWith cross-check (independent source):**

| | Count |
|---|---|
| Our markup detection (corpus of 4,214) | **87** |
| BuiltWith `tech_profile` (whole DB of 6,894) | **44** |
| Overlap | 22 |
| Ours only | **65** |
| BuiltWith only | **22** |
| Union | **109** |

Breakdown of BuiltWith's 22 extra:

- **5** are not in the corpus — never inspected
- **3** are CloudFront `403 Request blocked` captures (923 bytes): University College Dublin,
  Queen's University Belfast, Durham University — could not be inspected
- **14** are real, fully-captured pages carrying **no T4 fingerprint at all**

**Corrected recall against what was actually inspectable: 87 / 101 ≈ 86%.**

## ⚠️ Second correction: it is NOT a structural ceiling — it is homepage-only scanning

An earlier revision of this document claimed the misses were structural, on the theory that T4 is a
"static publishing CMS" that can leave no fingerprint, citing York's 704 KB homepage with no generator
meta and no "terminalfour" string. **That was wrong**, and Joel flagged it: T4 nearly always leaves a
fingerprint — the tells just are not reliably on the *homepage*. The claim was inferred from absence
of evidence, using only the tells already in hand.

Tested directly: **506 archived pages pulled from Wasabi for 29 candidate institutions** (all pages,
not just the homepage), via `scripts/wasabi-fetch-institutions.js`.

| Outcome | Count |
|---|---|
| **Recovered — homepage clean, interior page carries a tell** | **14** |
| Blocked — every page a 403/bot-block, could not inspect | 7 |
| Real pages, still no tell | 7 |
| Homepage carried only the *new* `site-assets` tell | 1 |

**York is among the recovered** — the flagship example of the "no fingerprint" claim turns out to
carry `terminalfour` on an interior page. Saginaw Valley State (WhatCMS-confirmed T4) is recovered via
`terminalfour` + `directEdit`. Others: Suffolk, Anne Arundel, Babson, Catawba, Longwood, Fordham,
San Juan, VCU Med, Gabelli, Olin, Idaho State, CSU Monterey.

**The fix is scanning depth, not pattern mining.** This also qualifies the Phase A dom-rule ledger,
which is measured on one homepage per institution: its `UNVALIDATED` bucket (1,280 never-fire rules)
is a homepage figure, and interior pages would fire more of them.

The 7 blocked institutions (QUB, Imperial, Durham, UCD, SUNY, South Wales, Wheaton IL) are a separate
scan-infrastructure problem — CloudFront/Cloudflare returning `403 Request blocked` for every page,
median capture size 1 KB. They are "could not look," not "nothing to find."

## New tells found by mining known-T4 pages

| Tell | T4 recall | Baseline (n=4,127) | Precision |
|---|---|---|---|
| `/terminalfour/page/directEdit` | 41% | **0** | 100% |
| `/media/<token>/site-assets/` | 45% | 1 | **98%** |
| `cdn-pxl` (T4's CDN/PXL product) | 14% | **0** | **100%** |
| `/media/` (generic) | **99%** | 15.1% | 12% |

`directEdit` is the footer CMS-login link — it sits next to the copyright notice, exactly as Joel
described. `cdn-pxl` is TERMINALFOUR's CDN/PXL image service
(<https://docs.terminalfour.com/documentation/developer-resources/cdn-pxl/>); the docs page does not
publish a hostname pattern, so the token was derived empirically from the corpus.

The last row is a useful structural fact rather than a usable rule: **86 of 87 T4 sites carry
`/media/`** (T4's media library), so it is a near-perfect *necessary* condition to pair with a weaker
second signal — but far too broad to fire on alone.

## The two sources are complementary — neither is sufficient

| CMS | BuiltWith (of 6,894) | Ours (of 4,214) | Reading |
|---|---|---|---|
| Omni CMS | 801 (**11.6%**) | 374 (**8.9%**) | comparable — both detect it well |
| TerminalFour | 44 (**0.64%**) | 87 (**2.06%**) | **we find ~3× more** |

Omni CMS publishes one unmistakable vendor URL (`a.cms.omniupdate.com/11/`), so both methods land in
the same range — it is an easy target. T4 is where BuiltWith goes blind, which quantifies the
HE-specialist CMS blindspot instead of asserting it.

But the reverse is also true: BuiltWith finds **14** T4 sites we structurally cannot. **We find 65 it
misses; it finds 14 we cannot see.** Neither source alone is adequate, which is direct support for
UNI-223's consolidation-with-precedence rather than picking a winner.

## Geography (real `institutions.country`, replacing the earlier TLD proxy)

US 56 · **GB 19** · CA 6 · IE 4 · AU 2.

GB is ~2.6% of the database but **22%** of T4 detections — roughly 8× lift, consistent with an Irish
vendor concentrated in UK/Ireland higher ed. A false-positive pattern would track the database
baseline instead; this does not.

## Is 109 consistent with T4's "400+ websites"?

Yes, and it corroborates rather than contradicts:

- **Websites ≠ institutions.** One university typically runs several T4-powered sites (main plus
  faculty/department/campus subsites). A conservative 3–5× multiplier puts 109 institutions at
  ~330–545 websites.
- **The corpus is US-heavy** (80% `.edu`) while T4's book of business is UK/Ireland-weighted.
- **Homepage-only**, one page per institution, covering 4,214 of a global HE population many times
  larger.

## Bearing on prior findings

UNI-156 measured T4 recall at 72.7% (16 of 22) against a **BuiltWith-derived** positive list. That
list of 22 is now confirmed to be exactly BuiltWith's T4 set — and BuiltWith's set captures only about
a quarter of what markup detection finds. **The 72.7% figure was measured against a gold standard
missing three-quarters of reality**, and understated the pattern accordingly.

## Incidental

**Fairfield University is duplicated** — institution ids `219` (`www.fairfield.edu`) and `5003`
(`fairfield.edu`), both flagged T4 by BuiltWith. One for the UNI-183 dedup audit.

## Caveats

- Ground truth for the 87 is markup-derived, so it cannot see fingerprint-free T4 deployments; the
  BuiltWith cross-check above is what bounds that error, and it is not itself complete either.
- Corpus is homepage-only: a T4 subsite under a non-T4 homepage is not counted.
- BuiltWith comparison spans the full 6,894-institution DB while our detection covers the 4,214-page
  corpus, so "ours only"/"BuiltWith only" partly reflects coverage, not just capability — the 22
  BuiltWith-only rows were individually checked for corpus membership to separate the two.
