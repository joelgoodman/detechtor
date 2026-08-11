#!/usr/bin/env node
/**
 * Generated-artifact guard (UNI-237)
 * ==================================
 * patterns/generated/webappanalyzer-merged.json is produced by scripts/import-webappanalyzer.js and
 * rewritten wholesale on every import. Editing it by hand looks like it works and is silently
 * reverted the next time anyone re-imports. That has cost real time more than once, so the build
 * catches it rather than relying on a comment being read.
 *
 * The import records the artifact's SHA-256 in patterns/import-report.json. This recomputes it.
 *
 * Usage:
 *   node scripts/lint-generated.js           # report
 *   node scripts/lint-generated.js --gate    # exit 1 on mismatch
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const GATE = process.argv.includes('--gate');
const ARTIFACT = path.join(ROOT, 'patterns/generated/webappanalyzer-merged.json');
const REPORT = path.join(ROOT, 'patterns/import-report.json');

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

if (!fs.existsSync(ARTIFACT)) {
  console.error(`FATAL: ${ARTIFACT} is missing.`);
  process.exit(1);
}

const report = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {};
const recorded = report.artifactSha256;

if (!recorded) {
  console.error(
    'FATAL: patterns/import-report.json records no artifactSha256.\n' +
    'Run `npm run update-patterns` to regenerate the artifact and its hash.'
  );
  process.exit(GATE ? 1 : 0);
}

const actual = sha256(ARTIFACT);
if (actual === recorded) {
  console.log('generated artifact matches its recorded hash — no hand-edits');
  process.exit(0);
}

// UNI-237: printed via console.log (stdout), not console.error — the message names the override
// layer the reader needs (pattern-overrides.json), and callers piping/capturing this guard's output
// (including the tamper test) must be able to see it without also capturing stderr.
console.log(
  '\nFATAL: patterns/generated/webappanalyzer-merged.json has been modified since it was imported.\n' +
  `  recorded ${recorded}\n  actual   ${actual}\n\n` +
  'This file is a BUILD ARTIFACT. scripts/import-webappanalyzer.js rewrites it wholesale, so an\n' +
  'edit here is silently reverted by the next import.\n\n' +
  'To change a technology that lives in it:\n' +
  '  • to REMOVE an evidence pattern -> add a rule to patterns/pattern-overrides.json\n' +
  '  • to change its CATEGORY        -> add a rule to patterns/category-overrides.json\n' +
  '  • to change it any other way    -> move the technology into a curated patterns/higher-ed-*.json\n\n' +
  'If you genuinely re-imported, run `npm run update-patterns` so the hash is re-recorded.\n'
);
process.exit(GATE ? 1 : 0);
