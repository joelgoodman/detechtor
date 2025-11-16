#!/usr/bin/env node

const DeTECHtor = require('./src/detechtor');
const yargs = require('yargs');
const fs = require('fs-extra');

const argv = yargs
  .option('url', {
    alias: 'u',
    describe: 'URL to scan',
    demandOption: true,
    type: 'string'
  })
  .option('output', {
    alias: 'o',
    describe: 'Output file path (JSON format)',
    type: 'string'
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Verbose output',
    type: 'boolean',
    default: false
  })
  .option('confidence', {
    alias: 'c',
    describe: 'Minimum confidence threshold (0-100)',
    type: 'number',
    default: 30
  })
  .option('timeout', {
    alias: 't',
    describe: 'Scan timeout in seconds',
    type: 'number',
    default: 30
  })
  .help()
  .example('$0 --url https://mit.edu', 'Scan MIT website for technologies')
  .example('$0 --url https://harvard.edu --output results.json --verbose', 'Scan Harvard with verbose output and save to file')
  .argv;

async function main() {
  const detector = new DeTECHtor();

  // Override config with CLI options
  const config = require('./src/config');
  config.verbose = argv.verbose;
  config.minConfidence = argv.confidence;
  config.timeout = argv.timeout * 1000; // Convert to milliseconds

  let results;
  let success = false;

  try {
    console.log(`\n🔍 deTECHtor v2.0.0 - Scanning ${argv.url}\n`);

    if (argv.verbose) {
      console.log('Configuration:');
      console.log(`  Timeout: ${config.timeout}ms`);
      console.log(`  Min Confidence: ${config.minConfidence}%`);
      console.log(`  User Agent: ${config.userAgent}\n`);
    }

    results = await detector.detectTechnologies(argv.url);
    success = true;

    // Display results
    console.log(`✅ Scan completed in ${results.meta.scanDuration}ms`);
    console.log(`📊 Found ${results.technologies.length} technologies across ${results.scannedPages} pages\n`);

    if (results.technologies.length > 0) {
      console.log('🔧 Detected Technologies:');
      console.log('─'.repeat(60));

      results.technologies.forEach((tech, index) => {
        const confidenceBar = '█'.repeat(Math.floor(tech.confidence / 10));
        const isHigherEd = tech.isHigherEd ? ' 🎓' : '';

        console.log(`${index + 1}. ${tech.name}${isHigherEd}`);
        console.log(`   Categories: ${tech.categories.join(', ')}`);
        console.log(`   Confidence: ${tech.confidence}% ${confidenceBar}`);

        if (tech.description) {
          console.log(`   Description: ${tech.description}`);
        }

        if (tech.version) {
          console.log(`   Version: ${tech.version}`);
        }

        if (argv.verbose && tech.evidence.length > 0) {
          console.log(`   Evidence:`);
          tech.evidence.slice(0, 3).forEach(evidence => {
            console.log(`     • ${evidence}`);
          });
          if (tech.evidence.length > 3) {
            console.log(`     • ... and ${tech.evidence.length - 3} more`);
          }
        }

        console.log('');
      });

      // Show scanned pages
      if (results.scannedPages > 1 && argv.verbose) {
        console.log('📄 Scanned Pages:');
        console.log('─'.repeat(30));
        results.scannedUrls.forEach((url, index) => {
          console.log(`  ${index + 1}. ${url}`);
        });
        console.log('');
      }

      // Show API endpoints if discovered
      if (results.apiEndpoints && results.apiEndpoints.length > 0 && argv.verbose) {
        console.log('🔌 Discovered API Endpoints:');
        console.log('─'.repeat(35));
        results.apiEndpoints.slice(0, 10).forEach(endpoint => {
          console.log(`  • ${endpoint}`);
        });
        if (results.apiEndpoints.length > 10) {
          console.log(`  • ... and ${results.apiEndpoints.length - 10} more`);
        }
        console.log('');
      }

      // Technology stack inference
      if (results.inferredStack && argv.verbose) {
        console.log('🏗️  Technology Stack Analysis:');
        console.log('─'.repeat(40));

        const stack = results.inferredStack.components;
        if (stack.cms) console.log(`  CMS: ${stack.cms}`);
        if (stack.lms) console.log(`  LMS: ${stack.lms}`);
        if (stack.sis) console.log(`  SIS: ${stack.sis}`);
        if (stack.crm) console.log(`  CRM: ${stack.crm}`);
        if (stack.analytics.length > 0) console.log(`  Analytics: ${stack.analytics.join(', ')}`);
        if (stack.javascript.length > 0) console.log(`  JavaScript: ${stack.javascript.join(', ')}`);
        if (stack.server.length > 0) console.log(`  Server: ${stack.server.join(', ')}`);
        if (stack.cdn.length > 0) console.log(`  CDN: ${stack.cdn.join(', ')}`);

        if (results.inferredStack.inferences.length > 0) {
          console.log('\n  📈 Stack Inferences:');
          results.inferredStack.inferences.forEach(inference => {
            console.log(`    • ${inference}`);
          });
        }
        console.log('');
      }

      // Category summary
      const categories = {};
      results.technologies.forEach(tech => {
        tech.categories.forEach(category => {
          if (!categories[category]) categories[category] = 0;
          categories[category]++;
        });
      });

      console.log('📈 Technology Categories:');
      console.log('─'.repeat(30));
      Object.entries(categories)
        .sort(([,a], [,b]) => b - a)
        .forEach(([category, count]) => {
          console.log(`  ${category}: ${count}`);
        });

      // Higher-ed specific summary
      const higherEdTech = results.technologies.filter(tech => tech.isHigherEd);
      if (higherEdTech.length > 0) {
        console.log('\n🎓 Higher Education Technologies:');
        console.log('─'.repeat(40));
        higherEdTech.forEach(tech => {
          console.log(`  • ${tech.name} (${tech.confidence}%)`);
        });
      }

    } else {
      console.log('⚠️  No technologies detected above confidence threshold');
    }

    if (argv.verbose) {
      console.log('\n📋 Scan Metadata:');
      console.log(`  Final URL: ${results.finalUrl}`);
      console.log(`  Response Code: ${results.meta.responseCode}`);
      console.log(`  Timestamp: ${new Date(results.timestamp).toISOString()}`);
      console.log(`  deTECHtor Version: ${results.meta.detechtor_version}`);
    }

    const output = JSON.stringify(results, null, 2);

    if (argv.output) {
      await fs.writeFile(argv.output, output);
      console.log(`\n💾 Results saved to ${argv.output}`);
    } else if (argv.verbose) {
      console.log('\n📄 Raw JSON Output:');
      console.log('─'.repeat(50));
      console.log(output);
    }

  } catch (error) {
    console.error('❌ Scan failed:', error.message);

    if (argv.verbose) {
      console.error('\nError details:');
      console.error(error.stack);
    }

    // Provide helpful error suggestions
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      console.error('\n💡 Suggestion: Check if the URL is accessible and spelled correctly');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Suggestion: Try increasing the timeout with --timeout option');
    } else if (error.message.includes('Failed to launch browser')) {
      console.error('\n💡 Suggestion: Ensure Node.js dependencies are installed: npm install');
    }

    process.exit(1);
  } finally {
    try {
      await detector.shutdown();
    } catch (shutdownError) {
      if (argv.verbose) {
        console.warn('Warning: Error during cleanup:', shutdownError.message);
      }
    }
  }

  if (success) {
    console.log('\n🎉 Scan completed successfully!');
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏸️  Shutting down deTECHtor...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏸️  Shutting down deTECHtor...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}