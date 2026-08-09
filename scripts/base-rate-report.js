#!/usr/bin/env node
/**
 * Base-rate plausibility report (UNI-224 Phase C)
 * ==============================================
 * The guard for unknown-unknowns.
 *
 * Cohort 128 recorded **Pleroma on 4,575 institutions out of ~4,459 scanned** — arithmetically
 * impossible, categorised as a CMS, and nothing in the pipeline looked. No rule-level check could
 * have caught it: the pattern was well-formed and tightly anchored; the ENGINE misread it. Only
 * counting the output against the population reveals that class of failure.
 *
 * Two checks:
 *   1. IMPOSSIBLE  — detections exceed the number of institutions scanned. Always a defect.
 *   2. IMPLAUSIBLE — prevalence above a threshold. NOT automatically wrong: Open Graph legitimately
 *                    appears on ~66% of university homepages. These need adjudication, never blind
 *                    rejection — the Phase A ledger rejected 3 of 13 reviewed, and kept 10.
 *
 * Input: JSON, either
 *   { institutions: <n>, detections: [ { name, institutionId } ... ] }   (raw)
 *   or { institutions: <n>, counts: { "<tech>": <n> } }                  (pre-aggregated)
 *
 * Usage:
 *   node scripts/base-rate-report.js results.json
 *   node scripts/base-rate-report.js results.json --threshold 0.4 --gate
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const GATE = args.includes('--gate');
const tIdx = args.indexOf('--threshold');
const THRESHOLD = tIdx !== -1 ? Number(args[tIdx + 1]) : 0.4;

if (!file) {
  console.error('usage: base-rate-report.js <results.json> [--threshold 0.4] [--gate]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const institutions = Number(data.institutions);
if (!institutions || institutions < 1) {
  console.error('FATAL: results must carry a positive `institutions` count — prevalence is meaningless without a denominator');
  process.exit(1);
}

let counts = data.counts;
if (!counts) {
  if (!Array.isArray(data.detections)) {
    console.error('FATAL: results must carry `counts` or `detections`');
    process.exit(1);
  }
  // Count DISTINCT institutions per technology. Counting raw detections instead is what let a
  // multi-page scan inflate a per-institution figure past 100% unnoticed.
  const seen = new Map();
  for (const d of data.detections) {
    if (!seen.has(d.name)) seen.set(d.name, new Set());
    seen.get(d.name).add(d.institutionId);
  }
  counts = Object.fromEntries([...seen].map(([k, v]) => [k, v.size]));
}

const rows = Object.entries(counts)
  .map(([name, n]) => ({ name, n, rate: n / institutions }))
  .sort((a, b) => b.rate - a.rate);

const impossible = rows.filter((r) => r.n > institutions);
const implausible = rows.filter((r) => r.n <= institutions && r.rate > THRESHOLD);

console.log(`base-rate report — ${rows.length} technologies over ${institutions} institutions`);
console.log(`threshold ${(THRESHOLD * 100).toFixed(0)}%\n`);

if (impossible.length) {
  console.log('IMPOSSIBLE — more detections than institutions. Always a defect:');
  for (const r of impossible) {
    console.log(`  ${r.name}: ${r.n}/${institutions} = ${(r.rate * 100).toFixed(1)}%`);
  }
  console.log();
}

if (implausible.length) {
  console.log(`IMPLAUSIBLE — above ${(THRESHOLD * 100).toFixed(0)}%. Adjudicate; do not auto-reject:`);
  for (const r of implausible) {
    console.log(`  ${r.name}: ${r.n}/${institutions} = ${(r.rate * 100).toFixed(1)}%`);
  }
  console.log('\n  Legitimately-prevalent technologies exist. In the Phase A corpus run, Open Graph');
  console.log('  (66%), Font Awesome (48%) and Google Font API (46%) all cleared this bar; only');
  console.log('  Font Awesome was actually wrong, and for a reason prevalence alone did not show.');
  console.log();
}

if (!impossible.length && !implausible.length) {
  console.log('No technology exceeds the threshold.');
}

console.log('Top 15 by prevalence:');
for (const r of rows.slice(0, 15)) {
  console.log(`  ${(r.rate * 100).toFixed(1).padStart(6)}%  ${String(r.n).padStart(6)}  ${r.name}`);
}

if (GATE && impossible.length) {
  console.error(`\nFAIL: ${impossible.length} technology(ies) detected on more institutions than exist.`);
  process.exit(1);
}
