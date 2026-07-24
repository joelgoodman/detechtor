#!/usr/bin/env node
// scripts/residual-audit.js — UNI-156 Task 4.2 go/no-go for the provenance gate.
// Measures how many BASE (non-curated) technologies in SIGNAL categories would
// clear the product floor (>=50) against the local corpus. A base signal detection
// reaches >=50 offline only via a scriptSrc (+60) or meta-generator (+100) match
// (html alone is +40 < 50). So we approximate "would fire in product" as:
//   pattern is signal-category AND not _curated AND (scriptSrc matches OR meta matches).
// Output: per-category count of base-origin signal over-firers + the worst techs.
const fs = require('fs');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { mapCategory, SIGNAL_CATEGORIES } = require(path.resolve(__dirname, '../src/category-mapping.js'));

const REPO = path.resolve(__dirname, '..');
const idx = JSON.parse(fs.readFileSync(path.join(REPO, 'corpus/index.json'), 'utf8'));
let files = [];
for (const id of Object.keys(idx)) for (const p of idx[id]) files.push(p);
const SAMPLE = Number(process.env.RESIDUAL_SAMPLE) || 3; // every Nth file
files = files.filter((_, i) => i % SAMPLE === 0);

const d = new DeTECHtor();
d.loadPatterns();

// Build the list of BASE (non-curated) patterns whose categories intersect the signal set,
// that have a scriptSrc or meta-generator signal (the >=50-capable evidence offline).
const isSignal = (catId) => SIGNAL_CATEGORIES.has(mapCategory(catId));
const baseSignalPats = [];
for (const [name, def] of Object.entries(d.patterns)) {
  if (name === '_metadata' || !def || typeof def !== 'object') continue;
  if (def._curated === true) continue;                       // curated → authoritative, not residual
  const cats = def.cats || def.categories || [];
  if (!cats.some(isSignal)) continue;                        // not a signal-category tech
  const scriptSrc = def.scriptSrc || def.scripts || [];
  const metaGen = def.meta && (def.meta.generator || def.meta['generator']);
  const res = [];
  for (const s of scriptSrc) { try { res.push({ t: 'script', re: new RegExp(s, 'i') }); } catch {} }
  if (metaGen) { try { res.push({ t: 'meta', re: new RegExp(metaGen, 'i') }); } catch {} }
  if (!res.length) continue;                                 // no >=50-capable offline evidence
  baseSignalPats.push({ name, cats: cats.filter(isSignal).map(mapCategory), res });
}

const scriptSrcs = (html) => [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).join('\n');
const metaGen = (html) => (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i) || [, ''])[1];

const hitInst = {};   // techName -> count of institutions it fired >=50 on
for (const p of baseSignalPats) hitInst[p.name] = 0;
let n = 0;
for (const fp of files) {
  let html; try { html = fs.readFileSync(fp, 'utf8'); } catch { continue; } n++;
  const ss = scriptSrcs(html), mg = metaGen(html);
  for (const p of baseSignalPats) {
    const fired = p.res.some(r => r.t === 'script' ? r.re.test(ss) : r.re.test(mg));
    if (fired) hitInst[p.name]++;
  }
}

// Aggregate
const byCat = {};
const firing = Object.entries(hitInst).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
for (const p of baseSignalPats) {
  if (hitInst[p.name] === 0) continue;
  for (const c of p.cats) (byCat[c] ||= []).push([p.name, hitInst[p.name]]);
}
const out = [];
out.push(`# Residual base-origin signal over-firers (UNI-156 Task 4.2)`);
out.push(`sampled ${n} corpus files (every ${SAMPLE}th); base signal patterns with >=50-capable evidence: ${baseSignalPats.length}`);
out.push(`total base signal techs that fired >=50 on >=1 sampled site: ${firing.length}`);
out.push('');
for (const cat of Object.keys(byCat).sort()) {
  const techs = byCat[cat].sort((a, b) => b[1] - a[1]);
  const totalFires = techs.reduce((a, [, c]) => a + c, 0);
  out.push(`## ${cat}: ${techs.length} base techs fired (${totalFires} total site-fires on sample)`);
  for (const [name, c] of techs.slice(0, 20)) out.push(`  ${String(c).padStart(4)}  ${name}`);
  out.push('');
}
fs.writeFileSync(path.join(REPO, '.superpowers/sdd/residual-audit-out.txt'), out.join('\n'));
console.log('DONE — see .superpowers/sdd/residual-audit-out.txt');
console.log(`base signal patterns considered: ${baseSignalPats.length}; fired>=50: ${firing.length}`);
