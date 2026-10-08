#!/usr/bin/env node
/**
 * Whole-pattern-set match CPU over a deterministic slice of the archived corpus
 * =============================================================================
 * Times `DeTECHtor#matchPatterns` (every technology against one page's evidence) in ONE process, so two
 * engine checkouts -- before and after a pattern change -- can be compared like for like:
 *
 *   node scripts/measure-match-cpu.js --engine-root <checkout> --corpus <dir> --out old.json
 *   node scripts/measure-match-cpu.js --engine-root <other>    --corpus <dir> --out new.json
 *
 * Evidence building (cheerio parse + dom plan) is NOT timed; only matching is, as CPU time of this
 * process (not wall clock), so a loaded machine does not distort it. Each page runs under a hard timeout
 * (vm); a page that hits it is recorded as `timedOut` with the cap as its (lower-bound) time, never
 * dropped.
 *
 * The slice is every k-th institution in numeric id order, plus any `--include`d ones (the 3.35 MB
 * program page of institution 172 is the page `Canva for Education` took ~124 s on), so the same flags
 * select the same pages in both runs.
 *
 *   --engine-root DIR    checkout whose src/detechtor.js is measured (default: this repo)
 *   --corpus DIR         required
 *   --institutions N     size of the slice (default 500)
 *   --include IDS        comma list always included (default 172)
 *   --cap-ms N           hard per-page cap (default 400000)
 *   --out FILE           JSON result
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const root = path.resolve(arg('--engine-root', path.join(__dirname, '..')));
const corpus = arg('--corpus');
if (!corpus) { console.error('--corpus <dir> is required'); process.exit(2); }
const N = Number(arg('--institutions', 500));
const include = new Set(arg('--include', '172').split(',').filter(Boolean).map(Number));
const capMs = Number(arg('--cap-ms', 400000));

const DeTECHtor = require(path.join(root, 'src/detechtor.js'));
const { evidenceFromHtml } = require(path.join(root, 'src/evidence-from-html.js'));

const ids = fs.readdirSync(corpus).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b);
const pick = new Set(include);
for (let i = 0; i < N && i < ids.length; i++) pick.add(ids[Math.floor((i * ids.length) / N)]);
const subset = [...pick].sort((a, b) => a - b);

const engine = new DeTECHtor();
const ctx = vm.createContext({});
const run = new vm.Script('fn()');

const pages = [];
const cpuNow = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
let totalMs = 0;
const t0 = Date.now();
for (const inst of subset) {
  const dir = path.join(corpus, String(inst));
  if (!fs.existsSync(dir)) continue;
  let js = {};
  try { js = JSON.parse(fs.readFileSync(path.join(dir, 'js_globals.json'), 'utf8')); } catch { /* no js globals for this institution */ }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const stem = f.replace(/\.html$/, '');
    const evidence = evidenceFromHtml(html, engine.domPlan, { jsGlobals: Array.isArray(js[stem]) ? js[stem] : undefined });
    ctx.fn = () => engine.matchPatterns(evidence);
    const c0 = cpuNow();
    let timedOut = false;
    try { run.runInContext(ctx, { timeout: capMs }); } catch (e) { if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timedOut = true; else throw e; }
    const ms = cpuNow() - c0;
    totalMs += ms;
    pages.push({ inst, page: f, bytes: Buffer.byteLength(html), ms: +ms.toFixed(1), timedOut });
  }
}
pages.sort((a, b) => b.ms - a.ms);
const out = {
  engineRoot: root, institutions: subset.length, pages: pages.length,
  totalMatchCpuMs: +totalMs.toFixed(0), meanMsPerPage: +(totalMs / pages.length).toFixed(1),
  timedOutPages: pages.filter((p) => p.timedOut).length, wallSeconds: +((Date.now() - t0) / 1000).toFixed(0),
  slowest: pages.slice(0, 25), perPage: pages,
};
if (arg('--out')) fs.writeFileSync(arg('--out'), JSON.stringify(out));
console.log(JSON.stringify({ ...out, perPage: undefined, slowest: out.slowest.slice(0, 10) }, null, 1));
