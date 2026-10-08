// scripts/lib/cost-gate.js -- the decision logic behind scripts/lint-pattern-cost.js.
//
// Kept separate from the CLI so the importer can ask the same question about a CANDIDATE artifact
// before it is written, and so tests can feed it fixture pattern maps.
'use strict';
const fs = require('fs');
const path = require('path');
const { enumerateRegexes, unclassifiedFields, compiles, CHANNELS } = require('./pattern-channels.js');
const { analyze } = require('./regex-shape.js');

/**
 * The per-regex time budget on a 1 MB adversarial input.
 *
 * Calibrated on the shipped pattern set (docs/WILDCARD_GATE.md): after the rewrite the slowest legitimate
 * regex takes a few tens of milliseconds; the regexes this gate exists to stop take seconds to minutes
 * (iClicker alone: 67% of all match CPU, a 3.35 MB page took 124 s on one pattern). 250 ms leaves a wide
 * margin over the former and sits orders of magnitude under the latter, so a loaded CI machine does not
 * flake the build and a quadratic pattern cannot slip under it.
 */
const MEASURE_DEFAULT_BUDGET_MS = 250;

const ALLOWLIST_PATH = path.resolve(__dirname, '../../patterns/wildcard-allowlist.json');
const CHANNEL_NAMES = new Set(CHANNELS.map((c) => c.channel));

const keyOf = (tech, channel, pattern) => `${tech}\u0000${channel}\u0000${pattern}`;

function loadAllowlist(file = ALLOWLIST_PATH) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { entries: Array.isArray(j.entries) ? j.entries : [] };
}

/**
 * Apply the static rules to every regex the engine compiles.
 * @param {object} patterns the EFFECTIVE map (engine loader output)
 * @param {{allowlist?: {entries: object[]}}} [opts]
 */
function checkStatic(patterns, opts = {}) {
  const entries = (opts.allowlist && opts.allowlist.entries) || [];
  const allowed = new Set(entries.map((e) => keyOf(e.technology, e.channel, e.pattern)));
  const records = enumerateRegexes(patterns);
  const violations = [];
  const allowlisted = [];
  let invalid = 0;
  for (const r of records) {
    if (!compiles(r.pattern)) { invalid++; continue; } // the engine skips it: dead, not costly
    let found;
    try { found = analyze(r.pattern); } catch (e) { found = [{ rule: 'unparseable', message: `the gate cannot read this regex: ${e.message}` }]; }
    if (!found.length) continue;
    const rec = { ...r, rules: [...new Set(found.map((v) => v.rule))], messages: [...new Set(found.map((v) => v.message))] };
    (allowed.has(keyOf(r.tech, r.channel, r.pattern)) ? allowlisted : violations).push(rec);
  }
  return { total: records.length, invalid, violations, allowlisted, records, unclassified: unclassifiedFields(patterns) };
}

/**
 * The ratchet. Problems with the allowlist itself, given a checkStatic() result.
 * @returns {Array<{entry: object, problem: string}>}
 */
function validateAllowlist(entries, checked) {
  const problems = [];
  const seen = new Set();
  const live = new Set(checked.records.map((r) => keyOf(r.tech, r.channel, r.pattern)));
  const offending = new Set([...checked.violations, ...checked.allowlisted].map((r) => keyOf(r.tech, r.channel, r.pattern)));
  for (const e of entries) {
    const add = (problem) => problems.push({ entry: e, problem });
    if (!e || typeof e !== 'object') { add('malformed entry'); continue; }
    for (const f of ['technology', 'channel', 'pattern']) if (typeof e[f] !== 'string' || !e[f]) add(`missing ${f}`);
    if (typeof e.reason !== 'string' || e.reason.trim().length < 30) add('reason must be a sentence (>= 30 chars) saying why this wildcard cannot be bounded');
    if (!(typeof e.maxSpan === 'number' || (e.maxSpan === null && typeof e.maxSpanNote === 'string' && e.maxSpanNote))) add('maxSpan must be a measured number (or null with maxSpanNote saying why none exists)');
    if (typeof e.worstCaseMs !== 'number' || !(e.worstCaseMs >= 0)) add('worstCaseMs must be the measured worst-case cost in ms');
    if (typeof e.channel === 'string' && !CHANNEL_NAMES.has(e.channel)) add(`unknown channel "${e.channel}"`);
    if (typeof e.technology !== 'string' || typeof e.channel !== 'string' || typeof e.pattern !== 'string') continue;
    const k = keyOf(e.technology, e.channel, e.pattern);
    if (seen.has(k)) add('duplicate entry'); seen.add(k);
    if (!live.has(k)) add('the pattern no longer exists in the effective set — remove the entry');
    else if (!offending.has(k)) add('not needed: the pattern no longer offends — remove the entry');
  }
  return problems;
}

/** One printable line per violation. */
function formatViolation(v) {
  const where = v.key ? `${v.channel}[${v.key}]` : v.channel;
  return `${v.tech} · ${where} · ${v.pattern}\n      ${v.rules.join(', ')}: ${v.messages[0]}`;
}

module.exports = {
  MEASURE_DEFAULT_BUDGET_MS, ALLOWLIST_PATH, checkStatic, validateAllowlist, loadAllowlist, formatViolation, keyOf,
};
