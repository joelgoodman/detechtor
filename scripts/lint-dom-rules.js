#!/usr/bin/env node
/**
 * dom rule lint (UNI-224 Phase C)
 * ==============================
 * The companion to `lint-patterns.js`, covering the gap that let the dom defect ship.
 *
 * `lint-patterns.js` reads `html` + `scripts` ONLY, and its CI gate (`--fail-curated`) exempts
 * `webappanalyzer-merged.json`. So it could cite `[object Object]` → Pleroma in its own header and
 * still never look at a `dom` rule. Worse, every check it makes is SEMANTIC ("is this too broad?").
 * Nothing asked the STRUCTURAL question: "is this the shape the engine consumes?"
 *
 * This lint asks both:
 *
 *   STRUCTURAL — shape + selector parseability. Applied to EVERY file including the merged base,
 *                because imported and curated patterns may fairly differ on breadth but never on
 *                well-formedness. Fails the gate anywhere.
 *   SEMANTIC   — selector breadth. Curated files fail the gate; the merged base reports only,
 *                preserving the existing breadth exemption.
 *
 * Usage:
 *   node scripts/lint-dom-rules.js          # report
 *   node scripts/lint-dom-rules.js --gate   # exit 1 on any structural problem, or on a curated
 *                                           # breadth problem (CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { checkDomRules, admittedDomRules, isOverBroadRule } = require('../src/dom-rules.js');
const { normalizeDefinition, hasModifier } = require('../src/pattern-normalize.js');

const ROOT = path.resolve(__dirname, '..');
const PATTERNS_DIR = path.join(ROOT, 'patterns');
const CURATED_RE = /(higher-ed-|general-analytics-extensions|fediverse-social)/;
const GATE = process.argv.includes('--gate');

const structural = [];
const breadth = [];
const modifiers = [];   // on-disk values still carrying an upstream modifier (UNI-226)

for (const file of fs.readdirSync(PATTERNS_DIR).filter((f) => f.endsWith('.json'))) {
  if (file === 'dom-rule-denylist.json') continue;
  const curated = CURATED_RE.test(file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(PATTERNS_DIR, file), 'utf8'));
  } catch (e) {
    structural.push({ file, tech: '(file)', kind: 'json', message: e.message });
    continue;
  }
  for (const [tech, def] of Object.entries(data.technologies || data)) {
    if (tech === '_metadata' || !def || typeof def !== 'object' || def.dom === undefined) continue;

    // UNI-226: lint what the ENGINE will see, not the raw file. The engine strips upstream
    // `\;confidence:NN` / `\;version:\1` suffixes at load, so linting the raw value would report
    // selectors as unparseable that are in fact fine — and, worse, would keep passing once the
    // on-disk files are eventually cleaned. Count the debt separately instead.
    if (hasModifier(JSON.stringify(def.dom))) modifiers.push({ file, tech });
    normalizeDefinition(def);

    const { problems } = checkDomRules(tech, def);
    for (const p of problems) structural.push({ file, curated, ...p });

    // Breadth is only meaningful for rules that survive admission.
    let rules = [];
    try {
      rules = admittedDomRules(tech, def);
    } catch {
      continue; // already reported structurally
    }
    for (const r of rules) {
      if (isOverBroadRule(r)) {
        breadth.push({ file, curated, tech, selector: r.selector, kind: r.kind });
      }
    }
  }
}

const curatedBreadth = breadth.filter((b) => b.curated);

console.log(`dom rule lint — ${structural.length} structural, ${breadth.length} breadth ` +
  `(${curatedBreadth.length} in curated files), ${modifiers.length} carrying on-disk modifiers`);

if (modifiers.length) {
  console.log(`\nMODIFIERS — ${modifiers.length} dom field(s) still carry an upstream ` +
    `\\;confidence / \\;version suffix on disk.`);
  console.log('  Harmless at runtime: the engine strips them at load (UNI-226). This is data debt,');
  console.log('  cleared by re-running `npm run update-patterns`, which now strips at import.');
  console.log('  NOT gated — a stale on-disk file must not be able to fail a build.');
}

if (structural.length) {
  console.log('\nSTRUCTURAL — the engine cannot evaluate these (silent death):');
  for (const s of structural) console.log(`  ${s.file}  ${s.tech} [${s.kind}]: ${s.message}`);
}

if (breadth.length) {
  console.log('\nBREADTH — selector likely fires far beyond its technology:');
  for (const b of breadth) {
    console.log(`  ${b.curated ? 'CURATED' : 'base   '}  ${b.file}  ${b.tech}: ${b.selector}`);
  }
  console.log('\n  Note: breadth heuristics catch short-token substring matches and bare element');
  console.log('  names. They do NOT catch a long-but-generic token such as');
  console.log("  link[type*='application'] (matches json, json+oembed, rsd+xml as well as rss+xml).");
  console.log('  That class is caught by the base-rate report, not by a lint.');
}

if (GATE) {
  const fail = structural.length > 0 || curatedBreadth.length > 0;
  if (fail) {
    console.error(`\nFAIL: ${structural.length} structural + ${curatedBreadth.length} curated breadth`);
    process.exit(1);
  }
  console.log('\nOK: no structural problems; no curated breadth problems.');
}
