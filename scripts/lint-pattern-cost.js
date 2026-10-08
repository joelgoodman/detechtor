#!/usr/bin/env node
/**
 * Pattern cost gate
 * =================
 * An unbounded wildcard in a detection pattern has been "fixed" at least four times and kept coming
 * back. Each fix judged the pattern's TEXT (longest literal, dictionary words, corpus fire rate);
 * `i.*clicker` has a seven-letter literal, passed every one of them, and cost 67% of all match CPU.
 * Nothing measured runtime cost and nothing banned the construct, so this gate does both, on what the
 * ENGINE ACTUALLY LOADS (generated artifact + curated files + identity merge + override layers), not on
 * the source files: the generated upstream file is re-imported and brings wildcards back.
 *
 *   1. STATIC   every regex in every channel the engine compiles is parsed (scripts/lib/regex-shape.js)
 *               and must not contain: an unbounded `*` `+` `{n,}` over a span-eating atom (`.`, a negated
 *               class, \s \S \w \W \D, [\s\S] ...) unless it is terminal or in a `^`-anchored branch; more
 *               than one such wildcard on a match path; an ambiguous nested quantifier or alternation
 *               under an unbounded repeat; a bound so large it is unbounded in practice.
 *   2. MEASURED every regex is run against 1 MB single-line adversarial inputs (dense markup-like text;
 *               repeated near-misses built from the pattern's own literals) in a child process under a
 *               hard per-regex time budget. Allowlisted patterns are NOT exempt from this.
 *   3. HYGIENE  the allowlist (patterns/wildcard-allowlist.json) has no stale, no-op, duplicate or
 *               unexplained entry; the rewrite layer (patterns/pattern-rewrites.json) has no stale rule;
 *               every definition field is classified, so a new channel cannot hide.
 *
 * Usage:
 *   node scripts/lint-pattern-cost.js                 # report
 *   node scripts/lint-pattern-cost.js --gate          # exit 1 on any failure (npm test)
 *   --static-only                                     # skip the measured check
 *   --budget-ms N                                     # per-regex budget on a 1 MB input (default 250)
 *   --workers N                                       # measurement processes (default min(4, cpus))
 *   --exhaustive                                      # also run the unbroken-run ("pump") inputs
 *   --all                                             # print every violation, not the first 60
 *   --extra-patterns FILE                             # load one more pattern file (fixtures)
 *   --candidate FILE                                  # use FILE instead of the generated artifact
 *   --json                                            # machine-readable summary on stdout
 *
 * What it cannot catch is written down in scripts/lib/regex-shape.js (analyze) and docs/WILDCARD_GATE.md.
 */
'use strict';
const path = require('path');
const config = require('../src/config.js');
const { applyPatternOverrides } = require('../src/pattern-overrides.js');
const { validatePatternRewrites } = require('../src/pattern-rewrites.js');
const { loadEffective } = require('./lib/pattern-channels.js');
const { checkStatic, validateAllowlist, loadAllowlist, formatViolation, MEASURE_DEFAULT_BUDGET_MS, keyOf } = require('./lib/cost-gate.js');
const { measureSources } = require('./lib/cost-measure.js');

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

async function main() {
  const t0 = Date.now();
  const GATE = flag('--gate');
  const budgetMs = Number(arg('--budget-ms', MEASURE_DEFAULT_BUDGET_MS));

  let patternPaths;
  if (arg('--candidate') || arg('--extra-patterns')) {
    patternPaths = [...config.patternPaths];
    if (arg('--candidate')) patternPaths[0] = path.resolve(arg('--candidate'));
    if (arg('--extra-patterns')) patternPaths.push(path.resolve(arg('--extra-patterns')));
  }
  const patterns = loadEffective(patternPaths ? { patternPaths } : {});
  const allowlist = loadAllowlist(arg('--allowlist'));
  const checked = checkStatic(patterns, { allowlist });
  const failures = [];

  // ---- static
  const byChannel = {};
  const byRule = {};
  for (const v of checked.violations) {
    byChannel[v.channel] = (byChannel[v.channel] || 0) + 1;
    for (const r of v.rules) byRule[r] = (byRule[r] || 0) + 1;
  }
  console.log(`pattern cost gate · ${checked.total} regexes in the effective set (${Object.keys(patterns).length} technologies), ${checked.invalid} the engine skips as invalid`);
  console.log(`static: ${checked.violations.length} violation(s), ${checked.allowlisted.length} allowlisted`);
  if (checked.violations.length) {
    console.log(`  by channel ${JSON.stringify(byChannel)}  by rule ${JSON.stringify(byRule)}`);
    const shown = flag('--all') ? checked.violations : checked.violations.slice(0, 60);
    for (const v of shown) console.log(`  ✖ ${formatViolation(v)}`);
    if (shown.length < checked.violations.length) console.log(`  … ${checked.violations.length - shown.length} more (--all)`);
    failures.push(`${checked.violations.length} unbounded-wildcard violation(s)`);
  }
  if (checked.unclassified.size) {
    for (const [field, techs] of checked.unclassified) console.log(`  ✖ definition field "${field}" is not classified (${techs.length} technologies, e.g. ${techs[0]}): add it to CHANNELS or NON_REGEX_FIELDS in scripts/lib/pattern-channels.js`);
    failures.push(`${checked.unclassified.size} unclassified definition field(s)`);
  }

  // ---- hygiene
  const allowProblems = validateAllowlist(allowlist.entries, checked);
  for (const p of allowProblems) console.log(`  ✖ allowlist ${p.entry && p.entry.technology} · ${p.entry && p.entry.pattern}: ${p.problem}`);
  if (allowProblems.length) failures.push(`${allowProblems.length} allowlist problem(s)`);

  if (!patternPaths) {
    const pristine = loadEffective({ applyOverrides: false });
    const afterRemovals = applyPatternOverrides(pristine, require('../patterns/pattern-overrides.json').overrides || {});
    const rewriteProblems = validatePatternRewrites(afterRemovals, require('../patterns/pattern-rewrites.json').rewrites || {});
    for (const p of rewriteProblems) console.log(`  ✖ rewrite ${p.name}: ${p.problem}`);
    if (rewriteProblems.length) failures.push(`${rewriteProblems.length} stale or malformed rewrite rule(s)`);
  }

  // ---- measured
  const slow = [];
  let measuredCount = 0;
  let worst = null;
  if (!flag('--static-only')) {
    const usable = checked.records.filter((r) => { try { new RegExp(r.pattern, 'i'); return true; } catch { return false; } });
    const sources = [...new Set(usable.map((r) => r.pattern))];
    const results = await measureSources(sources, { budgetMs, workers: Number(arg('--workers', 0)) || undefined, exhaustive: flag('--exhaustive') });
    measuredCount = results.size;
    const where = new Map();
    for (const r of usable) { if (!where.has(r.pattern)) where.set(r.pattern, []); where.get(r.pattern).push(r); }
    for (const [src, res] of results) {
      if (res.status === 'ok') { if (!worst || res.maxMs > worst.maxMs) worst = { src, ...res }; continue; }
      slow.push({ src, ...res, sites: where.get(src) });
    }
    console.log(`measured: ${measuredCount} distinct regexes x ${flag('--exhaustive') ? 'dense + near-miss + pump' : 'dense + near-miss'} 1 MB inputs, budget ${budgetMs} ms each: ${slow.length} over budget` +
      (worst ? ` (slowest passing: ${worst.maxMs} ms, ${worst.sites ? '' : ''}${worst.src.slice(0, 60)})` : ''));
    for (const s of slow) {
      const first = s.sites[0];
      const lbl = s.status === 'ok' ? '' : s.status.toUpperCase();
      console.log(`  ✖ ${lbl} ${s.status === 'timeout' || s.status === 'hung' ? '>' : ''}${s.maxMs} ms (${s.shape}) ${first.tech} · ${first.channel} · ${s.src}${s.sites.length > 1 ? `  (+${s.sites.length - 1} more use)` : ''}`);
    }
    if (slow.length) failures.push(`${slow.length} regex(es) over the ${budgetMs} ms budget on a 1 MB input`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (flag('--json')) {
    console.log(JSON.stringify({ total: checked.total, violations: checked.violations.length, allowlisted: checked.allowlisted.length, overBudget: slow.length, seconds: +secs }));
  }
  if (failures.length) {
    console.error(`\n❌ pattern cost gate FAILED (${secs}s): ${failures.join('; ')}.\n` +
      '   Bound the wildcard — `node scripts/rewrite-unbounded-wildcards.js --corpus <dir>` does it with corpus evidence —\n' +
      '   or, for a reviewed exception, add an entry to patterns/wildcard-allowlist.json (see its _comment).');
    if (GATE) process.exit(1);
  } else {
    console.log(`✅ pattern cost gate clean (${secs}s)`);
  }
  void keyOf;
}

main().catch((e) => { console.error(e); process.exit(2); });
