#!/usr/bin/env node
/**
 * Full-corpus technology prevalence (UNI-235)
 * ===========================================
 * How many institution homepages each technology actually fires on. This is what makes a 6,504-row
 * review queue finite: on a 133-institution sample only 424 technologies fired at all, and 19
 * categories fired zero times. A miscategorised technology on 100 institutions matters; one that
 * never fires does not.
 *
 * ⚠️ Homepage corpus only. A technology may appear on interior pages (UNI-225 tiered detection) or
 * be present but undetected. Zero here means DEPRIORITISED, never "proven absent".
 *
 * ⚠️ UNI-231: unscannable (bot-blocked) captures are excluded from the denominator. Dividing by
 * unreadable pages understates every prevalence figure.
 *
 * Usage:
 *   node scripts/corpus-prevalence.js [--limit N] [--shards N]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORPUS = path.resolve(ROOT, process.env.CORPUS_DIR || 'corpus');

function listDirs() {
  return fs.readdirSync(CORPUS)
    .filter((d) => { try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; } })
    .sort();
}

// ---------- child ----------
if (process.env.PREVALENCE_SHARD !== undefined) {
  const DeTECHtor = require('../src/detechtor.js');
  const { evidenceFromHtml } = require('../src/evidence-from-html.js');
  const { classifyCapture } = require('../src/capture-quality.js');

  const shard = Number(process.env.PREVALENCE_SHARD);
  const shards = Number(process.env.PREVALENCE_SHARDS);
  const limit = Number(process.env.PREVALENCE_LIMIT || 0);

  const engine = new DeTECHtor();
  let dirs = listDirs();
  if (limit) dirs = dirs.slice(0, limit);
  dirs = dirs.filter((_, i) => i % shards === shard);

  const counts = Object.create(null);
  const cooc = Object.create(null);
  let scanned = 0, unscannable = 0;

  for (const d of dirs) {
    let html;
    try {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      if (!f) continue;
      html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    } catch { continue; }

    if (!classifyCapture(html).scannable) { unscannable++; continue; }
    scanned++;

    let names;
    try {
      names = engine.matchPatterns(evidenceFromHtml(html, engine.domPlan)).map((h) => h.name);
    } catch { continue; }

    const uniq = [...new Set(names)];
    for (const n of uniq) counts[n] = (counts[n] || 0) + 1;
    for (const n of uniq) {
      if (!cooc[n]) cooc[n] = Object.create(null);
      for (const m of uniq) if (m !== n) cooc[n][m] = (cooc[n][m] || 0) + 1;
    }
  }

  // process.send() writes to the IPC pipe asynchronously — calling process.exit() right after it
  // races the flush and drops the message under fork() (confirmed: 100% loss on this corpus size).
  // Exiting from send's callback guarantees the write completed before the process tears down.
  process.send({ scanned, unscannable, counts, cooc }, () => process.exit(0));
} else {
  // ---------- parent ----------
  // Gated behind `else`, not just a following `if`-exit: the send() above hands off before its
  // callback runs, so without this guard a shard child falls through into the fan-out logic below
  // and forks a full, unlimited set of grandchildren against the whole corpus (confirmed — it did).
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const LIMIT = li === -1 ? 0 : Number(args[li + 1]);
  const si = args.indexOf('--shards');
  const SHARDS = si === -1 ? Math.max(1, Math.min(os.cpus().length - 2, 12)) : Number(args[si + 1]);

  if (!fs.existsSync(CORPUS)) {
    console.error(`FATAL: no corpus at ${CORPUS}. Set CORPUS_DIR or fetch it with scripts/wasabi-corpus.js.`);
    process.exit(1);
  }

  const total = LIMIT || listDirs().length;
  console.log(`corpus prevalence — ${total} captures across ${SHARDS} shards\n`);

  const merged = { scanned: 0, unscannable: 0, counts: Object.create(null), cooc: Object.create(null) };
  let done = 0;
  const t0 = Date.now();

  for (let i = 0; i < SHARDS; i++) {
    const child = fork(__filename, [], {
      env: { ...process.env, PREVALENCE_SHARD: String(i), PREVALENCE_SHARDS: String(SHARDS), PREVALENCE_LIMIT: String(LIMIT) },
    });
    child.on('message', (m) => {
      merged.scanned += m.scanned;
      merged.unscannable += m.unscannable;
      for (const [k, v] of Object.entries(m.counts)) merged.counts[k] = (merged.counts[k] || 0) + v;
      for (const [k, inner] of Object.entries(m.cooc)) {
        if (!merged.cooc[k]) merged.cooc[k] = Object.create(null);
        for (const [k2, v] of Object.entries(inner)) merged.cooc[k][k2] = (merged.cooc[k][k2] || 0) + v;
      }
    });
    child.on('exit', () => {
      done++;
      console.log(`  shard ${done}/${SHARDS} complete`);
      if (done === SHARDS) finish();
    });
  }

  function finish() {
    // Keep only the top 8 co-occurring technologies each — the full matrix is ~900x900 and nothing
    // downstream reads past the head of it.
    const cooccurs = {};
    for (const [k, inner] of Object.entries(merged.cooc)) {
      cooccurs[k] = Object.entries(inner).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
    }

    const out = path.resolve(ROOT, 'docs/corpus-prevalence.json');
    fs.writeFileSync(out, JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      ticket: 'UNI-235',
      scanned: merged.scanned,
      unscannable: merged.unscannable,
      note: 'Institutions on which each technology fires, over the homepage corpus. Unscannable ' +
            'captures excluded per UNI-231. Homepage-only: absence here means DEPRIORITISED, never ' +
            'proven absent — a technology may live on interior pages (UNI-225) or be undetected.',
      counts: merged.counts,
      cooccurs,
    }, null, 2));

    const secs = (Date.now() - t0) / 1000;
    console.log(`\nscanned ${merged.scanned} scannable (${merged.unscannable} unscannable) in ${(secs / 60).toFixed(1)} min`);
    console.log(`distinct technologies firing: ${Object.keys(merged.counts).length}`);
    console.log(`wrote ${out}`);
  }
}
