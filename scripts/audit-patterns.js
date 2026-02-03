#!/usr/bin/env node

/**
 * Pattern Audit Script
 *
 * Checks all pattern files for common issues that cause false positives:
 * - Patterns shorter than 4 characters
 * - Common English words
 * - Single-letter JS object names
 * - Overly broad regex patterns
 * - Duplicate patterns across files
 */

const fs = require('fs');
const path = require('path');

// Common English words that should not be used as standalone patterns
const COMMON_WORDS = new Set([
  'banner', 'navigate', 'colleague', 'cascade', 'starfish', 'canvas',
  'react', 'angular', 'ultra', 'modern', 'campus', 'student', 'portal',
  'login', 'home', 'page', 'site', 'web', 'app', 'system', 'platform',
  'service', 'server', 'client', 'user', 'data', 'info', 'content',
  'form', 'button', 'link', 'menu', 'header', 'footer', 'main', 'body',
  'class', 'style', 'script', 'image', 'text', 'title', 'name', 'type',
  'value', 'event', 'action', 'function', 'object', 'array', 'string',
  'number', 'boolean', 'null', 'undefined', 'true', 'false', 'success',
  'error', 'message', 'alert', 'warning', 'notification', 'status',
  'bootstrap', 'jquery', 'vue', 'moodle', 'sakai', 'alma', 'primo'
]);

// Single-letter or very short variable names to flag
const SHORT_JS_NAMES = new Set(['s', 'ga', '$', '_', 'a', 'b', 'c', 'd', 'e', 'i', 'j', 'k', 'n', 'o', 'p', 'q', 'r', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'PS', 'bb', 'd2l', 'cas', 'ems']);

// Patterns that are too broad
const BROAD_PATTERNS = [
  /^\.\*[a-z]+\.\*$/i,  // .*word.*
  /^class="?\.\*/,       // class=".*
  /^\\\$\\\(/,           // \$\(
];

class PatternAuditor {
  constructor() {
    this.issues = [];
    this.patternsByTech = new Map(); // For duplicate detection
  }

  loadPatternFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error loading ${filePath}: ${error.message}`);
      return null;
    }
  }

  checkShortPattern(pattern, tech, file, field) {
    // Skip if pattern has special regex chars that make it more specific
    if (/[\\.*+?^${}()|[\]]/.test(pattern) && pattern.length > 6) {
      return;
    }

    // Check raw length (without regex escapes)
    const rawPattern = pattern.replace(/\\\\/g, '\\').replace(/\\\./g, '.');
    if (rawPattern.length < 4) {
      this.issues.push({
        severity: 'ERROR',
        tech,
        file: path.basename(file),
        field,
        pattern,
        message: `Pattern too short (${rawPattern.length} chars): "${pattern}"`
      });
    }
  }

  checkCommonWord(pattern, tech, file, field) {
    // Extract the core word from the pattern
    const words = pattern.toLowerCase()
      .replace(/[\\.*+?^${}()|[\]]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    for (const word of words) {
      if (COMMON_WORDS.has(word) && pattern === word) {
        this.issues.push({
          severity: 'ERROR',
          tech,
          file: path.basename(file),
          field,
          pattern,
          message: `Standalone common word: "${word}" - use more specific pattern`
        });
      }
    }
  }

  checkBroadRegex(pattern, tech, file, field) {
    for (const broad of BROAD_PATTERNS) {
      if (broad.test(pattern)) {
        this.issues.push({
          severity: 'WARNING',
          tech,
          file: path.basename(file),
          field,
          pattern,
          message: `Overly broad regex pattern: "${pattern}"`
        });
        break;
      }
    }
  }

  checkJsObjectName(name, tech, file) {
    if (SHORT_JS_NAMES.has(name)) {
      this.issues.push({
        severity: 'ERROR',
        tech,
        file: path.basename(file),
        field: 'js',
        pattern: name,
        message: `Short/common JS object name: "${name}" - too likely to cause false positives`
      });
    }
  }

  checkDuplicates(pattern, tech, file, field) {
    const key = `${field}:${pattern}`;
    if (!this.patternsByTech.has(key)) {
      this.patternsByTech.set(key, []);
    }
    this.patternsByTech.get(key).push({ tech, file: path.basename(file) });
  }

  auditTechnology(tech, config, file) {
    // Check HTML patterns
    const htmlPatterns = config.html || [];
    for (const pattern of htmlPatterns) {
      this.checkShortPattern(pattern, tech, file, 'html');
      this.checkCommonWord(pattern, tech, file, 'html');
      this.checkBroadRegex(pattern, tech, file, 'html');
      this.checkDuplicates(pattern, tech, file, 'html');
    }

    // Check script patterns
    const scriptPatterns = config.scripts || config.scriptSrc || [];
    for (const pattern of scriptPatterns) {
      this.checkShortPattern(pattern, tech, file, 'scripts');
      this.checkCommonWord(pattern, tech, file, 'scripts');
      this.checkBroadRegex(pattern, tech, file, 'scripts');
      this.checkDuplicates(pattern, tech, file, 'scripts');
    }

    // Check JS object names
    const jsObjects = config.js || {};
    for (const name of Object.keys(jsObjects)) {
      this.checkJsObjectName(name, tech, file);
      this.checkDuplicates(name, tech, file, 'js');
    }
  }

  auditFile(filePath) {
    const patterns = this.loadPatternFile(filePath);
    if (!patterns) return;

    for (const [tech, config] of Object.entries(patterns)) {
      // Skip metadata entries
      if (tech.startsWith('_')) continue;

      this.auditTechnology(tech, config, filePath);
    }
  }

  findDuplicates() {
    for (const [key, locations] of this.patternsByTech) {
      if (locations.length > 1) {
        const [field, pattern] = key.split(':');
        const techs = locations.map(l => `${l.tech} (${l.file})`).join(', ');
        this.issues.push({
          severity: 'INFO',
          tech: 'Multiple',
          file: 'various',
          field,
          pattern,
          message: `Duplicate pattern found in: ${techs}`
        });
      }
    }
  }

  printReport() {
    const errors = this.issues.filter(i => i.severity === 'ERROR');
    const warnings = this.issues.filter(i => i.severity === 'WARNING');
    const infos = this.issues.filter(i => i.severity === 'INFO');

    console.log('\n=== Pattern Audit Report ===\n');

    if (errors.length > 0) {
      console.log(`ERRORS (${errors.length}):`);
      console.log('-'.repeat(60));
      for (const issue of errors) {
        console.log(`  [${issue.tech}] ${issue.field}: ${issue.message}`);
        console.log(`    File: ${issue.file}`);
      }
      console.log('');
    }

    if (warnings.length > 0) {
      console.log(`WARNINGS (${warnings.length}):`);
      console.log('-'.repeat(60));
      for (const issue of warnings) {
        console.log(`  [${issue.tech}] ${issue.field}: ${issue.message}`);
        console.log(`    File: ${issue.file}`);
      }
      console.log('');
    }

    if (infos.length > 0) {
      console.log(`INFO (${infos.length}):`);
      console.log('-'.repeat(60));
      for (const issue of infos) {
        console.log(`  ${issue.field}: ${issue.message}`);
      }
      console.log('');
    }

    console.log('='.repeat(60));
    console.log(`Summary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`);

    if (errors.length > 0) {
      console.log('\nAudit FAILED - please fix errors before committing.');
      return 1;
    }

    console.log('\nAudit PASSED');
    return 0;
  }

  run() {
    const patternsDir = path.join(__dirname, '..', 'patterns');

    // Pattern files to audit (in priority order)
    const patternFiles = [
      'higher-ed-patterns.json',
      'higher-ed-comprehensive.json',
      'enhanced-payment-analytics.json',
      'higher-ed-exhaustive-core.json',
      'higher-ed-exhaustive-sis-additional.json',
      'higher-ed-exhaustive-lms-additional.json',
      'higher-ed-exhaustive-business.json',
      'higher-ed-exhaustive-specialized.json',
      'higher-ed-exhaustive-infrastructure.json',
      'higher-ed-exhaustive-media.json'
    ];

    console.log('Auditing pattern files...\n');

    for (const file of patternFiles) {
      const filePath = path.join(patternsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`  Checking ${file}...`);
        this.auditFile(filePath);
      } else {
        console.log(`  Skipping ${file} (not found)`);
      }
    }

    this.findDuplicates();
    return this.printReport();
  }
}

// Run audit
const auditor = new PatternAuditor();
const exitCode = auditor.run();
process.exit(exitCode);
