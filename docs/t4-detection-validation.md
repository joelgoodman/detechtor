# TerminalFour detection — corpus validation (2026-08-01)

Independent check of the curated `TerminalFour` pattern (`higher-ed-cms.json`) against the full
cohort-128 corpus: **4,214 institutions, one rendered homepage each**.

T4 carries **no `dom` field**, so this is not a UNI-224 dom-recall case. It is a test of whether our
existing detection matches reality on a CMS where BuiltWith is known to fail (0/9 known clients).

## The watermark

`<meta name="generator" content="Terminalfour">` — present on 47 institutions, in these exact forms:

| Count | Generator content |
|---|---|
| 31 | `Terminalfour` |
| 11 | `TERMINALFOUR` (with/without leading space) |
| 2 | `Terminalfour` (leading space) |
| 2 | `T4 Site Core` |
| 1 | `TerminalFour Site Manager` |

Zero collisions — no `gt4`-style false matches. But the watermark alone finds only **47 of 87** real
T4 sites (54%): many strip or replace the generator meta. The broader markup tells (`terminalfour` in
markup, `data-t4-`, `/terminalfour/`, `t4-*` classes such as `t4-bodycontainer`, `t4-site-root`,
`t4-tag-content-item`) are what close the gap.

## Result

| Metric | Value |
|---|---|
| Ground truth (any genuine T4 tell) | **87 institutions** (2.06% of corpus) |
| Current curated pattern detects | **87** |
| Recall | **100%** |
| False positives | **0** |

The curated pattern is `html: ["terminalfour", "data-t4-"]` + `meta.generator: "T4|TerminalFour"`.

**A broad `\bt4_[a-z]` probe was tested and rejected.** It added 4 apparent hits, all false:
`.t4_BEt` (hashed CSS class) and `T4_umgu` (Drupal `itok` image hash). UNI-156 narrowed this pattern
deliberately, and that narrowing is vindicated — the ad-hoc broad probe was the noisy one.

## Geography corroborates the detections

TLD distribution of T4 institutions vs the corpus baseline (63 of 87 had a resolvable canonical domain):

| TLD | T4 share | Corpus share | Lift |
|---|---|---|---|
| `ac.uk` | 27.0% | 3.5% | **7.6×** |
| `edu.au` | 3.2% | 0.6% | **5.1×** |
| `.edu` (US) | 61.9% | 80.0% | 0.8× |

T4 is an Irish vendor selling heavily into UK/Ireland/Australia higher ed, and the detections carry
exactly that fingerprint. A false-positive pattern would track the corpus baseline instead. Within the
corpus's ~112 resolvable `ac.uk` institutions, 17 are T4 — roughly **15% of UK HE in corpus**.

## Is 87 consistent with T4's "400+ websites"?

Yes, and it corroborates rather than contradicts it:

- **Websites ≠ institutions.** One university typically runs several T4-powered sites (main site plus
  faculty/department/campus subsites). Even a conservative 3–5× multiplier puts our 87 institutions at
  ~260–435 websites.
- **The corpus is US-heavy** (80% `.edu`) while T4's book of business is UK/Ireland-weighted, so it
  systematically under-samples T4's core market.
- **The corpus is homepage-only**, one page per institution, and covers 4,214 of a global HE population
  many times that size.

## Caveats

- Ground truth is derived from markup tells, so a T4 site that strips every tell is invisible to both
  the pattern and this check. The 100% figure means "the pattern finds everything a full-text sweep
  finds," not "T4 has no undetectable deployments."
- TLD analysis covers the 63 of 87 institutions with a resolvable canonical/og:url/base domain.
- Homepage-only: a T4 subsite under a non-T4 homepage is not counted.

## Bearing on prior findings

UNI-156 measured T4 recall at 72.7% (16 of 22) against a **BuiltWith-derived** positive list. The
corpus ground truth is **87 — 4.1× larger**. BuiltWith's T4 list was drastically incomplete, which is
consistent with the known BuiltWith HE-specialist CMS blindspot. **The corpus is a better T4 ground
truth than BuiltWith**, and the curated pattern is materially better than the 72.7% figure suggested.
