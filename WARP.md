# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

deTECHtor is SpeedyU's technology detection engine specialized for higher education web technologies. It uses Puppeteer to scan websites and identify technologies like CMS, LMS, SIS, CRM systems through pattern matching against HTML, scripts, headers, cookies, and DOM elements.

## Common Commands

### Development & Testing
```bash
# Install dependencies
npm install

# Run pattern validation tests
npm test

# Test a single URL scan
node cli.js --url "https://example.edu" --verbose

# Scan with custom confidence threshold
node cli.js --url "https://example.edu" --confidence 50 --output results.json
```

### Pattern Management
```bash
# Update patterns from WebAppAnalyzer upstream
npm run update-patterns

# Generate pattern report showing coverage
npm run patterns-report

# Test pattern loading (custom script)
node scripts/test-patterns.js

# List SIS systems in patterns
node scripts/list-sis-systems.js
```

### Running the CLI
```bash
# Basic scan with alias
npm run scan -- --url "https://example.edu"

# Direct CLI invocation (after npm install -g)
detechtor --url "https://example.edu" --verbose --confidence 30
```

## Architecture

### Core Components

**DeTECHtor Class** (`src/detechtor.js`)
- Main detection engine with singleton browser instance
- Multi-page scanning capability (discovers and scans strategic pages)
- Pattern matching engine supporting multiple evidence types
- Always call `shutdown()` after scanning to close browser

**Pattern System** (`patterns/`)
- `webappanalyzer-merged.json`: Comprehensive patterns (2700+ technologies)
- `enhanced-payment-analytics.json`: Payment, analytics, video platforms
- `fediverse-social-patterns.json`: Corrected categorizations for Fediverse/ActivityPub platforms
- Custom higher-ed patterns override upstream WebAppAnalyzer patterns
- Pattern structure supports: HTML regex, script sources, headers, cookies, meta tags, JS objects, DOM elements

**Configuration** (`src/config.js`)
- Browser config with anti-detection measures (stealth mode)
- Pattern loading paths
- Strategic paths for multi-page discovery
- Security settings (excludePaths for admin/login pages)
- `CHROME_EXECUTABLE_PATH` environment variable for custom Chrome path

**Category Mapping** (`src/category-mapping.js`)
- Maps WebAppAnalyzer numeric category IDs to semantic names
- Handles both numeric (WebAppAnalyzer) and string (custom) categories
- Categories: CMS, LMS, SIS, CRM, Analytics, JavaScript Framework, Web Server, CDN, Message Boards, Social Network, Fediverse, etc.
- Note: Category ID 2 maps to "Message Boards" (not CMS) to properly categorize forums and social platforms

### Detection Flow

1. **Initialize Browser**: Puppeteer launches with stealth settings (no webdriver detection)
2. **Scan Main Page**: Collect evidence (HTML, scripts, headers, cookies, DOM, JS objects)
3. **Discover Additional Pages**: Extract strategic URLs from hrefs (login, portal, student, etc.)
4. **Multi-Page Scan**: Scan up to `maxPagesToScan` strategic pages (default: 5)
5. **Pattern Matching**: Each pattern scores confidence based on evidence matches
6. **Merge Results**: Deduplicate and combine detections across pages
7. **Infer Stack**: Identify primary technologies (CMS, LMS, SIS, CRM) and stack relationships
8. **Return Results**: JSON output with technologies, confidence, evidence, versions

### Evidence Collection

The scanner collects multiple evidence types:
- **HTML Content**: Full page source for regex pattern matching
- **Script Sources**: All `<script src>` tags with version extraction
- **HTTP Headers**: Response headers (e.g., X-Powered-By, X-Canvas-Request-Context-Id)
- **Meta Tags**: Generator tags, framework identifiers
- **Cookies**: Cookie names/values for technology fingerprinting
- **DOM Elements**: Presence checks (Drupal.settings, WordPress classes, etc.)
- **JS Objects**: Window-level objects (Banner, Blackboard, D2L, Canvas, etc.)
- **API Endpoints**: Discovered from JS code and HTML
- **Version Info**: Extracted from generator tags, script versions, JS globals

### Pattern Matching Confidence Scoring

- Meta tag match: +100
- Header match: +80
- JS object match: +80
- DOM element match: +70
- Cookie match: +70
- Script source match: +60
- HTML regex match: +40
- JS object in HTML fallback: +30
- Final confidence capped at 100

### Multi-Page Strategic Scanning

The scanner intelligently discovers additional pages to increase detection accuracy:
- Prioritizes strategic paths: `/login`, `/portal`, `/student`, `/faculty`, `/courses`, `/library`, `/lms`, `/sis`
- Stays on same domain by default (`followExternalLinks: false`)
- Scans up to `maxPagesToScan` pages (configurable)
- Uses shorter timeout for additional pages (`pageScanTimeout: 15s`)
- Skips excluded paths (`/admin`, `/wp-admin`, `/secure`)

## Key Implementation Details

### Browser Stealth Mode

The scanner implements multiple anti-detection techniques in `scanSinglePage()`:
- Custom user agent
- Overrides `navigator.webdriver` to false
- Injects fake `window.chrome` object
- Masks permissions API
- Fake plugins array
- Sets realistic viewport (1920x1080)
- 500ms delay to appear human

### Pattern File Format

Patterns support WebAppAnalyzer format with extensions:
```json
{
  "Technology Name": {
    "description": "Technology description",
    "categories": ["CMS"],
    "cats": [1],
    "html": ["regex1", "regex2"],
    "scripts": ["script-pattern.js"],
    "headers": { "X-Powered-By": "TechName" },
    "meta": { "generator": "TechName.*" },
    "cookies": { "tech_session": "" },
    "js": { "TechName": "" },
    "higher_ed": true,
    "website": "https://example.com"
  }
}
```

### Version Detection

Version extraction attempts multiple strategies:
1. Meta generator tags (`<meta name="generator" content="WordPress 6.2">`)
2. Script source query params (`?ver=1.2.3`)
3. JS global version properties (`jQuery.fn.jquery`)
4. HTML content regex patterns
5. Collected in `versionInfo` object during evidence gathering

### Higher Education Focus

The system specializes in detecting:
- **SIS**: Banner, Colleague, PeopleSoft, Jenzabar, Campus Management
- **LMS**: Canvas, Blackboard, Moodle, D2L Brightspace, Sakai
- **CRM**: Slate, Salesforce for Higher Ed
- **CMS**: OmniCMS, TerminalFour, Modern Campus
- **Auth**: Shibboleth, CAS
- **Video**: Kaltura, Panopto, YuJa
- **Library**: Alma, Primo (Ex Libris)
- **Payments**: TouchNet, Transact, CBORD
- **Events**: 25Live, EMS, Localist

Patterns marked with `higher_ed: true` get flagged in results with 🎓 emoji.

## Code Patterns to Follow

### Always Clean Up Browser Resources
```javascript
const detector = new DeTECHtor();
try {
  const results = await detector.detectTechnologies(url);
  // process results
} finally {
  await detector.shutdown(); // IMPORTANT: Always call this
}
```

### Programmatic Usage
```javascript
const DeTECHtor = require('./src/detechtor');
const detector = new DeTECHtor();

// Override config if needed
const config = require('./src/config');
config.verbose = true;
config.maxPagesToScan = 10;

const results = await detector.detectTechnologies('https://example.edu');
await detector.shutdown();
```

### Adding Custom Patterns

Add to `patterns/higher-ed-patterns.json` or create new pattern file:
```json
{
  "MyTech": {
    "categories": ["CMS"],
    "description": "Description here",
    "html": ["unique-identifier"],
    "scripts": ["mytech\\.js"],
    "higher_ed": true
  }
}
```

Then reference in `src/config.js` under `patternPaths`.

### Category Mapping

Use the mapping helper for consistent categorization:
```javascript
const { mapCategory } = require('./src/category-mapping');
const category = mapCategory(1); // Returns "CMS"
const category2 = mapCategory("Web Server"); // Returns "web server" (lowercased)
```

## Important Notes

- **Browser Path**: Set `CHROME_EXECUTABLE_PATH` env var if Chrome/Chromium not at default path
- **Node Version**: Requires Node.js >= 18.0.0
- **Pattern Updates**: Run `npm run update-patterns` to sync from WebAppAnalyzer upstream
- **Confidence Threshold**: Default is 30%, adjust with `--confidence` flag or config
- **Security**: Scanner automatically skips admin/login paths defined in `excludePaths`
- **Rate Limiting**: Built-in delays between requests (`minDelayBetweenRequests: 1000ms`)
- **Timeout Handling**: Main page has 30s timeout, additional pages have 15s timeout
- **Error Handling**: Individual page scan failures don't crash entire detection job

## TypeScript Support

Full TypeScript definitions available in `index.d.ts` covering:
- `DeTECHtor` class and all methods
- `ScanResult`, `Technology`, `TechnologyStack` interfaces
- `Pattern`, `Evidence`, `Config` types
- Import with: `import DeTECHtor from '@speedyu/detechtor';`
