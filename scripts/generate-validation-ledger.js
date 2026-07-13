#!/usr/bin/env node

/**
 * Pattern Validation Ledger Generator
 *
 * Reads the four higher-ed pattern files and emits a CSV with one row
 * per pattern for use as a working validation ledger.
 *
 * Output: docs/pattern-validation-ledger.csv
 *
 * Columns:
 *   technology        Canonical tech name
 *   file              Source pattern file (basename)
 *   category          cats[] from the pattern file (first entry, numeric)
 *   field             Which evidence field: html|scripts|headers|js|cookies|meta
 *   pattern           The regex/string pattern itself
 *   tier              Auto-classified quality tier (A|B|C) per PATTERN_GUIDELINES.md
 *   higher_ed         true|false
 *   legacy_names      Semicolon-separated legacy names if rebrand tracked
 *   source_evidence   Blank — fill in with URL/doc citation during validation
 *   status            Blank — fill in: verified|needs-work|remove
 *   notes             Blank — free-form notes during validation
 */

const fs = require('fs');
const path = require('path');

const PATTERN_FILES = [
  'patterns/higher-ed-cms.json',
  'patterns/higher-ed-lms.json',
  'patterns/higher-ed-sis.json',
  'patterns/higher-ed-infra.json'
];

const OUTPUT = 'docs/pattern-validation-ledger.csv';

// Auto-tier heuristics (aligned with docs/PATTERN_GUIDELINES.md).
// Tier A: high-specificity identifiers unlikely to collide.
// Tier B: product-specific paths/domains, moderately specific regex.
// Tier C: anything short, single English word, broad wildcard.
const COMMON_WORDS = new Set([
  'banner', 'navigate', 'colleague', 'cascade', 'starfish', 'canvas',
  'moodle', 'sakai', 'alma', 'primo', 'parchment', 'compass', 'populi',
  'ultra', 'modern', 'campus', 'student', 'portal', 'login', 'home',
  'slate', 'revel', 'summon', 'focus', 'encoura', 'element', 'absorb'
]);

function classifyTier(field, pattern) {
  const p = String(pattern);
  const lower = p.toLowerCase();

  // Field-level shortcuts: header names, js globals with unique casing,
  // and cookie names are usually high signal.
  if (field === 'headers') return 'A';
  if (field === 'cookies' && p.length >= 6) return 'A';
  if (field === 'meta' && /generator/i.test(p) === false) return 'B';

  // JS globals: unique-cased product names are A; single letters or generic are C.
  if (field === 'js') {
    if (p.length <= 2) return 'C';
    if (/^[A-Z][a-zA-Z0-9]{4,}$/.test(p)) return 'A';
    if (COMMON_WORDS.has(lower)) return 'C';
    return 'B';
  }

  // Short strings — almost always suspect.
  if (p.length < 4) return 'C';

  // Common English words as bare patterns — suspect.
  if (COMMON_WORDS.has(lower)) return 'C';

  // Broad wildcards.
  if (/^\.\*[a-z]+\.\*$/i.test(p)) return 'C';
  if (/^class="?\.\*/.test(p)) return 'C';

  // Vendor domain literals — strong.
  if (/[a-z0-9-]+\\\.(com|org|net|edu|io)/i.test(p)) return 'A';

  // Path-based with escaping — strong.
  if (/^\/[a-z0-9_-]{4,}/i.test(p) && /\\/.test(p)) return 'B';

  // Compound product identifiers (underscores, hyphens, meaningful length).
  if (p.length >= 8 && /[a-z]+[-_][a-z]+/i.test(p)) return 'B';

  return 'C';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function extractRows(fileName, patterns) {
  const rows = [];
  const fileBase = path.basename(fileName);

  for (const [tech, def] of Object.entries(patterns)) {
    if (tech.startsWith('_')) continue;

    const categoryList = (def.cats || def.categories || []).join(';');
    const higherEd = def.higher_ed === true;
    const legacy = (def._legacy_names || []).join(';');

    // html, scripts — arrays of strings
    for (const field of ['html', 'scripts']) {
      const values = def[field] || [];
      for (const v of values) {
        rows.push({
          technology: tech,
          file: fileBase,
          category: categoryList,
          field,
          pattern: v,
          tier: classifyTier(field, v),
          higher_ed: higherEd,
          legacy_names: legacy,
          source_evidence: '',
          status: '',
          notes: ''
        });
      }
    }

    // headers, meta, cookies, js — objects keyed by name
    for (const field of ['headers', 'meta', 'cookies', 'js']) {
      const obj = def[field] || {};
      for (const [key, val] of Object.entries(obj)) {
        const combined = val ? `${key}=${val}` : key;
        rows.push({
          technology: tech,
          file: fileBase,
          category: categoryList,
          field,
          pattern: combined,
          tier: classifyTier(field, key),
          higher_ed: higherEd,
          legacy_names: legacy,
          source_evidence: '',
          status: '',
          notes: ''
        });
      }
    }
  }

  return rows;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const allRows = [];

  for (const rel of PATTERN_FILES) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      console.error(`Missing pattern file: ${abs}`);
      continue;
    }
    const patterns = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const rows = extractRows(abs, patterns);
    allRows.push(...rows);
    console.log(`  ${rel}: ${rows.length} pattern rows (${Object.keys(patterns).filter(k => !k.startsWith('_')).length} techs)`);
  }

  const header = [
    'technology', 'file', 'category', 'field', 'pattern',
    'tier', 'higher_ed', 'legacy_names',
    'source_evidence', 'status', 'notes'
  ];

  const csv = [
    header.join(','),
    ...allRows.map(r => header.map(h => csvEscape(r[h])).join(','))
  ].join('\n');

  const outAbs = path.join(repoRoot, OUTPUT);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, csv + '\n', 'utf8');

  // Summary
  const tierCounts = allRows.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + 1;
    return acc;
  }, {});
  console.log(`\nTotal rows: ${allRows.length}`);
  console.log(`Tier breakdown: A=${tierCounts.A || 0}  B=${tierCounts.B || 0}  C=${tierCounts.C || 0}`);
  console.log(`Written: ${OUTPUT}`);
}

if (require.main === module) {
  main();
}

module.exports = { classifyTier, extractRows };
