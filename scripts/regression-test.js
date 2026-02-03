#!/usr/bin/env node

/**
 * Regression Test Script
 *
 * Tests patterns against known sites to verify:
 * - True positives: Technologies should be detected on known sites
 * - False positives: Technologies should NOT be detected where they don't exist
 *
 * Usage: npm run test:regression
 *
 * Note: This script requires network access and may take several minutes to run.
 * For CI environments, consider caching or mocking responses.
 */

const fs = require('fs');
const path = require('path');

// Load DeTECHtor
const DeTECHtor = require('../src/detechtor');

// Load test fixtures
const fixturesPath = path.join(__dirname, '..', 'tests', 'fixtures', 'known-sites.json');

class RegressionTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    this.detector = null;
  }

  async loadFixtures() {
    try {
      const content = fs.readFileSync(fixturesPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error loading fixtures: ${error.message}`);
      process.exit(1);
    }
  }

  async runFalsePositiveTests(tests) {
    console.log('\n=== False Positive Tests ===\n');

    for (const test of tests) {
      console.log(`Testing: ${test.url}`);
      console.log(`  Description: ${test.description}`);

      try {
        const results = await this.detector.detectTechnologies(test.url);
        const detected = results.technologies.map(t => t.name);

        // Check must_not_match
        let passed = true;
        for (const forbidden of test.must_not_match || []) {
          if (detected.includes(forbidden)) {
            console.log(`  FAIL: Incorrectly detected "${forbidden}"`);
            this.results.errors.push({
              type: 'false_positive',
              url: test.url,
              technology: forbidden,
              message: `Should not detect ${forbidden} on ${test.url}`
            });
            passed = false;
          }
        }

        // Check expected technologies are present
        for (const expected of test.expected || []) {
          if (!detected.includes(expected)) {
            console.log(`  WARN: Did not detect expected "${expected}"`);
          }
        }

        if (passed) {
          console.log(`  PASS`);
          this.results.passed++;
        } else {
          this.results.failed++;
        }

      } catch (error) {
        console.log(`  ERROR: ${error.message}`);
        this.results.skipped++;
      }

      console.log('');
    }
  }

  async runTruePositiveTests(tests) {
    console.log('\n=== True Positive Tests ===\n');

    for (const test of tests) {
      console.log(`Testing: ${test.url}`);
      console.log(`  Description: ${test.description}`);

      try {
        const results = await this.detector.detectTechnologies(test.url);
        const detected = results.technologies;

        let passed = true;
        for (const expected of test.expected || []) {
          const match = detected.find(t => t.name === expected);

          if (!match) {
            console.log(`  FAIL: Did not detect "${expected}"`);
            this.results.errors.push({
              type: 'true_positive_missing',
              url: test.url,
              technology: expected,
              message: `Should detect ${expected} on ${test.url}`
            });
            passed = false;
          } else if (test.min_confidence && match.confidence < test.min_confidence) {
            console.log(`  FAIL: "${expected}" confidence ${match.confidence}% < required ${test.min_confidence}%`);
            this.results.errors.push({
              type: 'low_confidence',
              url: test.url,
              technology: expected,
              confidence: match.confidence,
              required: test.min_confidence,
              message: `${expected} detected with insufficient confidence`
            });
            passed = false;
          } else {
            console.log(`  Found "${expected}" at ${match.confidence}% confidence`);
          }
        }

        if (passed) {
          console.log(`  PASS`);
          this.results.passed++;
        } else {
          this.results.failed++;
        }

      } catch (error) {
        console.log(`  ERROR: ${error.message}`);
        this.results.skipped++;
      }

      console.log('');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('REGRESSION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Passed:  ${this.results.passed}`);
    console.log(`  Failed:  ${this.results.failed}`);
    console.log(`  Skipped: ${this.results.skipped}`);
    console.log('');

    if (this.results.errors.length > 0) {
      console.log('Errors:');
      for (const error of this.results.errors) {
        console.log(`  - [${error.type}] ${error.message}`);
      }
      console.log('');
    }

    if (this.results.failed > 0) {
      console.log('REGRESSION TESTS FAILED');
      return 1;
    }

    console.log('ALL REGRESSION TESTS PASSED');
    return 0;
  }

  async run() {
    console.log('deTECHtor Pattern Regression Tests');
    console.log('='.repeat(60));

    const fixtures = await this.loadFixtures();

    // Initialize detector
    console.log('\nInitializing DeTECHtor...');
    this.detector = new DeTECHtor({
      verbose: false,
      timeout: 30000
    });

    try {
      // Run false positive tests
      if (fixtures.false_positive_tests && fixtures.false_positive_tests.length > 0) {
        await this.runFalsePositiveTests(fixtures.false_positive_tests);
      }

      // Run true positive tests
      if (fixtures.true_positive_tests && fixtures.true_positive_tests.length > 0) {
        await this.runTruePositiveTests(fixtures.true_positive_tests);
      }

    } finally {
      // Clean up
      if (this.detector) {
        await this.detector.close();
      }
    }

    return this.printSummary();
  }
}

// Check for --dry-run flag
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('Dry run mode - loading fixtures only');
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  console.log(`False positive tests: ${fixtures.false_positive_tests?.length || 0}`);
  console.log(`True positive tests: ${fixtures.true_positive_tests?.length || 0}`);
  process.exit(0);
}

// Run tests
const tester = new RegressionTester();
tester.run()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
