#!/usr/bin/env node

// Test script to verify our comprehensive higher education patterns are loaded correctly

const DeTECHtor = require('../src/detechtor');
const config = require('../src/config');

function testPatternLoading() {
  console.log('🔍 Testing deTECHtor Pattern Loading...\n');

  const detector = new DeTECHtor();
  const patterns = detector.patterns;
  const failures = [];

  console.log(`📊 Total patterns loaded: ${Object.keys(patterns).length}`);
  console.log(`📁 Pattern files configured: ${config.patternPaths.join(', ')}`);

  // Check for higher education systems (post-rebrand canonical names)
  const higherEdSystems = [
    'Ellucian Banner',
    'Ellucian Colleague',
    'Oracle PeopleSoft Campus Solutions',
    'Blackboard Learn',
    'D2L Brightspace',
    'Canvas LMS',
    'Moodle',
    'Modern Campus CMS',
    'TerminalFour',
    'Shibboleth',
    'CAS',
    'Kaltura',
    'Panopto',
    'Slate (Technolutions)',
    'TouchNet',
    'Workday Student',
    'Anthology Student',
    'Duo Security',
    'Turnitin',
    '25Live'
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
  if (foundCount !== higherEdSystems.length) failures.push(`${higherEdSystems.length - foundCount} expected higher-ed system(s) not loaded`);
  if (Object.keys(patterns).length < 5000) failures.push(`only ${Object.keys(patterns).length} patterns loaded (expected the ~6,400-entry base plus the curated files)`);

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

  // Check for any patterns with issues. Generated entries are reported only (the importer and
  // lint-generated.js own the base); a CURATED entry fails the run when it has no description, or no
  // detection rule in any channel the engine evaluates unless its `_detection_note` says why
  // ("No detection rules ..."), as for an entry kept only so its name stays in the vocabulary.
  console.log('\n🔍 Pattern Validation:');
  const { loadEffective, enumerateRegexes } = require('./lib/pattern-channels.js');
  const effective = loadEffective();
  const withRegex = new Set(enumerateRegexes(effective).map((r) => r.tech));
  let generatedIssues = 0;
  const curatedIssues = [];
  Object.entries(effective).forEach(([name, pattern]) => {
    if (name === '_metadata' || !pattern || typeof pattern !== 'object') return;
    const issues = [];
    if (!pattern.description) issues.push('missing description');
    const detects = withRegex.has(name) || (pattern.js && Object.keys(pattern.js).length > 0)
      || (Array.isArray(pattern._domRules) && pattern._domRules.length > 0);
    const explained = /no detection rules/i.test(pattern._detection_note || '');
    if (!detects && !explained) issues.push('no detection patterns');
    if (!issues.length) return;
    if (pattern._curated) curatedIssues.push(`${name}: ${issues.join(', ')}`);
    else generatedIssues++;
  });
  console.log(`   generated base: ${generatedIssues} entries with no description or no detection rule (reported, not failed)`);
  if (curatedIssues.length === 0) {
    console.log('   ✅ every curated entry has a description and a detection rule (or a note saying why not)');
  } else {
    for (const i of curatedIssues) console.log(`   ❌ curated ${i}`);
    failures.push(`${curatedIssues.length} curated entr${curatedIssues.length === 1 ? 'y' : 'ies'} with no description or no detection rule`);
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

  if (failures.length) {
    console.error(`\n❌ Pattern loading test failed: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n✅ Pattern loading test completed!');
}

if (require.main === module) {
  testPatternLoading();
}