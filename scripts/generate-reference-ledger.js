#!/usr/bin/env node

/**
 * Reference-Site Ledger Generator
 *
 * Reads the four higher-ed pattern files and emits a CSV with one row
 * per technology for use as a URL research ledger.
 *
 * Output: docs/reference-site-ledger.csv
 *
 * Columns (URLs are blank by default — to be populated by research):
 *   technology              Canonical tech name
 *   file                    Source pattern file (basename)
 *   legacy_names            Semicolon-separated legacy names
 *   vendor_website          website field from pattern (if present)
 *   vendor_demo_url         Vendor demo / community / public login
 *   vendor_docs_url         Vendor developer / admin documentation
 *   customer_url_1          Known .edu customer homepage
 *   customer_url_2          Second known .edu customer homepage
 *   customer_url_3          Third (optional)
 *   unverifiable_public     true if no public surface exists
 *   priority                high|medium|low — research ordering
 *   notes                   Free-form
 *
 * Regenerating this file will NOT overwrite any ledger data already
 * filled in. Merge manually or re-run with --force to overwrite.
 */

const fs = require('fs');
const path = require('path');

const PATTERN_FILES = [
  'patterns/higher-ed-cms.json',
  'patterns/higher-ed-lms.json',
  'patterns/higher-ed-sis.json',
  'patterns/higher-ed-infra.json'
];

const OUTPUT = 'docs/reference-site-ledger.csv';

// Priority heuristic: rebranded + obscure single-vendor tech = high priority
// for research because invented patterns are most likely there.
const HIGH_PRIORITY_HINTS = [
  'Anthology', 'Modern Campus', 'Slate', 'Element451', 'EAB',
  'Watermark', 'Campus Labs', 'CBORD', 'Academic Works', 'Mindmax',
  'HelioCampus', 'Civitas', 'CampusLogic', 'AwardSpring', 'Regent',
  'Brightspace', 'Instructure Canvas Catalog', 'Alma', 'Primo',
  'Colleague', 'Jenzabar', 'Populi', 'Veracross', 'Rediker',
  'CampusVue', 'Campus Management Suite', 'PowerCampus', 'Tribal'
];

const LOW_PRIORITY_HINTS = [
  'Canvas LMS', 'Blackboard Learn', 'Moodle', 'Drupal',
  'Google Workspace', 'Google Classroom', 'Microsoft Teams',
  'Ellucian Banner', 'Workday Student', 'YouTube', 'Vimeo',
  'Adobe', 'Okta', 'Salesforce'
];

function priorityFor(tech, hasLegacy) {
  if (hasLegacy) return 'high';
  if (HIGH_PRIORITY_HINTS.some(h => tech.includes(h))) return 'high';
  if (LOW_PRIORITY_HINTS.some(h => tech.includes(h))) return 'low';
  return 'medium';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const rows = [];

  for (const rel of PATTERN_FILES) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const patterns = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const fileBase = path.basename(abs);

    for (const [tech, def] of Object.entries(patterns)) {
      if (tech.startsWith('_')) continue;
      const legacy = (def._legacy_names || []).join(';');
      rows.push({
        technology: tech,
        file: fileBase,
        legacy_names: legacy,
        vendor_website: def.website || '',
        vendor_demo_url: '',
        vendor_docs_url: '',
        customer_url_1: '',
        customer_url_2: '',
        customer_url_3: '',
        unverifiable_public: '',
        priority: priorityFor(tech, legacy.length > 0),
        notes: ''
      });
    }
  }

  const header = [
    'technology', 'file', 'legacy_names', 'vendor_website',
    'vendor_demo_url', 'vendor_docs_url',
    'customer_url_1', 'customer_url_2', 'customer_url_3',
    'unverifiable_public', 'priority', 'notes'
  ];

  const csv = [
    header.join(','),
    ...rows.map(r => header.map(h => csvEscape(r[h])).join(','))
  ].join('\n');

  const outAbs = path.join(repoRoot, OUTPUT);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  // Safety: don't clobber an existing populated file without --force.
  if (fs.existsSync(outAbs) && !process.argv.includes('--force')) {
    const existing = fs.readFileSync(outAbs, 'utf8');
    const populated = existing.split('\n').slice(1).some(line => {
      const cols = line.split(',');
      return cols.slice(4, 9).some(c => c && c !== '""');
    });
    if (populated) {
      console.error(`Refusing to overwrite populated ledger: ${OUTPUT}`);
      console.error(`Pass --force to overwrite.`);
      process.exit(1);
    }
  }

  fs.writeFileSync(outAbs, csv + '\n', 'utf8');

  const priorityCounts = rows.reduce((acc, r) => {
    acc[r.priority] = (acc[r.priority] || 0) + 1;
    return acc;
  }, {});
  console.log(`Total techs: ${rows.length}`);
  console.log(`Priority: high=${priorityCounts.high || 0}  medium=${priorityCounts.medium || 0}  low=${priorityCounts.low || 0}`);
  console.log(`Written: ${OUTPUT}`);
}

if (require.main === module) {
  main();
}
