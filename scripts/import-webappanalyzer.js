#!/usr/bin/env node

/**
 * Script to import WebAppAnalyzer technology patterns and merge with our custom higher-ed patterns
 * This gives us comprehensive technology detection while maintaining our higher-ed focus
 */

const fs = require('fs-extra');
const https = require('https');
const path = require('path');

const WEBAPPANALYZER_BASE_URL = 'https://raw.githubusercontent.com/enthec/webappanalyzer/main/src/technologies/';

// Letters that contain major CMSes and technologies we care about
const IMPORTANT_LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '_'
];

async function downloadPatterns() {
  const allPatterns = {};

  console.log('Downloading WebAppAnalyzer patterns...');

  for (const letter of IMPORTANT_LETTERS) {
    try {
      const url = `${WEBAPPANALYZER_BASE_URL}${letter}.json`;
      const patterns = await downloadJSON(url);

      if (patterns && typeof patterns === 'object') {
        Object.assign(allPatterns, patterns);
        console.log(`Downloaded ${Object.keys(patterns).length} patterns from ${letter}.json`);
      }
    } catch (error) {
      console.warn(`Failed to download ${letter}.json: ${error.message}`);
    }
  }

  return allPatterns;
}

function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Invalid JSON: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function mergeWithExistingPatterns(webappPatterns) {
  const mergedPatterns = { ...webappPatterns };

  // Load our existing higher-ed patterns and merge them in
  const configPath = path.join(__dirname, '../src/config.js');
  if (fs.existsSync(configPath)) {
    const config = require(configPath);

    for (const patternPath of config.patternPaths) {
      // Resolve relative paths from scripts directory
      const resolvedPath = path.isAbsolute(patternPath)
        ? patternPath
        : path.resolve(__dirname, '..', patternPath);

      if (fs.existsSync(resolvedPath)) {
        try {
          const customPatterns = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

          // Our custom patterns take precedence over WebAppAnalyzer patterns
          Object.assign(mergedPatterns, customPatterns);

          console.log(`Merged ${Object.keys(customPatterns).length} custom patterns from ${resolvedPath}`);
        } catch (error) {
          console.warn(`Failed to merge patterns from ${resolvedPath}: ${error.message}`);
        }
      }
    }
  }

  return mergedPatterns;
}

function categorizePatterns(patterns) {
  const categories = {
    cms: [],
    lms: [],
    sis: [],
    higherEd: [],
    general: []
  };

  for (const [name, pattern] of Object.entries(patterns)) {
    const cats = pattern.cats || pattern.categories || [];
    const isHigherEd = pattern.higher_ed === true;

    // Category 1 = CMS, 21 = LMS, 53 = SIS/Enterprise
    if (cats.includes(1)) {
      categories.cms.push(name);
    } else if (cats.includes(21)) {
      categories.lms.push(name);
    } else if (cats.includes(53)) {
      categories.sis.push(name);
    }

    if (isHigherEd) {
      categories.higherEd.push(name);
    } else {
      categories.general.push(name);
    }
  }

  return categories;
}

async function main() {
  try {
    console.log('Starting WebAppAnalyzer pattern import...');

    // Download all WebAppAnalyzer patterns
    const webappPatterns = await downloadPatterns();
    console.log(`Downloaded ${Object.keys(webappPatterns).length} total patterns from WebAppAnalyzer`);

    // Merge with our existing patterns (our patterns take precedence)
    const mergedPatterns = await mergeWithExistingPatterns(webappPatterns);
    console.log(`Final merged pattern count: ${Object.keys(mergedPatterns).length}`);

    // Save the merged patterns
    const outputPath = path.join(__dirname, '..', 'patterns', 'webappanalyzer-merged.json');
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, mergedPatterns, { spaces: 2 });
    console.log(`Saved merged patterns to ${outputPath}`);

    // Generate a report
    const categories = categorizePatterns(mergedPatterns);

    console.log('\\n=== Pattern Summary ===');
    console.log(`CMS Patterns: ${categories.cms.length}`);
    console.log(`LMS Patterns: ${categories.lms.length}`);
    console.log(`SIS/Enterprise Patterns: ${categories.sis.length}`);
    console.log(`Higher Ed Specific: ${categories.higherEd.length}`);
    console.log(`General Patterns: ${categories.general.length}`);

    // Show some popular CMS patterns we now have
    const popularCMS = categories.cms.filter(name =>
      ['WordPress', 'Drupal', 'Joomla', 'Sitecore', 'Adobe Experience Manager',
       'Wix', 'Squarespace', 'Ghost', 'TYPO3', 'Umbraco', 'Kentico'].includes(name)
    );

    console.log('\\n=== Popular CMS Patterns Detected ===');
    console.log(popularCMS.join(', '));

    // Save a summary report
    const reportPath = path.join(__dirname, '..', 'patterns', 'import-report.json');
    await fs.writeJson(reportPath, {
      importDate: new Date().toISOString(),
      totalPatterns: Object.keys(mergedPatterns).length,
      webappPatternsImported: Object.keys(webappPatterns).length,
      categories,
      popularCMS
    }, { spaces: 2 });

    console.log(`\\nImport complete! Report saved to ${reportPath}`);

  } catch (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { downloadPatterns, mergeWithExistingPatterns };