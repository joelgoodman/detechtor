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
- `webappanalyzer-merged.json` - Base patterns from WebappAnalyzer
- `enhanced-payment-analytics.json` - Payment processors, analytics, video platforms
- `higher-ed-patterns.json` - Higher-ed specific patterns (main file)
- `higher-ed-exhaustive-*.json` - Comprehensive patterns by category (SIS, LMS, infrastructure, etc.)

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

1. Add patterns to `patterns/higher-ed-patterns.json` for higher-ed tech
2. Use appropriate category from existing patterns
3. Set `higher_ed: true` for university-specific systems
4. Include multiple detection methods (html, scripts, headers) for reliability
5. Run `npm test` to validate patterns

## Environment Variables

- `CHROME_EXECUTABLE_PATH` - Path to Chrome/Chromium binary (default: `/usr/bin/chromium`)
