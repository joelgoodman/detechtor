#!/usr/bin/env node
// scripts/modifier-impact.js — what does stripping the modifiers actually turn on? (UNI-226)
//
// Stripping `\;confidence:NN` / `\;version:\1` revives 939 previously-dead pattern values at once.
// That is a large, sudden behaviour change, and the lesson of UNI-224 is that a large sudden
// behaviour change must be MEASURED against real pages before it is trusted — a revived pattern is
// as capable of being wrong as it is of being right.
//
// Runs the engine twice over the same pages: once with definitions normalized (after) and once
// with the raw on-disk definitions (before), and reports what changed.
//
// Usage:
//   node scripts/modifier-impact.js                 # whole corpus
//   node scripts/modifier-impact.js --limit 800     # first N institutions
'use strict';
const fs = require('fs');
const path = require('path');
const DeTECHtor = require('../src/detechtor.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');
const { classifyCapture } = require('../src/capture-quality.js');
const { normalizeDefinition, hasModifier } = require('../src/pattern-normalize.js');
const { mapCategory, SIGNAL_CATEGORIES } = require('../src/category-mapping.js');

const CORPUS = path.resolve(__dirname, '..', process.env.CORPUS_DIR || 'corpus');
const args = process.argv.slice(2);
const li = args.indexOf('--limit');
const LIMIT = li === -1 ? Infinity : Number(args[li + 1]);

if (!fs.existsSync(CORPUS)) {
  console.error(`FATAL: corpus not found at ${CORPUS}. Refusing to report over a corpus that is not there.`);
  process.exit(1);
}

// "after" = the shipped engine, which normalizes at load.
const after = new DeTECHtor();

// "before" = the same pattern files with normalization undone, so the two runs differ in exactly
// one variable. Re-read from disk rather than trying to un-strip already-loaded definitions.
const before = new DeTECHtor();
before.patterns = (() => {
  const config = require('../src/config.js');
  const out = {};
  for (const p of config.patternPaths) {
    const full = path.resolve(__dirname, '../src', p);
    if (!fs.existsSync(full)) continue;
    for (const [name, def] of Object.entries(JSON.parse(fs.readFileSync(full, 'utf8')))) {
      if (name !== '_metadata') out[name] = def;
    }
  }
  return out;
})();
before.domPlan = before.buildDomPlan();

// Which techs COULD change? Only those carrying a modifier on the raw definition.
const couldChange = new Set();
for (const [name, def] of Object.entries(before.patterns)) {
  if (name === '_metadata' || !def || typeof def !== 'object') continue;
  const s = JSON.stringify(def);
  if (s.includes('\\\\;confidence:') || s.includes('\\\\;version:') || hasModifier(s)) couldChange.add(name);
}

// Only a tech carrying a modifier can change between the two runs — every other definition is
// byte-identical in both engines. Restricting both to that set measures exactly the same delta
// while evaluating ~1,166 patterns instead of ~6,400. This is a speed optimisation, not a sample:
// no possible change is excluded by it.
for (const engine of [before, after]) {
  for (const name of Object.keys(engine.patterns)) {
    if (name !== '_metadata' && !couldChange.has(name)) delete engine.patterns[name];
  }
  engine.domPlan = engine.buildDomPlan();
}

const isSignal = (t) => (t.categories || []).some((c) => SIGNAL_CATEGORIES.has(c));

const dirs = fs.readdirSync(CORPUS)
  .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
  .slice(0, LIMIT === Infinity ? undefined : LIMIT);

const files = dirs.length
  ? dirs.map((d) => {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      return f ? path.join(CORPUS, d, f) : null;
    }).filter(Boolean)
  : fs.readdirSync(CORPUS).filter((f) => f.endsWith('.html')).slice(0, LIMIT === Infinity ? undefined : LIMIT)
      .map((f) => path.join(CORPUS, f));

if (!files.length) {
  console.error(`FATAL: no HTML found under ${CORPUS}`);
  process.exit(1);
}

const beforeCount = new Map();
const afterCount = new Map();
let scanned = 0, skipped = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!classifyCapture(html).scannable) { skipped++; continue; }
  scanned++;
  const bump = (map, techs) => {
    for (const t of techs) map.set(t.name, (map.get(t.name) || 0) + 1);
  };
  bump(beforeCount, before.matchPatterns(evidenceFromHtml(html, before.domPlan)));
  bump(afterCount, after.matchPatterns(evidenceFromHtml(html, after.domPlan)));
  if (scanned % 250 === 0) process.stderr.write(`  …${scanned}\n`);
}

const names = new Set([...beforeCount.keys(), ...afterCount.keys()]);
const rows = [...names].map((name) => {
  const b = beforeCount.get(name) || 0;
  const a = afterCount.get(name) || 0;
  return { name, b, a, delta: a - b, rate: a / scanned, signal: null };
}).filter((r) => r.delta !== 0).sort((x, y) => y.delta - x.delta);

console.log(`modifier impact — ${scanned} pages scanned (${skipped} unscannable), corpus ${path.basename(CORPUS)}`);
console.log(`techs carrying a modifier: ${couldChange.size}`);
console.log(`techs whose detection count CHANGED: ${rows.length}\n`);

if (!rows.length) {
  console.log('No detection changed. Either the revived patterns match nothing in this corpus,');
  console.log('or the strip is not reaching the engine — check before/after really differ.');
} else {
  console.log('newly firing (or newly silent), by change in institutions detected:');
  console.log('   before   after    delta   rate   technology');
  for (const r of rows.slice(0, 40)) {
    console.log(`  ${String(r.b).padStart(6)}  ${String(r.a).padStart(6)}  ${String(r.delta).padStart(7)}  ` +
      `${(r.rate * 100).toFixed(1).padStart(5)}%  ${r.name}${couldChange.has(r.name) ? '' : '  ⚠️ NOT a modifier tech'}`);
  }
}

// The false-positive shape to worry about is a LARGE CHANGE, not high prevalence. Filtering on
// absolute rate flags things like Facebook Pixel — 55.8% prevalent but +1 institution — while
// saying nothing about whether this change caused it. Judge the delta.
const suspicious = rows.filter((r) => r.delta / scanned > 0.25);
if (suspicious.length) {
  console.log(`\n⚠️ ${suspicious.length} technolog(ies) gained >25% of the corpus — adjudicate before trusting:`);
  for (const r of suspicious) {
    console.log(`   +${(r.delta / scanned * 100).toFixed(1)} points → ${(r.rate * 100).toFixed(1)}%  ${r.name}`);
  }
} else {
  console.log('\nNo technology gained more than 25% of the corpus.');
}

// Signal categories are what the product actually trusts; a change there matters far more than a
// jQuery plugin appearing, however large.
const signalRows = rows.filter((r) => {
  const def = after.patterns[r.name] || before.patterns[r.name];
  if (!def) return false;
  return (def.categories || def.cats || []).map(mapCategory).some((c) => SIGNAL_CATEGORIES.has(c));
});
console.log(`\nSIGNAL-CATEGORY changes: ${signalRows.length}`);
for (const r of signalRows) {
  console.log(`   ${(r.rate * 100).toFixed(1).padStart(5)}%  ${String(r.b).padStart(4)} → ${String(r.a).padStart(4)}  ${r.name}`);
}

const lost = rows.filter((r) => r.delta < 0);
console.log(`\ntechnologies that LOST detections: ${lost.length}` +
  (lost.length ? '' : '  (expected — a broken regex can only start matching, never stop)'));

// Name the artifact after its scope. Writing every run to one path let a 40-page smoke test
// silently overwrite a full-corpus result — a partial measurement must never be able to
// impersonate a complete one.
const scope = LIMIT === Infinity ? 'full' : `limit${LIMIT}`;
const outPath = path.resolve(__dirname, `../docs/modifier-impact.${scope}.json`);
fs.writeFileSync(outPath, JSON.stringify({ scope, scanned, skipped, changed: rows }, null, 2));
console.log(`\nwrote ${outPath}`);
