#!/usr/bin/env node
/**
 * UNI-237 change summary, computed from live state (not transcribed)
 * ==================================================================
 * Every hand-written count in this work has been wrong at least once. The pattern-removal figures
 * in docs/uni-237-handoff.md were restated three times — 53/11/47/3, then 67/12/55/5, then
 * 75/12/60/11 — not because anyone was careless, but because the numbers move with every commit and
 * a number copied into prose stops tracking the thing it describes the moment it is written.
 *
 * So the hand-off cites this script rather than quoting it. Rerun it; the output is the answer.
 *
 * Usage:
 *   node scripts/uni-237-summary.js [--base <ref>]     # default base: 5de54fd (branch point)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const bi = process.argv.indexOf('--base');
const BASE = bi === -1 ? '5de54fd' : process.argv[bi + 1];

function showAt(ref, file) {
  try { return JSON.parse(cp.execSync(`git show ${ref}:${file}`, { cwd: ROOT, maxBuffer: 1e9 }).toString()); }
  catch { return null; }
}
function readNow(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch { return null; }
}

// ---- pattern changes in the hand-edited files -------------------------------------------------
const curated = fs.readdirSync(path.join(ROOT, 'patterns'))
  .filter((f) => f.endsWith('.json') && !/overrides|allowlist|dictionary|import-report/.test(f))
  .map((f) => `patterns/${f}`);

let htmlRemoved = 0, scriptRemoved = 0, tightened = 0;
const touched = new Set();
for (const f of curated) {
  const before = showAt(BASE, f);
  const after = readNow(f);
  if (!before || !after) continue;
  for (const k of Object.keys(after)) {
    const b = before[k], a = after[k];
    if (!b || typeof b !== 'object' || !a || typeof a !== 'object') continue;
    const rh = (b.html || []).filter((x) => !(a.html || []).includes(x));
    const rs = (b.scripts || []).filter((x) => !(a.scripts || []).includes(x));
    const added = (a.html || []).filter((x) => !(b.html || []).includes(x));
    if (rh.length || rs.length) { touched.add(k); htmlRemoved += rh.length; scriptRemoved += rs.length; }
    if (added.length) tightened++;
  }
}

// ---- the override layer (technologies in the regenerated artifact) ----------------------------
const overrides = (readNow('patterns/pattern-overrides.json') || {}).overrides || {};
const overrideTechs = Object.keys(overrides).filter((k) => k !== '_comment');
let overrideRemoved = 0;
for (const k of overrideTechs) {
  touched.add(k);
  for (const arr of Object.values(overrides[k].remove || {})) overrideRemoved += arr.length;
}

// ---- technologies deleted outright ------------------------------------------------------------
const genBefore = showAt(BASE, 'patterns/webappanalyzer-merged.json')
  || showAt(BASE, 'patterns/generated/webappanalyzer-merged.json');
const genAfter = readNow('patterns/generated/webappanalyzer-merged.json');
const deleted = genBefore && genAfter ? Object.keys(genBefore).filter((k) => !genAfter[k]).length : null;

// ---- detections, and the alias collapses that are NOT losses ----------------------------------
const prevBefore = showAt(BASE, 'docs/corpus-prevalence.json');
const prevAfter = readNow('docs/corpus-prevalence.json');
const aliases = (readNow('patterns/technology-aliases.json') || {}).aliases || {};

let detBefore = null, detAfter = null, zeroed = [], aliasCollapsed = [], recovered = [];
if (prevBefore && prevAfter) {
  detBefore = Object.values(prevBefore.counts).reduce((s, v) => s + v, 0);
  detAfter = Object.values(prevAfter.counts).reduce((s, v) => s + v, 0);
  for (const [k, v] of Object.entries(prevBefore.counts)) {
    const now = prevAfter.counts[k] || 0;
    if (v > 0 && now === 0) {
      // A name that vanished because it was merged into its canonical target is a DEDUPLICATION,
      // not a lost detection. Conflating the two overstates the drop — it did once already.
      if (aliases[k]) aliasCollapsed.push(`${k} -> ${aliases[k]} (${v})`);
      else zeroed.push(`${k} (${v})`);
    }
  }
  for (const [k, v] of Object.entries(prevAfter.counts)) {
    const was = prevBefore.counts[k] || 0;
    if (v > was) recovered.push(`${k} ${was}->${v}`);
  }
}

const eng = new (require('../src/detechtor.js'))();
const techCount = Object.keys(eng.patterns).filter((k) => k !== '_metadata').length;

const L = [];
L.push(`UNI-237 change summary  (base ${BASE} -> working tree)`);
L.push('');
L.push(`  html patterns removed        ${htmlRemoved} curated + ${overrideRemoved} via the override layer = ${htmlRemoved + overrideRemoved}`);
L.push(`  script patterns removed      ${scriptRemoved}`);
L.push(`  technologies touched         ${touched.size}  (includes the ${overrideTechs.length} handled by pattern-overrides.json)`);
L.push(`  technologies tightened       ${tightened}`);
if (deleted !== null) L.push(`  technologies deleted         ${deleted} (never-fireable)`);
L.push(`  technologies now loaded      ${techCount}`);
if (detBefore !== null) {
  L.push('');
  L.push(`  detections                   ${detBefore.toLocaleString()} -> ${detAfter.toLocaleString()} (${((detAfter - detBefore) / detBefore * 100).toFixed(1)}%)`);
  L.push(`  dropped to zero              ${zeroed.length}`);
  for (const z of zeroed) L.push(`      ${z}`);
  L.push(`  alias collapses (NOT losses) ${aliasCollapsed.length}`);
  for (const a of aliasCollapsed) L.push(`      ${a}`);
  L.push(`  recovered by the scripts/scriptSrc union  ${recovered.length}`);
  for (const r of recovered) L.push(`      ${r}`);
} else {
  L.push('');
  L.push('  (no prevalence baseline at that ref — detection figures unavailable)');
}
console.log(L.join('\n'));
