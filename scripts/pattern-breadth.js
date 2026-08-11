#!/usr/bin/env node
/**
 * Per-pattern breadth measurement (UNI-237)
 * =========================================
 * corpus-prevalence.js answers "how many institutions run X". This answers the question that
 * actually finds false positives: "which of X's patterns claimed it, and did anything else agree?"
 *
 * For each html regex we record how many homepages it matched. For each technology we record the
 * best match count among its NON-html channels. The difference —
 *
 *     excess = max(0, htmlPatternMatches - strongestNonHtmlMatches)
 *
 * — is collision mass: homepages where an html substring asserted the technology and no independent
 * signal backed it up. `Bootstrap`'s `class=".*row"` matches ~70% of homepages while its script
 * marker matches far fewer; that gap is the false positives.
 *
 * ⚠️ Corpus captures are bare rendered HTML. evidenceFromHtml supplies no jsGlobals, cookies,
 * headers, finalUrl or networkHosts, so the js/cookies/headers/url/xhr channels CANNOT fire here.
 * That is recorded in the artifact as channelsNotProbed. A zero in this file means "not measurable
 * from a static capture", never "absent in production".
 *
 * ⚠️ A crashed or killed shard must never look like a valid, merely-smaller result — every shard's
 * exit is checked and the totals reconciled, exactly as in corpus-prevalence.js.
 *
 * Usage:
 *   node scripts/pattern-breadth.js [--limit N] [--shards N]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORPUS = path.resolve(ROOT, process.env.CORPUS_DIR || 'corpus');
const CHANNELS_NOT_PROBED = ['js', 'cookies', 'headers', 'url', 'xhr'];

function listDirs() {
  return fs.readdirSync(CORPUS)
    .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
    .sort();
}

// ---------- child ----------
if (process.env.BREADTH_SHARD !== undefined) {
  const DeTECHtor = require('../src/detechtor.js');
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const { classifyCapture } = require('../src/capture-quality.js');

  const shard = Number(process.env.BREADTH_SHARD);
  const shards = Number(process.env.BREADTH_SHARDS);
  const limit = Number(process.env.BREADTH_LIMIT || 0);

  const engine = new DeTECHtor();
  let dirs = listDirs();
  if (limit) dirs = dirs.slice(0, limit);
  dirs = dirs.filter((_, i) => i % shards === shard);

  // tech -> { fires, html: {regex: n}, other: {label: n} }
  const acc = Object.create(null);
  let scanned = 0, unscannable = 0, readFailures = 0, classifyFailures = 0, matchFailures = 0;

  for (const d of dirs) {
    let html;
    try {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      if (!f) { readFailures++; continue; }
      html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    } catch { readFailures++; continue; }

    let quality;
    try { quality = classifyCapture(html); } catch { classifyFailures++; continue; }
    if (!quality.scannable) { unscannable++; continue; }
    scanned++;

    let matches;
    try { matches = engine.matchPatterns(evidenceFromHtml(html, engine.domPlan)); }
    catch { matchFailures++; continue; }

    for (const m of matches) {
      const a = acc[m.name] || (acc[m.name] = { fires: 0, html: Object.create(null), other: Object.create(null) });
      a.fires++;
      // Count each distinct pattern at most once per homepage: we are measuring "on how many pages
      // did this regex match", not "how many times did it match on a page".
      const seen = new Set();
      for (const ev of m.evidence || []) {
        const s = String(ev);
        const i = s.indexOf(': ');
        if (i === -1) continue;
        const kind = s.slice(0, i);
        const body = s.slice(i + 2);
        const key = JSON.stringify([kind, body]);
        if (seen.has(key)) continue;
        seen.add(key);
        if (kind === 'HTML') a.html[body] = (a.html[body] || 0) + 1;
        else a.other[key] = (a.other[key] || 0) + 1;
      }
    }
  }

  process.send(
    { scanned, unscannable, readFailures, classifyFailures, matchFailures, acc },
    () => process.exit(0)
  );
} else {
  // ---------- parent ----------
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const LIMIT = li === -1 ? 0 : Number(args[li + 1]);
  const si = args.indexOf('--shards');
  const SHARDS = si === -1 ? Math.max(1, Math.min(os.cpus().length - 2, 12)) : Number(args[si + 1]);

  if (!Number.isInteger(SHARDS) || SHARDS < 1) {
    console.error(`FATAL: --shards must be a positive integer, got ${JSON.stringify(args[si + 1])}.`);
    process.exit(1);
  }
  if (li !== -1 && (!Number.isFinite(LIMIT) || LIMIT < 1)) {
    console.error(`FATAL: --limit must be a positive number, got ${JSON.stringify(args[li + 1])}.`);
    process.exit(1);
  }
  if (!fs.existsSync(CORPUS)) {
    console.error(`FATAL: no corpus at ${CORPUS}. Set CORPUS_DIR or fetch it with scripts/wasabi-corpus.js.`);
    process.exit(1);
  }

  const total = LIMIT || listDirs().length;
  console.log(`pattern breadth — ${total} captures across ${SHARDS} shards\n`);

  const merged = {
    scanned: 0, unscannable: 0, readFailures: 0, classifyFailures: 0, matchFailures: 0,
    acc: Object.create(null),
  };
  let done = 0;
  let anyFailure = false;

  for (let i = 0; i < SHARDS; i++) {
    let gotMessage = false;
    let settled = false;

    const child = fork(__filename, [], {
      env: { ...process.env, BREADTH_SHARD: String(i), BREADTH_SHARDS: String(SHARDS), BREADTH_LIMIT: String(LIMIT) },
    });

    const settle = () => {
      if (settled) return;
      settled = true;
      done++;
      console.log(`  shard ${done}/${SHARDS} settled`);
      if (done === SHARDS) finish();
    };

    child.on('message', (m) => {
      gotMessage = true;
      merged.scanned += m.scanned;
      merged.unscannable += m.unscannable;
      merged.readFailures += m.readFailures;
      merged.classifyFailures += m.classifyFailures;
      merged.matchFailures += m.matchFailures;
      for (const [tech, a] of Object.entries(m.acc)) {
        const t = merged.acc[tech] || (merged.acc[tech] = { fires: 0, html: Object.create(null), other: Object.create(null) });
        t.fires += a.fires;
        for (const [k, v] of Object.entries(a.html)) t.html[k] = (t.html[k] || 0) + v;
        for (const [k, v] of Object.entries(a.other)) t.other[k] = (t.other[k] || 0) + v;
      }
    });

    child.on('error', (err) => {
      console.error(`FATAL: shard ${i} process error: ${err.message}`);
      anyFailure = true;
      settle();
    });

    child.on('exit', (code) => {
      if (code !== 0 || !gotMessage) {
        console.error(
          `FATAL: shard ${i} exited with code ${code}${gotMessage ? '' : ' and sent no result'} — its contribution is lost.`
        );
        anyFailure = true;
      }
      settle();
    });
  }

  function finish() {
    if (anyFailure) {
      console.error('\nFATAL: one or more shards failed — refusing to write a partial artifact.');
      process.exit(1);
    }

    const accounted = merged.scanned + merged.unscannable + merged.readFailures + merged.classifyFailures;
    if (accounted !== total) {
      console.error(
        `FATAL: accounted directories (${accounted}) != intended directories (${total}) — ` +
        'some input was silently dropped. Refusing to write a partial artifact.'
      );
      process.exit(1);
    }

    const patterns = Object.create(null);
    for (const tech of Object.keys(merged.acc).sort()) {
      const a = merged.acc[tech];
      const strongest = Object.values(a.other).reduce((m, v) => (v > m ? v : m), 0);
      const htmlSorted = Object.create(null);
      for (const k of Object.keys(a.html).sort()) htmlSorted[k] = a.html[k];
      patterns[tech] = { fires: a.fires, strongest, html: htmlSorted };
    }

    const out = {
      generated: new Date().toISOString(),
      ticket: 'UNI-237',
      scanned: merged.scanned,
      unscannable: merged.unscannable,
      readFailures: merged.readFailures,
      classifyFailures: merged.classifyFailures,
      matchFailures: merged.matchFailures,
      channelsNotProbed: CHANNELS_NOT_PROBED,
      patterns,
    };

    const dest = path.join(ROOT, 'docs/pattern-breadth.json');
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
    console.log(`\nwrote ${dest}`);
    console.log(`${merged.scanned} scanned · ${Object.keys(patterns).length} technologies with at least one match`);
    if (merged.matchFailures) console.log(`⚠️  ${merged.matchFailures} match failures — counts are a floor`);
  }
}
