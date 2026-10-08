#!/usr/bin/env node
/**
 * Mechanical rewriter for unbounded wildcards in detection patterns
 * =================================================================
 * Replaces each unbounded `.*` / `.+` / `[^x]*` / `\s*` ... in the patterns the ENGINE LOADS with a
 * bounded form, choosing the bound from EVIDENCE rather than judgment, and writes a rewrite only when
 * it is provably identical on a corpus of real archived pages.
 *
 *   node scripts/rewrite-unbounded-wildcards.js --corpus <dir>            # dry run: classify, report
 *   node scripts/rewrite-unbounded-wildcards.js --corpus <dir> --write    # write the IDENTICAL set
 *
 * The corpus is `<dir>/<institution_id>/<pageType>__<sha12>.html`, read-only here.
 *
 * WHAT IT DOES, per flagged regex
 *   1. Measures how far apart the pieces of the pattern really are on the corpus: for every place the
 *      pattern can match, the SHORTEST gap each wildcard needs (a lazy copy of the regex), summarised as
 *      min / median / p99 / max.
 *   2. Chooses  bound = max(80, 2 x observed max), rounded up  (no match ever seen -> 250, flagged
 *      `unobserved`, never the floor).
 *   3. Rewrites: a wildcard that is the first or last thing in a branch is DROPPED (redundant for
 *      RegExp#test); every other becomes `{min,N}` over the same class, `.` as the tag-local `[^<>\n]`
 *      for html when that loses nothing, else `.{0,N}`. The span class per channel:
 *        html, version       `.` -> [^<>\n]   (one tag, one line; archived pages are minified to one line)
 *        scripts, scriptSrc  `.` -> .         (the input is one URL; it has no tags to stay inside)
 *        meta, dom, headers, cookies, url, xhr, network   `.` -> .   (a single short value)
 *        any other class keeps its class: [^"] stays [^"], \s stays \s, [\s\S] stays [\s\S].
 *   4. Compares old and new over the WHOLE corpus (scripts/lib/wildcard-verify.js) under a per-call
 *      timeout. Outcomes: IDENTICAL (written), LOST (old matched where new does not: listed with
 *      institution, page, span and context, NOT written), GAINED (impossible for a pure bounding:
 *      investigate), and "old regex did not finish" (recorded, never counted as a match).
 *   5. Anything not provably identical goes to patterns/wildcard-review.tsv with its observed spans and
 *      a recommended bound, so a human decision is one line per pattern. Patterns whose literal parts
 *      are too short to be safe even once bounded are tagged `precision-suspect` and otherwise left
 *      alone: this is a cost fix, not a precision review.
 *
 * WHERE IT WRITES. Never to patterns/generated/ (the importer rewrites it wholesale). A technology
 * defined in a curated file (patterns/higher-ed-*.json ...) is edited in that file with a minimal diff;
 * one that comes only from the generated artifact gets an entry in patterns/pattern-rewrites.json, a
 * load-time layer that names the exact original text (src/pattern-rewrites.js).
 *
 * CHANNELS WITH NO CORPUS EVIDENCE (url, xhr, network, headers, cookies): the offline corpus carries no
 * final URL, response header, cookie or network host, so no rewrite there can be proven identical. They
 * are listed as UNVERIFIABLE; `--accept-unobservable` applies them with the default bound and records
 * that basis on every entry.
 *
 * Flags:
 *   --corpus DIR            required
 *   --write                 apply the IDENTICAL (+ decided, + accepted-unobservable) rewrites
 *   --workers N             worker processes, default 6 (never more)
 *   --accept-unobservable   also apply rewrites for channels the corpus cannot observe
 *   --decisions FILE        reviewed decisions, default patterns/wildcard-decisions.json
 *   --propose-decisions OUT cap every leftover bound at 250, verify, and write the proposals whose
 *                           page verdicts do not change (to review, not to apply)
 *   --review-out FILE       default patterns/wildcard-review.tsv (written with --write)
 *   --report-out FILE       full JSON report (spans, outcomes, CPU)
 *   --limit N               use every k-th institution (about N of them): development only
 *   --only SUBSTR           only patterns containing SUBSTR
 *   --timeout-ms N          per-input hard timeout for the ORIGINAL regex, default 10000
 *   --cpu-institutions N    institutions in the CPU measurement subset, default 500
 *   --cpu-include IDS       comma list always included in it, default 172
 *   --no-cpu                skip the CPU measurement
 *   --cpu-item-budget-ms N  stop timing one OLD regex after this much (default 20000): its total is then a lower bound
 *   --candidate FILE        evaluate this generated artifact instead of the shipped one
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../src/config.js');
const { loadEffective, enumerateRegexes } = require('./lib/pattern-channels.js');
const { analyze, MAX_BOUND } = require('./lib/regex-shape.js');
const { listCorpus, costSubset, planAndVerify, measureCpu, prepareItem } = require('./lib/wildcard-verify.js');
const { planPlacement, renderCurated, addLayerEntries, serializeLayer } = require('./lib/rewrite-apply.js');
const { chooseBound, buildRewrite, precisionSuspect } = require('./lib/wildcard-rewrite.js');
const { measureSources } = require('./lib/cost-measure.js');
const { MEASURE_DEFAULT_BUDGET_MS } = require('./lib/cost-gate.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const SPAN_RULES = new Set(['unbounded-span', 'multiple-wildcards']);
const DECIDED_DATE = '2026-10-08';
const DECISIONS_COMMENT = 'Reviewed decisions for wildcard patterns the mechanical pass could not rewrite identically (scripts/rewrite-unbounded-wildcards.js). Keyed by the evidence kind and the ORIGINAL pattern text, so a re-import that brings the original back is decided the same way. { bounds | to, acceptPagesLost, reason, decided }. A decision applies only if no page GAINS a match and no more than acceptPagesLost pages change verdict on the corpus; start positions beyond the decided bound drop, and the reason says how many.';

// ---------------------------------------------------------------------------------------------
// Items: one per (evidence kind, pattern). The same pattern text in two techs is one item.
// ---------------------------------------------------------------------------------------------

function itemFor(r) {
  const base = { source: r.pattern, channel: r.channel };
  switch (r.channel) {
    case 'html': case 'version': return { ...base, kind: 'page', id: `page::${r.pattern}` };
    case 'scripts': case 'scriptSrc': return { ...base, kind: 'src', id: `src::${r.pattern}` };
    case 'meta': return { ...base, kind: 'meta', metaName: r.key, id: `meta:${String(r.key).toLowerCase()}::${r.pattern}` };
    case 'dom': return { ...base, kind: 'dom', dom: r.dom, id: `dom:${r.dom.selector}|${r.dom.kind}|${r.dom.name || ''}::${r.pattern}` };
    default: return { ...base, kind: 'none', id: `none:${r.channel}::${r.pattern}` };
  }
}

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

function loadDecisions(file) {
  if (!file || !fs.existsSync(file)) return {};
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.decisions || {};
}


/**
 * The candidate a reviewed decision stands for: an explicit `to`, or one bound per wildcard that is LEFT
 * after the redundant end wildcards are dropped (the same targets the rewriter itself bounds).
 */
function decisionCandidate(res, dec) {
  if (typeof dec.to === 'string') return { id: 'decision', source: dec.to, comparable: true, method: 'decision' };
  const p = prepareItem({ source: res.source, channel: res.channel, kind: res.kind, id: res.id });
  if (p.reviewReason || !Array.isArray(dec.bounds) || dec.bounds.length !== p.targets.length) return null;
  const wild = p.targets.map((t, k) => ({ ordinal: t.ordinal, action: 'bound', bound: dec.bounds[k] }));
  return { id: 'decision', method: 'decision', comparable: !p.dropped, source: buildRewrite(p.reduced, wild, { tagLocal: !!dec.tagLocal }) };
}

/**
 * COST BUDGET. A bounded wildcard is only a fix if the bounded regex is cheap. With several wildcards on
 * one path the cost is the PRODUCT of the bounds (canva.{0,250}for.{0,250}schools is 62,500 steps per
 * start), and even one `{1,850}` over a one-character prefix is 700 ms on a 1 MB near-miss. So every
 * chosen rewrite is measured with the gate's own measurement (scripts/lib/cost-measure.js) against HALF
 * the gate's budget: the rewriter targets 125 ms so that the gate, at 250 ms, has 2x headroom on a
 * slower or busier machine.
 */
const COST_TARGET_MS = MEASURE_DEFAULT_BUDGET_MS / 2;

/** The gate's static verdict on a candidate; null when clean. */
function staticProblem(src) {
  try { const v = analyze(src); return v.length ? v[0].message : null; } catch (e) { return `unparseable: ${e.message}`; }
}

async function overBudget(sources, workers) {
  const res = await measureSources(sources, { budgetMs: COST_TARGET_MS, workers });
  const bad = new Map();
  for (const [src, r] of res) if (r.status !== 'ok') bad.set(src, r);
  return bad;
}

/**
 * Decisions for what the mechanical pass left over -- a pattern whose evidence needs a bound over
 * MAX_BOUND, or whose rewritten form is over the cost target.
 *
 * WHY THIS IS A DECISION. These are mostly patterns of the form `word1.*word2`. On a minified one-line
 * page the two words occur kilobytes to megabytes apart by coincidence ("ebs" in "webs", "tribal" in a
 * footer), so the evidence "needs" a bound of up to 5 MB: the pattern only matches by spanning unrelated
 * text. No bound that keeps those matches is affordable, so the question is not "which N reproduces the
 * old result" but "which N keeps the matches that are a phrase". The rule, uniform for all of them: the
 * largest of 250 / 200 / 160 / 120 / 100 / 80 / 60 / 40 / 20 that the rewritten regex can afford (COST_TARGET_MS), per-wildcard no
 * larger than the evidence asked for. The decision records what that costs -- how many match starts
 * survive, how many pages change verdict -- so the loss is stated, not hidden.
 *
 * Kept only if no page GAINS a match and the original finished. `acceptPagesLost` is the measured number
 * of pages whose verdict changes; applying the decision later fails if the corpus shows more, so a
 * decision cannot silently cover a bigger loss than the one that was reviewed.
 */
const LADDER = [250, 200, 160, 120, 100, 80, 60, 40, 20];
async function proposeDecisions(leftovers, items, pages, opts) {
  const ladders = [];
  const sources = [];
  for (const res of leftovers) {
    if (!res.bounds.length) continue;
    const rungs = LADDER.map((L) => {
      const bounds = res.bounds.map((b) => (b.action === 'drop' ? 'drop' : Math.min(b.bound, L)));
      const cand = decisionCandidate(res, { bounds, tagLocal: false });
      return cand && !staticProblem(cand.source) ? { L, bounds, cand } : null;
    }).filter(Boolean);
    ladders.push({ res, rungs });
    for (const r of rungs) sources.push(r.cand.source);
  }
  const bad = await overBudget(sources, opts.workers);
  const forced = [];
  for (const { res, rungs } of ladders) {
    const fit = rungs.find((r) => !bad.has(r.cand.source));
    if (!fit) { res.reason = `even at the lowest rung (20) the rewritten form is over the ${COST_TARGET_MS} ms cost target`; continue; }
    forced.push({ ...itemToPlain(items.get(res.id)), forceCandidate: fit.cand, _bounds: fit.bounds, _prev: res });
  }
  const out = {};
  // No corpus evidence exists for these channels, so there is nothing to verify against; the decision
  // is the bound the cost target allows, and says so.
  for (const f of forced.filter((x) => x.kind === 'none')) {
    out[f.id] = { bounds: f._bounds, acceptPagesLost: 0, reason: `bounded to ${f._bounds.join('/')} (largest the cost target allows); no corpus evidence exists for this channel`, decided: DECIDED_DATE };
  }
  const checkable = forced.filter((x) => x.kind !== 'none');
  if (!checkable.length) return out;
  const verified = await planAndVerify(checkable.map(({ _bounds, _prev, ...f }) => f), pages, opts);
  verified.forEach((v, i) => {
    const c = v.candidates.find((x) => x.id === 'decision');
    if (!c || c.verdictGained || c.newDidNotFinish) return;
    const prev = checkable[i]._prev;
    const maxSpan = Math.max(0, ...prev.observed.map((o) => o.max || 0));
    const comparable = decisionCandidate(prev, { bounds: checkable[i]._bounds }).comparable;
    const kept = comparable ? `; keeps ${c.oldStarts - c.startsLost} of ${c.oldStarts} match starts` : '';
    out[v.id] = {
      bounds: checkable[i]._bounds,
      acceptPagesLost: c.verdictLost,
      reason: `bounded to ${checkable[i]._bounds.join('/')} (largest the cost target allows): ${c.verdictLost} of ${c.compared} inputs change verdict${kept}; the evidence asked for up to ${maxSpan}`,
      decided: DECIDED_DATE,
    };
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// TSV
// ---------------------------------------------------------------------------------------------

const tsvCell = (v) => String(v === undefined || v === null ? '' : v).replace(/[\t\r\n]+/g, ' ');

function writeReviewTsv(file, rows) {
  const cols = ['outcome', 'channel', 'technologies', 'rules', 'pattern', 'observed_max_span', 'observed_p99', 'match_starts', 'old_did_not_finish',
    'recommended_bounds', 'recommended_pattern', 'lost_starts', 'lost_pages', 'tags', 'reason', 'sample_lost'];
  const lines = [cols.join('\t')];
  for (const r of rows) lines.push(cols.map((c) => tsvCell(r[c])).join('\t'));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  const corpusDir = arg('--corpus');
  if (!corpusDir) { console.error('--corpus <dir> is required (see the header of this file)'); process.exit(2); }
  const WRITE = flag('--write');
  const workers = Math.min(6, Number(arg('--workers', 6)));
  const timeoutMs = Number(arg('--timeout-ms', 10000));
  const only = arg('--only');

  let patternPaths;
  if (arg('--candidate')) { patternPaths = [...config.patternPaths]; patternPaths[0] = path.resolve(arg('--candidate')); }
  const effective = loadEffective(patternPaths ? { patternPaths } : {});
  const records = enumerateRegexes(effective);

  const decisionsPath = arg('--decisions', path.join(ROOT, 'patterns/wildcard-decisions.json'));
  let decisions = loadDecisions(decisionsPath);

  // ---- offenders -> items
  const items = new Map();
  const structural = [];
  let offenderRecords = 0;
  for (const r of records) {
    let v; try { v = analyze(r.pattern); } catch { continue; }
    if (!v.length) continue;
    offenderRecords++;
    if (only && !r.pattern.includes(only)) continue;
    const spanRules = v.filter((x) => SPAN_RULES.has(x.rule));
    if (!spanRules.length) { structural.push({ r, rules: [...new Set(v.map((x) => x.rule))] }); continue; }
    const it = itemFor(r);
    if (!items.has(it.id)) items.set(it.id, { ...it, rules: new Set(), locations: [] });
    const rec = items.get(it.id);
    v.forEach((x) => rec.rules.add(x.rule));
    rec.locations.push(r);
  }
  // A reviewed decision with an explicit replacement may also name a pattern the STATIC rules pass but the
  // MEASURED gate does not (a bounded `{1,512}` over a one-character prefix): those join the work too.
  const structuralIds = new Set(structural.map((x) => itemFor(x.r).id));
  for (const [id, dec] of Object.entries(decisions)) {
    if (typeof dec.to !== 'string' || items.has(id) || structuralIds.has(id)) continue;
    for (const r of records) {
      const it = itemFor(r);
      if (it.id !== id) continue;
      if (!items.has(id)) items.set(id, { ...it, rules: new Set(['cost-only']), locations: [] });
      items.get(id).locations.push(r);
    }
  }
  const itemList = [...items.values()];
  const byChannel = {};
  for (const r of records) { try { if (analyze(r.pattern).some((x) => SPAN_RULES.has(x.rule))) byChannel[r.channel] = (byChannel[r.channel] || 0) + 1; } catch { /* unparseable: reported by the gate */ } }
  console.log(`effective set: ${records.length} regexes; ${offenderRecords} flagged (${itemList.length} distinct wildcard patterns to rewrite, ${structural.length} structural/other)`);
  console.log(`  unbounded-wildcard regexes BEFORE, by channel: ${JSON.stringify(byChannel)}`);

  // ---- corpus
  let pages = listCorpus(corpusDir);
  if (arg('--limit')) {
    const ids = [...new Set(pages.map((p) => p.inst))];
    const k = Math.max(1, Math.floor(ids.length / Number(arg('--limit'))));
    const keep = new Set(ids.filter((_, i) => i % k === 0));
    pages = pages.filter((p) => keep.has(p.inst));
  }
  const instCount = new Set(pages.map((p) => p.inst)).size;
  console.log(`corpus: ${pages.length} pages, ${instCount} institutions (${corpusDir}); ${workers} workers, per-call timeout ${timeoutMs} ms`);

  // ---- observe + verify
  const t0 = Date.now();
  const results = await planAndVerify(itemList.map(({ rules, locations, ...it }) => it), pages, { workers, timeoutMs });
  console.log(`verified ${results.length} patterns in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // ---- stage A: what the mechanical pass produced
  const acceptUnobservable = flag('--accept-unobservable');
  const meta = new Map();
  for (const res of results) {
    const item = items.get(res.id);
    const tags = [];
    const sus = precisionSuspect(res.source);
    if (sus) tags.push(`precision-suspect (${sus})`);
    if (res.bounds.some((b) => b.unobserved)) tags.push('unobserved');
    if (res.oldDidNotFinish) tags.push(`old-did-not-finish x${res.oldDidNotFinish}`);
    let outcome = res.outcome;
    let chosen = res.chosen;
    let basis = null;
    if (outcome === 'IDENTICAL') {
      const biggest = Math.max(0, ...res.bounds.filter((b) => b.action === 'bound').map((b) => b.bound));
      if (biggest > MAX_BOUND) { outcome = 'BOUND_TOO_LARGE'; res.reason = `the evidence needs a bound of ${biggest}, over the ${MAX_BOUND} cap: the pattern only matches by spanning unrelated text`; chosen = null; }
      else basis = res.bounds.some((b) => b.unobserved) ? 'corpus:IDENTICAL(unobserved-default-bound)' : 'corpus:IDENTICAL';
    }
    if (outcome === 'UNVERIFIABLE' && acceptUnobservable) {
      chosen = res.candidates.find((c) => c.id === 'class') || res.candidates[0];
      outcome = 'IDENTICAL'; basis = 'unobservable-channel:default-bound'; tags.push('unobservable-channel');
    }
    meta.set(res.id, { item, tags, outcome, chosen, basis, how: chosen ? (outcome === 'IDENTICAL' && basis && basis.startsWith('unobservable') ? 'unobservable-channel' : 'corpus-identical') : null });
  }

  // ---- stage B: a rewrite must itself pass the gate -- the static rules, then the cost target. A rewrite
  // that is identical on the corpus but still carries a banned shape, or is correct and too slow, is not a fix.
  for (const m of meta.values()) {
    const why = m.chosen && staticProblem(m.chosen.source);
    if (why) { m.outcome = 'STATIC'; m.costNote = `the rewritten form still violates the static rules: ${why}`; m.chosen = null; m.basis = null; }
  }
  {
    const withChosen = [...meta.values()].filter((m) => m.chosen);
    const bad = await overBudget(withChosen.map((m) => m.chosen.source), workers);
    let demoted = 0;
    for (const m of withChosen) {
      const r = bad.get(m.chosen.source);
      if (!r) continue;
      m.outcome = 'COST'; m.costNote = `the rewritten form costs ${r.status === 'ok' ? r.maxMs : '>' + r.maxMs} ms on a 1 MB input (target ${COST_TARGET_MS} ms)`;
      m.chosen = null; m.basis = null; demoted++;
    }
    console.log(`cost: ${withChosen.length - demoted} of ${withChosen.length} rewrites are within ${COST_TARGET_MS} ms on 1 MB inputs; ${demoted} are not and go to a decision`);
  }

  // ---- stage C: decisions. Hand-written ones win over generated ones.
  if (flag('--auto-decide')) {
    const leftovers = results.filter((res) => {
      const m = meta.get(res.id);
      return !m.chosen && !decisions[res.id] && m.outcome !== 'NEEDS_REVIEW';
    });
    const proposals = await proposeDecisions(leftovers, items, pages, { workers, timeoutMs });
    decisions = { ...proposals, ...decisions };
    console.log(`auto-decide: ${Object.keys(proposals).length} proposal(s) for ${leftovers.length} leftover pattern(s), largest bound of ${LADDER.join('/')} within the cost target`);
  }
  if (arg('--propose-decisions')) {
    fs.writeFileSync(arg('--propose-decisions'), JSON.stringify({ decisions }, null, 2) + '\n');
    console.log(`decisions -> ${arg('--propose-decisions')}`);
    return;
  }
  const decidedItems = [];
  for (const res of results) {
    const dec = decisions[res.id];
    const m = meta.get(res.id);
    if (!dec || m.chosen) continue;
    const forced = decisionCandidate(res, dec);
    if (forced) decidedItems.push({ ...itemToPlain(items.get(res.id)), forceCandidate: forced });
  }
  const decidedResults = new Map();
  if (decidedItems.length) {
    const again = await planAndVerify(decidedItems, pages, { workers, timeoutMs });
    for (const r of again) decidedResults.set(r.id, r);
    console.log(`verified ${decidedItems.length} reviewed decision(s)`);
  }
  const decidedCost = await overBudget(decidedItems.map((d) => d.forceCandidate.source), workers);
  const decidedApplied = [];
  for (const res of results) {
    const dec = decisions[res.id];
    const m = meta.get(res.id);
    const dr = decidedResults.get(res.id);
    if (!dec || m.chosen || !dr) continue;
    const cand = dr.candidates.find((c) => c.id === 'decision');
    const unverifiable = m.item.kind === 'none';
    const allowedLoss = Number.isFinite(dec.acceptPagesLost) ? dec.acceptPagesLost : 0;
    const clean = unverifiable || (cand && cand.verdictLost <= allowedLoss && cand.verdictGained === 0 && cand.newDidNotFinish === 0);
    res.decisionStats = cand && !unverifiable ? { compared: cand.compared, oldStarts: cand.oldStarts, startsLost: cand.startsLost, comparable: cand.comparable !== false, verdictLost: cand.verdictLost, verdictGained: cand.verdictGained, lost: cand.lost } : null;
    const src = decisionCandidate(res, dec).source;
    const badShape = staticProblem(src);
    if (badShape) { res.reason = `the decided form still violates the static rules: ${badShape}`; continue; }
    if (decidedCost.has(src)) { res.reason = `the decided form costs more than the ${COST_TARGET_MS} ms target`; continue; }
    if (!clean) { res.reason = `the decision changes more than the ${allowedLoss} page verdict(s) it accepted (${cand && cand.verdictLost} lost, ${cand && cand.verdictGained} gained)`; continue; }
    m.chosen = { id: 'decision', source: src, method: 'decision' };
    m.outcome = 'IDENTICAL'; m.basis = `decision:${dec.reason}`;
    m.how = /^bounded to /.test(dec.reason) ? 'decision (cost-forced bound)' : 'decision (reviewed replacement)';
    m.tags.push(unverifiable ? 'decided (no corpus evidence)' : `decided (${(cand && cand.startsLost) || 0} match starts and ${(cand && cand.verdictLost) || 0} page verdict(s) beyond the decided bound)`);
    decidedApplied.push(res.id);
  }

  // ---- stage D: outcomes
  const rows = [];
  const applied = [];
  const tally = { IDENTICAL: 0, LOST: 0, GAINED: 0, 'LOST+GAINED': 0, SLOW: 0, NEEDS_REVIEW: 0, UNVERIFIABLE: 0, BOUND_TOO_LARGE: 0, COST: 0, STATIC: 0, STRUCTURE: structural.length };
  for (const res of results) {
    const m = meta.get(res.id);
    const { item, tags } = m;
    const outcome = m.outcome;
    tally[outcome] = (tally[outcome] || 0) + 1;
    const o0 = res.observed[0] || {};
    const maxSpan = Math.max(0, ...res.observed.map((o) => (o.max === null ? 0 : o.max)));
    const best = res.candidates.find((c) => c.id === 'class') || res.candidates[0] || {};
    if (outcome === 'IDENTICAL' && m.chosen) {
      applied.push({ res, item, chosen: m.chosen, basis: m.basis, how: m.how });
      const suspect = tags.some((t) => t.startsWith('precision-suspect'));
      const ds = res.decisionStats;
      const lossy = !!ds && ds.verdictLost > 0;
      // Which rewrites still want a human eye: the ones whose literal parts are too short to be safe once
      // bounded (a precision question), and the ones where the bound the cost target allows changed the
      // verdict on some pages (a recall question). Everything else is identical on the corpus.
      if (suspect || lossy) {
        const kept = ds && ds.comparable ? ds.oldStarts - ds.startsLost : null;
        const genuine = lossy && ds.comparable && o0.le1000 !== undefined && ds.oldStarts > 0 && (o0.le1000 - kept) / ds.oldStarts >= 0.2;
        if (genuine) tags.push('possible-genuine-loss');
        rows.push({
          outcome: lossy ? 'REWRITTEN-LOSSY' : 'REWRITTEN', channel: res.channel, technologies: [...new Set(item.locations.map((l) => l.tech))].join('; '),
          rules: [...item.rules].join(','), pattern: res.source, observed_max_span: maxSpan || '', observed_p99: o0.p99 ?? '',
          match_starts: res.startsTotal, old_did_not_finish: res.oldDidNotFinish,
          recommended_bounds: '', recommended_pattern: m.chosen.source, lost_starts: ds ? ds.startsLost : '', lost_pages: ds ? ds.verdictLost : '',
          tags: tags.join('; '),
          reason: lossy ? `rewritten at the largest bound the cost target allows; ${ds.verdictLost} of ${ds.compared} page verdicts change (the pattern only matched by spanning far-apart text, or its genuine matches have longer gaps than the cost target affords)`
            : 'rewritten (cost fix only); the literal parts are too short to be safe once bounded: a precision review is a separate decision',
          sample_lost: ds && ds.lost ? ds.lost.slice(0, 3).map((x) => `${x.inst}/${x.page} span=${x.spanLength} «${x.context.slice(0, 120)}»`).join(' || ') : '',
        });
      }
    } else {
      const lostSamples = (res.candidates.flatMap((c) => c.lost || []).slice(0, 3)).map((x) => `${x.inst}/${x.page} span=${x.spanLength} «${x.context.slice(0, 120)}»`).join(' || ');
      rows.push({
        outcome, channel: res.channel, technologies: [...new Set(item.locations.map((l) => l.tech))].join('; '),
        rules: [...item.rules].join(','), pattern: res.source, observed_max_span: maxSpan || '', observed_p99: o0.p99 ?? '',
        match_starts: res.startsTotal, old_did_not_finish: res.oldDidNotFinish,
        recommended_bounds: res.bounds.map((b) => (b.action === 'drop' ? 'drop' : Math.min(b.bound, MAX_BOUND))).join(','),
        recommended_pattern: best.source || '', lost_starts: best.startsLost ?? '', lost_pages: best.verdictLost ?? '',
        tags: tags.join('; '), reason: m.costNote || res.reason || '', sample_lost: lostSamples,
      });
    }
    res.tags = tags;
    res.how = m.how || null;
    res.finalOutcome = outcome;
  }

  for (const sr of structural) {
    // A structural offender (a leading run, a nested repeat) has no mechanical bound. A reviewed decision
    // may supply the replacement outright (`to`); it is exact by construction, not by measurement.
    const it = itemFor(sr.r);
    const dec = decisions[it.id];
    if (dec && typeof dec.to === 'string') {
      applied.push({ res: { id: it.id, source: sr.r.pattern }, item: { ...it, locations: [sr.r] }, chosen: { source: dec.to, method: 'decision' }, basis: `decision:${dec.reason}` });
      tally.STRUCTURE--; tally.IDENTICAL++;
      continue;
    }
    rows.push({
      outcome: 'STRUCTURE', channel: sr.r.channel, technologies: sr.r.tech, rules: sr.rules.join(','), pattern: sr.r.pattern, reason: 'nested/ambiguous/run quantifier: no mechanical bound; needs a human',
    });
  }

  const howCount = {};
  for (const a of applied) howCount[a.how || 'decision (reviewed replacement)'] = (howCount[a.how || 'decision (reviewed replacement)'] || 0) + 1;
  const methodCount = {};
  for (const a of applied) { const k = a.chosen.id === 'tag-local' ? 'bound, tag-local [^<>\\n]' : a.chosen.method === 'drop' ? 'drop (redundant end wildcard)' : a.chosen.method === 'drop+bound' ? 'drop + bound' : a.chosen.method === 'decision' ? 'decision' : 'bound, same class'; methodCount[k] = (methodCount[k] || 0) + 1; }
  console.log('\nhow the applied rewrites were decided:', JSON.stringify(howCount));
  console.log('rewrite forms:', JSON.stringify(methodCount));
  console.log('\noutcomes (distinct patterns):', JSON.stringify(tally));
  console.log(`  would write ${applied.length} rewrite(s); ${rows.length} row(s) stay in the review file`);

  if (arg('--report-out')) fs.writeFileSync(arg('--report-out'), JSON.stringify({ tally, results }, null, 1));

  // ---- CPU: old vs new regex time over a deterministic institution subset, rewritten patterns only. After
  // the writes on purpose: it can take long (the OLD regexes are the slow ones) and must not hold them up.
  async function cpuStage() {
    let cpu = [];
    if (applied.length && !flag('--no-cpu')) {
      const sub = costSubset(pages, Number(arg('--cpu-institutions', 500)), (arg('--cpu-include', '172')).split(',').filter(Boolean).map(Number));
      console.log(`CPU: old vs new over ${new Set(sub.map((p) => p.inst)).size} institutions, ${sub.length} pages`);
      const cpuItems = applied.filter((a) => a.item.kind !== 'none').map((a) => ({
        id: a.res.id, kind: a.item.kind, metaName: a.item.metaName, dom: a.item.dom, oldSource: a.res.source, newSource: a.chosen.source,
      }));
      cpu = await measureCpu(cpuItems, sub, { workers, timeoutMs, itemBudgetMs: Number(arg('--cpu-item-budget-ms', 20000)) });
      const oldMs = cpu.reduce((x, c) => x + c.oldMs, 0); const newMs = cpu.reduce((x, c) => x + c.newMs, 0);
      console.log(`  summed regex time over the subset, rewritten patterns only: old ${(oldMs / 1000).toFixed(1)} s (lower bound where an old regex hit its per-item budget) -> new ${(newMs / 1000).toFixed(1)} s`);
    }
    if (arg('--report-out')) fs.writeFileSync(arg('--report-out'), JSON.stringify({ tally, results, cpu }, null, 1));
  }

  if (!WRITE) { console.log('\n(dry run: nothing written; --write applies the IDENTICAL set)'); await cpuStage(); return; }

  // ---- write
  const curatedFiles = config.patternPaths.filter((p) => /higher-ed-|general-analytics-extensions|fediverse-social/.test(p)).map((p) => path.resolve(ROOT, 'src', p));
  const curated = new Map(curatedFiles.map((f) => [f, JSON.parse(fs.readFileSync(f, 'utf8'))]));
  const layerPath = path.join(ROOT, 'patterns/pattern-rewrites.json');
  const layer = JSON.parse(fs.readFileSync(layerPath, 'utf8'));

  const toApply = applied.map((a) => ({ from: a.res.source, to: a.chosen.source, basis: a.basis, locations: a.item.locations }));
  const placement = planPlacement(toApply, curated);
  let curatedCount = 0;
  for (const [file, { text, count }] of renderCurated(placement.curatedEdits, (f) => fs.readFileSync(f, 'utf8'))) {
    fs.writeFileSync(file, text);
    curatedCount += count;
    console.log(`  edited ${path.relative(ROOT, file)}: ${count} pattern(s)`);
  }
  addLayerEntries(layer, placement.layerEntries);
  fs.writeFileSync(layerPath, serializeLayer(layer));

  // Anything still in the EFFECTIVE set after those writes (an alias union, a duplicate in the generated
  // artifact) is covered by the layer as well. Asked in a fresh process: this one cached the old layer.
  const probes = [];
  for (const a of toApply) for (const loc of a.locations) probes.push({ tech: loc.tech, channel: loc.channel, key: loc.key, pattern: a.from, loc, a });
  const probeFile = path.join(os.tmpdir(), `still-present-${process.pid}.json`);
  fs.writeFileSync(probeFile, JSON.stringify(probes.map(({ tech, channel, key, pattern }) => ({ tech, channel, key, pattern }))));
  const still = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'lib/still-present.js'), probeFile], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  fs.rmSync(probeFile, { force: true });
  if (still.length) {
    addLayerEntries(layer, still.map((i) => ({ loc: probes[i].loc, from: probes[i].a.from, to: probes[i].a.to, basis: probes[i].a.basis })));
    fs.writeFileSync(layerPath, serializeLayer(layer));
    console.log(`  ${still.length} more location(s) covered through the rewrite layer (alias or generated duplicate)`);
  }
  const layerCount = Object.values(layer.rewrites).reduce((n, t) => n + Object.values(t).reduce((m, l) => m + l.length, 0), 0);
  console.log(`  wrote ${curatedCount} curated edit(s) and ${layerCount} layer entr${layerCount === 1 ? 'y' : 'ies'}`);

  if (flag('--auto-decide') && decidedApplied.length) {
    const keep = {};
    for (const id of decidedApplied) keep[id] = decisions[id];
    const existing = fs.existsSync(decisionsPath) ? JSON.parse(fs.readFileSync(decisionsPath, 'utf8')) : {};
    fs.writeFileSync(decisionsPath, JSON.stringify({
      _comment: existing._comment || DECISIONS_COMMENT,
      decisions: Object.fromEntries(Object.entries({ ...(existing.decisions || {}), ...keep }).sort(([x], [y]) => x.localeCompare(y))),
    }, null, 2) + '\n');
    console.log(`  recorded ${decidedApplied.length} decision(s) in ${path.relative(ROOT, decisionsPath)}`);
  }
  const reviewOut = arg('--review-out', path.join(ROOT, 'patterns/wildcard-review.tsv'));
  writeReviewTsv(reviewOut, rows);
  console.log(`  review file: ${path.relative(ROOT, reviewOut)} (${rows.length} row(s))`);

  await cpuStage();
}

function itemToPlain(it) {
  const { rules, locations, ...rest } = it;
  void rules; void locations;
  return rest;
}

main().catch((e) => { console.error(e); process.exit(1); });
void chooseBound;
