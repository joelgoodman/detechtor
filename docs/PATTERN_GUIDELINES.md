# Pattern Quality Guidelines

This document defines quality standards for detection patterns in deTECHtor. Following these guidelines prevents false positives and ensures reliable technology detection.

## Pattern Quality Tiers

| Tier | Confidence | Description | Examples |
|------|------------|-------------|----------|
| **A** | 80-100 | Unique identifiers that definitively identify a technology | Headers: `X-Canvas-User-Id`, Meta: `generator="WordPress"`, JS: `webpackChunkcanvas_lms` |
| **B** | 40-60 | Product-specific paths or namespaced identifiers | `/terminalfour/`, `/wp-content/`, `instructure.com`, `class="slate-"` |
| **C** | 10-30 | Generic patterns that need corroboration from other patterns | Product names in body content, common class prefixes |

### Tier A: Definitive Patterns (Preferred)

These patterns should be the primary detection method:

- **Custom HTTP headers**: `X-Canvas-User-Id`, `X-Drupal-Cache`, `X-Powered-By: OmniCMS`
- **Meta generator tags**: `<meta name="generator" content="WordPress 6.0">`
- **Vendor-specific JS objects**: `window.webpackChunkcanvas_lms`, `Drupal.settings`
- **Unique DOM attributes**: `data-reactroot`, `data-slate-`, `data-omni-`
- **Product-specific cookies**: `BbRouter` (Blackboard), `PS_TOKEN` (PeopleSoft)

### Tier B: Strong Patterns (Good)

Reliable but not unique:

- **Vendor domains in URLs**: `instructure.com`, `technolutions.com`, `adobedtm.com`
- **Product-specific paths**: `/terminalfour/`, `/wp-content/`, `/sites/all/themes/`
- **Namespaced classes**: `class="slate-form"`, `class="omni-edit"`
- **Versioned script files**: `jquery-3.6.0.min.js`, `bootstrap.bundle.min.js`

### Tier C: Weak Patterns (Use with Caution)

These should only supplement stronger patterns:

- **Product names in content** (may appear in discussions, comparisons)
- **Generic class prefixes** (may be used by multiple frameworks)
- **Short or common strings**

---

## Anti-Patterns to Avoid

These pattern types cause false positives and should be avoided or removed:

### 1. Single Common English Words

| Bad Pattern | Why Bad | Better Alternative |
|-------------|---------|-------------------|
| `"colleague"` | Matches natural text like "ask a colleague" | `"ellucian[^>]*colleague"`, `"/colleague/"` |
| `"banner"` | Matches ad banners, hero banners | `"ellucian.*banner"`, `"bwck"` |
| `"navigate"` | Matches navigation elements | `"navigate.*eab"`, `"eab\\.com"` |
| `"cascade"` | Common word | `"cascade.*cms"`, `"hannon.*hill"` |
| `"starfish"` | Could appear in content | `"starfishsolutions"`, `"hobsons.*starfish"` |

### 2. Short Strings (< 4 characters)

| Bad Pattern | Why Bad | Better Alternative |
|-------------|---------|-------------------|
| `"t4"` | Matches CSS hashes like `t4-abc123`, version strings | `"terminalfour"`, `"/terminalfour/"` |
| `"PS"` | Matches PostScript, abbreviations | `"PeopleSoft"`, `"PS_TOKEN"` |
| `"bb"` | Matches many things | `"blackboard"`, `"bblearn"` |
| `"d2l"` | Ambiguous | `"brightspace"`, `"desire2learn"` |
| `"cas"` | Matches "case", "cascade" | `"/cas/"`, `"central.*authentication"` |

### 3. Single-Letter JS Object Names

| Bad Pattern | Why Bad | Better Alternative |
|-------------|---------|-------------------|
| `"s": ""` (Adobe Analytics) | Extremely common variable | `"s_gi"`, `"s_account"` |
| `"ga": ""` (Google Analytics) | Common abbreviation | `"GoogleAnalyticsObject"`, `"gtag"` |
| `"$": ""` (jQuery) | Common alias | Detect via script src only |

### 4. Generic CSS Class Patterns

| Bad Pattern | Why Bad | Better Alternative |
|-------------|---------|-------------------|
| `class=".*btn-"` | Matches Bootstrap, custom CSS | `"getbootstrap\\.com"`, script detection |
| `class=".*col-"` | Grid systems everywhere | Script or CDN URL detection |
| `class=".*row"` | Common layout class | Remove entirely |
| `class=".*moodle"` | Overly broad regex | `"class=\"moodle-"`, `"id=\"moodle-"` |

### 5. Unbounded Wildcards (a cost bug, enforced by `npm test`)

`.*`, `.+`, `[^"]*`, `\s*`, `\w+` and `{n,}` with no upper bound are **banned** in every detection regex, in
every field the engine compiles. V8 retries a regex from every start position, so on a page minified onto
one line an unbounded wildcard is quadratic in page size: `i.*clicker` was 67% of all match CPU over a
300-institution sample, and one 3.35 MB page took 124 s on `canva.*for.*schools`. Do not judge it by the
literals around it. `scripts/lint-pattern-cost.js` parses the regex and measures it on 1 MB adversarial
input; see [WILDCARD_GATE.md](WILDCARD_GATE.md).

| Bad | Write instead |
|-----|---------------|
| `canva.*for.*schools` | `canva[^<>\n]{0,80}for[^<>\n]{0,80}schools` (inside a tag), `.{0,80}` elsewhere |
| `.*altcha\.js` | `altcha\.js` (a leading or trailing wildcard is redundant for `test()`) |
| `<a-scene[^<>]*>` | `<a-scene[^<>]{0,300}>` |
| `/plugins/x/.+\.js` | `/plugins/x/.{1,120}\.js` |

A single wildcard inside a `^`-anchored pattern (`^Name (.*)$`) is fine: one start position. Pick the
bound from evidence, not by eye: `node scripts/rewrite-unbounded-wildcards.js --corpus <dir>` measures
the real span on archived pages and writes only rewrites that are identical over the whole corpus.

### 6. Overly Broad Wildcards

| Bad Pattern | Why Bad | Better Alternative |
|-------------|---------|-------------------|
| `".*canvas.*"` | Matches HTML canvas element, "canvas" in text | `"canvas-lms"`, `"instructure"` |
| `".*react.*"` | Matches "reaction", "reactive" | `"data-reactroot"`, `"_reactRootContainer"` |
| `".*angular.*"` | Matches "angular" in text | `"ng-app"`, `"data-ng-"` |

---

## Writing Good Patterns

### HTML Patterns

```json
// GOOD: Specific, namespaced patterns
"html": [
  "Drupal\\.settings",           // JS object initialization
  "sites/all/themes",            // Drupal-specific path
  "/misc/drupal\\.js",           // Drupal-specific script
  "class=\"slate-",              // Namespaced class prefix
  "data-omni-"                   // Vendor-specific data attribute
]

// BAD: Generic, ambiguous patterns
"html": [
  "drupal",                      // Too generic
  "class=\".*btn",               // Matches many frameworks
  "banner"                       // Common word
]
```

### Script Patterns

```json
// GOOD: Specific file names or paths
"scripts": [
  "jquery(?:\\.min)?\\.js",           // Versioned filename
  "googletagmanager\\.com/gtag/js",   // Full CDN path
  "instructure",                       // Vendor domain
  "bwck"                               // Banner-specific module
]

// BAD: Generic names
"scripts": [
  "banner",          // Common word
  "canvas",          // HTML element name
  "ultra"            // Generic word
]
```

### Vendor hosts (`_hosts`)

Every fired rule now reports what it matched (`matches[]`, artifact schema 2, `src/rule-matches.js`), and
each match on a URL says whether that URL is on the **vendor's** own domain (`vendorHost`). The ledger
loader grades a Script or non-link DOM match as anchored only when `vendorHost` is true (or the match is
first-party for a self-hosted product), so a rule that matches `elastic` inside a slider plugin, or
`force` inside "workforce", no longer anchors a row.

A technology's vendor domains are:

1. the registrable domain of its `website` (`https://www.hubspot.com` -> `hubspot.com`), plus
2. every entry of an optional `_hosts` array: registrable domains or longer host suffixes the vendor
   serves its product from.

```json
"HubSpot": {
  "website": "https://www.hubspot.com",
  "_hosts": ["hs-scripts.com", "hs-analytics.net", "hsforms.net"],
  "scripts": ["js\\.hs-scripts\\.com"]
}
```

A host matches an entry when it equals it or is a subdomain of it (`js.hs-scripts.com` is on
`hs-scripts.com`). Registrable domains use `src/registrable-domain.js`: the last two labels, or three
under a known public second level (`ac.uk`, `com.au`, `ac.nz`, ...; the list is in that file).

Add a host to `_hosts` only when it is **the vendor's own** (its product CDN, its tracking or form host,
its tenant domain such as `my.salesforce-sites.com`). Never a customer's host, an agency's, a plugin
marketplace's, a school's own CDN (that is first-party, not vendor) or a domain that merely contains the
vendor's name (`ghostplugins.dev` is not Ghost). When unsure, leave it out: a missing host makes a row
ungraded, a wrong one makes a wrong row anchored. `_hosts` is not a regex and is never matched against
page content; `scripts/corpus-rule-matches.js` lists the non-vendor hosts a technology's rules matched on
a corpus, which is how the current entries were chosen.

### JavaScript Object Patterns

```json
// GOOD: Unique, namespaced objects
"js": {
  "Drupal": "",
  "webpackChunkcanvas_lms": "",
  "GoogleAnalyticsObject": "",
  "Blackboard": "",
  "PeopleSoft": ""
}

// BAD: Common variable names
"js": {
  "s": "",           // Single letter
  "ga": "",          // Too short
  "PS": "",          // Abbreviation
  "$": ""            // Common alias
}
```

### Header Patterns

```json
// GOOD: Vendor-specific headers
"headers": {
  "X-Canvas-User-Id": ".*",
  "X-Drupal-Cache": ".*",
  "X-Powered-By": "OmniCMS",
  "shib-session-id": ".*"
}
```

---

## Pattern Checklist for Contributors

Before submitting new patterns, verify:

- [ ] **No single common English words** as standalone patterns
- [ ] **No strings shorter than 4 characters** (unless highly specific like `"GTM-"`)
- [ ] **No single-letter JS object names**
- [ ] **No overly broad regex** (`.*word.*` without anchors) and **no unbounded `*`/`+`/`{n,}` over `.`, a negated class, `\s` or `\w`** (`npm run lint:cost`)
- [ ] **At least one Tier A or Tier B pattern** for reliable detection
- [ ] **Tested against false positive sites** (sites that don't use the technology)
- [ ] **Tested against true positive sites** (sites that do use the technology)

---

## Testing Patterns

### Run the pattern gates

```bash
npm test
```

The old `npm run test:audit` (`scripts/audit-patterns.js`) was removed: it exited 1 on the main branch, skipped
the CRM, marketing, chat and accessibility files, and its checks (short strings, common words, broad regex) are
covered by `lint-patterns.js`, `lint-pattern-breadth.js` and `lint-pattern-cost.js`. `npm test` also runs:

- `lint-ledger-categories.js`: a technology in a ledger category needs a reviewed entry in
  `patterns/ledger-category-review.json` that agrees with the engine.
- `lint-script-negcorpus.js`: every `scripts`/`scriptSrc` rule of a ledger-category technology runs against real
  script URLs (`tests/fixtures/negcorpus/script-urls.tsv.gz`); a rule whose matches neither come from the vendor's
  domains nor name the vendor host fails, unless `patterns/script-negcorpus-allowlist.json` exempts it with a reason
  and a ceiling.

### Test False Positives

```bash
# Test a known Drupal site should NOT match TerminalFour
node cli.js --url "https://www1.lehigh.edu" --verbose
```

### Test True Positives

```bash
# Test a known TerminalFour site SHOULD match at 80%+
node cli.js --url "https://www.scu.edu" --verbose
```

---

## Fixing False Positive Reports

When a false positive is reported:

1. **Identify the problematic pattern** - Run with `--verbose` to see which patterns matched
2. **Check against guidelines** - Does the pattern violate any anti-patterns above?
3. **Tighten the pattern** - Make it more specific:
   - Add vendor prefix: `"banner"` → `"ellucian.*banner"`
   - Add path context: `"t4"` → `"/terminalfour/"`
   - Remove generic patterns entirely if no good alternative exists
4. **Test the fix**:
   - False positive site should no longer match
   - True positive sites should still match
5. **Update documentation** if the pattern was in examples

---

## Reference: Common False Positive Sources

| Pattern Type | Common False Matches |
|--------------|---------------------|
| Short strings | CSS hashes (`t4-abc`), version strings, IDs |
| English words | Marketing content, navigation, documentation |
| Generic classes | Bootstrap, Tailwind, custom CSS frameworks |
| Single-letter vars | Minified JavaScript, common aliases |
| Broad regex | HTML elements (`<canvas>`), unrelated products |
