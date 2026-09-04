#!/usr/bin/env node
/**
 * Category audit (UNI-233)
 * ========================
 * Every guard we own asks whether a pattern MATCHES the right thing. None asks whether a matched
 * technology is FILED under the right category — so a perfectly precise pattern can be counted as
 * the wrong kind of technology, forever, silently. That is the same shape as the UNI-224 defect:
 * a question nobody was asking.
 *
 * It matters because SIGNAL categories (CMS/LMS/SIS/CRM/Chatbot/Site Search/Accessibility/
 * Marketing Automation) are what the product acts on, and what tiered detection's escalation
 * decision keys on. A miscategorised technology is not a cosmetic problem; it changes whether we
 * think we found anything at all.
 *
 * Checks (all deterministic — no judgement):
 *
 *   NAME_COLLISION     two technologies whose names differ only by case/spacing/punctuation.
 *                      Detection then depends on spelling, and prevalence is double-counted.
 *   SIGNAL_CASE_DROP   a technology that IS signal-category by a case-insensitive test but fails
 *                      the case-SENSITIVE `SIGNAL_CATEGORIES.has()` used across the codebase.
 *   CATEGORY_CASE      a category value differing from a canonical one only by case.
 *   DUPLICATE_CATEGORY the same category listed twice for one technology.
 *   UNKNOWN_CATEGORY   a mapped value outside the known vocabulary.
 *
 * Plus, with --corpus, a prevalence-ranked list of signal-category technologies for SEMANTIC
 * review. Semantic correctness ("is Slate a Chatbot?") needs a human; ranking by how many
 * institutions each affects is what makes that review finite and worth doing.
 *
 * Usage:
 *   node scripts/category-audit.js
 *   node scripts/category-audit.js --corpus [--limit 600]
 *   node scripts/category-audit.js --gate     # exit 1 on any mechanical defect
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DeTECHtor = require('../src/detechtor.js');
const { mapCategory, SIGNAL_CATEGORIES, CANONICAL_CATEGORIES } = require('../src/category-mapping.js');
const { validateOverrides } = require('../src/category-overrides.js');
const CATEGORY_OVERRIDES = require('../patterns/category-overrides.json');

const args = process.argv.slice(2);
const GATE = args.includes('--gate');
const USE_CORPUS = args.includes('--corpus');
const li = args.indexOf('--limit');
const LIMIT = li === -1 ? 600 : Number(args[li + 1]);

const engine = new DeTECHtor();
const techs = Object.entries(engine.patterns)
  .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object');

// The vocabulary comes from category-mapping.js, the single source of truth. Rebuilding it here
// from `Object.values(categoryMapping)` was itself the duplication this ticket is about: it missed
// the six string-only names and reported 21 permanent false positives.
const CANONICAL = CANONICAL_CATEGORIES;

const rawCats = (def) => (def.categories || def.cats) || [];
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const looseSignal = (c) =>
  [...SIGNAL_CATEGORIES].some((s) => s.toLowerCase() === String(c).toLowerCase());

const findings = { NAME_COLLISION: [], SIGNAL_CASE_DROP: [], CATEGORY_CASE: [], DUPLICATE_CATEGORY: [], UNKNOWN_CATEGORY: [] };

// --- NAME_COLLISION -----------------------------------------------------------------------
const byNorm = new Map();
for (const [name] of techs) {
  const k = normName(name);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(name);
}
for (const [, names] of byNorm) {
  if (names.length < 2) continue;
  const variants = names.map((n) => ({
    name: n,
    categories: rawCats(engine.patterns[n]).map(mapCategory),
    source: engine.patterns[n]._sourceFile || null,
    curated: !!engine.patterns[n]._curated,
  }));
  const sets = variants.map((v) => JSON.stringify([...v.categories].sort()));
  findings.NAME_COLLISION.push({
    names,
    variants,
    categoriesAgree: new Set(sets).size === 1,
    // Disagreement is the dangerous kind: which spelling matched decides the category.
    signalDisagreement: new Set(variants.map((v) => v.categories.some(looseSignal))).size > 1,
  });
}

// --- per-technology category checks ---------------------------------------------------------
for (const [name, def] of techs) {
  const mapped = rawCats(def).map(mapCategory);

  const strictSignal = mapped.some((c) => SIGNAL_CATEGORIES.has(c));
  const loose = mapped.some(looseSignal);
  if (loose && !strictSignal) {
    findings.SIGNAL_CASE_DROP.push({ name, categories: mapped, source: def._sourceFile || null });
  }

  const seen = new Set();
  for (const c of mapped) {
    if (seen.has(c)) {
      findings.DUPLICATE_CATEGORY.push({ name, category: c, source: def._sourceFile || null });
    }
    seen.add(c);

    if (!CANONICAL.has(c)) {
      const nearMiss = [...CANONICAL].find((k) => k.toLowerCase() === String(c).toLowerCase());
      if (nearMiss) {
        findings.CATEGORY_CASE.push({ name, got: c, canonical: nearMiss, source: def._sourceFile || null });
      } else {
        findings.UNKNOWN_CATEGORY.push({ name, category: c, source: def._sourceFile || null });
      }
    }
  }
}

// --- MISSING_SIGNAL (heuristic, reported only) ----------------------------------------------
//
// Every other check looks for problems INSIDE the signal categories. This looks the other way:
// a technology that SHOULD be signal but is filed elsewhere is a silent false NEGATIVE, and
// nothing else here would ever surface it.
//
// Deliberately a SCREEN, not a verdict. Matching a word in a description is weak evidence — a
// martech product mentioning "CRM" in prose is not thereby a CRM, and `HubSpot CMS Hub` is
// correctly a CMS even though its description mentions chat. Never gated; it produces a review
// queue for a human, which is the only thing that can settle it.
const SIGNAL_HINTS = {
  CMS: [/content management/i, /\bcms\b/i],
  LMS: [/learning management/i, /\blms\b/i, /e-?learning/i, /courseware/i],
  SIS: [/student information/i, /\bsis\b/i, /student system/i, /registrar/i],
  CRM: [/customer relationship/i, /\bcrm\b/i],
  Chatbot: [/chatbot/i, /live chat/i, /\bchat\b/i],
  'Site Search': [/site search/i, /enterprise search/i],
  Accessibility: [/accessibility/i, /\ba11y\b/i, /screen reader/i, /WCAG/i],
  'Marketing Automation': [/marketing automation/i],
};
findings.MISSING_SIGNAL = [];
for (const [name, def] of techs) {
  const mapped = rawCats(def).map(mapCategory);
  const haystack = `${name} ${def.description || ''}`;
  for (const [signal, patterns] of Object.entries(SIGNAL_HINTS)) {
    if (mapped.includes(signal)) continue;
    if (!patterns.some((r) => r.test(haystack))) continue;
    findings.MISSING_SIGNAL.push({
      name, suggests: signal, categories: mapped,
      curated: !!def._curated, source: def._sourceFile || null,
    });
  }
}

// --- OVERRIDE_INVALID ------------------------------------------------------------------------
// A decision recorded in patterns/category-overrides.json must still make sense against the
// patterns actually on disk. This is what makes the override layer durable: an upstream reimport
// that renames or drops a technology, or that folds our decision into the base, fails the build
// here instead of leaving a stale rule nobody notices.
const pristine = engine.loadPatterns({ applyOverrides: false });
findings.OVERRIDE_INVALID = validateOverrides(pristine, CATEGORY_OVERRIDES.overrides || {});

// --- OVERRIDE_COUNT ---------------------------------------------------------------------------
// M2: an empty or typo'd `overrides` key (e.g. `overide`, or a JSON structural slip that leaves
// `CATEGORY_OVERRIDES.overrides` undefined) silently disables every UNI-235/UNI-233 correction —
// `applyCategoryOverrides` just iterates zero entries and every other check above still passes,
// because there is nothing left to disagree with the patterns on disk. Only a floor on the count
// catches "the corrections stopped applying" as distinct from "the corrections are correct."
const overrideCount = Object.keys(CATEGORY_OVERRIDES.overrides || {}).filter((k) => k !== '_comment').length;
const OVERRIDE_COUNT_FLOOR = 2000;

// --- report ---------------------------------------------------------------------------------
const collisionsThatMatter = findings.NAME_COLLISION.filter((c) => !c.categoriesAgree);
const signalCollisions = findings.NAME_COLLISION.filter((c) => c.signalDisagreement);

console.log(`category audit — ${techs.length} technologies\n`);
console.log(`NAME_COLLISION      ${findings.NAME_COLLISION.length}  (${collisionsThatMatter.length} with differing categories, ${signalCollisions.length} where SIGNAL status differs)`);
console.log(`SIGNAL_CASE_DROP    ${findings.SIGNAL_CASE_DROP.length}`);
console.log(`CATEGORY_CASE       ${findings.CATEGORY_CASE.length}`);
console.log(`DUPLICATE_CATEGORY  ${findings.DUPLICATE_CATEGORY.length}`);
console.log(`UNKNOWN_CATEGORY    ${findings.UNKNOWN_CATEGORY.length}`);
console.log(`OVERRIDE_INVALID    ${findings.OVERRIDE_INVALID.length}`);
console.log(`OVERRIDE_COUNT      ${overrideCount}  (floor: ${OVERRIDE_COUNT_FLOOR})`);
console.log(`MISSING_SIGNAL      ${findings.MISSING_SIGNAL.length}  (heuristic screen, NOT gated — ` +
  `${findings.MISSING_SIGNAL.filter((f) => f.curated).length} in curated files)`);

if (signalCollisions.length) {
  console.log(`\nSIGNAL-DIFFERING NAME COLLISIONS — which spelling matched decides whether this`);
  console.log(`counts as a signal technology at all:`);
  for (const c of signalCollisions) {
    for (const v of c.variants) {
      console.log(`   ${v.name.padEnd(22)} ${JSON.stringify(v.categories).padEnd(46)} ${v.curated ? 'CURATED' : 'base'}`);
    }
    console.log('   ---');
  }
}

if (findings.SIGNAL_CASE_DROP.length) {
  console.log(`\nSIGNAL_CASE_DROP — signal by meaning, dropped by case-sensitive matching:`);
  for (const f of findings.SIGNAL_CASE_DROP) console.log(`   ${f.name.padEnd(22)} ${JSON.stringify(f.categories)}`);
}

if (findings.CATEGORY_CASE.length) {
  console.log(`\nCATEGORY_CASE — value differs from canonical only by case:`);
  const byVal = new Map();
  for (const f of findings.CATEGORY_CASE) {
    const k = `${f.got} → ${f.canonical}`;
    byVal.set(k, (byVal.get(k) || 0) + 1);
  }
  for (const [k, n] of [...byVal].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);
}

if (findings.UNKNOWN_CATEGORY.length) {
  console.log(`\nUNKNOWN_CATEGORY — outside the canonical vocabulary:`);
  const byVal = new Map();
  for (const f of findings.UNKNOWN_CATEGORY) byVal.set(f.category, (byVal.get(f.category) || 0) + 1);
  for (const [k, n] of [...byVal].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ${String(n).padStart(4)}  ${JSON.stringify(k)}`);
}

if (findings.OVERRIDE_INVALID.length) {
  console.log(`\nOVERRIDE_INVALID — patterns/category-overrides.json disagrees with the patterns on disk:`);
  for (const f of findings.OVERRIDE_INVALID) console.log(`   ${f.name.padEnd(34)} ${f.problem}`);
}

// --- prevalence-ranked semantic review list --------------------------------------------------
let prevalence = null;
if (USE_CORPUS) {
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const { classifyCapture } = require('../src/capture-quality.js');
  const CORPUS = path.resolve(__dirname, '..', process.env.CORPUS_DIR || 'corpus');
  if (!fs.existsSync(CORPUS)) {
    console.error(`\nFATAL: --corpus given but no corpus at ${CORPUS}`);
    process.exit(1);
  }
  // Only signal-category technologies — those are the ones whose categorisation changes behaviour.
  const signalNames = new Set(techs
    .filter(([, d]) => rawCats(d).map(mapCategory).some(looseSignal))
    .map(([n]) => n));
  for (const n of Object.keys(engine.patterns)) {
    if (n !== '_metadata' && !signalNames.has(n)) delete engine.patterns[n];
  }
  engine.domPlan = engine.buildDomPlan();

  const dirs = fs.readdirSync(CORPUS)
    .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
    .slice(0, LIMIT);
  const counts = new Map();
  const sets = new Map();
  let scanned = 0;
  for (const d of dirs) {
    const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
    if (!f) continue;
    const html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    if (!classifyCapture(html).scannable) continue; // UNI-231: never divide by unreadable pages
    scanned++;
    for (const h of engine.matchPatterns(evidenceFromHtml(html, engine.domPlan))) {
      counts.set(h.name, (counts.get(h.name) || 0) + 1);
      if (!sets.has(h.name)) sets.set(h.name, new Set());
      sets.get(h.name).add(d);
    }
  }
  prevalence = { scanned, counts: Object.fromEntries(counts) };

  // --- CO_OCCURRENCE_DUPLICATE --------------------------------------------------------------
  // Name matching cannot find the worst duplicates. `Slate` (higher-ed-infra, tagged Chatbot+SIS)
  // and `Slate (Technolutions)` (higher-ed-crm, tagged CRM) are the same product under names that
  // share no normalisable form — UNI-156 added the correct CRM entry but never retired the older
  // one. Detection sets do find them: identical sets mean identical product.
  //
  // Deliberately reports rather than merges. `Salesforce` ~ `TargetX` overlap at 0.57 because
  // TargetX is BUILT ON Salesforce — real co-occurrence, not duplication. Only near-identity is
  // strong evidence, and even that wants a human.
  const entries = [...sets].filter(([, s]) => s.size >= 5);
  findings.CO_OCCURRENCE_DUPLICATE = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [n1, s1] = entries[i];
      const [n2, s2] = entries[j];
      const inter = [...s1].filter((x) => s2.has(x)).length;
      if (!inter) continue;
      const jaccard = inter / new Set([...s1, ...s2]).size;
      if (jaccard < 0.95) continue;
      const c1 = rawCats(engine.patterns[n1]).map(mapCategory);
      const c2 = rawCats(engine.patterns[n2]).map(mapCategory);
      findings.CO_OCCURRENCE_DUPLICATE.push({
        names: [n1, n2],
        jaccard: Number(jaccard.toFixed(3)),
        institutions: [s1.size, s2.size],
        categories: [c1, c2],
        sources: [engine.patterns[n1]._sourceFile, engine.patterns[n2]._sourceFile],
        categoriesAgree: JSON.stringify([...c1].sort()) === JSON.stringify([...c2].sort()),
      });
    }
  }
  if (findings.CO_OCCURRENCE_DUPLICATE.length) {
    console.log(`\nCO_OCCURRENCE_DUPLICATE — near-identical detection sets (likely the same product`);
    console.log(`under two names, double-counted and possibly categorised differently):`);
    for (const d of findings.CO_OCCURRENCE_DUPLICATE) {
      console.log(`   J=${d.jaccard}  ${d.names[0]} (${d.institutions[0]}) ~ ${d.names[1]} (${d.institutions[1]})`);
      console.log(`         ${JSON.stringify(d.categories[0])} [${d.sources[0]}]`);
      console.log(`         ${JSON.stringify(d.categories[1])} [${d.sources[1]}]${d.categoriesAgree ? '' : '   ⚠️ CATEGORIES DISAGREE'}`);
    }
  }

  console.log(`\nSEMANTIC REVIEW QUEUE — signal-category technologies by measured prevalence`);
  console.log(`(${scanned} scannable institutions). Highest impact first; a miscategorised`);
  console.log(`technology firing on 100 institutions matters far more than one that never fires.\n`);
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [n, c] of rows) {
    const cats = rawCats(engine.patterns[n]).map(mapCategory);
    console.log(`   ${String(c).padStart(4)}  ${(c / scanned * 100).toFixed(1).padStart(5)}%  ${n.padEnd(30)} ${JSON.stringify(cats)}`);
  }
}

const out = path.resolve(__dirname, '../docs/category-audit.json');
fs.writeFileSync(out, JSON.stringify({ technologies: techs.length, findings, prevalence }, null, 2));
console.log(`\nwrote ${out}`);

if (GATE) {
  if (overrideCount < OVERRIDE_COUNT_FLOOR) {
    console.error(`\nFAIL: only ${overrideCount} override(s) loaded (floor: ${OVERRIDE_COUNT_FLOOR}) — ` +
      `patterns/category-overrides.json's \`overrides\` key looks empty or misnamed. Every ` +
      `human-adjudicated category correction would be silently disabled while the rest of this ` +
      `gate still passes clean.`);
    process.exit(1);
  }

  const fail = signalCollisions.length + findings.SIGNAL_CASE_DROP.length +
    findings.CATEGORY_CASE.length + findings.DUPLICATE_CATEGORY.length +
    findings.OVERRIDE_INVALID.length;
  if (fail) {
    console.error(`\nFAIL: ${signalCollisions.length} signal-differing collisions, ` +
      `${findings.SIGNAL_CASE_DROP.length} case-dropped signals, ` +
      `${findings.CATEGORY_CASE.length} miscased categories, ` +
      `${findings.DUPLICATE_CATEGORY.length} duplicate categories, ` +
      `${findings.OVERRIDE_INVALID.length} invalid overrides`);
    process.exit(1);
  }
  console.log('\nOK: no mechanical category defects.');
}
