#!/usr/bin/env node
// scripts/mine-local.js — offline recall/spot-check of a candidate signature against the local corpus.
// Mirrors mine-signature.js metrics but matches locally (inline DB HTML is offloaded post-UNI-119).
// ORACLE CAVEAT: BuiltWith is a GOOD POSITIVE, BAD NEGATIVE oracle. neg_hit_pct is NOT precision —
// a dedicated vendor host with a few % neg-hits is almost always finding BuiltWith's OWN misses.
const fs = require('fs');
const path = require('path');

const CORPUS_DIR = process.env.CORPUS_DIR || path.resolve(__dirname, '../corpus');

function parseArgs(argv) {
  const a = { signatures: [], field: 'html' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--signature') a.signatures.push(argv[++i]);
    else if (argv[i] === '--pos-ids') a.posIds = argv[++i];
    else if (argv[i] === '--field') a.field = argv[++i];
    else if (argv[i] === '--spotcheck') a.spotcheck = true;
  }
  return a;
}
const scriptSrcs = (html) => [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).join('\n');
function instMatches(htmlPaths, res, field) {
  return htmlPaths.some(p => {
    const html = fs.readFileSync(p, 'utf8');
    const hay = field === 'scripts' ? scriptSrcs(html) : html;
    return res.some(re => re.test(hay));
  });
}
function main() {
  const a = parseArgs(process.argv);
  const res = a.signatures.map(s => new RegExp(s, 'i'));
  const index = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, 'index.json'), 'utf8'));
  const posIds = new Set(JSON.parse(fs.readFileSync(a.posIds, 'utf8')).map(String));
  let posTotal = 0, posHtml = 0, posHit = 0, negHtml = 0, negHit = 0;
  const negHits = [], posMiss = [];
  for (const [id, paths] of Object.entries(index)) {
    const isPos = posIds.has(String(id));
    const hit = instMatches(paths, res, a.field);
    if (isPos) { posTotal++; posHtml++; if (hit) posHit++; else posMiss.push(id); }
    else { negHtml++; if (hit) { negHit++; negHits.push(id); } }
  }
  // pos ids with no corpus HTML at all:
  for (const id of posIds) if (!index[id]) posTotal++;
  const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
  console.table([{ pos_total: posTotal, pos_with_html: posHtml, pos_hit: posHit, recall_pct: pct(posHit, posHtml),
    neg_with_html: negHtml, neg_hit: negHit, neg_hit_pct: pct(negHit, negHtml) }]);
  if (a.spotcheck) {
    console.log('NEG-HITS (eyeball: BuiltWith miss vs real FP):', negHits.slice(0, 12));
    console.log('POS-MISS (recall gaps):', posMiss.slice(0, 12));
  }
}
main();
