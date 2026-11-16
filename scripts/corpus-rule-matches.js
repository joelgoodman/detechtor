#!/usr/bin/env node
// scripts/corpus-rule-matches.js — re-run this engine over a producer corpus and keep the rule matches.
//
// Reads a benchmark-agent producer corpus (<corpus>/<institution_id>/pages.json + the archived HTML) and the
// producer artifact that was made from it, re-evaluates exactly the pages the artifact marks `evaluated`
// with THIS checkout's engine (page URL included, so `matches[].firstParty` is filled), and writes one JSON
// line per detection in the chosen categories:
//
//   {institution_id, scan_page_id, page_type, url, name, categories, rules, matches, operatedBy?}
//
// Read-only on the corpus and the artifact; writes only --out. No network.
//
//   node scripts/corpus-rule-matches.js --corpus <dir> --artifact <file.jsonl.gz> --out <file.jsonl>
//        [--workers 8] [--categories "CMS,CRM,Marketing Automation,Chatbot,Accessibility,Site Search"] [--ids 1,2]
//
// Used for the `_hosts` survey (which hosts a vendor's rules match outside its declared domains) and for
// regrading a load against artifact schema 2.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const LEDGER_CATEGORIES = ['CMS', 'CRM', 'Marketing Automation', 'Chatbot', 'Accessibility', 'Site Search'];

if (!isMainThread) {
  const DeTECHtor = require('../src/detechtor.js');
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const log = console.log;
  console.log = () => {};
  const engine = new DeTECHtor();
  console.log = log;
  const cats = new Set(workerData.categories);
  parentPort.on('message', ({ id, file, url, jsGlobals, meta }) => {
    let out = [];
    try {
      const html = fs.readFileSync(file, 'utf8');
      const evidence = evidenceFromHtml(html, engine.domPlan, { jsGlobals, pageUrl: url });
      out = engine.matchPatterns(evidence)
        .filter((t) => (t.categories || []).some((c) => cats.has(c)))
        .map((t) => ({ ...meta, url, name: t.name, categories: t.categories, rules: t.evidence, matches: t.matches,
          ...(t.operatedBy ? { operatedBy: t.operatedBy } : {}) }));
      parentPort.postMessage({ id, out });
    } catch (e) {
      parentPort.postMessage({ id, error: String(e && e.message || e).slice(0, 300) });
    }
  });
  parentPort.postMessage({ ready: true });
  return;
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const CORPUS = path.resolve(arg('--corpus', ''));
const ARTIFACT = path.resolve(arg('--artifact', ''));
const OUT = path.resolve(arg('--out', 'rule-matches.jsonl'));
const WORKERS = Math.max(1, Number(arg('--workers', 8)));
const CATEGORIES = arg('--categories') ? arg('--categories').split(',').map((s) => s.trim()) : LEDGER_CATEGORIES;
const IDS = arg('--ids') ? new Set(arg('--ids').split(',').map(Number)) : null;
if (!arg('--corpus') || !arg('--artifact')) {
  console.error('usage: corpus-rule-matches.js --corpus <dir> --artifact <file.jsonl.gz> --out <file.jsonl>');
  process.exit(2);
}

// The pages to evaluate: exactly those the artifact evaluated.
const lines = zlib.gunzipSync(fs.readFileSync(ARTIFACT)).toString('utf8').split('\n').filter(Boolean);
const jobs = [];
for (const l of lines.slice(1)) {
  const inst = JSON.parse(l);
  if (IDS && !IDS.has(inst.institution_id)) continue;
  const evaluated = new Set(inst.pages.filter((p) => p.outcome === 'evaluated').map((p) => p.scan_page_id));
  if (!evaluated.size) continue;
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(path.join(CORPUS, String(inst.institution_id), 'pages.json'), 'utf8'));
  } catch { continue; }
  for (const e of entries) {
    if (!evaluated.has(e.scan_page_id) || !e.file) continue;
    jobs.push({
      file: path.join(CORPUS, String(inst.institution_id), e.file),
      url: e.url || null,
      jsGlobals: Array.isArray(e.js_globals) ? e.js_globals : undefined,
      meta: { institution_id: inst.institution_id, scan_page_id: e.scan_page_id, page_type: e.page_type },
    });
  }
}

const t0 = Date.now();
const out = fs.createWriteStream(OUT);
let next = 0;
let done = 0;
let errors = 0;
const results = new Array(jobs.length);
let flushed = 0;
const flush = () => {
  while (flushed < jobs.length && results[flushed] !== undefined) {
    for (const r of results[flushed]) out.write(`${JSON.stringify(r)}\n`);
    results[flushed] = null;
    flushed++;
  }
};
console.log(`${jobs.length} pages on ${WORKERS} workers`);
const run = () => new Promise((resolve) => {
  const w = new Worker(__filename, { workerData: { categories: CATEGORIES } });
  const send = () => {
    if (next >= jobs.length) { w.terminate().then(resolve); return; }
    const id = next++;
    w.postMessage({ id, ...jobs[id] });
  };
  w.on('message', (m) => {
    if (m.ready) { send(); return; }
    if (m.error) { errors++; results[m.id] = []; } else results[m.id] = m.out;
    done++;
    if (done % 1000 === 0) console.log(`  ${done}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    flush();
    send();
  });
  w.on('error', (e) => { console.error(e); resolve(); });
});
Promise.all(Array.from({ length: WORKERS }, run)).then(() => {
  flush();
  out.end();
  console.log(JSON.stringify({ pages: jobs.length, errors, wall_s: +((Date.now() - t0) / 1000).toFixed(1), out: OUT }));
});
