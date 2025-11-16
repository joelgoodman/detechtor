# deTECHtor Quick Reference Guide

Fast reference for common operations and API usage.

## Installation

```bash
npm install @speedyu/detechtor
```

## Quick Start

### JavaScript/Node.js

```javascript
const DeTECHtor = require('@speedyu/detechtor');

const detector = new DeTECHtor();
const results = await detector.detectTechnologies('https://example.edu');
await detector.shutdown();
```

### Command Line

```bash
detechtor --url "https://example.edu"
```

---

## Common Operations

### 1. Basic Scan

```javascript
const DeTECHtor = require('@speedyu/detechtor');

async function scan(url) {
  const detector = new DeTECHtor();
  try {
    return await detector.detectTechnologies(url);
  } finally {
    await detector.shutdown();
  }
}
```

### 2. Custom Configuration

```javascript
const config = require('@speedyu/detechtor/src/config');

config.verbose = true;
config.minConfidence = 70;
config.timeout = 60000;

const detector = new DeTECHtor();
```

### 3. Filter Results

```javascript
const results = await detector.detectTechnologies(url);

// Get high-confidence technologies
const highConfidence = results.technologies.filter(t => t.confidence >= 80);

// Get higher education technologies
const higherEd = results.technologies.filter(t => t.isHigherEd);

// Get specific category
const cms = results.technologies.filter(t => t.categories.includes('CMS'));
```

### 4. Access Technology Stack

```javascript
const results = await detector.detectTechnologies(url);
const stack = results.inferredStack;

console.log(stack.components.cms);  // "WordPress"
console.log(stack.components.lms);  // "Canvas LMS"
console.log(stack.components.sis);  // "Ellucian Banner"
```

### 5. Export to JSON

```javascript
const fs = require('fs-extra');

const results = await detector.detectTechnologies(url);
await fs.writeJson('results.json', results, { spaces: 2 });
```

### 6. Batch Scanning

```javascript
const urls = ['https://mit.edu', 'https://harvard.edu'];
const detector = new DeTECHtor();

try {
  for (const url of urls) {
    const results = await detector.detectTechnologies(url);
    console.log(`${url}: ${results.technologies.length} technologies`);
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }
} finally {
  await detector.shutdown();
}
```

---

## CLI Quick Reference

### Basic Commands

```bash
# Basic scan
detechtor --url "https://example.edu"

# With JSON output
detechtor --url "https://example.edu" --output results.json

# Verbose mode
detechtor --url "https://example.edu" --verbose

# Custom confidence threshold
detechtor --url "https://example.edu" --confidence 70

# Extended timeout
detechtor --url "https://example.edu" --timeout 60
```

### Combined Options

```bash
detechtor --url "https://example.edu" \
  --verbose \
  --confidence 50 \
  --timeout 60 \
  --output results.json
```

---

## Configuration Options

### Quick Config Override

```javascript
const config = require('@speedyu/detechtor/src/config');

// Essential options
config.verbose = true;              // Enable logging
config.minConfidence = 50;          // Min confidence (0-100)
config.timeout = 45000;             // Timeout (ms)
config.maxPagesToScan = 10;         // Max pages to scan
config.includeEvidence = true;      // Include evidence
```

### All Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 30000 | Main page timeout (ms) |
| `minConfidence` | number | 30 | Min confidence threshold (0-100) |
| `maxPagesToScan` | number | 5 | Max pages to scan per site |
| `pageScanTimeout` | number | 15000 | Additional page timeout (ms) |
| `verbose` | boolean | false | Enable verbose logging |
| `includeEvidence` | boolean | true | Include evidence in results |
| `followExternalLinks` | boolean | false | Follow external links |

---

## Result Object Structure

```javascript
{
  url: "https://example.edu",
  finalUrl: "https://www.example.edu",
  timestamp: 1699887600000,
  technologies: [
    {
      name: "WordPress",
      confidence: 95,
      categories: ["CMS"],
      evidence: ["HTML: wp-content", "Script: wp-includes"],
      version: "6.3.1",
      isHigherEd: false,
      description: "Open-source content management system"
    }
  ],
  scannedPages: 3,
  scannedUrls: ["url1", "url2", "url3"],
  inferredStack: {
    components: {
      cms: "WordPress",
      lms: "Canvas LMS",
      sis: null,
      crm: null,
      analytics: ["Google Analytics"],
      javascript: ["jQuery", "React"],
      server: ["Apache"],
      cdn: ["Cloudflare"]
    },
    inferences: []
  },
  meta: {
    responseCode: 200,
    scanDuration: 8450,
    userAgent: "SpeedyU-deTECHtor/1.0",
    detechtor_version: "2.0.0"
  }
}
```

---

## Pattern Matching

### Pattern Structure

```json
{
  "Technology Name": {
    "description": "Technology description",
    "categories": ["CMS"],
    "html": ["pattern1", "pattern2"],
    "scripts": ["script\\.js"],
    "headers": { "X-Powered-By": "Tech" },
    "meta": { "generator": "Tech.*" },
    "cookies": { "session": ".*" },
    "js": { "GlobalObject": {} },
    "higher_ed": true,
    "confidence": 95
  }
}
```

### Detection Methods

| Method | Weight | Example |
|--------|--------|---------|
| Meta tags | 100 | `<meta name="generator" content="WordPress">` |
| Headers | 80 | `X-Powered-By: PHP/8.0` |
| JS objects | 80 | `window.jQuery` |
| Cookies | 70 | `wordpress_session` |
| DOM | 70 | Body classes, IDs |
| Scripts | 60 | Script src URLs |
| HTML | 40 | HTML content patterns |

---

## Common Categories

| Category | Description | Examples |
|----------|-------------|----------|
| CMS | Content Management | WordPress, Drupal |
| LMS | Learning Management | Canvas, Blackboard |
| SIS | Student Information | Banner, Colleague |
| CRM | Customer Relationship | Salesforce, Slate |
| Analytics | Web Analytics | Google Analytics |
| JavaScript Framework | JS Libraries | React, jQuery |
| Web Server | Server Software | Apache, Nginx |
| CDN | Content Delivery | Cloudflare, Akamai |

---

## Error Handling

### Common Errors

```javascript
try {
  const results = await detector.detectTechnologies(url);
} catch (error) {
  if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
    console.error('Domain not found');
  } else if (error.message.includes('timeout')) {
    console.error('Scan timeout - increase timeout setting');
  } else if (error.message.includes('Failed to launch browser')) {
    console.error('Browser error - run: npm install');
  } else {
    console.error('Scan failed:', error.message);
  }
}
```

### Always Cleanup

```javascript
const detector = new DeTECHtor();

try {
  const results = await detector.detectTechnologies(url);
  // Process results...
} finally {
  await detector.shutdown(); // Always call shutdown
}
```

---

## Utility Scripts

### Test Patterns

```bash
node scripts/test-patterns.js
```

### Update Patterns

```bash
npm run update-patterns
```

### List SIS Systems

```bash
node scripts/list-sis-systems.js
```

### View Pattern Report

```bash
npm run patterns-report
```

---

## Advanced Usage

### Rate Limiting

```javascript
class RateLimitedScanner {
  constructor(requestsPerMinute = 10) {
    this.detector = new DeTECHtor();
    this.delay = 60000 / requestsPerMinute;
  }
  
  async scan(url) {
    const result = await this.detector.detectTechnologies(url);
    await new Promise(r => setTimeout(r, this.delay));
    return result;
  }
  
  async shutdown() {
    await this.detector.shutdown();
  }
}
```

### Custom Patterns

```javascript
// Add to patterns/my-patterns.json
{
  "My Technology": {
    "description": "Custom technology",
    "categories": ["CMS"],
    "html": ["my-tech-pattern"],
    "confidence": 90
  }
}

// Load in config
const config = require('@speedyu/detechtor/src/config');
config.patternPaths.push('../patterns/my-patterns.json');
```

### Filter by Category

```javascript
const results = await detector.detectTechnologies(url);

const cms = results.technologies.filter(t => 
  t.categories.includes('CMS')
);

const lms = results.technologies.filter(t => 
  t.categories.includes('LMS')
);

const higherEd = results.technologies.filter(t => 
  t.isHigherEd
);
```

---

## Performance Tips

1. **Reuse Detector Instance**: Don't create new detector for each scan
2. **Rate Limit**: Add delays between scans (2000ms recommended)
3. **Adjust Pages**: Reduce `maxPagesToScan` for faster scans
4. **Timeout**: Decrease `timeout` for quick scans
5. **Confidence**: Increase `minConfidence` to reduce false positives

```javascript
// Good: Reuse detector
const detector = new DeTECHtor();
for (const url of urls) {
  await detector.detectTechnologies(url);
  await new Promise(r => setTimeout(r, 2000));
}
await detector.shutdown();

// Bad: Create detector each time
for (const url of urls) {
  const detector = new DeTECHtor();
  await detector.detectTechnologies(url);
  await detector.shutdown();
}
```

---

## Environment Variables

```bash
# Custom Chrome path
export CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome

# Run scan
detechtor --url "https://example.edu"
```

---

## Debugging

### Enable Verbose Mode

```javascript
const config = require('@speedyu/detechtor/src/config');
config.verbose = true;
```

### Check Loaded Patterns

```javascript
const detector = new DeTECHtor();
console.log(`Loaded ${Object.keys(detector.patterns).length} patterns`);
console.log('Available:', Object.keys(detector.patterns).slice(0, 10));
```

### Inspect Evidence

```javascript
// Evidence is collected but not exposed in API
// Use verbose mode to see detection process
config.verbose = true;
config.includeEvidence = true; // Include evidence in results
```

---

## Common Use Cases

### 1. University Technology Audit

```javascript
const universities = ['mit.edu', 'harvard.edu', 'stanford.edu'];
const detector = new DeTECHtor();

for (const domain of universities) {
  const url = `https://${domain}`;
  const results = await detector.detectTechnologies(url);
  
  console.log(`\n${domain}:`);
  console.log(`  CMS: ${results.inferredStack.components.cms || 'None'}`);
  console.log(`  LMS: ${results.inferredStack.components.lms || 'None'}`);
  console.log(`  SIS: ${results.inferredStack.components.sis || 'None'}`);
  
  await new Promise(r => setTimeout(r, 3000));
}

await detector.shutdown();
```

### 2. Security Assessment

```javascript
const results = await detector.detectTechnologies(url);

// Check for outdated technologies
results.technologies.forEach(tech => {
  if (tech.version) {
    console.log(`${tech.name} version ${tech.version}`);
    // Compare against known vulnerabilities
  }
});
```

### 3. Competitor Analysis

```javascript
const competitors = [
  'https://competitor1.edu',
  'https://competitor2.edu'
];

const detector = new DeTECHtor();
const comparison = {};

for (const url of competitors) {
  const results = await detector.detectTechnologies(url);
  comparison[url] = {
    cms: results.inferredStack.components.cms,
    lms: results.inferredStack.components.lms,
    totalTech: results.technologies.length
  };
}

console.table(comparison);
await detector.shutdown();
```

---

## Troubleshooting

### Problem: Browser Won't Launch

```bash
# Install dependencies
npm install

# Try custom Chrome path
export CHROME_EXECUTABLE_PATH=/usr/bin/chromium
```

### Problem: Scan Timeout

```javascript
const config = require('@speedyu/detechtor/src/config');
config.timeout = 60000; // Increase to 60 seconds
```

### Problem: Missing Detection

```javascript
// Check if pattern exists
const detector = new DeTECHtor();
if (detector.patterns['Technology Name']) {
  console.log('Pattern loaded');
} else {
  console.log('Pattern missing - check pattern files');
}
```

### Problem: Too Many False Positives

```javascript
const config = require('@speedyu/detechtor/src/config');
config.minConfidence = 70; // Increase threshold
```

---

## Best Practices

1. ✅ **Always** call `shutdown()` when done
2. ✅ **Reuse** detector instance for multiple scans
3. ✅ **Rate limit** when scanning multiple sites
4. ✅ **Handle errors** gracefully
5. ✅ **Validate URLs** before scanning
6. ✅ **Set timeouts** appropriately for site speed
7. ✅ **Filter results** by confidence for accuracy
8. ✅ **Use verbose mode** for debugging

---

## Links

- [Full API Documentation](./API_DOCUMENTATION.md)
- [README](../README.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)
- [GitHub Repository](https://github.com/speedyu/detechtor)

---

**Version:** 2.0.0  
**Last Updated:** 2025-11-16
