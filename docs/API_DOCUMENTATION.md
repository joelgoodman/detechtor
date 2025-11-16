# deTECHtor API Documentation

**Version:** 2.0.0  
**Last Updated:** 2025-11-16

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Core API](#core-api)
4. [CLI API](#cli-api)
5. [Configuration API](#configuration-api)
6. [Utility APIs](#utility-apis)
7. [Pattern Structure](#pattern-structure)
8. [Examples](#examples)
9. [Type Definitions](#type-definitions)

---

## Overview

deTECHtor is a technology detection engine that identifies web technologies used by websites, with specialized focus on higher education systems. It uses pattern matching against HTML content, JavaScript objects, HTTP headers, cookies, and more to detect technologies with confidence scores.

### Key Features

- 🎓 Specialized higher education technology detection (SIS, LMS, CRM)
- 🔍 Multi-page scanning with strategic URL discovery
- 📊 Confidence scoring for detected technologies
- 🌐 Browser automation using Puppeteer
- 📝 Comprehensive pattern library (1000+ technologies)
- 🔌 API endpoint discovery
- 📦 Version detection for major platforms

---

## Installation

```bash
npm install @speedyu/detechtor
```

### Requirements

- Node.js >= 18.0.0
- Chrome/Chromium (automatically installed with Puppeteer)

---

## Core API

### DeTECHtor Class

The main class for technology detection operations.

#### Constructor

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const detector = new DeTECHtor();
```

**Parameters:** None

**Description:** Creates a new DeTECHtor instance and loads detection patterns from configured pattern files.

**Returns:** `DeTECHtor` instance

---

#### detectTechnologies(url)

Scans a URL and detects technologies used on the website.

**Signature:**
```javascript
async detectTechnologies(url: string): Promise<ScanResult>
```

**Parameters:**
- `url` (string, required): The URL to scan (must include protocol, e.g., `https://example.edu`)

**Returns:** Promise<[ScanResult](#scanresult)>

**Example:**
```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function scanWebsite() {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies('https://mit.edu');
    
    console.log(`Detected ${results.technologies.length} technologies`);
    console.log(`Scanned ${results.scannedPages} pages`);
    console.log(`Scan took ${results.meta.scanDuration}ms`);
    
    // Display detected technologies
    results.technologies.forEach(tech => {
      console.log(`- ${tech.name} (${tech.confidence}% confidence)`);
      console.log(`  Categories: ${tech.categories.join(', ')}`);
      if (tech.isHigherEd) {
        console.log(`  🎓 Higher Education Technology`);
      }
    });
  } catch (error) {
    console.error('Scan failed:', error.message);
  } finally {
    await detector.shutdown();
  }
}

scanWebsite();
```

**Throws:**
- `Error` - If URL is invalid or unreachable
- `Error` - If browser fails to launch
- `Error` - If scan times out (default: 30 seconds)

---

#### shutdown()

Closes browser instances and cleans up resources.

**Signature:**
```javascript
async shutdown(): Promise<void>
```

**Parameters:** None

**Returns:** Promise<void>

**Example:**
```javascript
const detector = new DeTECHtor();

try {
  const results = await detector.detectTechnologies('https://example.edu');
  // Process results...
} finally {
  // Always shutdown to free resources
  await detector.shutdown();
}
```

**Description:** This method should always be called when you're done using the detector to prevent memory leaks and ensure proper cleanup of browser instances.

---

#### initialize()

Initializes the browser instance. Called automatically by `detectTechnologies()` if not already initialized.

**Signature:**
```javascript
async initialize(): Promise<void>
```

**Parameters:** None

**Returns:** Promise<void>

**Example:**
```javascript
const detector = new DeTECHtor();

// Manually initialize if you want to control initialization timing
await detector.initialize();

// Now perform multiple scans
const results1 = await detector.detectTechnologies('https://example.edu');
const results2 = await detector.detectTechnologies('https://university.edu');

await detector.shutdown();
```

---

#### loadPatterns()

Loads technology detection patterns from configured pattern files.

**Signature:**
```javascript
loadPatterns(): Object
```

**Parameters:** None

**Returns:** Object containing all loaded patterns

**Description:** Called automatically during construction. Loads patterns from files specified in `config.patternPaths`.

**Example:**
```javascript
const detector = new DeTECHtor();
const patterns = detector.patterns;

console.log(`Loaded ${Object.keys(patterns).length} patterns`);

// Check if a specific technology is in patterns
if (patterns['Canvas LMS']) {
  console.log('Canvas LMS detection available');
  console.log('Detection methods:', Object.keys(patterns['Canvas LMS']));
}
```

---

### Pattern Matching Methods

#### matchPatterns(evidence)

Matches collected evidence against all loaded patterns.

**Signature:**
```javascript
matchPatterns(evidence: Evidence): Technology[]
```

**Parameters:**
- `evidence` ([Evidence](#evidence)): Collected evidence from page scan

**Returns:** Array of [Technology](#technology) objects

**Description:** Internal method that evaluates all patterns against evidence. Returns technologies with confidence >= `config.minConfidence`.

---

#### evaluatePattern(name, pattern, evidence)

Evaluates a single pattern against evidence.

**Signature:**
```javascript
evaluatePattern(name: string, pattern: Pattern, evidence: Evidence): Technology
```

**Parameters:**
- `name` (string): Technology name
- `pattern` ([Pattern](#pattern)): Pattern definition
- `evidence` ([Evidence](#evidence)): Collected evidence

**Returns:** [Technology](#technology) object with confidence score

**Description:** Calculates confidence score based on pattern matches. Different evidence types have different weights:
- Meta tags: 100 points
- Headers: 80 points
- JavaScript objects: 80 points
- Cookies: 70 points
- DOM elements: 70 points
- Scripts: 60 points
- HTML patterns: 40 points

---

### Evidence Collection Methods

#### collectEvidence(page, response)

Collects all evidence from a page for pattern matching.

**Signature:**
```javascript
async collectEvidence(page: Page, response: Response): Promise<Evidence>
```

**Parameters:**
- `page` (puppeteer.Page): Puppeteer page instance
- `response` (puppeteer.Response): HTTP response object

**Returns:** Promise<[Evidence](#evidence)>

**Description:** Collects comprehensive evidence including HTML content, headers, scripts, meta tags, cookies, DOM elements, JavaScript objects, and API endpoints.

---

#### extractVersionInfo(page, html)

Extracts version information for detected technologies.

**Signature:**
```javascript
async extractVersionInfo(page: Page, html: string): Promise<Object>
```

**Parameters:**
- `page` (puppeteer.Page): Puppeteer page instance
- `html` (string): Page HTML content

**Returns:** Promise<Object> with version information

**Example Return Value:**
```javascript
{
  wordpress: "6.3.1",
  drupal: "9.5",
  jquery: "3.6.0",
  bootstrap: "5.2.0"
}
```

---

#### discoverApiEndpoints(page, html, scripts)

Discovers API endpoints from page content.

**Signature:**
```javascript
async discoverApiEndpoints(page: Page, html: string, scripts: Array): Promise<string[]>
```

**Parameters:**
- `page` (puppeteer.Page): Puppeteer page instance
- `html` (string): Page HTML content
- `scripts` (Array): Array of script objects with src properties

**Returns:** Promise<string[]> of discovered API endpoints

**Example:**
```javascript
// Returns endpoints like:
[
  "/api/v1/",
  "/wp-json/",
  "/learn/api/public/",
  "/d2l/api/lp/",
  "/canvas/api/v1/"
]
```

---

### Multi-Page Scanning

#### discoverAdditionalPages(page, baseUrl)

Discovers strategic additional pages to scan.

**Signature:**
```javascript
async discoverAdditionalPages(page: Page, baseUrl: string): Promise<string[]>
```

**Parameters:**
- `page` (puppeteer.Page): Puppeteer page instance
- `baseUrl` (string): Base URL for same-domain filtering

**Returns:** Promise<string[]> of discovered URLs

**Description:** Intelligently discovers additional pages by prioritizing:
1. Strategic paths (login, portal, student, faculty, etc.)
2. Higher education indicators (course, learn, library)
3. Same-domain links (unless `config.followExternalLinks` is true)

**Example:**
```javascript
const urls = await detector.discoverAdditionalPages(page, 'https://example.edu');
// Returns: [
//   'https://example.edu/login',
//   'https://example.edu/portal',
//   'https://example.edu/students'
// ]
```

---

#### mergeTechnologies(allTechnologies)

Merges technology detections from multiple pages.

**Signature:**
```javascript
mergeTechnologies(allTechnologies: Technology[]): Technology[]
```

**Parameters:**
- `allTechnologies` (Technology[]): Array of all detected technologies

**Returns:** Technology[] with merged and deduplicated entries

**Description:** Combines detections from multiple pages by:
- Deduplicating by technology name
- Taking maximum confidence score
- Merging evidence arrays
- Combining categories
- Preserving version information

---

#### inferTechnologyStack(technologies)

Infers overall technology stack from detected technologies.

**Signature:**
```javascript
async inferTechnologyStack(technologies: Technology[]): Promise<TechnologyStack>
```

**Parameters:**
- `technologies` (Technology[]): Array of detected technologies

**Returns:** Promise<[TechnologyStack](#technologystack)>

**Example Return Value:**
```javascript
{
  components: {
    cms: "WordPress",
    lms: "Canvas LMS",
    sis: "Ellucian Banner",
    crm: "Salesforce",
    analytics: ["Google Analytics", "Google Tag Manager"],
    javascript: ["React", "jQuery"],
    server: ["Apache", "Nginx"],
    cdn: ["Cloudflare"]
  },
  inferences: [
    "Integrated SIS (Ellucian Banner) and LMS (Canvas LMS) environment",
    "Enterprise Drupal with Google Analytics integration"
  ]
}
```

---

## CLI API

### Command Line Interface

Run deTECHtor from the command line using the `detechtor` command or `node cli.js`.

#### Basic Usage

```bash
detechtor --url <URL> [options]
```

#### Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--url` | `-u` | string | required | URL to scan |
| `--output` | `-o` | string | none | Output file path (JSON format) |
| `--verbose` | `-v` | boolean | false | Verbose output with detailed information |
| `--confidence` | `-c` | number | 30 | Minimum confidence threshold (0-100) |
| `--timeout` | `-t` | number | 30 | Scan timeout in seconds |
| `--help` | | boolean | | Show help information |

#### Examples

##### Basic Scan

```bash
detechtor --url "https://mit.edu"
```

Output:
```
🔍 deTECHtor v2.0.0 - Scanning https://mit.edu

✅ Scan completed in 8450ms
📊 Found 12 technologies across 3 pages

🔧 Detected Technologies:
────────────────────────────────────────────────────────
1. Drupal 🎓
   Categories: CMS
   Confidence: 95% █████████
   Description: Open-source content management system

2. Canvas LMS 🎓
   Categories: LMS
   Confidence: 88% ████████
   Description: Canvas learning management system
   Version: 2024.10

3. Google Analytics
   Categories: Analytics
   Confidence: 100% ██████████
   Evidence:
     • Script: google-analytics.com/analytics.js
     • HTML: ga('create'

...
```

##### Verbose Output with JSON Export

```bash
detechtor --url "https://harvard.edu" \
  --verbose \
  --confidence 50 \
  --output harvard-scan.json
```

##### High-Confidence Only

```bash
detechtor --url "https://stanford.edu" --confidence 80
```

##### Extended Timeout for Slow Sites

```bash
detechtor --url "https://example.edu" --timeout 60
```

#### Exit Codes

- `0` - Success
- `1` - Scan failed or error occurred

---

## Configuration API

### Configuration Object

Located in `src/config.js`. All configuration options with descriptions and defaults.

#### Scanning Configuration

```javascript
module.exports = {
  // Scanning configuration
  timeout: 30000,              // Main page timeout (ms)
  concurrency: 3,              // Max concurrent scans
  waitUntil: 'domcontentloaded', // Puppeteer waitUntil option
  userAgent: 'SpeedyU-deTECHtor/1.0 (+https://speedyu.com/tech-scan)',
  
  // Multi-page scanning
  maxPagesToScan: 5,           // Maximum pages to crawl per site
  pageScanTimeout: 15000,      // Timeout per additional page (ms)
  followExternalLinks: false,  // Stay on same domain
  strategicPaths: [            // Priority paths to discover
    '/login', '/portal', '/student', '/faculty', '/courses',
    '/library', '/learn', '/lms', '/sis', '/blackboard', '/canvas'
  ],
  
  // Pattern configuration
  patternPaths: [              // Pattern files to load
    '../patterns/webappanalyzer-merged.json',
    '../patterns/enhanced-payment-analytics.json'
  ],
  
  // Output configuration
  verbose: false,              // Enable verbose logging
  includeEvidence: true,       // Include evidence in results
  minConfidence: 30,           // Minimum confidence threshold (0-100)
  
  // Browser configuration
  browserOptions: {
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security'
    ]
  },
  
  // Security settings
  excludePaths: [              // Paths to avoid scanning
    '/admin', '/login', '/portal',
    '/secure', '/private', '/auth',
    '/wp-admin', '/administrator'
  ],
  
  // Rate limiting
  minDelayBetweenRequests: 1000,  // Min delay between requests (ms)
  maxConcurrentScans: 3,          // Max concurrent scans
  maxScanDuration: 60000          // Max total scan duration (ms)
};
```

#### Modifying Configuration Programmatically

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const config = require('@speedyu/detechtor/src/config');

// Override configuration before creating detector
config.verbose = true;
config.minConfidence = 50;
config.timeout = 45000;
config.maxPagesToScan = 10;

const detector = new DeTECHtor();
const results = await detector.detectTechnologies('https://example.edu');
```

#### Environment Variables

- `CHROME_EXECUTABLE_PATH` - Custom path to Chrome/Chromium binary

```bash
export CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome
detechtor --url "https://example.edu"
```

---

## Utility APIs

### Category Mapping

Located in `src/category-mapping.js`. Maps category IDs to human-readable names.

#### mapCategory(categoryId)

Maps a category ID or string to a standardized category name.

**Signature:**
```javascript
mapCategory(categoryId: number | string): string
```

**Parameters:**
- `categoryId` (number | string): Category ID or name

**Returns:** string - Standardized category name

**Example:**
```javascript
const { mapCategory } = require('@speedyu/detechtor/src/category-mapping');

console.log(mapCategory(1));    // "CMS"
console.log(mapCategory(5));    // "LMS"
console.log(mapCategory(10));   // "Analytics"
console.log(mapCategory(53));   // "SIS"
console.log(mapCategory('cms')); // "cms"
```

#### Category Mapping Table

| ID | Category | Description |
|----|----------|-------------|
| 1 | CMS | Content Management Systems |
| 5 | LMS | Learning Management Systems |
| 6 | Web Server | Apache, Nginx, IIS |
| 7 | CDN | Content Delivery Networks |
| 10 | Analytics | Google Analytics, etc. |
| 52 | Chatbot | Chat and support bots |
| 53 | SIS | Student Information Systems |
| 54-56 | CRM | Customer Relationship Management |
| 107-110 | Payment Processor | Payment gateways |

---

### Script Utilities

#### Test Patterns

Test pattern loading and validation.

```bash
node scripts/test-patterns.js
```

**Programmatic Usage:**
```javascript
const { testPatternLoading } = require('./scripts/test-patterns');

testPatternLoading();
```

**Output:**
```
🔍 Testing deTECHtor Pattern Loading...

📊 Total patterns loaded: 1247
📁 Pattern files configured: ../patterns/webappanalyzer-merged.json, ...

🎓 Higher Education Systems:
   ✅ Ellucian Banner
   ✅ Ellucian Colleague
   ✅ Canvas LMS
   ...
   
📈 Higher Ed Coverage: 35/35 (100%)
```

---

#### Import WebAppAnalyzer Patterns

Import and merge patterns from WebAppAnalyzer.

```bash
npm run update-patterns
# or
node scripts/import-webappanalyzer.js
```

**Programmatic Usage:**
```javascript
const { downloadPatterns, mergeWithExistingPatterns } = 
  require('./scripts/import-webappanalyzer');

async function updatePatterns() {
  const webappPatterns = await downloadPatterns();
  const merged = await mergeWithExistingPatterns(webappPatterns);
  console.log(`Merged ${Object.keys(merged).length} patterns`);
}
```

---

#### List SIS Systems

Display all detectable Student Information Systems.

```bash
node scripts/list-sis-systems.js
```

**Output:**
```
🎓 Student Information Systems Detection Coverage

📋 **Legacy Leaders:**
   ✅ Ellucian Banner (confidence: 95%)
   ✅ Ellucian Colleague (confidence: 90%)
   ...

📋 **Enterprise Cloud:**
   ✅ Workday Student (confidence: 85%)
   ...
```

---

## Pattern Structure

### Creating Custom Patterns

Patterns define how to detect technologies. Add custom patterns to JSON files.

#### Pattern Format

```javascript
{
  "Technology Name": {
    // Required
    "description": "Technology description",
    "categories": ["CMS"],  // or "cats": [1]
    
    // Optional detection methods
    "html": [
      "pattern1",           // Regex string to match in HTML
      "pattern2"
    ],
    "scripts": [            // or "scriptSrc"
      "technology\\.js",    // Regex for script src
      "cdn\\.example\\.com"
    ],
    "headers": {
      "X-Powered-By": "Technology",  // HTTP headers
      "X-Technology": ".*"
    },
    "meta": {
      "generator": "Technology.*",   // Meta tags
      "version": "\\d+\\.\\d+"
    },
    "cookies": {
      "session_id": ".*",            // Cookie names/patterns
      "tech_cookie": null            // Cookie existence check
    },
    "js": {
      "TechnologyObject": {},        // JavaScript objects
      "window.Technology": {}
    },
    "dom": {
      "bodyClasses": "technology-*", // DOM properties
      "title": ".*Technology.*"
    },
    
    // Additional properties
    "higher_ed": true,               // Mark as higher ed tech
    "confidence": 95,                // Base confidence (optional)
    "version": "Version ([0-9.]+)",  // Version extraction regex
    "website": "https://example.com",
    "icon": "Technology.svg",
    "implies": ["jQuery", "Bootstrap"], // Implies other techs
    "excludes": ["OtherTech"]        // Mutually exclusive
  }
}
```

#### Pattern Examples

##### Example 1: CMS Detection

```json
{
  "WordPress": {
    "description": "WordPress is an open-source content management system",
    "categories": ["CMS"],
    "html": [
      "wp-content",
      "wp-includes",
      "WordPress"
    ],
    "scripts": [
      "/wp-content/",
      "/wp-includes/js/"
    ],
    "meta": {
      "generator": "WordPress ([0-9.]+)"
    },
    "headers": {
      "X-Powered-By": "WordPress"
    },
    "version": "WordPress ([0-9.]+)",
    "website": "https://wordpress.org",
    "higher_ed": false,
    "confidence": 95
  }
}
```

##### Example 2: LMS Detection

```json
{
  "Canvas LMS": {
    "description": "Canvas learning management system by Instructure",
    "categories": ["LMS"],
    "higher_ed": true,
    "html": [
      "canvas-lms",
      "instructure\\.com"
    ],
    "scripts": [
      "instructure\\.com",
      "/javascripts/canvas_"
    ],
    "headers": {
      "X-Canvas-Request-Context-Id": ".*",
      "X-Canvas-User-Id": ".*"
    },
    "js": {
      "ENV.FEATURES.canvas_parent_app": {}
    },
    "cookies": {
      "canvas_session": ".*"
    },
    "confidence": 90
  }
}
```

##### Example 3: SIS Detection

```json
{
  "Ellucian Banner": {
    "description": "Ellucian Banner student information system",
    "categories": ["SIS"],
    "higher_ed": true,
    "html": [
      "bwckgens\\.p_",
      "Banner Self-Service",
      "Ellucian Banner"
    ],
    "scripts": [
      "bwckgens",
      "banner\\.js"
    ],
    "js": {
      "Banner": {},
      "BWCK": {}
    },
    "dom": {
      "title": ".*Banner.*Self.*Service"
    },
    "confidence": 95
  }
}
```

##### Example 4: Analytics Detection

```json
{
  "Google Analytics": {
    "description": "Google Analytics web analytics service",
    "categories": ["Analytics"],
    "scripts": [
      "google-analytics\\.com/ga\\.js",
      "google-analytics\\.com/analytics\\.js",
      "googletagmanager\\.com/gtag/js"
    ],
    "html": [
      "ga\\('create'",
      "gtag\\('config'"
    ],
    "js": {
      "ga": {},
      "gtag": {}
    },
    "confidence": 100
  }
}
```

#### Pattern Best Practices

1. **Use Specific Patterns**: More specific patterns reduce false positives
2. **Multiple Detection Methods**: Use multiple evidence types for accuracy
3. **Escape Regex**: Properly escape regex special characters
4. **Test Patterns**: Use `test-patterns.js` to validate
5. **Document Well**: Include clear descriptions
6. **Set Confidence**: Higher confidence for more specific patterns
7. **Mark Higher Ed**: Flag higher education technologies with `higher_ed: true`

---

## Examples

### Example 1: Basic Website Scan

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function scanWebsite(url) {
  const detector = new DeTECHtor();
  
  try {
    console.log(`Scanning ${url}...`);
    const results = await detector.detectTechnologies(url);
    
    console.log('\nResults:');
    console.log(`- URL: ${results.url}`);
    console.log(`- Final URL: ${results.finalUrl}`);
    console.log(`- Technologies: ${results.technologies.length}`);
    console.log(`- Scan Duration: ${results.meta.scanDuration}ms`);
    
    return results;
  } finally {
    await detector.shutdown();
  }
}

scanWebsite('https://mit.edu');
```

---

### Example 2: Batch Scanning Multiple URLs

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function batchScan(urls) {
  const detector = new DeTECHtor();
  const results = [];
  
  try {
    for (const url of urls) {
      console.log(`Scanning ${url}...`);
      
      try {
        const result = await detector.detectTechnologies(url);
        results.push({
          url,
          success: true,
          data: result
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error.message
        });
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  } finally {
    await detector.shutdown();
  }
}

const universities = [
  'https://mit.edu',
  'https://harvard.edu',
  'https://stanford.edu',
  'https://berkeley.edu'
];

batchScan(universities).then(results => {
  console.log('\nBatch Scan Complete:');
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.url}: ${result.data.technologies.length} technologies`);
    } else {
      console.log(`❌ ${result.url}: ${result.error}`);
    }
  });
});
```

---

### Example 3: Filtering Higher Education Technologies

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function findHigherEdTech(url) {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies(url);
    
    // Filter for higher education technologies
    const higherEdTech = results.technologies.filter(tech => tech.isHigherEd);
    
    console.log(`\nHigher Education Technologies at ${url}:`);
    console.log(`Found ${higherEdTech.length} higher ed systems\n`);
    
    higherEdTech.forEach(tech => {
      console.log(`${tech.name}`);
      console.log(`  Categories: ${tech.categories.join(', ')}`);
      console.log(`  Confidence: ${tech.confidence}%`);
      if (tech.version) {
        console.log(`  Version: ${tech.version}`);
      }
      console.log();
    });
    
    return higherEdTech;
  } finally {
    await detector.shutdown();
  }
}

findHigherEdTech('https://mit.edu');
```

---

### Example 4: Custom Configuration

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const config = require('@speedyu/detechtor/src/config');

async function customScan(url) {
  // Customize configuration
  config.verbose = true;
  config.minConfidence = 70;        // Only high-confidence results
  config.maxPagesToScan = 10;       // Scan more pages
  config.timeout = 60000;           // 60 second timeout
  config.includeEvidence = true;    // Include evidence details
  
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies(url);
    return results;
  } finally {
    await detector.shutdown();
  }
}

customScan('https://example.edu');
```

---

### Example 5: Technology Stack Analysis

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function analyzeStack(url) {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies(url);
    const stack = results.inferredStack;
    
    console.log(`\nTechnology Stack for ${url}:\n`);
    
    if (stack.components.cms) {
      console.log(`📝 CMS: ${stack.components.cms}`);
    }
    if (stack.components.lms) {
      console.log(`🎓 LMS: ${stack.components.lms}`);
    }
    if (stack.components.sis) {
      console.log(`📊 SIS: ${stack.components.sis}`);
    }
    if (stack.components.crm) {
      console.log(`👥 CRM: ${stack.components.crm}`);
    }
    
    if (stack.components.analytics.length > 0) {
      console.log(`📈 Analytics: ${stack.components.analytics.join(', ')}`);
    }
    
    if (stack.components.javascript.length > 0) {
      console.log(`⚡ JavaScript: ${stack.components.javascript.join(', ')}`);
    }
    
    if (stack.components.server.length > 0) {
      console.log(`🖥️  Server: ${stack.components.server.join(', ')}`);
    }
    
    if (stack.components.cdn.length > 0) {
      console.log(`🌐 CDN: ${stack.components.cdn.join(', ')}`);
    }
    
    if (stack.inferences.length > 0) {
      console.log(`\n💡 Inferences:`);
      stack.inferences.forEach(inference => {
        console.log(`   - ${inference}`);
      });
    }
    
    return stack;
  } finally {
    await detector.shutdown();
  }
}

analyzeStack('https://mit.edu');
```

---

### Example 6: Export to JSON

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const fs = require('fs-extra');

async function scanAndExport(url, outputFile) {
  const detector = new DeTECHtor();
  
  try {
    console.log(`Scanning ${url}...`);
    const results = await detector.detectTechnologies(url);
    
    // Save to JSON file
    await fs.writeJson(outputFile, results, { spaces: 2 });
    console.log(`\nResults exported to ${outputFile}`);
    
    return results;
  } finally {
    await detector.shutdown();
  }
}

scanAndExport('https://harvard.edu', 'harvard-tech-scan.json');
```

---

### Example 7: Compare Multiple Websites

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function compareWebsites(urls) {
  const detector = new DeTECHtor();
  const comparison = {};
  
  try {
    for (const url of urls) {
      const results = await detector.detectTechnologies(url);
      comparison[url] = {
        totalTech: results.technologies.length,
        higherEdTech: results.technologies.filter(t => t.isHigherEd).length,
        cms: results.inferredStack.components.cms,
        lms: results.inferredStack.components.lms,
        sis: results.inferredStack.components.sis,
        topTechnologies: results.technologies
          .slice(0, 5)
          .map(t => ({ name: t.name, confidence: t.confidence }))
      };
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\nWebsite Technology Comparison:\n');
    console.table(comparison);
    
    return comparison;
  } finally {
    await detector.shutdown();
  }
}

compareWebsites([
  'https://mit.edu',
  'https://harvard.edu',
  'https://stanford.edu'
]);
```

---

### Example 8: Error Handling

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function robustScan(url) {
  const detector = new DeTECHtor();
  
  try {
    const results = await detector.detectTechnologies(url);
    return { success: true, data: results };
  } catch (error) {
    // Handle different error types
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      return {
        success: false,
        error: 'Domain not found',
        suggestion: 'Check if the URL is correct and accessible'
      };
    } else if (error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Scan timeout',
        suggestion: 'Try increasing the timeout or check website availability'
      };
    } else if (error.message.includes('Failed to launch browser')) {
      return {
        success: false,
        error: 'Browser launch failed',
        suggestion: 'Ensure Chromium is installed: npm install'
      };
    } else {
      return {
        success: false,
        error: error.message,
        suggestion: 'Check the error details and try again'
      };
    }
  } finally {
    await detector.shutdown();
  }
}

robustScan('https://example.edu').then(result => {
  if (result.success) {
    console.log('Scan successful!');
    console.log(`Found ${result.data.technologies.length} technologies`);
  } else {
    console.error(`Scan failed: ${result.error}`);
    console.log(`Suggestion: ${result.suggestion}`);
  }
});
```

---

## Type Definitions

### ScanResult

Complete scan result object returned by `detectTechnologies()`.

```typescript
interface ScanResult {
  url: string;                      // Original URL
  finalUrl: string;                 // Final URL after redirects
  timestamp: number;                // Unix timestamp
  technologies: Technology[];       // Detected technologies
  scannedPages: number;            // Number of pages scanned
  scannedUrls: string[];           // URLs that were scanned
  apiEndpoints?: string[];         // Discovered API endpoints
  inferredStack: TechnologyStack;  // Inferred technology stack
  meta: {
    responseCode: number;          // HTTP response code
    scanDuration: number;          // Scan duration in ms
    userAgent: string;             // User agent used
    detechtor_version: string;     // deTECHtor version
  };
}
```

---

### Technology

Individual technology detection result.

```typescript
interface Technology {
  name: string;                    // Technology name
  confidence: number;              // Confidence score (0-100)
  categories: string[];            // Categories (CMS, LMS, etc.)
  evidence: string[];              // Evidence for detection
  version?: string;                // Detected version
  isHigherEd: boolean;            // Is higher education technology
  description: string;             // Technology description
}
```

---

### TechnologyStack

Inferred technology stack from detected technologies.

```typescript
interface TechnologyStack {
  components: {
    cms: string | null;            // CMS name
    lms: string | null;            // LMS name
    sis: string | null;            // SIS name
    crm: string | null;            // CRM name
    analytics: string[];           // Analytics tools
    javascript: string[];          // JavaScript frameworks
    server: string[];              // Web servers
    cdn: string[];                 // CDN providers
  };
  inferences: string[];            // Stack inferences/observations
}
```

---

### Evidence

Evidence collected from a page scan.

```typescript
interface Evidence {
  html: string;                    // Full HTML content
  headers: Record<string, string>; // HTTP headers
  scripts: ScriptInfo[];           // Script sources
  meta: Record<string, string>;    // Meta tags
  cookies: Cookie[];               // Cookies
  dom: DOMInfo;                    // DOM information
  apiEndpoints: string[];          // API endpoints
  versionInfo: Record<string, string>; // Version information
}
```

---

### Pattern

Pattern definition for technology detection.

```typescript
interface Pattern {
  description: string;             // Technology description
  categories?: string[];           // Category names
  cats?: number[];                 // Category IDs
  html?: string[];                 // HTML regex patterns
  scripts?: string[];              // Script src regex patterns
  scriptSrc?: string[];            // Alternative script src field
  headers?: Record<string, string>; // Header patterns
  meta?: Record<string, string>;   // Meta tag patterns
  cookies?: Record<string, string>; // Cookie patterns
  js?: Record<string, any>;        // JavaScript object patterns
  dom?: Record<string, string>;    // DOM element patterns
  higher_ed?: boolean;             // Is higher ed technology
  confidence?: number;             // Base confidence score
  version?: string;                // Version extraction regex
  website?: string;                // Official website
  implies?: string[];              // Implied technologies
  excludes?: string[];             // Mutually exclusive techs
}
```

---

## Advanced Usage

### Custom Pattern Loading

```javascript
const DeTECHtor = require('@speedyu/detechtor');
const config = require('@speedyu/detechtor/src/config');
const path = require('path');

// Add custom pattern file
config.patternPaths.push(
  path.join(__dirname, 'my-custom-patterns.json')
);

const detector = new DeTECHtor();
// Now includes patterns from custom file
```

---

### Rate Limiting for Production

```javascript
const DeTECHtor = require('@speedyu/detechtor');

class RateLimitedScanner {
  constructor(requestsPerMinute = 10) {
    this.detector = new DeTECHtor();
    this.minDelay = 60000 / requestsPerMinute;
    this.lastScan = 0;
  }
  
  async scan(url) {
    const now = Date.now();
    const timeSinceLastScan = now - this.lastScan;
    
    if (timeSinceLastScan < this.minDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minDelay - timeSinceLastScan)
      );
    }
    
    this.lastScan = Date.now();
    return await this.detector.detectTechnologies(url);
  }
  
  async shutdown() {
    await this.detector.shutdown();
  }
}

// Usage
const scanner = new RateLimitedScanner(10); // 10 requests per minute

async function scan() {
  try {
    const result = await scanner.scan('https://example.edu');
    console.log(result);
  } finally {
    await scanner.shutdown();
  }
}
```

---

## Support and Contributing

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/speedyu/detechtor/issues)
- **Documentation**: [README](../README.md)
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md)

### Reporting Bugs

When reporting bugs, include:
1. deTECHtor version
2. Node.js version
3. URL being scanned (if public)
4. Error message and stack trace
5. Expected vs actual behavior

### Contributing Patterns

To contribute new technology patterns:
1. Add pattern to appropriate pattern file
2. Test with `npm test`
3. Verify detection accuracy
4. Submit pull request with examples

---

## License

MIT License - See [LICENSE](../LICENSE) file for details.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.

---

**Last Updated:** 2025-11-16  
**Version:** 2.0.0  
**Maintained by:** SpeedyU Development Team
