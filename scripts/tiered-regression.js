#!/usr/bin/env node
// scripts/tiered-regression.js — the regression that justifies UNI-225.
//
// Runs tiered detection over the real archived corpus and compares it against tier-1-only
// detection. The corpus (506 pages, 29 institutions) is gitignored, so this cannot live in
// `npm test`; it is run deliberately.
//
// MEASURED BASELINE (2026-08-09, shipped TerminalFour pattern, all 29 corpus institutions):
//   12  detect on the homepage already
//    2  recover from an interior page (ids 2153, 478)   <- what this change buys
//    1  carries ONLY a mined tell (id 557: directEdit/site-assets/cdn-pxl, none of which are in
//       the shipped pattern) — recoverable only by a pattern change, deliberately out of scope
//    9  carry no tell on any page
//    5  are blocked on every page and must report `unknown`
//   = 29
//
// ⚠️ This does NOT reproduce the "14 recovered / 7 blocked" figures in docs/t4-detection-validation.md.
//    - The 14 there is the TOTAL detected across all pages (12 + 2), not 14 recovered from interior
//      pages. Those 12 carry the tell on their homepage consistently — verified stable across every
//      archived home capture, so it is not weekly flakiness.
//    - The 7 blocked is 5: institutions 2099 and 449 are blocked on home/admissions/cost-aid/
//      student-life but have fully readable `program` captures (1.2 MB and 328 KB). Tiering moves
//      them from "unknown" to a real evaluation, which is the point.
//   The doc has been corrected. Treat the numbers below as the regression floor.
//
// Usage:
//   node scripts/tiered-regression.js
//   node scripts/tiered-regression.js --assert --expect-unknown 5 --expect-recovered 2
//   CORPUS_DIR=corpus-other TARGET_TECH='Omni CMS' node scripts/tiered-regression.js
'use strict';
const fs = require('fs');
const path = require('path');
const DeTECHtor = require('../src/detechtor.js');
const { detectTiered } = require('../src/tiered-detect.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');
const { classifyCapture } = require('../src/capture-quality.js');
const { SIGNAL_CATEGORIES } = require('../src/category-mapping.js');

const CORPUS = path.resolve(__dirname, '..', process.env.CORPUS_DIR || 'corpus-t4-candidates');
const args = process.argv.slice(2);
const ASSERT = args.includes('--assert');
const numArg = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : Number(args[i + 1]);
};
const EXPECT_UNKNOWN = numArg('--expect-unknown', 5);
const EXPECT_RECOVERED = numArg('--expect-recovered', 2);
const TARGET = process.env.TARGET_TECH || 'TerminalFour';

if (!fs.existsSync(CORPUS)) {
  console.error(`FATAL: corpus not found at ${CORPUS}`);
  console.error('It is gitignored. Repopulate with:');
  console.error('  CORPUS_DIR=corpus-t4-candidates node scripts/wasabi-fetch-institutions.js <id> ...');
  console.error('Refusing to report a result over a corpus that is not there.');
  process.exit(1);
}

// corpus layout: <CORPUS>/<institution_id>/<pageType>__<sha12>.html
function loadInstitution(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({
      pageType: f.split('__')[0],
      html: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
}

const engine = new DeTECHtor();
const ids = fs.readdirSync(CORPUS).filter((d) => fs.statSync(path.join(CORPUS, d)).isDirectory());
if (!ids.length) {
  console.error(`FATAL: ${CORPUS} contains no institution directories`);
  process.exit(1);
}

const isSignal = (t) => (t.categories || []).some((c) => SIGNAL_CATEGORIES.has(c));
let unknown = 0, detected = 0, none = 0, parses = 0;
let homepageOnly = 0, tieredFinds = 0, viaOrdering = 0, viaEscalation = 0;
const recoveredIds = [], unknownIds = [];

for (const id of ids) {
  const pages = loadInstitution(path.join(CORPUS, id));
  if (!pages.length) continue;

  const r = detectTiered(engine, pages);
  parses += r.pagesEvaluated.length;
  if (r.status === 'unknown') { unknown++; unknownIds.push(id); continue; }
  if (r.status === 'detected') detected++; else none++;

  // The regression baseline is the OLD behaviour: one page per institution, the homepage.
  // Comparing against "the first page the new ordering picks" would compare the change to itself.
  const home = pages.filter((p) => p.pageType === 'home' && classifyCapture(p.html).scannable);
  const foundOnHome = home.some((p) =>
    engine.matchPatterns(evidenceFromHtml(p.html, engine.domPlan)).some((t) => t.name === TARGET));
  if (foundOnHome) homepageOnly++;

  if (!r.technologies.some((t) => t.name === TARGET)) continue;
  tieredFinds++;
  if (foundOnHome) continue;

  recoveredIds.push(id);
  // Two distinct wins, worth separating: a better FIRST page (ordering) versus reading more
  // pages (escalation). The spec predicted ordering to be the smaller of the two effects.
  if (r.tier === 1) viaOrdering++; else viaEscalation++;
}

const recovered = viaOrdering + viaEscalation;

console.log(`tiered regression — ${ids.length} institutions, corpus ${path.basename(CORPUS)}`);
console.log(`  status:      detected ${detected} · none ${none} · unknown ${unknown}`);
console.log(`  ${TARGET}:    homepage-only ${homepageOnly} → tiered ${tieredFinds}`);
console.log(`  recovered:   ${recovered} (${viaOrdering} by page ordering, ${viaEscalation} by escalation)`);
console.log(`  page parses: ${parses} (scan-everything would be ${ids.length * 5})`);
console.log(`  recovered ids: ${recoveredIds.join(', ') || 'none'}`);
console.log(`  unknown ids:   ${unknownIds.join(', ') || 'none'}`);

if (ASSERT) {
  const failures = [];
  if (unknown !== EXPECT_UNKNOWN) {
    failures.push(`unknown ${unknown}, expected ${EXPECT_UNKNOWN} — blocked institutions must ` +
      `report unknown, never "no CMS"`);
  }
  if (recovered < EXPECT_RECOVERED) {
    failures.push(`recovered ${recovered}, expected at least ${EXPECT_RECOVERED} — escalation is ` +
      `the point of this work`);
  }
  if (failures.length) {
    console.error('\nFAIL:');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nOK: escalation and unscannable handling match the measured baseline.');
}
