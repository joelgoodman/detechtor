# deTECHtor

SpeedyU's open-source technology detection engine for identifying web technologies, with specialized focus on higher education systems.

## Overview

deTECHtor automatically identifies web technologies used by institutional websites, with a special focus on higher education systems like:

- **SIS**: Banner, Colleague, PeopleSoft, Jenzabar
- **LMS**: Canvas, Blackboard, Moodle, D2L Brightspace
- **CRM**: Slate, Salesforce, HubSpot
- **CMS**: Drupal, WordPress, OmniCMS, TerminalFour
- **Analytics**: Google Analytics, Google Tag Manager

## Installation

```bash
npm install
```

## Quick Start

### Command Line Usage

```bash
# Basic scan
node cli.js --url "https://mit.edu"

# Verbose output with custom confidence threshold
node cli.js --url "https://harvard.edu" --verbose --confidence 50

# Save results to file
node cli.js --url "https://stanford.edu" --output results.json
```

### Programmatic Usage

```javascript
const DeTECHtor = require('./src/detechtor');

async function scan() {
  const detector = new DeTECHtor();
  const results = await detector.detectTechnologies('https://mit.edu');

  console.log(`Found ${results.technologies.length} technologies`);
  console.log(JSON.stringify(results, null, 2));

  await detector.shutdown();
}

scan();
```

## Configuration

Edit `config.js` to customize:

- `timeout`: Scan timeout in milliseconds (default: 30000)
- `minConfidence`: Minimum confidence threshold 0-100 (default: 30)
- `maxPagesToScan`: Maximum number of pages to scan (default: 5)
- `userAgent`: Browser user agent string
- `verbose`: Enable verbose logging

## Output Format

```json
{
  "url": "https://example.edu",
  "finalUrl": "https://www.example.edu",
  "technologies": [
    {
      "name": "Drupal",
      "confidence": 95,
      "categories": ["CMS"],
      "evidence": ["HTML: Drupal.settings", "Script: misc/drupal.js"],
      "isHigherEd": false,
      "description": "Open-source content management system"
    },
    {
      "name": "Canvas LMS",
      "confidence": 88,
      "categories": ["LMS"],
      "evidence": ["Header: X-Canvas-Request-Context-Id"],
      "isHigherEd": true,
      "description": "Canvas learning management system"
    }
  ],
  "meta": {
    "scanDuration": 8450,
    "responseCode": 200,
    "detechtor_version": "1.0.0",
    "scannedPages": 3
  },
  "timestamp": "2024-10-15T14:30:00.000Z"
}
```

## Pattern Management

### Higher Education Patterns

deTECHtor includes specialized patterns for university-specific technologies in `patterns/higher-ed-*.json`:

- **Student Information Systems**: Banner, Colleague, Campus Management
- **Learning Management**: Canvas, Blackboard, Moodle, Sakai
- **CRM Systems**: Slate, Salesforce for Higher Ed
- **CMS Platforms**: OmniCMS, TerminalFour, Modern Campus

### Adding Custom Patterns

Add custom patterns to `patterns/higher-ed-patterns.json`:

```json
{
  "My University CMS": {
    "categories": ["CMS"],
    "html": ["my-university-cms", "data-mycms"],
    "scripts": ["mycms\\.js"],
    "higher_ed": true,
    "description": "Custom university CMS"
  }
}
```

### Updating Patterns from WebappAnalyzer

```bash
npm run update-patterns
```

This imports patterns from the webappanalyzer library and merges them with custom higher-ed patterns.

## API Reference

### `DeTECHtor` Class

#### Constructor
```javascript
const detector = new DeTECHtor();
```

#### Methods

##### `async detectTechnologies(url)`
Scans a URL and returns detected technologies.

**Parameters:**
- `url` (string): URL to scan

**Returns:**
- Promise resolving to results object (see Output Format above)

##### `async shutdown()`
Closes browser instances and cleans up resources.

**Example:**
```javascript
await detector.shutdown();
```

## Development

### Running Tests

```bash
npm test
```

### Pattern Validation

```bash
node scripts/test-patterns.js
```

### Pattern Report

```bash
npm run patterns-report
```

## Requirements

- Node.js >= 18.0.0
- Chrome/Chromium (for Puppeteer)

## License

MIT

## Contributing

1. Add new technology patterns to `patterns/higher-ed-patterns.json`
2. Report detection issues with evidence
3. Submit performance improvements
4. Update documentation

## Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Version**: 1.0.0
**Maintainer**: SpeedyU Development Team

