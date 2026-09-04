#!/usr/bin/env node
/**
 * Supervised pattern mining from ground truth (UNI-141 prototype)
 * ===============================================================
 * Every pattern in this engine was GUESSED — most by an LLM during the webappanalyzer import, the
 * rest hand-written. UNI-237 spent its effort deleting the ones that fire wrongly, which is
 * subtractive: it cannot tell you what a *correct* pattern would be. This derives them instead.
 *
 * Method: take institutions where an independent source says technology X is present, take the
 * ones where it is not, and keep the strings that separate them. No model, no judgement, just
 * counting. Corpus directory names are `institutions.id`, so ground truth joins directly.
 *
 * Ground truth available today:
 *   - BuiltWith  `institutions.tech_profile` — 5,704 institutions, 25 curated categories
 *   - WhatCMS    `scans.whatcms_cms`         — 3,131 institutions, cohort 107 only
 *
 * ⚠️ WHAT THIS CANNOT DO, measured 2026-08-11 on three calibration cases:
 *
 *   UserWay     BuiltWith 462 · we detect 165 · mined `cdn.userway.org` at 62% recall, 0 of 800
 *               false positives — but only 163 corpus files contain it, so the GUESSED pattern
 *               `userway\.org` was already at the ceiling. NO GAIN.
 *   Osano       BuiltWith 382 · we detect 17 · nothing above noise. Its marker is injected at
 *               runtime and is simply absent from the archived HTML. Not a pattern problem, and
 *               no amount of mining will make it one.
 *   Sitefinity  BuiltWith 64 · we detect 0, no pattern at all · mined the `data-sf-*` family
 *               (data-sf-element, data-sf-role, data-sf-marked) with 0–1 false positives. 0 → 24.
 *               REAL GAIN.
 *
 * So: guessing has cost us COVERAGE, not precision. Mining pays off on technologies we do not
 * model at all. For ones we already model, the limiting factor is capture fidelity — what the
 * scanner archives — not pattern quality. That is C12/C13/C14, not this script.
 *
 * A "no markers found" result is therefore a FINDING, not a failure: it means stop writing
 * patterns and go fix the capture.
 *
 * Usage:
 *   node scripts/mine-patterns.js --tech "Sitefinity" --ids 33,126,218,...
 *   node scripts/mine-patterns.js --tech "Sitefinity" --ids-file /tmp/ids.txt [--json]
 *
 * Get the ids from BuiltWith with:
 *   SELECT string_agg(DISTINCT i.id::text, ',' ORDER BY i.id::text)
 *   FROM institutions i,
 *        LATERAL jsonb_each(i.tech_profile->'categories') cat(key,val),
 *        LATERAL jsonb_array_elements(COALESCE(cat.val->'current','[]'::jsonb)) e
 *   WHERE i.status='active' AND (e->>'is_current')::bool AND e->>'name' = 'Sitefinity';
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORPUS = path.resolve(ROOT, process.env.CORPUS_DIR || 'corpus');

// --- thresholds -------------------------------------------------------------------------------
const MIN_POS_RATE = 0.03;   // a marker must cover at least this share of positives
const MIN_POS_ABS = 3;       // ...and at least this many, so tiny positive sets cannot fluke
const MAX_NEG_RATE = 0.02;   // ...and appear on at most this share of negatives
const NEG_SAMPLE = 800;      // negatives sampled evenly; precision needs a representative denominator

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const tech = arg('--tech');
const idsFile = arg('--ids-file');
const idsArg = arg('--ids');
const AS_JSON = process.argv.includes('--json');

if (!tech || (!idsArg && !idsFile)) {
  console.error('Usage: node scripts/mine-patterns.js --tech "<name>" (--ids a,b,c | --ids-file <path>)');
  process.exit(1);
}
if (!fs.existsSync(CORPUS)) {
  console.error(`FATAL: no corpus at ${CORPUS}. Set CORPUS_DIR or fetch it with scripts/wasabi-corpus.js.`);
  process.exit(1);
}

const rawIds = idsFile ? fs.readFileSync(idsFile, 'utf8') : idsArg;
const posIds = new Set(rawIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
if (posIds.size === 0) {
  console.error('FATAL: no positive institution ids supplied — nothing to learn from.');
  process.exit(1);
}

/**
 * Reject tokens that would look perfect on this corpus and break on the next scan.
 *
 * The prototype ranked `widget_app_base_1783421028734` and `sha256-ak8f...` in its top five for
 * UserWay: both are build- or session-specific and would have been committed as patterns with
 * apparently flawless precision, then silently stopped matching at the next deploy. Any miner
 * without this guard produces patterns that rot within a week — the exact failure mode that makes
 * derived patterns look no better than guessed ones.
 */
function isOverfit(token) {
  const t = token.replace(/^(HOST|TOK|META) /, '');
  if (/\d{6,}/.test(t)) return true;                                  // epoch / build number
  if (/\b(sha\d{3}|md5|nonce|csrf|sessionid|jsessionid)\b/i.test(t)) return true;
  if (/[a-f0-9]{16,}/i.test(t)) return true;                          // hex digest
  const digits = (t.match(/\d/g) || []).length;
  if (t.length >= 12 && digits / t.length > 0.3) return true;         // mostly-numeric identifier
  return false;
}

function candidates(html) {
  const out = new Set();
  // Hostnames are the highest-value marker class — instructure.com, technolutions.net and
  // funnelback.squiz.cloud all came out this way, and a vendor domain cannot collide with prose.
  for (const m of html.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) out.add('HOST ' + m[1].toLowerCase());
  // Hyphen/underscore compounds: data-sf-element, data-uw-rm-ignore, wp-content.
  for (const m of html.matchAll(/\b([a-z][a-z0-9]{2,}(?:[-_][a-z0-9]{2,}){1,3})\b/gi)) {
    const t = m[1].toLowerCase();
    if (t.length >= 6 && t.length <= 40) out.add('TOK ' + t);
  }
  for (const m of html.matchAll(/<meta[^>]+name=["']([^"']+)["']/gi)) out.add('META ' + m[1].toLowerCase());
  return out;
}

function readCapture(dir) {
  try {
    const f = fs.readdirSync(path.join(CORPUS, dir)).find((x) => x.endsWith('.html'));
    return f ? fs.readFileSync(path.join(CORPUS, dir, f), 'utf8') : null;
  } catch { return null; }
}

const allDirs = fs.readdirSync(CORPUS).filter((d) => /^\d+$/.test(d));
const pos = [], neg = [];
for (const d of allDirs) (posIds.has(d) ? pos : neg).push(d);
const stride = Math.max(1, Math.floor(neg.length / NEG_SAMPLE));
const negSample = neg.filter((_, i) => i % stride === 0).slice(0, NEG_SAMPLE);

const posCount = Object.create(null), negCount = Object.create(null);
let posRead = 0, negRead = 0;
for (const d of pos) { const h = readCapture(d); if (!h) continue; posRead++; for (const c of candidates(h)) posCount[c] = (posCount[c] || 0) + 1; }
for (const d of negSample) { const h = readCapture(d); if (!h) continue; negRead++; for (const c of candidates(h)) negCount[c] = (negCount[c] || 0) + 1; }

// A positive institution with no capture teaches nothing, and pretending otherwise inflates recall.
const missing = posIds.size - posRead;

const rows = [];
let rejectedOverfit = 0;
for (const [c, pc] of Object.entries(posCount)) {
  if (pc < Math.max(MIN_POS_ABS, posRead * MIN_POS_RATE)) continue;
  const nc = negCount[c] || 0;
  if (nc / negRead > MAX_NEG_RATE) continue;
  if (isOverfit(c)) { rejectedOverfit++; continue; }
  rows.push({ marker: c, posN: pc, recall: pc / posRead, negN: nc, negRate: nc / negRead });
}
rows.sort((a, b) => b.recall - a.recall || a.negN - b.negN);

if (AS_JSON) {
  console.log(JSON.stringify({
    tech, positivesKnown: posIds.size, positivesRead: posRead, positivesMissingCapture: missing,
    negativesSampled: negRead, rejectedOverfit, markers: rows,
  }, null, 2));
} else {
  console.log(`\n${tech} — ${posRead} positive captures read (${posIds.size} known, ${missing} with no capture), ${negRead} negatives sampled`);
  if (rejectedOverfit) console.log(`${rejectedOverfit} candidate(s) rejected as build-specific (see isOverfit)`);
  console.log('');
  if (!rows.length) {
    console.log('NO MARKERS FOUND.');
    console.log('');
    console.log('This is a finding, not a failure. It means the technology leaves nothing in the');
    console.log('archived HTML — typically because it is injected at runtime by a tag manager. No');
    console.log('pattern can recover it; the fix is capture fidelity (js/cookies/headers, C12/C13/C14),');
    console.log('not pattern authoring. Osano behaves exactly this way: BuiltWith sees 382, the corpus');
    console.log('contains its marker on 17.');
  } else {
    console.log('recall   posN   negN  marker');
    for (const r of rows.slice(0, 25)) {
      console.log(`${(r.recall * 100).toFixed(0).padStart(5)}%  ${String(r.posN).padStart(5)}  ${String(r.negN).padStart(5)}  ${r.marker}`);
    }
    console.log('');
    console.log('Before adopting any of these, check what the marker actually detects corpus-wide');
    console.log('(`grep -rlaiF -- "<marker>" corpus | wc -l`) and compare against what the CURRENT');
    console.log('pattern already detects. On UserWay the mined marker matched 163 files while the');
    console.log('existing guessed pattern already caught 165 — a perfect-looking result worth nothing.');
  }
}
