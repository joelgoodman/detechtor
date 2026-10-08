// scripts/lib/wildcard-verify.js -- prove a rewritten regex behaves like the original on real pages.
//
// The rewriter's whole point is that nobody has to judge a bound by eye. For each flagged regex this
// module (1) measures how far apart the pieces really are on a corpus of archived pages, (2) builds
// the rewrite from that, and (3) runs old and new side by side over the SAME pages and reports exactly
// what differs.
//
// WHAT "THE SAME" MEANS. The engine consumes one boolean per input (`RegExp#test`), so a candidate is
// judged on two things:
//   - the VERDICT on every page / script URL / meta value (old matched, new did not = LOST; the
//     reverse = GAINED);
//   - for a pure bounding, the set of START positions at which the regex can match. Bounding to
//     >= 2 x the shortest span any start needs must lose none; the tag-local form `[^<>\n]` can, and
//     when it does the class-preserving form is tried instead.
// A leading/trailing wildcard that is DROPPED changes where a match starts by construction, so it is
// judged on the verdict alone.
//
// THE OLD REGEX MAY NOT FINISH. That is the bug being fixed. Every run is under a hard per-call timeout
// (vm), a timeout is recorded as "did not finish" and is NEVER counted as a match or as an absence.
//
// Spans are measured with a LAZY copy of the regex: the shortest gap that still lets a match start
// there succeed, which is what a bound must cover. A greedy `.*` measures the distance to the LAST
// suffix on the line -- up to a whole 3 MB page -- and would make every bound enormous.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const { evidenceFromHtml } = require('../../src/evidence-from-html.js');
const { spanQuantifiers, requiredLiterals, analyze } = require('./regex-shape.js');
const { buildRewrite, measurementRegex, chooseBound, FLOOR_BOUND, UNOBSERVED_BOUND } = require('./wildcard-rewrite.js');

const DEFAULTS = { timeoutMs: 10000, startCap: 5000, contextChars: 200, maxSamples: 25, workers: 0 };

// ---------------------------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------------------------

/** All pages under `<dir>/<institution_id>/<pageType>__<sha12>.html`, institutions in numeric order. */
function listCorpus(dir, filter = null) {
  const out = [];
  const insts = fs.readdirSync(dir).filter((d) => /^\d+$/.test(d)).sort((a, b) => Number(a) - Number(b));
  for (const d of insts) {
    const inst = Number(d);
    if (filter && !filter(inst)) continue;
    for (const f of fs.readdirSync(path.join(dir, d)).filter((x) => x.endsWith('.html')).sort()) {
      out.push({ inst, name: f, path: path.join(dir, d, f) });
    }
  }
  return out;
}

/** Every k-th institution (deterministic), plus any explicitly included, for the CPU measurement. */
function costSubset(pages, count, include = []) {
  const ids = [...new Set(pages.map((p) => p.inst))];
  const pick = new Set(include);
  for (let i = 0; i < count && i < ids.length; i++) pick.add(ids[Math.floor((i * ids.length) / count)]);
  return pages.filter((p) => pick.has(p.inst));
}

// ---------------------------------------------------------------------------------------------
// Running a regex under a hard timeout
// ---------------------------------------------------------------------------------------------

const ctx = vm.createContext({});
const scanScript = new vm.Script(`(function () {
  const starts = [];
  const spans = [];
  re.lastIndex = 0;
  let m;
  while (starts.length < cap && (m = re.exec(text))) {
    starts.push(m.index);
    if (groups) {
      const row = [];
      for (const g of groups) { const ix = m.indices.groups[g]; row.push(ix ? ix[1] - ix[0] : -1); }
      spans.push(row);
    }
    re.lastIndex = m.index + 1;
  }
  return { starts, spans };
})()`);
const testScript = new vm.Script('re.test(text)');
const stickyScript = new vm.Script(`(function () {
  re.lastIndex = at;
  const m = re.exec(text);
  return m ? m[0].length : -1;
})()`);

/** Every start at which `re` (flags g,i[,d]) can match `text`, up to `cap`; null on timeout. */
function scan(re, text, cap, groups, timeoutMs) {
  ctx.re = re; ctx.text = text; ctx.cap = cap; ctx.groups = groups || null;
  try {
    const r = scanScript.runInContext(ctx, { timeout: timeoutMs });
    return { starts: Array.from(r.starts), spans: Array.from(r.spans, (row) => Array.from(row)), timedOut: false };
  } catch (e) {
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return { starts: [], spans: [], timedOut: true };
    throw e;
  }
}

/** One timed `test()`: { ms, timedOut } */
function timedTest(re, text, timeoutMs) {
  ctx.re = re; ctx.text = text;
  const t0 = process.hrtime.bigint();
  let timedOut = false;
  try { testScript.runInContext(ctx, { timeout: timeoutMs }); } catch (e) {
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timedOut = true; else throw e;
  }
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, timedOut };
}

const manyScript = new vm.Script('(function () { let n = 0; for (let i = 0; i < texts.length; i++) if (re.test(texts[i])) n++; return n; })()');
/** `test()` over a whole list in ONE call, so the per-call cost of crossing into the vm is not what is measured. */
function timedTestMany(re, texts, timeoutMs) {
  ctx.re = re; ctx.texts = texts;
  const t0 = process.hrtime.bigint();
  let timedOut = false;
  try { manyScript.runInContext(ctx, { timeout: timeoutMs }); } catch (e) {
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timedOut = true; else throw e;
  }
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, timedOut };
}

/** Length of the (lazy-measured) match that starts exactly at `at`, for lost-match reports. */
function matchLengthAt(stickyRe, text, at, timeoutMs) {
  ctx.re = stickyRe; ctx.text = text; ctx.at = at;
  try { return stickyScript.runInContext(ctx, { timeout: timeoutMs }); } catch { return -1; }
}

// ---------------------------------------------------------------------------------------------
// Items and their inputs
// ---------------------------------------------------------------------------------------------

/**
 * An item is one regex plus what it is run against.
 *   kind 'page'  the whole archived HTML          (html, version)
 *   kind 'src'   each <script src> value          (scripts, scriptSrc)
 *   kind 'meta'  the named <meta> content         (meta; item.metaName)
 *   kind 'dom'   each matched node's text/attr    (dom; item.dom = {selector, kind, name})
 *   kind 'none'  no offline evidence exists       (url, xhr, network, headers, cookies)
 */
function prepareItem(item, opts = {}) {
  const source = item.source;
  const prepared = { ...item, noPrefilter: !!opts.noPrefilter };
  prepared.literals = opts.noPrefilter ? null : requiredLiterals(source);
  const q = spanQuantifiers(source);
  const multi = analyze(source).some((v) => v.rule === 'multiple-wildcards');
  const original = q.filter((w) => !w.allowed || multi);
  prepared.reviewReason = null;
  if (!original.length) prepared.reviewReason = 'no unbounded span-eating quantifier to rewrite (a nested or run quantifier needs a human)';
  else if (original.some((w) => w.inNegLook)) prepared.reviewReason = 'a wildcard sits inside a negative look-around: bounding it can ADD matches';
  else if (q.length && q[0].hasBackrefs) prepared.reviewReason = 'the regex has back-references; group numbers cannot be instrumented';

  // Droppable = first/last in a top-level branch and not anchored: redundant for RegExp#test. Drop
  // those FIRST; what is left is what gets bounded and what the spans are measured on (measuring with a
  // leading `.*` still in place would make every earlier position a "start" and bury the real spans).
  const droppable = (w) => (w.leading || w.tail) && !w.anchored && !w.inLook && w.depth === 0;
  const drops = prepared.reviewReason ? [] : original.filter(droppable).map((w) => ({ ordinal: w.ordinal, action: 'drop' }));
  prepared.dropped = drops.length;
  prepared.reduced = drops.length ? buildRewrite(source, drops, {}) : source;
  if (prepared.reviewReason) {
    prepared.targets = original;
  } else {
    const rq = drops.length ? spanQuantifiers(prepared.reduced) : q;
    const multiAfter = drops.length ? analyze(prepared.reduced).some((v) => v.rule === 'multiple-wildcards') : multi;
    prepared.targets = rq.filter((w) => !w.allowed || multiAfter);
  }
  prepared.actions = prepared.targets.map((w) => ({ ordinal: w.ordinal, action: 'bound' }));
  prepared.measure = prepared.targets.length && !prepared.reviewReason
    ? measurementRegex(prepared.reduced, { only: prepared.targets.map((w) => w.ordinal) })
    : null;
  return prepared;
}

function compileOld(p) { return new RegExp(p.source, 'gi'); }

/** The inputs one item is tested against on one page. */
function inputsFor(p, html, evidence) {
  switch (p.kind) {
    case 'page': return [html];
    case 'src': return evidence ? evidence.scripts.map((s) => s.src) : [];
    case 'meta': {
      const v = evidence && evidence.meta[String(p.metaName).toLowerCase()];
      return typeof v === 'string' ? [v] : [];
    }
    case 'dom': {
      const nodes = (evidence && evidence.domNodes[p.dom.selector]) || [];
      const out = [];
      for (const n of nodes) {
        const v = p.dom.kind === 'text' ? n.text || '' : n.attributes && n.attributes[p.dom.name];
        if (v !== undefined && v !== null) out.push(String(v));
      }
      return out;
    }
    default: return [];
  }
}

function domPlanFor(items) {
  const bySel = new Map();
  for (const it of items) {
    if (it.kind !== 'dom') continue;
    const e = bySel.get(it.dom.selector) || { selector: it.dom.selector, text: false, attrs: new Set(), props: [] };
    if (it.dom.kind === 'text') e.text = true; else if (it.dom.kind === 'attributes') e.attrs.add(it.dom.name);
    bySel.set(it.dom.selector, e);
  }
  return [...bySel.values()].map((e) => ({ selector: e.selector, text: e.text, attrs: [...e.attrs], props: [] }));
}

/** A literal that entity-encoding could split or rewrite cannot be prefiltered on the RAW page. */
const rawSafe = (lit) => /^[\x20-\x7e]*$/.test(lit) && !/[&<>"']/.test(lit);

/** Per-input prefilter: exact (inputs are the decoded strings the regex really sees). */
const passesPrefilter = (p, text, low) => {
  if (!p.literals) return true;
  const l = low === undefined ? text.toLowerCase() : low;
  return p.literals.some((x) => l.includes(x));
};

/**
 * Page-level prefilter for items whose inputs are DERIVED from the page (src/meta/dom): skip parsing
 * the page for an item whose required literal does not even occur in the raw text. Only used when
 * every literal is entity-proof; otherwise the item is always parsed.
 */
const pageMayMatch = (p, low) => {
  if (p.kind === 'page') return passesPrefilter(p, null, low);
  if (!p.literals || !p.literals.every(rawSafe)) return true;
  return p.literals.some((x) => low.includes(x));
};

/** Walk pages, handing the callback a lazy context: html, its lowercase, and the parsed evidence. */
function forEachPage(pages, items, fn) {
  const needEvidence = items.some((i) => i.kind !== 'page' && i.kind !== 'none');
  const plan = needEvidence ? domPlanFor(items) : null;
  for (const page of pages) {
    let html;
    try { html = fs.readFileSync(page.path, 'utf8'); } catch { continue; }
    let low = null;
    let evidence = null;
    fn(page, {
      html,
      get low() { return low === null ? (low = html.toLowerCase()) : low; },
      evidence() { return evidence === null ? (evidence = evidenceFromHtml(html, plan)) : evidence; },
    });
  }
}

/** The inputs one item is tested against on this page, already past the prefilters. */
function liveInputs(p, pg) {
  if (!pageMayMatch(p, pg.low)) return [];
  const raw = inputsFor(p, pg.html, p.kind === 'page' ? null : pg.evidence());
  return p.literals ? raw.filter((x) => passesPrefilter(p, x, p.kind === 'page' ? pg.low : undefined)) : raw;
}

// ---------------------------------------------------------------------------------------------
// Pass 1: observe spans
// ---------------------------------------------------------------------------------------------

function pass1(pages, items, opts) {
  const o = { ...DEFAULTS, ...opts };
  const prep = items.map((i) => prepareItem(i, o));
  const res = new Map(prep.map((p) => [p.id, {
    id: p.id, tested: 0, matchPages: 0, oldDidNotFinish: 0, startsTotal: 0, truncatedPages: 0,
    hist: p.targets.map(() => ({})), relevant: [],
  }]));
  const compiled = prep.map((p) => ({
    p,
    old: p.kind === 'none' ? null : compileOld(p),
    measure: p.measure ? new RegExp(p.measure.source, 'dgi') : null,
    groups: p.measure ? p.measure.wildcards.map((w) => w.group) : null,
    // measurement group g -> index into the item's targets
    kOf: p.measure ? p.measure.wildcards.map((w) => p.targets.findIndex((t) => t.ordinal === w.ordinal)) : [],
  }));
  forEachPage(pages, prep, (page, pg) => {
    for (const c of compiled) {
      if (!c.old) continue;
      const r = res.get(c.p.id);
      let interesting = false;
      let matched = false;
      for (const input of liveInputs(c.p, pg)) {
        r.tested++;
        // A verdict is all a dropped wildcard needs, so cap=1; a bound needs every start's span.
        const out = scan(c.measure || c.old, input, c.measure ? o.startCap : 1, c.groups, o.timeoutMs);
        if (out.timedOut) { r.oldDidNotFinish++; interesting = true; continue; }
        if (!out.starts.length) continue;
        matched = true; interesting = true;
        r.startsTotal += out.starts.length;
        if (out.starts.length >= o.startCap) r.truncatedPages++;
        if (c.groups) {
          for (const row of out.spans) {
            for (let g = 0; g < c.groups.length; g++) {
              if (row[g] < 0 || c.kOf[g] < 0) continue;
              const h = r.hist[c.kOf[g]];
              h[row[g]] = (h[row[g]] || 0) + 1;
            }
          }
        }
      }
      if (matched) r.matchPages++;
      if (interesting) r.relevant.push(page.path);
    }
  });
  return res;
}

function mergePass1(into, part) {
  for (const [id, r] of part) {
    const t = into.get(id);
    if (!t) { into.set(id, r); continue; }
    t.tested += r.tested; t.matchPages += r.matchPages; t.oldDidNotFinish += r.oldDidNotFinish;
    t.startsTotal += r.startsTotal; t.truncatedPages += r.truncatedPages;
    t.relevant.push(...r.relevant);
    r.hist.forEach((h, k) => { for (const [len, n] of Object.entries(h)) t.hist[k][len] = (t.hist[k][len] || 0) + n; });
  }
  return into;
}

function summarise(hist) {
  const lens = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const n = lens.reduce((a, l) => a + hist[l], 0);
  if (!n) return { n: 0, min: null, median: null, p99: null, max: null, le80: 0, le250: 0, le1000: 0 };
  const at = (q) => { let acc = 0; const target = Math.ceil(q * n); for (const l of lens) { acc += hist[l]; if (acc >= target) return l; } return lens[lens.length - 1]; };
  const upTo = (b) => lens.filter((l) => l <= b).reduce((a, l) => a + hist[l], 0);
  return { n, min: lens[0], median: at(0.5), p99: at(0.99), max: lens[lens.length - 1], le80: upTo(80), le250: upTo(250), le1000: upTo(1000) };
}

// ---------------------------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------------------------

function buildCandidates(p, observedMaxByOrdinal) {
  const bounds = p.actions.map((a) => {
    const max = observedMaxByOrdinal.get(a.ordinal);
    const unobserved = max === null || max === undefined;
    // With several wildcards on one path the cost is the PRODUCT of the bounds (canva.{0,250}for.{0,250}schools
    // is 62,500 steps per start and times out), so an unobserved wildcard in a multi-wildcard pattern gets
    // the floor, not the single-wildcard default.
    const bound = unobserved && p.actions.length > 1 ? FLOOR_BOUND : chooseBound(max);
    return { ordinal: a.ordinal, action: 'bound', bound, unobserved, observedMax: unobserved ? null : max };
  });
  const method = p.dropped ? (bounds.length ? 'drop+bound' : 'drop') : 'bound';
  const comparable = !p.dropped;
  const html = p.channel === 'html' || p.channel === 'version';
  const anyDot = p.targets.some((w) => w.kind === 'dot');
  if (!bounds.length) return { bounds, candidates: [{ id: 'class', method, comparable, source: p.reduced }] };
  const c = [];
  if (anyDot && html) c.push({ id: 'tag-local', method, comparable, source: buildRewrite(p.reduced, bounds, { tagLocal: true }) });
  c.push({ id: 'class', method, comparable, source: buildRewrite(p.reduced, bounds, { tagLocal: false }) });
  return { bounds, candidates: c };
}

// ---------------------------------------------------------------------------------------------
// Pass 2: compare a candidate with the original
// ---------------------------------------------------------------------------------------------

function emptyCmp() {
  return {
    compared: 0, verdictLost: 0, verdictGained: 0, startsLost: 0, startsGained: 0,
    oldDidNotFinish: 0, newDidNotFinish: 0, oldStarts: 0, newStarts: 0, lost: [], gained: [],
  };
}

function compareInput(p, cand, oldRe, newRe, stickyRe, input, page, o, acc) {
  const cap = cand.comparable ? o.startCap : 1;
  const old = scan(oldRe, input, cap, null, o.timeoutMs);
  if (old.timedOut) { acc.oldDidNotFinish++; return; }
  const nw = scan(newRe, input, cap, null, o.timeoutMs);
  if (nw.timedOut) { acc.newDidNotFinish++; return; }
  acc.compared++;
  acc.oldStarts += old.starts.length; acc.newStarts += nw.starts.length;
  const vOld = old.starts.length > 0; const vNew = nw.starts.length > 0;
  if (vOld && !vNew) acc.verdictLost++;
  if (!vOld && vNew) acc.verdictGained++;
  if (!cand.comparable) return;
  // Compare start sets over the range both enumerations cover (a capped enumeration stops early).
  const limit = Math.min(old.starts.length >= cap ? old.starts[old.starts.length - 1] : Infinity,
    nw.starts.length >= cap ? nw.starts[nw.starts.length - 1] : Infinity);
  const oldSet = new Set(old.starts); const newSet = new Set(nw.starts);
  for (const s of old.starts) {
    if (s > limit || newSet.has(s)) continue;
    acc.startsLost++;
    if (acc.lost.length < o.maxSamples) acc.lost.push(sample(p, stickyRe, input, s, page, o));
  }
  for (const s of nw.starts) {
    if (s > limit || oldSet.has(s)) continue;
    acc.startsGained++;
    if (acc.gained.length < o.maxSamples) acc.gained.push(sample(p, stickyRe, input, s, page, o));
  }
}

function sample(p, stickyRe, input, start, page, o) {
  const from = Math.max(0, start - 60);
  return {
    inst: page.inst, page: page.name, start,
    spanLength: stickyRe ? matchLengthAt(stickyRe, input, start, o.timeoutMs) : -1,
    context: input.slice(from, from + o.contextChars).replace(/\s+/g, ' '),
  };
}

/** Compare one candidate with the original over a list of pages (in this process). */
function compareOnPages(item, cand, pages, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const p = item.actions ? item : prepareItem(item, o);
  const acc = emptyCmp();
  const oldRe = compileOld(p);
  const newRe = new RegExp(cand.source, 'gi');
  const stickyRe = p.measure ? new RegExp(p.measure.source, 'yi') : new RegExp(p.source, 'yi');
  const withComparable = { comparable: true, ...cand };
  // A candidate can match where the original cannot (that is GAINED), so a page is compared when
  // EITHER side's required literal is present.
  const candLits = o.noPrefilter ? null : requiredLiterals(cand.source);
  const widened = { ...p, literals: p.literals && candLits ? [...new Set([...p.literals, ...candLits])] : null };
  forEachPage(pages, [widened], (page, pg) => {
    for (const input of liveInputs(widened, pg)) compareInput(p, withComparable, oldRe, newRe, stickyRe, input, page, o, acc);
  });
  return finishCmp(acc, withComparable);
}

function finishCmp(acc, cand) {
  const lost = acc.verdictLost > 0 || acc.startsLost > 0;
  const gained = acc.verdictGained > 0 || acc.startsGained > 0;
  let outcome = lost && gained ? 'LOST+GAINED' : lost ? 'LOST' : gained ? 'GAINED' : 'IDENTICAL';
  if (outcome === 'IDENTICAL' && acc.newDidNotFinish > 0) outcome = 'SLOW';
  return { ...acc, outcome };
}

function pass2(pages, work, opts) {
  // work: [{ prepared item, candidates:[{id,source,comparable,method}] }]  -> partial results
  const o = { ...DEFAULTS, ...opts };
  const out = new Map();
  const compiled = work.map((w) => ({
    w,
    old: compileOld(w.p),
    sticky: w.p.measure ? new RegExp(w.p.measure.source, 'yi') : new RegExp(w.p.source, 'yi'),
    cands: w.candidates.map((c) => ({ c, re: new RegExp(c.source, 'gi'), acc: emptyCmp() })),
  }));
  forEachPage(pages, work.map((w) => w.p), (page, pg) => {
    for (const c of compiled) {
      if (!c.w.relevantSet.has(page.path)) continue;
      for (const input of liveInputs(c.w.p, pg)) {
        for (const cc of c.cands) compareInput(c.w.p, cc.c, c.old, cc.re, c.sticky, input, page, o, cc.acc);
      }
    }
  });
  for (const c of compiled) out.set(c.w.p.id, c.cands.map((cc) => ({ id: cc.c.id, acc: cc.acc })));
  return out;
}

function mergeCmp(a, b, maxSamples) {
  for (const k of ['compared', 'verdictLost', 'verdictGained', 'startsLost', 'startsGained', 'oldDidNotFinish', 'newDidNotFinish', 'oldStarts', 'newStarts']) a[k] += b[k];
  a.lost.push(...b.lost.slice(0, Math.max(0, maxSamples - a.lost.length)));
  a.gained.push(...b.gained.slice(0, Math.max(0, maxSamples - a.gained.length)));
  return a;
}

// ---------------------------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------------------------

function shard(list, n) {
  const shards = Array.from({ length: n }, () => []);
  list.forEach((x, i) => shards[i % n].push(x));
  return shards;
}

/** Run `job` ('pass1'|'pass2'|'cpu') on shards of `pages` in child processes; resolve the partials. */
function inWorkers(job, pages, payload, workers) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let pending = 0;
    for (const s of shard(pages, workers)) {
      if (!s.length) continue;
      pending++;
      const child = cp.fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('message', (m) => { if (m.error) reject(new Error(m.error)); else parts.push(m.result); });
      child.on('error', reject);
      child.on('exit', (code) => { if (code !== 0) reject(new Error(`worker exited ${code}`)); if (--pending === 0) resolve(parts); });
      child.send({ job, pages: s, payload });
    }
    if (!pending) resolve(parts);
  });
}

if (require.main === module && process.argv.includes('--worker')) {
  process.on('message', ({ job, pages, payload }) => {
    try {
      let result;
      if (job === 'pass1') result = [...pass1(pages, payload.items, payload.opts)];
      else if (job === 'pass2') {
        const work = payload.work.map((w) => ({ ...w, p: prepareItem(w.item, payload.opts), relevantSet: new Set(w.relevant) }));
        result = [...pass2(pages, work, payload.opts)];
      } else if (job === 'cpu') result = cpuPass(pages, payload.items, payload.opts);
      process.send({ result }, () => process.exit(0));
    } catch (e) { process.send({ error: e.stack || String(e) }, () => process.exit(1)); }
  });
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

/**
 * Observe, build candidates, compare. One result per input item.
 * @returns {Promise<Array>} per item: observed, bounds, candidates (with outcomes), chosen, outcome, reason
 */
async function planAndVerify(items, pages, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const workers = o.workers;
  // ---- pass 1
  let merged = new Map();
  if (workers > 0) {
    const parts = await inWorkers('pass1', pages, { items, opts: o }, workers);
    for (const part of parts) mergePass1(merged, new Map(part));
  } else merged = pass1(pages, items, o);

  // ---- plan
  const prepared = items.map((i) => prepareItem(i, o));
  const work = [];
  const results = [];
  for (const p of prepared) {
    const r1 = merged.get(p.id) || { tested: 0, matchPages: 0, oldDidNotFinish: 0, startsTotal: 0, hist: [], relevant: [] };
    const observed = p.targets.map((w, k) => ({ ordinal: w.ordinal, ...summarise(r1.hist[k] || {}) }));
    const res = {
      id: p.id, source: p.source, channel: p.channel, kind: p.kind,
      tested: r1.tested, matchPages: r1.matchPages, oldDidNotFinish: r1.oldDidNotFinish, startsTotal: r1.startsTotal,
      observed, bounds: [], candidates: [], chosen: null, outcome: 'NEEDS_REVIEW', reason: p.reviewReason,
    };
    results.push(res);
    if (p.reviewReason && !p.forceCandidate) continue;
    if (p.kind === 'none') { res.reason = 'no corpus evidence exists for this channel'; res.outcome = 'UNVERIFIABLE'; }
    const maxByOrdinal = new Map(observed.map((x) => [x.ordinal, x.max]));
    // A reviewed decision supplies its own candidate; it is verified exactly like a generated one.
    const built = p.forceCandidate ? { bounds: [], candidates: [p.forceCandidate] } : buildCandidates(p, maxByOrdinal);
    res.bounds = built.bounds;
    res.candidates = built.candidates.map((c) => ({ ...c }));
    if (p.kind === 'none') continue;
    work.push({ p, item: items.find((i) => i.id === p.id), candidates: built.candidates, relevant: r1.relevant, relevantSet: new Set(r1.relevant), res });
  }

  // ---- pass 2
  const bundles = work.map((w) => ({ item: w.item, candidates: w.candidates, relevant: w.relevant }));
  const pageSet = new Set(work.flatMap((w) => w.relevant));
  const relevantPages = pages.filter((pg) => pageSet.has(pg.path));
  let cmp;
  if (!work.length) cmp = new Map();
  else if (workers > 0) {
    const parts = await inWorkers('pass2', relevantPages, { work: bundles, opts: o }, workers);
    cmp = new Map();
    for (const part of parts) {
      for (const [id, arr] of part) {
        const have = cmp.get(id);
        if (!have) { cmp.set(id, arr.map((x) => ({ id: x.id, acc: x.acc }))); continue; }
        arr.forEach((x, i) => mergeCmp(have[i].acc, x.acc, o.maxSamples));
      }
    }
  } else cmp = pass2(relevantPages, work, o);

  for (const w of work) {
    const cands = cmp.get(w.p.id) || [];
    w.res.candidates = w.candidates.map((c, i) => {
      const done = finishCmp(cands[i] ? cands[i].acc : emptyCmp(), c);
      return { ...c, ...done };
    });
    const chosen = w.res.candidates.find((c) => c.outcome === 'IDENTICAL');
    if (chosen) { w.res.chosen = chosen; w.res.outcome = 'IDENTICAL'; w.res.reason = null; } else {
      const best = [...w.res.candidates].sort((a, b) => (a.startsLost + a.verdictLost) - (b.startsLost + b.verdictLost))[0];
      w.res.outcome = best.outcome;
      w.res.reason = 'no candidate was identical over the corpus';
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// CPU: old vs new over a page set
// ---------------------------------------------------------------------------------------------

function cpuPass(pages, items, opts) {
  const o = { cpuCapMs: 20000, itemBudgetMs: 60000, ...DEFAULTS, ...opts };
  const prep = items.map((i) => ({
    i, old: new RegExp(i.oldSource, 'i'), nw: new RegExp(i.newSource, 'i'),
    acc: { tests: 0, oldMs: 0, newMs: 0, oldTimeouts: 0, newTimeouts: 0, oldTimed: 0, maxOld: { ms: 0, page: null }, maxNew: { ms: 0, page: null } },
  }));
  // One timed test of each side. `weight` lets a deduplicated script URL stand for every page that has it.
  function timeBoth(c, input, label, weight) {
    timedTest(c.old, 'x', 50); timedTest(c.nw, 'x', 50); // tier V8's regex engine up before the timed run
    c.acc.tests += weight;
    if (c.acc.oldMs < o.itemBudgetMs) {
      const a = timedTest(c.old, input, o.cpuCapMs);
      c.acc.oldMs += a.ms * weight; c.acc.oldTimed += weight;
      if (a.timedOut) c.acc.oldTimeouts += weight;
      if (a.ms > c.acc.maxOld.ms) c.acc.maxOld = { ms: +a.ms.toFixed(1), page: label };
    }
    const b = timedTest(c.nw, input, o.cpuCapMs);
    c.acc.newMs += b.ms * weight;
    if (b.timedOut) c.acc.newTimeouts += weight;
    if (b.ms > c.acc.maxNew.ms) c.acc.maxNew = { ms: +b.ms.toFixed(1), page: label };
  }
  const srcItems = prep.filter((c) => c.i.kind === 'src');
  const allSrcs = []; // every script URL on every page, repeats included: that is what the engine tests
  forEachPage(pages, items, (page, pg) => {
    if (srcItems.length) for (const s of pg.evidence().scripts) allSrcs.push(s.src);
    for (const c of prep) {
      if (c.i.kind === 'src' || c.i.kind === 'none') continue;
      for (const input of inputsFor(c.i, pg.html, c.i.kind === 'page' ? null : pg.evidence())) timeBoth(c, input, `${page.inst}/${page.name}`, 1);
    }
  });
  for (const c of srcItems) {
    timedTest(c.old, 'x', 50); timedTest(c.nw, 'x', 50);
    const a = timedTestMany(c.old, allSrcs, o.cpuCapMs * 5);
    const b = timedTestMany(c.nw, allSrcs, o.cpuCapMs * 5);
    c.acc.tests += allSrcs.length; c.acc.oldMs += a.ms; c.acc.newMs += b.ms; c.acc.oldTimed += allSrcs.length;
    if (a.timedOut) c.acc.oldTimeouts++;
    if (b.timedOut) c.acc.newTimeouts++;
  }
  return prep.map((c) => ({ id: c.i.id, ...c.acc }));
}

async function measureCpu(items, pages, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!items.length) return [];
  let parts;
  if (o.workers > 0) parts = await inWorkers('cpu', pages, { items, opts: o }, o.workers);
  else parts = [cpuPass(pages, items, o)];
  const byId = new Map();
  for (const part of parts) {
    for (const r of part) {
      const t = byId.get(r.id);
      if (!t) { byId.set(r.id, r); continue; }
      for (const k of ['tests', 'oldMs', 'newMs', 'oldTimeouts', 'newTimeouts', 'oldTimed']) t[k] += r[k];
      if (r.maxOld.ms > t.maxOld.ms) t.maxOld = r.maxOld;
      if (r.maxNew.ms > t.maxNew.ms) t.maxNew = r.maxNew;
    }
  }
  return [...byId.values()];
}

module.exports = {
  DEFAULTS, listCorpus, costSubset, prepareItem, planAndVerify, compareOnPages, measureCpu,
  scan, timedTest, summarise, UNOBSERVED_BOUND,
};
