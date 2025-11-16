# deTECHtor Documentation Index

Complete documentation for deTECHtor - the open-source technology detection engine.

## 📚 Documentation Overview

This directory contains comprehensive documentation for developers, integrators, and contributors.

---

## Quick Navigation

### For New Users

1. **[Main README](../README.md)** - Start here for installation and quick start
2. **[Quick Reference](./QUICK_REFERENCE.md)** - Fast lookup for common operations
3. **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference

### For Developers

1. **[Integration Guide](./INTEGRATION_GUIDE.md)** - Integrate deTECHtor into your app
2. **[API Documentation](./API_DOCUMENTATION.md)** - Full API reference with examples
3. **[Quick Reference](./QUICK_REFERENCE.md)** - Code snippets and common patterns

### For Contributors

1. **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
2. **[Changelog](./CHANGELOG.md)** - Version history and changes
3. **[Migration Guide](./MIGRATION_COMPLETE.md)** - Migration information

---

## 📖 Documentation Files

### Core Documentation

#### [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
**Complete API reference with detailed examples**

- DeTECHtor Class API
- Configuration options
- CLI interface documentation
- Pattern structure
- Comprehensive examples
- Type definitions
- Error handling

**Read this if you need:**
- Detailed API method signatures
- Complete configuration options
- Pattern creation guidelines
- Type definitions and interfaces

---

#### [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
**Fast lookup guide for common operations**

- Quick start examples
- Common operations
- CLI commands
- Configuration shortcuts
- Result object structure
- Troubleshooting tips
- Best practices

**Read this if you need:**
- Quick code snippets
- Common use cases
- Fast answers to "How do I...?"
- Command line examples
- Performance tips

---

#### [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
**Integration examples and production deployment**

- Express.js integration
- REST API example
- React integration
- Scheduled scanning
- Database integration
- Docker deployment
- Performance optimization
- Security considerations

**Read this if you need:**
- To integrate deTECHtor into your app
- Production deployment examples
- Database storage patterns
- API server examples
- Caching and queuing strategies

---

### Project Documentation

#### [CONTRIBUTING.md](./CONTRIBUTING.md)
**Contribution guidelines**

- How to contribute
- Code standards
- Testing requirements
- Pull request process

---

#### [CHANGELOG.md](./CHANGELOG.md)
**Version history and changes**

- Release notes
- Breaking changes
- New features
- Bug fixes

---

### Technical Documentation

#### [HIGHER_ED_TECHNOLOGY_DETECTION.md](./HIGHER_ED_TECHNOLOGY_DETECTION.md)
**Higher education technology detection**

- SIS detection coverage
- LMS detection
- CRM systems
- Specialized platforms

---

#### [EXHAUSTIVE_HIGHER_ED_COVERAGE.md](./EXHAUSTIVE_HIGHER_ED_COVERAGE.md)
**Comprehensive higher education platform coverage**

- Detailed system coverage
- Detection patterns
- Market segments

---

#### [MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md)
**Migration information**

- Version migration guides
- Breaking changes
- Upgrade instructions

---

## 🚀 Quick Start Guides

### I want to...

#### ...scan a website from the command line
```bash
detechtor --url "https://example.edu"
```
See: [Quick Reference - CLI Commands](./QUICK_REFERENCE.md#cli-quick-reference)

---

#### ...scan a website programmatically
```javascript
const DeTECHtor = require('@speedyu/detechtor');

const detector = new DeTECHtor();
const results = await detector.detectTechnologies('https://example.edu');
await detector.shutdown();
```
See: [Quick Reference - Basic Scan](./QUICK_REFERENCE.md#1-basic-scan)

---

#### ...integrate into my Express.js app
See: [Integration Guide - Express.js](./INTEGRATION_GUIDE.md#expressjs-integration)

---

#### ...create a REST API
See: [Integration Guide - REST API](./INTEGRATION_GUIDE.md#rest-api-example)

---

#### ...customize configuration
```javascript
const config = require('@speedyu/detechtor/src/config');
config.verbose = true;
config.minConfidence = 70;
```
See: [API Documentation - Configuration](./API_DOCUMENTATION.md#configuration-api)

---

#### ...add custom detection patterns
See: [API Documentation - Pattern Structure](./API_DOCUMENTATION.md#pattern-structure)

---

#### ...deploy to production
See: [Integration Guide - Production Deployment](./INTEGRATION_GUIDE.md#production-deployment)

---

#### ...handle errors properly
See: [Quick Reference - Error Handling](./QUICK_REFERENCE.md#error-handling)

---

## 📊 Documentation by Topic

### Getting Started
- [Installation](../README.md#installation)
- [Quick Start](../README.md#quick-start)
- [Basic Usage](./QUICK_REFERENCE.md#quick-start)

### API Reference
- [DeTECHtor Class](./API_DOCUMENTATION.md#detechtor-class)
- [Configuration Options](./API_DOCUMENTATION.md#configuration-api)
- [CLI Options](./API_DOCUMENTATION.md#cli-api)
- [Type Definitions](./API_DOCUMENTATION.md#type-definitions)

### Integration
- [Express.js](./INTEGRATION_GUIDE.md#expressjs-integration)
- [REST API](./INTEGRATION_GUIDE.md#rest-api-example)
- [React](./INTEGRATION_GUIDE.md#react-integration)
- [Database Integration](./INTEGRATION_GUIDE.md#database-integration)

### Advanced Topics
- [Scheduled Scanning](./INTEGRATION_GUIDE.md#scheduled-scanning)
- [Performance Optimization](./INTEGRATION_GUIDE.md#performance-optimization)
- [Security](./INTEGRATION_GUIDE.md#security-considerations)
- [Docker Deployment](./INTEGRATION_GUIDE.md#production-deployment)

### Pattern Development
- [Pattern Structure](./API_DOCUMENTATION.md#pattern-structure)
- [Creating Patterns](./API_DOCUMENTATION.md#creating-custom-patterns)
- [Pattern Examples](./API_DOCUMENTATION.md#pattern-examples)
- [Testing Patterns](../README.md#pattern-validation)

### Higher Education
- [SIS Detection](./HIGHER_ED_TECHNOLOGY_DETECTION.md)
- [LMS Detection](./HIGHER_ED_TECHNOLOGY_DETECTION.md)
- [Comprehensive Coverage](./EXHAUSTIVE_HIGHER_ED_COVERAGE.md)

---

## 🔍 Common Questions

### How do I...?

#### ...increase scan timeout?
```javascript
const config = require('@speedyu/detechtor/src/config');
config.timeout = 60000; // 60 seconds
```
[See: Configuration API](./API_DOCUMENTATION.md#configuration-api)

#### ...filter results by confidence?
```javascript
const highConfidence = results.technologies.filter(t => t.confidence >= 80);
```
[See: Quick Reference - Filter Results](./QUICK_REFERENCE.md#3-filter-results)

#### ...get only higher education technologies?
```javascript
const higherEd = results.technologies.filter(t => t.isHigherEd);
```
[See: API Examples](./API_DOCUMENTATION.md#example-3-filtering-higher-education-technologies)

#### ...scan multiple websites?
[See: Quick Reference - Batch Scanning](./QUICK_REFERENCE.md#6-batch-scanning)

#### ...cache results?
[See: Integration Guide - Caching Strategy](./INTEGRATION_GUIDE.md#caching-strategy)

#### ...deploy with Docker?
[See: Integration Guide - Docker Configuration](./INTEGRATION_GUIDE.md#docker-configuration)

---

## 📝 Code Examples

### Quick Examples

```javascript
// Basic scan
const detector = new DeTECHtor();
const results = await detector.detectTechnologies('https://example.edu');
await detector.shutdown();

// Custom configuration
const config = require('@speedyu/detechtor/src/config');
config.minConfidence = 70;
config.verbose = true;

// Filter results
const cms = results.technologies.filter(t => t.categories.includes('CMS'));
const lms = results.technologies.filter(t => t.categories.includes('LMS'));

// Access technology stack
console.log(results.inferredStack.components.cms); // "WordPress"
```

For more examples, see:
- [API Documentation - Examples](./API_DOCUMENTATION.md#examples)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Integration Guide](./INTEGRATION_GUIDE.md)

---

## 🛠️ Utilities and Scripts

### Available Scripts

#### Test Patterns
```bash
node scripts/test-patterns.js
```
Validates that all patterns are loaded correctly.

#### Update Patterns
```bash
npm run update-patterns
```
Imports latest patterns from WebAppAnalyzer.

#### List SIS Systems
```bash
node scripts/list-sis-systems.js
```
Shows all detectable Student Information Systems.

#### Pattern Report
```bash
npm run patterns-report
```
Displays pattern import statistics.

[See: Utility APIs](./API_DOCUMENTATION.md#utility-apis)

---

## 🐛 Troubleshooting

Common issues and solutions:

### Browser Won't Launch
```bash
npm install  # Reinstall dependencies
export CHROME_EXECUTABLE_PATH=/usr/bin/chromium
```

### Scan Timeout
```javascript
config.timeout = 60000; // Increase timeout
```

### Missing Detections
- Check if pattern exists: `detector.patterns['Technology Name']`
- Enable verbose mode: `config.verbose = true`
- Lower confidence threshold: `config.minConfidence = 30`

### False Positives
- Increase confidence threshold: `config.minConfidence = 70`
- Review pattern accuracy
- Check evidence: `config.includeEvidence = true`

[See: Quick Reference - Troubleshooting](./QUICK_REFERENCE.md#troubleshooting)

---

## 📞 Support

### Getting Help

- **Documentation Issues**: Review this documentation index
- **Bug Reports**: [GitHub Issues](https://github.com/speedyu/detechtor/issues)
- **Questions**: Check [Quick Reference](./QUICK_REFERENCE.md) first
- **Contributing**: See [Contributing Guide](./CONTRIBUTING.md)

### Before Asking for Help

1. Check the [Quick Reference](./QUICK_REFERENCE.md)
2. Review the [API Documentation](./API_DOCUMENTATION.md)
3. Search existing [GitHub Issues](https://github.com/speedyu/detechtor/issues)
4. Try verbose mode: `config.verbose = true`

---

## 🗺️ Documentation Roadmap

### Current Version: 2.0.0

#### Completed ✅
- Complete API reference
- Quick reference guide
- Integration guide with examples
- Pattern documentation
- Configuration reference
- CLI documentation

#### Planned 📋
- Video tutorials
- Interactive examples
- Pattern contribution workflow
- Advanced debugging guide
- Performance tuning guide
- Multi-language documentation

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details.

---

## 🤝 Contributing to Documentation

Documentation improvements are always welcome!

- Fix typos or unclear explanations
- Add more examples
- Improve code snippets
- Add missing information
- Translate documentation

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

**Last Updated:** 2025-11-16  
**Version:** 2.0.0  
**Maintained by:** SpeedyU Development Team

---

## Quick Links

- [Main README](../README.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Integration Guide](./INTEGRATION_GUIDE.md)
- [GitHub Repository](https://github.com/speedyu/detechtor)
