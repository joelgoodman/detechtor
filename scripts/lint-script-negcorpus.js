#!/usr/bin/env node
/**
 * Negative-corpus gate for script rules
 * =====================================
 * Every other lint judges a rule by its TEXT. This one runs it. Every `scripts` / `scriptSrc` regex of
 * a technology in one of the six tech-ledger categories (CMS, CRM, Marketing Automation, Chatbot,
 * Accessibility, Site Search) is run, as the engine runs it (flag `i`), against a committed fixture of
 * real `<script src>` values harvested from the cohort-143 page archive
 * (tests/fixtures/negcorpus/script-urls.tsv.gz; built by scripts/build-script-url-fixture.js; script
 * URLs only, query values and tokens redacted).
 *
 * A match is ANCHORED when
 *   (1) the src is served from one of the technology's vendor domains (`website` plus `_hosts`, the
 *       same list src/rule-matches.js uses for vendorHost), or
 *   (2) the match itself names the host: it lies in the hostname, starts on a label boundary and
 *       covers the registrable label (`js\.hs-scripts\.com` on js.hs-scripts.com; NOT `force` in
 *       wilberforce.edu, NOT `salesforce` in salesforceliveagent.com, NOT `force\.com` in workforce.com).
 * Every other match is UNANCHORED: the rule fired on a URL for a reason the rule does not state.
 *
 * A rule FAILS when its unanchored matches land on more than K distinct registrable domains (K = 0)
 * and patterns/script-negcorpus-allowlist.json has no entry for it. An entry carries a reason and a
 * `maxOffDomains` ceiling, so an allowlisted rule that gets broader still fails. A stale entry (rule
 * gone, or no longer over K) fails too: the allowlist cannot accumulate dead weight.
 *
 * This is the gate that `Script: force` (matched `workforce`, `wilberforce`) and the bare `salesforce`
 * / `lightning` rules of b9be898 would have failed.
 *
 * Also printed, never gated: hosts that serve ledger-rule matches to many institutions and are not in
 * patterns/shared-tenants.json -- a vendor-operated tenant (UniQuest's Salesforce org) shows up here.
 *
 * Limits: the script channel only. Most rules match nothing in the fixture and are therefore
 * unexercised, not proven precise; the count is printed on every run.
 *
 * Usage: node scripts/lint-script-negcorpus.js [--gate] [--list] [--k N] [--fixture FILE]
 *        [--allowlist FILE] [--shared-min N] [--min-rows N] [--json FILE]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadEffective } = require('./lib/pattern-channels.js');
const { parseRow, runNegCorpus, negCorpusVerdict } = require('./lib/ledger-gates.js');
const { operatorForHosts } = require('../src/shared-tenants.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const GATE = argv.includes('--gate');
const K = Number(arg('--k', 0));
const SHARED_MIN = Number(arg('--shared-min', 5));
const MIN_ROWS = Number(arg('--min-rows', 10000));
const fixturePath = path.resolve(arg('--fixture', path.join(ROOT, 'tests/fixtures/negcorpus/script-urls.tsv.gz')));
const allowPath = path.resolve(arg('--allowlist', path.join(ROOT, 'patterns/script-negcorpus-allowlist.json')));
const t0 = Date.now();

let raw = fs.readFileSync(fixturePath);
if (fixturePath.endsWith('.gz')) raw = zlib.gunzipSync(raw);
const rows = raw.toString('utf8').split('\n').filter(Boolean).map(parseRow).filter(Boolean);
// An empty or truncated measurement must never read as "no rule is broad".
if (rows.length < MIN_ROWS) {
  console.error(`FATAL: ${path.relative(ROOT, fixturePath)} has ${rows.length} rows (minimum ${MIN_ROWS}) -- refusing to pass on a broken measurement`);
  process.exit(2);
}
const allowDoc = JSON.parse(fs.readFileSync(allowPath, 'utf8'));
const entries = Array.isArray(allowDoc.entries) ? allowDoc.entries : [];

const patterns = loadEffective();
const { results, exercised, technologies, shared } = runNegCorpus(patterns, rows);
const { fails, allowed, problems } = negCorpusVerdict(results, entries, K);

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`script negative-corpus gate -- ${rows.length} script URLs on ${new Set(rows.map((r) => r.d)).size} registrable domains -- ` +
  `${results.length} script rules of ${technologies} ledger-category technologies -- K=${K} -- ${secs}s`);
console.log(`  exercised: ${exercised} rules match at least one URL; ${results.length - exercised} match nothing and are UNTESTED here, not proven precise`);
console.log(`  allowlisted: ${allowed.length} rules within their reviewed ceiling (${allowed.filter((a) => /known defect/i.test(a.entry.class || '')).length} of them known defects awaiting a rule fix)`);
const show = argv.includes('--list') ? fails : fails.slice(0, 25);
if (fails.length) {
  console.log(`\nFAIL -- ${fails.length} rule(s) fire on URLs that do not name the vendor (fix the rule, declare the vendor's _hosts, or allowlist with a reason):`);
  for (const f of show) {
    const over = f.entry ? ` (allowlist ceiling ${f.entry.maxOffDomains})` : '';
    console.log(`  ✖ ${f.curated ? 'curated  ' : 'generated'} ${f.cats.join('+')} · ${f.tech} · ${f.pattern}\n` +
      `      unanchored on ${f.off} registrable domain(s)${over}; anchored ${f.anchoredVendor} vendor-host, ${f.anchoredHost} host-named` +
      f.top.map((t) => `\n      ${t[0]} (${t[1]} inst, ${t[2] ? 'first-party' : 'third-party'}): ${t[3]}`).join(''));
  }
  if (show.length < fails.length) console.log(`  … ${fails.length - show.length} more (--list)`);
}
if (problems.length) {
  console.log(`\nALLOWLIST -- ${problems.length} problem(s) in ${path.relative(ROOT, allowPath)}:`);
  for (const p of problems) console.log(`  ✖ ${p}`);
}
for (const s of shared.values()) s.n = [...s.rows].reduce((a, i) => a + rows[i].n, 0);
const tenants = [...shared].filter(([host, s]) => s.n >= SHARED_MIN && host.split('.').length >= 4
  && ![...s.techs].every((t) => operatorForHosts(t, [host]))).sort((a, b) => b[1].n - a[1].n);
console.log(`\nINFO (not gated) -- ${tenants.length} deep host(s) serve ledger-rule matches to ${SHARED_MIN}+ institutions and are not in patterns/shared-tenants.json. ` +
  'A vendor-operated tenant (one org serving many institutions) looks like this; most are the vendor\'s own CDN:');
for (const [host, s] of tenants.slice(0, 10)) console.log(`  ${host}  ~${s.n} inst (summed over URLs)  ${[...s.techs].slice(0, 3).join(', ')}`);

if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(results));
if (GATE && (fails.length || problems.length)) {
  console.error(`\n❌ script negative-corpus gate: ${fails.length} failing rule(s), ${problems.length} allowlist problem(s)`);
  process.exit(1);
}
if (GATE) console.log('\nOK: every exercised ledger-category script rule names its vendor or is allowlisted.');
