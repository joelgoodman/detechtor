# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

deTECHtor is a Node.js technology detection engine that identifies web technologies on websites, with **specialized patterns for higher education systems** (LMS, SIS, CRM, CMS). It uses Puppeteer for headless browser scanning and pattern matching against HTML, headers, scripts, cookies, and JavaScript objects.

This powers the **technology stack analysis** feature of SpeedyU, enabling competitive intelligence like:
- "Which universities use Canvas vs Blackboard?"
- "What CMS is gaining market share in higher ed?"
- "Track when a competitor switches their tech stack"

## Ecosystem Context

This is part of the SpeedyU competitive intelligence platform:

| Repository | Language | Purpose |
|------------|----------|---------|
| **detechtor** (this repo) | Node.js | Technology detection - identifies tech stacks |
| **benchmark-agent** (`~/LLM/benchmark-agent`) | Ruby | Data collection - orchestrates Lighthouse/AXE/deTECHtor |
| **speedyu-benchmark** (`~/LLM/speedyu-benchmark`) | Python | Intelligence platform - peer benchmarking, reports |

The benchmark-agent calls deTECHtor via CLI during each site scan.

## Common Commands

```bash
# Install dependencies
npm install

# Scan a URL
node cli.js --url "https://mit.edu" --verbose

# Scan with custom confidence threshold
node cli.js --url "https://harvard.edu" --confidence 50 --output results.json

# Run pattern tests
npm test

# Update patterns from WebappAnalyzer
npm run update-patterns

# View pattern import report
npm run patterns-report
```

## Architecture

### Core Files
- `cli.js` - Command-line interface with yargs
- `src/detechtor.js` - Main DeTECHtor class with browser management and scanning logic
- `src/config.js` - Configuration (timeouts, paths, browser options, strategic paths)
- `src/category-mapping.js` - Maps numeric WebappAnalyzer categories to strings

### Pattern Files (in `patterns/`)

Loaded in order by `src/config.js` — later files override earlier ones on name collisions, so higher-ed files take precedence over the WebAppAnalyzer base.

- `webappanalyzer-merged.json` - Base: ~6,400 patterns imported from WebAppAnalyzer
- `general-analytics-extensions.json` - GA4, Adobe Analytics, and other general patterns not in the base
- `fediverse-social-patterns.json` - Fediverse / social networking overrides
- `higher-ed-cms.json` - Higher-ed CMSes (TerminalFour, Cascade, Modern Campus CMS, Ingeniux, Finalsite, etc.)
- `higher-ed-lms.json` - LMSes + assessment / proctoring / courseware (Canvas, Blackboard, Moodle, D2L Brightspace, Turnitin, Respondus, Pearson, etc.)
- `higher-ed-sis.json` - Student info / ERP / financial aid / admissions / curriculum (Banner, Colleague, PeopleSoft, Workday Student, Anthology Student, Slate, DegreeWorks, etc.)
- `higher-ed-infra.json` - Auth, library, CRM/advancement, events, payments, video, search, safety, BI, research

Rebrands are tracked on each canonical tech via a `_legacy_names` field (e.g., `Modern Campus CMS` lists `"OmniCMS"` as a legacy name and retains the old `omniupdate` / `omni-cms` detection patterns).

Deprecated pattern files are preserved under `patterns/_archive/` for reference only and are NOT loaded at runtime.

### Detection Flow
1. `detectTechnologies(url)` launches Puppeteer browser
2. `scanSinglePage()` navigates to URL with stealth settings (hides webdriver detection)
3. `collectEvidence()` gathers HTML, headers, scripts, meta tags, cookies, DOM elements, JS objects
4. `discoverAdditionalPages()` finds strategic paths (/login, /portal, /student, etc.)
5. `matchPatterns()` evaluates all patterns against evidence
6. `mergeTechnologies()` deduplicates results across pages

### Evidence Collection
The scanner collects:
- HTML content
- Response headers
- Script sources (with version detection)
- Meta tags
- Cookies
- DOM elements and classes
- JavaScript global objects (Banner, Blackboard, Canvas, D2L, Moodle, etc.)
- API endpoints

### Pattern Format
```json
{
  "Technology Name": {
    "categories": ["CMS"],
    "html": ["regex-pattern"],
    "scripts": ["script-pattern\\.js"],
    "headers": { "X-Header": "pattern" },
    "meta": { "generator": "pattern" },
    "js": { "GlobalObject": "" },
    "cookies": { "cookie_name": "pattern" },
    "higher_ed": true,
    "description": "Description text"
  }
}
```

## Configuration

Key settings in `src/config.js`:
- `timeout` - Page load timeout (default: 30000ms)
- `maxPagesToScan` - Pages to crawl per site (default: 5)
- `minConfidence` - Minimum confidence to report (default: 30)
- `strategicPaths` - Priority paths to discover (/login, /portal, /student, /canvas, etc.)
- `browserOptions` - Puppeteer launch options including Chrome path

## Adding New Patterns

1. Add patterns to the appropriate higher-ed file by domain:
   - CMS → `patterns/higher-ed-cms.json`
   - LMS / assessment / courseware → `patterns/higher-ed-lms.json`
   - Student info / ERP / financial aid / admissions / curriculum → `patterns/higher-ed-sis.json`
   - Auth / library / CRM / events / payments / video / etc. → `patterns/higher-ed-infra.json`
2. Use an appropriate category from existing patterns
3. Set `higher_ed: true` for university-specific systems
4. For rebranded products, use the canonical (current) name as the key and list prior names in `_legacy_names: ["Old Name"]`; keep detection patterns for both old and new identifiers
5. Include multiple detection methods (html, scripts, headers, js) for reliability
6. Run `npm test` to validate patterns
7. Run `npm run test:audit` to check for pattern quality issues

## Pattern Quality Rules

**See full guidelines at:** `docs/PATTERN_GUIDELINES.md`

### Quick Reference - Patterns to AVOID

| Anti-Pattern | Example | Why Bad |
|--------------|---------|---------|
| Single English words | `"colleague"`, `"banner"` | Matches natural text |
| Short strings (<4 chars) | `"t4"`, `"PS"`, `"bb"` | Matches hashes, IDs |
| Generic CSS classes | `class=".*btn-"` | Matches Bootstrap everywhere |
| Single-letter JS objects | `"s"`, `"ga"` | Too common in minified code |
| Broad wildcards | `".*canvas.*"` | Matches unrelated content |

### Pattern Quality Tiers

| Tier | Confidence | Examples |
|------|------------|----------|
| A (80-100) | Unique identifiers | `X-Canvas-User-Id` header, `generator="WordPress"` |
| B (40-60) | Product-specific paths | `/terminalfour/`, `instructure.com` |
| C (10-30) | Generic (needs corroboration) | Product names in content |

### Testing Commands

```bash
# Check patterns for quality issues
npm run test:audit

# Run regression tests against known sites
npm run test:regression

# Dry run - just show what would be tested
npm run test:regression:dry
```

## Environment Variables

- `CHROME_EXECUTABLE_PATH` - Path to Chrome/Chromium binary (default: `/usr/bin/chromium`)
