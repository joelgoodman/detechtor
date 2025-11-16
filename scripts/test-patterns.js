#!/usr/bin/env node

// Test script to verify our comprehensive higher education patterns are loaded correctly

const DeTECHtor = require('../src/detechtor');
const config = require('../src/config');

function testPatternLoading() {
  console.log('🔍 Testing deTECHtor Pattern Loading...\n');

  const detector = new DeTECHtor();
  const patterns = detector.patterns;

  console.log(`📊 Total patterns loaded: ${Object.keys(patterns).length}`);
  console.log(`📁 Pattern files configured: ${config.patternPaths.join(', ')}`);

  // Check for higher education systems
  const higherEdSystems = [
    'Ellucian Banner',
    'Ellucian Colleague',
    'PeopleSoft Campus Solutions',
    'Blackboard Learn',
    'D2L Brightspace',
    'Canvas LMS',
    'Moodle',
    'OmniCMS',
    'TerminalFour',
    'Shibboleth',
    'CAS',
    'Kaltura',
    'Panopto',
    'Slate',
    'TouchNet'
  ];

  console.log('\n🎓 Higher Education Systems:');
  let foundCount = 0;
  higherEdSystems.forEach(system => {
    if (patterns[system]) {
      console.log(`   ✅ ${system}`);
      foundCount++;
    } else {
      console.log(`   ❌ ${system} - NOT FOUND`);
    }
  });

  console.log(`\n📈 Higher Ed Coverage: ${foundCount}/${higherEdSystems.length} (${Math.round(foundCount/higherEdSystems.length*100)}%)`);

  // Show pattern structure for a few systems
  console.log('\n🔧 Sample Pattern Structures:');

  if (patterns['Ellucian Banner']) {
    const banner = patterns['Ellucian Banner'];
    console.log('\n📋 Ellucian Banner:');
    console.log(`   - HTML patterns: ${banner.html ? banner.html.length : 0}`);
    console.log(`   - Script patterns: ${banner.scriptSrc ? banner.scriptSrc.length : (banner.scripts ? banner.scripts.length : 0)}`);
    console.log(`   - Headers: ${banner.headers ? Object.keys(banner.headers).length : 0}`);
    console.log(`   - JS objects: ${banner.js ? Object.keys(banner.js).length : 0}`);
    console.log(`   - Confidence: ${banner.confidence || 'default'}`);
    console.log(`   - Higher Ed: ${banner.higher_ed}`);
  }

  if (patterns['Canvas LMS']) {
    const canvas = patterns['Canvas LMS'];
    console.log('\n🎨 Canvas LMS:');
    console.log(`   - Categories: ${canvas.cats || canvas.categories || 'none'}`);
    console.log(`   - Headers: ${canvas.headers ? Object.keys(canvas.headers).length : 0}`);
    console.log(`   - JS objects: ${canvas.js ? Object.keys(canvas.js).length : 0}`);
    console.log(`   - Higher Ed: ${canvas.higher_ed}`);
  }

  // Check for any patterns with issues
  console.log('\n🔍 Pattern Validation:');
  let issueCount = 0;

  Object.entries(patterns).forEach(([name, pattern]) => {
    const issues = [];

    // Skip metadata
    if (name === '_metadata') return;

    // Check required fields
    if (!pattern.description) issues.push('missing description');
    if (!pattern.html && !pattern.scriptSrc && !pattern.scripts && !pattern.headers && !pattern.js) {
      issues.push('no detection patterns');
    }

    if (issues.length > 0) {
      console.log(`   ⚠️  ${name}: ${issues.join(', ')}`);
      issueCount++;
    }
  });

  if (issueCount === 0) {
    console.log('   ✅ All patterns validated successfully');
  } else {
    console.log(`   ⚠️  Found ${issueCount} patterns with issues`);
  }

  // Test pattern categories
  const categories = new Set();
  Object.values(patterns).forEach(pattern => {
    if (pattern.cats) {
      pattern.cats.forEach(cat => categories.add(cat));
    } else if (pattern.categories) {
      pattern.categories.forEach(cat => categories.add(cat));
    }
  });

  console.log(`\n📂 Categories found: ${Array.from(categories).sort().join(', ')}`);

  console.log('\n✅ Pattern loading test completed!');
}

if (require.main === module) {
  testPatternLoading();
}