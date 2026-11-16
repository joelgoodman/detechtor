// src/shared-tenants.js — vendor-operated tenants on shared platform hosts.
//
// A Salesforce org (or a campaign host) that a vendor runs for many unrelated institutions is
// detected like any other tenant: the rules no longer carve it out with a lookahead such as
// `(?!spanside\.|uniquest)`. Whether the detection is the institution's own is decided here, from
// one reviewed list (patterns/shared-tenants.json), so every rule and every technology get the same
// answer for the same host. Ruling (Joel 2026-11-16): such a detection is recorded, flagged with its
// operator, and never shown to users; it is never discarded.
//
// Pure functions only. Called by src/rule-matches.js operatedByFor(), which src/detechtor.js uses to set
// `operatedBy` on a detection from the hosts of its Script and DOM matches.
'use strict';

const REGISTRY = require('../patterns/shared-tenants.json');

const MATCH_KINDS = new Set(['exact', 'suffix']);
const RULINGS = new Set(['vendor_operated']);
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lowercase, drop a port and a trailing dot. Returns null for anything that is not a hostname. */
function normalizeHost(host) {
  if (typeof host !== 'string') return null;
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return HOST_RE.test(h) ? h : null;
}

function entryMatchesHost(entry, host) {
  if (entry.match === 'exact') return host === entry.host;
  return host === entry.host || host.endsWith(`.${entry.host}`);
}

function entryCoversTechnology(entry, technologyName) {
  return entry.technologies === '*' || (Array.isArray(entry.technologies) && entry.technologies.includes(technologyName));
}

/**
 * The vendor that operates every one of these hosts for this technology, or null.
 *
 * Non-null only when the list is non-empty and EVERY host is registered (`ruling: vendor_operated`) for
 * `technologyName` or for "*". One host the registry does not know means the institution may run the
 * technology itself, so the answer is null. When the hosts belong to different registered operators,
 * `operator` lists them, sorted and joined with " / ".
 *
 * @param {string} technologyName  the detection's technology name
 * @param {string[]} hosts          the hosts of its host-anchored matches (Script, or DOM with a host)
 * @param {object} [registry]       defaults to patterns/shared-tenants.json
 * @returns {{operator: string, hosts: string[]} | null}  hosts: the distinct normalised hosts, sorted
 */
function operatorForHosts(technologyName, hosts, registry = REGISTRY) {
  if (!Array.isArray(hosts) || hosts.length === 0) return null;
  const tenants = (registry && registry.tenants) || [];
  const distinct = [...new Set(hosts.map(normalizeHost))];
  if (distinct.some((h) => h === null)) return null;

  const operators = new Set();
  for (const host of distinct) {
    const entry = tenants.find((t) => RULINGS.has(t.ruling) && entryMatchesHost(t, host)
      && entryCoversTechnology(t, technologyName));
    if (!entry) return null;
    operators.add(entry.operator);
  }
  return { operator: [...operators].sort().join(' / '), hosts: distinct.sort() };
}

/**
 * Check a registry document. Returns a list of problems (empty = valid).
 * @param {object} registry
 * @param {{technologies?: Set<string>}} [opts]  when given, every named technology must be in this set
 * @returns {string[]}
 */
function validateRegistry(registry, opts = {}) {
  const problems = [];
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.tenants)) {
    return ['registry must be an object with a `tenants` array'];
  }
  const seen = new Map();
  registry.tenants.forEach((t, i) => {
    const at = `tenants[${i}]${t && t.host ? ` (${t.host})` : ''}`;
    if (!t || typeof t !== 'object') { problems.push(`${at}: not an object`); return; }
    const allowed = new Set(['host', 'match', 'operator', 'technologies', 'ruling', 'reason', 'decided', 'decider', 'seen']);
    for (const k of Object.keys(t)) if (!allowed.has(k)) problems.push(`${at}: unknown key "${k}"`);
    if (normalizeHost(t.host) !== t.host) problems.push(`${at}: host must be a lowercase hostname`);
    if (!MATCH_KINDS.has(t.match)) problems.push(`${at}: match must be exact or suffix`);
    if (typeof t.operator !== 'string' || !t.operator.trim()) problems.push(`${at}: operator missing`);
    if (t.technologies !== '*') {
      if (!Array.isArray(t.technologies) || t.technologies.length === 0
        || t.technologies.some((n) => typeof n !== 'string' || !n)) {
        problems.push(`${at}: technologies must be "*" or a non-empty array of names`);
      } else if (opts.technologies) {
        for (const n of t.technologies) if (!opts.technologies.has(n)) problems.push(`${at}: unknown technology "${n}"`);
      }
    }
    if (!RULINGS.has(t.ruling)) problems.push(`${at}: ruling must be vendor_operated`);
    if (typeof t.reason !== 'string' || !t.reason.trim()) problems.push(`${at}: reason missing`);
    if (typeof t.decided !== 'string' || !DATE_RE.test(t.decided) || Number.isNaN(Date.parse(t.decided))) {
      problems.push(`${at}: decided must be a YYYY-MM-DD date`);
    }
    if (typeof t.decider !== 'string' || !t.decider.trim()) problems.push(`${at}: decider missing`);
    if (t.seen !== undefined && (typeof t.seen !== 'object' || !Array.isArray(t.seen.institutions))) {
      problems.push(`${at}: seen must be {cohort, institutions: [...]}`);
    }
    if (typeof t.host === 'string') {
      if (seen.has(t.host)) problems.push(`${at}: duplicate host (also tenants[${seen.get(t.host)}])`);
      else seen.set(t.host, i);
    }
  });
  // A suffix entry must not swallow another entry's host: two answers for one host.
  const suffixes = registry.tenants.filter((t) => t && t.match === 'suffix' && typeof t.host === 'string');
  for (const s of suffixes) {
    for (const t of registry.tenants) {
      if (t && t !== s && typeof t.host === 'string' && t.host.endsWith(`.${s.host}`)) {
        problems.push(`tenants (${t.host}): also covered by suffix entry ${s.host}`);
      }
    }
  }
  return problems;
}

module.exports = { operatorForHosts, validateRegistry, normalizeHost, REGISTRY };
