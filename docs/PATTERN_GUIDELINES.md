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

### 5. Overly Broad Wildcards

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
- [ ] **No overly broad regex** (`.*word.*` without anchors)
- [ ] **At least one Tier A or Tier B pattern** for reliable detection
- [ ] **Tested against false positive sites** (sites that don't use the technology)
- [ ] **Tested against true positive sites** (sites that do use the technology)

---

## Testing Patterns

### Run Pattern Audit

```bash
npm run test:audit
```

This checks all patterns for:
- Patterns < 4 characters
- Common English words
- Single-letter JS objects
- Overly broad regex
- Duplicates across files

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
