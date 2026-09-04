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
 * ⚠️ A crashed or killed shard must never look like a valid, merely-smaller result. Every shard's
 * exit is checked (exit code + "did it ever send a result"), and the merged totals are checked
 * against the directory count the parent intended to process. Either check failing means the
 * artifact is NOT written and the process exits non-zero — half a corpus that looks whole is worse
 * than a crash.
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
  // Every directory assigned to this shard must land in exactly one bucket below: scanned,
  // unscannable, readFailures, or classifyFailures (matchFailures is a subset of scanned — the
  // capture was read and classified fine, only technology matching on it failed). That invariant
  // is what lets the parent detect a shard that silently dropped input instead of merely a full
  // corpus with some broken captures in it.
  let scanned = 0, unscannable = 0, readFailures = 0, classifyFailures = 0, matchFailures = 0;

  for (const d of dirs) {
    let html;
    try {
      const f = fs.readdirSync(path.join(CORPUS, d)).find((x) => x.endsWith('.html'));
      if (!f) { readFailures++; continue; }
      html = fs.readFileSync(path.join(CORPUS, d, f), 'utf8');
    } catch { readFailures++; continue; }

    // classifyCapture can throw on malformed input. Previously this call sat outside any
    // try/catch: an uncaught throw here would kill the whole shard before process.send() ever
    // ran, silently erasing its entire contribution while the parent still printed "complete".
    let quality;
    try {
      quality = classifyCapture(html);
    } catch { classifyFailures++; continue; }
    if (!quality.scannable) { unscannable++; continue; }
    scanned++;

    // A failure here is a *partial* tooling break, not a "doesn't fire": it's indistinguishable
    // from the technology genuinely not being present unless matchFailures is watched. Tracked
    // and surfaced (not silently swallowed) so the counts below can be read as a floor when non-zero.
    let names;
    try {
      names = engine.matchPatterns(evidenceFromHtml(html, engine.domPlan)).map((h) => h.name);
    } catch { matchFailures++; continue; }

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
  process.send(
    { scanned, unscannable, readFailures, classifyFailures, matchFailures, counts, cooc },
    () => process.exit(0)
  );
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

  // M5: `--shards 0`, `--shards abc`, or a non-numeric `--limit` must not produce a silent,
  // zero-work exit-0 run. A non-integer/non-positive SHARDS means the fan-out loop below never
  // runs, no child ever fires `finish()`, and the process exits cleanly having written nothing —
  // indistinguishable from "nothing to do". Fail loudly instead.
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
  console.log(`corpus prevalence — ${total} captures across ${SHARDS} shards\n`);

  const merged = {
    scanned: 0, unscannable: 0, readFailures: 0, classifyFailures: 0, matchFailures: 0,
    counts: Object.create(null), cooc: Object.create(null),
  };
  let done = 0;
  let anyFailure = false;
  const t0 = Date.now();

  for (let i = 0; i < SHARDS; i++) {
    let gotMessage = false;
    let settled = false;

    const child = fork(__filename, [], {
      env: { ...process.env, PREVALENCE_SHARD: String(i), PREVALENCE_SHARDS: String(SHARDS), PREVALENCE_LIMIT: String(LIMIT) },
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
      for (const [k, v] of Object.entries(m.counts)) merged.counts[k] = (merged.counts[k] || 0) + v;
      for (const [k, inner] of Object.entries(m.cooc)) {
        if (!merged.cooc[k]) merged.cooc[k] = Object.create(null);
        for (const [k2, v] of Object.entries(inner)) merged.cooc[k][k2] = (merged.cooc[k][k2] || 0) + v;
      }
    });
    // fork() itself can fail to spawn, or the IPC channel can error — without this handler that's
    // silent, and the shard's 'exit' may never fire at all, hanging the run.
    child.on('error', (err) => {
      console.error(`FATAL: shard ${i} process error: ${err.message}`);
      anyFailure = true;
      settle();
    });
    // A shard that exits non-zero, or that exits cleanly but never sent a result (killed after
    // send() but before its callback, or crashed before reaching send() at all), has lost its
    // entire contribution. That must not be allowed to produce a plausible, merely-smaller artifact.
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

    // Second line of defense beyond the per-shard exit-code check: every directory the parent
    // intended to process must land in exactly one of scanned/unscannable/readFailures/
    // classifyFailures. A mismatch means a shard silently dropped input despite exiting cleanly
    // and sending a result — e.g. a partitioning bug — and must fail loudly, not write a quietly
    // smaller artifact.
    const accounted = merged.scanned + merged.unscannable + merged.readFailures + merged.classifyFailures;
    if (accounted !== total) {
      console.error(
        `FATAL: accounted directories (${accounted}) != intended directories (${total}) — ` +
        'some input was silently dropped. Refusing to write a partial artifact.'
      );
      process.exit(1);
    }

    // Sort keys before serialising both `counts` and `cooccurs` — otherwise their key order
    // depends on which shard's IPC message happens to arrive first, which is not guaranteed
    // stable across runs (this plan has already been fixed twice for exactly this).
    const sortedKeys = (obj) => {
      const out = {};
      for (const k of Object.keys(obj).sort()) out[k] = obj[k];
      return out;
    };

    // Keep only the top 8 co-occurring technologies each — the full matrix is ~900x900 and nothing
    // downstream reads past the head of it. Tie-break by name ascending so a count tie at the 8th
    // place boundary is broken deterministically, not by shard-arrival order (stable sort would
    // otherwise let arrival order decide which technology makes the cut, not just its position).
    // M6: the tie-break must be code-unit order, not `localeCompare` (locale-dependent — can
    // reorder identically on every machine that runs it, or not, depending on ICU/locale data).
    // `sortedKeys` above already sorts with the plain code-unit `.sort()`; match it here so
    // determinism holds by construction instead of by coincidence of the default locale.
    const cooccurs = {};
    for (const [k, inner] of Object.entries(merged.cooc)) {
      cooccurs[k] = Object.entries(inner)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 8)
        .map(([n]) => n);
    }

    const out = path.resolve(ROOT, 'docs/corpus-prevalence.json');
    fs.writeFileSync(out, JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      ticket: 'UNI-235',
      scanned: merged.scanned,
      unscannable: merged.unscannable,
      readFailures: merged.readFailures,
      classifyFailures: merged.classifyFailures,
      matchFailures: merged.matchFailures,
      note: 'Institutions on which each technology fires, over the homepage corpus. Unscannable ' +
            'captures excluded per UNI-231. Homepage-only: absence here means DEPRIORITISED, never ' +
            'proven absent — a technology may live on interior pages (UNI-225) or be undetected. ' +
            'readFailures/classifyFailures/matchFailures are per-capture tooling failures, not ' +
            'unscannable pages — if any is non-zero, the counts and cooccurs below are a FLOOR: ' +
            'affected captures contributed zero technologies even though they may have fired some.',
      counts: sortedKeys(merged.counts),
      cooccurs: sortedKeys(cooccurs),
    }, null, 2));

    const secs = (Date.now() - t0) / 1000;
    console.log(`\nscanned ${merged.scanned} scannable (${merged.unscannable} unscannable) in ${(secs / 60).toFixed(1)} min`);
    console.log(
      `read failures ${merged.readFailures}, classify failures ${merged.classifyFailures}, ` +
      `match failures ${merged.matchFailures}`
    );
    console.log(`distinct technologies firing: ${Object.keys(merged.counts).length}`);
    console.log(`wrote ${out}`);
  }
}
