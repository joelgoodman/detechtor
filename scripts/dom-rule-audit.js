#!/usr/bin/env node
// scripts/dom-rule-audit.js — Phase A of the dom shape-contract work.
//
// WHY: 1,456 techs carry `dom` rules and, on current main, NONE can fire (the engine tested a
// fixed six-key `evidence.dom` bag while patterns key `dom` on CSS selectors). Those rules are
// therefore UNEXECUTED — not known-good and not known-bad. Before the engine is taught to run
// them, we measure what each one would actually do against real pages.
//
// WHAT: evaluates every dom rule, in all three on-disk shapes, against the local corpus of
// cohort-128 rendered HTML (corpus/index.json). Corpus pages come from page.content(), which
// serializes the RENDERED DOM, so JS-injected markup is present and this is a faithful offline
// proxy for live selector matching.
//
// Prevalence is measured PER INSTITUTION, not per page — the denominator that makes base-rate
// nonsense visible. Pleroma at 4,575 detections / 4,459 institutions was >100% and nothing looked.
//
// Rules are evaluated IN FULL: a selector match is necessary but not sufficient where a paired
// regex exists. Curated Pleroma's `noscript` selector alone fires on ~73% of real university
// homepages; its text regex is what makes the rule sound. Auditing selectors alone lies.
//
// Usage:
//   node scripts/dom-rule-audit.js                # full corpus
//   DOM_AUDIT_SAMPLE=10 node scripts/dom-rule-audit.js   # every 10th institution
//
// Output: docs/dom-rule-ledger.json + a console summary.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { normalizeDomRules } = require(path.resolve(__dirname, '../src/dom-rules.js'));

const REPO = path.resolve(__dirname, '..');
const SAMPLE = Number(process.env.DOM_AUDIT_SAMPLE) || 1;
const OUT = path.join(REPO, 'docs/dom-rule-ledger.json');

// Admission thresholds — see the design spec. Tunable here, not hardcoded at call sites.
const PLAUSIBLE_MAX = 0.10;
const REVIEW_MAX = 0.40;

function bucket(rate) {
  if (rate === 0) return 'UNVALIDATED';
  if (rate <= PLAUSIBLE_MAX) return 'PLAUSIBLE';
  if (rate <= REVIEW_MAX) return 'REVIEW';
  return 'IMPLAUSIBLE';
}

// ---- 1. Load patterns exactly as the engine sees them (post load-order override) ----------
const d = new DeTECHtor();
d.patterns = d.loadPatterns();

const rules = [];
const shapeErrors = [];
for (const [tech, def] of Object.entries(d.patterns)) {
  if (tech === '_metadata' || !def || typeof def !== 'object' || def.dom === undefined) continue;
  let normalized;
  try {
    normalized = normalizeDomRules(def);
  } catch (err) {
    // A shape the contract cannot represent. Record it — this is exactly what the Phase C
    // load-time validator will refuse, so the ledger must show how many exist today.
    shapeErrors.push({ tech, sourceFile: def._sourceFile || null, error: err.message });
    continue;
  }
  for (const r of normalized) {
    const entry = {
      tech,
      sourceFile: def._sourceFile || null,
      curated: def._curated === true,
      selector: r.selector,
      kind: r.kind,
      name: r.name,
      regex: r.regex,
      hits: 0,
      selectorHits: 0, // selector matched but the paired regex did not — measures rule tightening
      status: 'ok',
    };
    if (r.regex !== undefined) {
      try {
        entry._re = new RegExp(r.regex, 'i');
      } catch {
        entry.status = 'invalid-regex';
      }
    }
    if (r.kind === 'properties') {
      // cheerio parses markup; it has no DOM property model. Report honestly rather than
      // silently approximating with attributes.
      entry.status = 'unsupported-offline';
    }
    rules.push(entry);
  }
}

// Dedupe selectors — the expensive part is the query, and many rules share a selector.
const selectorSet = [...new Set(rules.map((r) => r.selector))];
const selectorOk = new Map();
for (const s of selectorSet) {
  try {
    cheerio.load('<div></div>')(s);
    selectorOk.set(s, true);
  } catch {
    selectorOk.set(s, false);
  }
}
for (const r of rules) {
  if (r.status === 'ok' && !selectorOk.get(r.selector)) r.status = 'unparseable-selector';
}

const evaluable = rules.filter((r) => r.status === 'ok');

// ---- 2. Walk the corpus, one institution at a time ---------------------------------------
const idx = JSON.parse(fs.readFileSync(path.join(REPO, 'corpus/index.json'), 'utf8'));
const institutions = Object.keys(idx).filter((_, i) => i % SAMPLE === 0);

console.log(
  `dom-rule-audit: ${rules.length} rules (${evaluable.length} evaluable) over ${selectorSet.length} distinct selectors`,
);
console.log(`corpus: ${institutions.length} institutions (sample=1/${SAMPLE})\n`);

// Index rules by selector so each query result is reused by every rule sharing it.
const bySelector = new Map();
for (const r of evaluable) {
  if (!bySelector.has(r.selector)) bySelector.set(r.selector, []);
  bySelector.get(r.selector).push(r);
}

let read = 0;
let skipped = 0;
const t0 = Date.now();

for (let i = 0; i < institutions.length; i++) {
  const firedThisInst = new Set();
  const selectorFiredThisInst = new Set();

  for (const rel of idx[institutions[i]]) {
    let html;
    try {
      html = fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(REPO, rel), 'utf8');
    } catch {
      skipped++;
      continue;
    }
    read++;
    let $;
    try {
      $ = cheerio.load(html);
    } catch {
      continue;
    }

    for (const [selector, selRules] of bySelector) {
      let els;
      try {
        els = $(selector);
      } catch {
        continue;
      }
      if (els.length === 0) continue;

      for (const r of selRules) {
        selectorFiredThisInst.add(r);
        if (r.kind === 'exists') {
          firedThisInst.add(r);
          continue;
        }
        let matched = false;
        els.each((_, el) => {
          if (matched) return false;
          if (r.kind === 'text') {
            if (r._re.test($(el).text())) matched = true;
          } else if (r.kind === 'attributes') {
            const v = $(el).attr(r.name);
            if (v !== undefined && (r.regex === '' || r._re.test(v))) matched = true;
          }
          return undefined;
        });
        if (matched) firedThisInst.add(r);
      }
    }
  }

  for (const r of firedThisInst) r.hits++;
  for (const r of selectorFiredThisInst) r.selectorHits++;

  if ((i + 1) % 250 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(
      `  ${i + 1}/${institutions.length} institutions · ${el.toFixed(0)}s · eta ${(
        (el / (i + 1)) * (institutions.length - i - 1)
      ).toFixed(0)}s`,
    );
  }
}

// ---- 3. Ledger ---------------------------------------------------------------------------
const denom = institutions.length;
for (const r of rules) {
  delete r._re;
  r.instFireRate = denom ? r.hits / denom : 0;
  r.selectorFireRate = denom ? r.selectorHits / denom : 0;
  r.bucket = r.status === 'ok' ? bucket(r.instFireRate) : 'NOT-EVALUATED';
}

const counts = {};
for (const r of rules) counts[r.bucket] = (counts[r.bucket] || 0) + 1;

const ledger = {
  generatedFrom: {
    corpusInstitutions: denom,
    corpusPagesRead: read,
    corpusPagesMissing: skipped,
    sample: SAMPLE,
    thresholds: { PLAUSIBLE_MAX, REVIEW_MAX },
  },
  caveats: [
    'Corpus is cohort-128, roughly one page (homepage) per institution: technologies that appear only on deeper pages read low.',
    'cheerio is a markup parser with no DOM property model, so `properties` rules are unsupported offline.',
    'Corpus HTML is rendered-then-serialized, so JS-injected markup IS present.',
  ],
  shapeErrors,
  counts,
  rules: rules.sort((a, b) => b.instFireRate - a.instFireRate),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(ledger, null, 2));

console.log(`\n=== dom rule ledger (${denom} institutions, ${read} pages) ===`);
console.log(counts);
console.log(`shape-contract violations: ${shapeErrors.length}`);

const fired = rules.filter((r) => r.status === 'ok' && r.hits > 0);
console.log(`\nTop 30 by institution prevalence:`);
for (const r of fired.slice(0, 30)) {
  console.log(
    `  ${(r.instFireRate * 100).toFixed(1).padStart(5)}%  ${r.bucket.padEnd(12)} ${r.curated ? 'CURATED' : 'base   '} ${r.tech}  ${r.kind}  ${r.selector.slice(0, 60)}`,
  );
}

const curated = rules.filter((r) => r.curated);
console.log(`\nCurated dom rules (${curated.length}):`);
for (const r of curated) {
  console.log(
    `  ${(r.instFireRate * 100).toFixed(1).padStart(5)}%  ${r.bucket.padEnd(12)} ${r.tech} [${r.sourceFile}] ${r.kind} ${r.selector}` +
      (r.selectorHits !== r.hits ? `  (selector alone: ${(r.selectorFireRate * 100).toFixed(1)}%)` : ''),
  );
}
console.log(`\nledger → ${path.relative(REPO, OUT)}`);
