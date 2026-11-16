// src/vendor-hosts.js — vendor domains for technologies whose definition lives in the generated base.
//
// A technology's vendor domains (src/rule-matches.js) are the registrable domain of its `website`
// plus its `_hosts` array. Curated technologies carry `_hosts` in their own pattern file. A
// technology defined only in patterns/generated/ cannot: that file is rebuilt by
// scripts/import-webappanalyzer.js and an in-place edit would be reverted. patterns/vendor-hosts.json
// supplies `_hosts` for those, applied at load (union with any `_hosts` already present).
//
// Like category-overrides, this layer never touches evidence fields: `_hosts` is not a regex and is
// never matched against a page. It only decides whether a URL a rule matched is the vendor's own.
'use strict';

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/** A `_hosts` entry is a lower-case dotted host name with at least two labels (no scheme, path or wildcard). */
function isValidHostEntry(h) {
  return typeof h === 'string' && HOST_RE.test(h);
}

/**
 * @param {object} patterns name -> definition
 * @param {object} table name -> string[] (patterns/vendor-hosts.json `hosts`)
 * @returns {object} a new pattern map; inputs are not mutated
 */
function applyVendorHosts(patterns, table = {}) {
  const out = { ...patterns };
  for (const [name, hosts] of Object.entries(table)) {
    if (name === '_comment') continue;
    const def = out[name];
    if (!def || typeof def !== 'object' || !Array.isArray(hosts)) continue; // validateVendorHosts reports it
    const merged = [...(Array.isArray(def._hosts) ? def._hosts : [])];
    for (const h of hosts) if (isValidHostEntry(h) && !merged.includes(h)) merged.push(h);
    out[name] = { ...def, _hosts: merged };
  }
  return out;
}

/**
 * Problems with the table or with any definition's `_hosts`: unknown technology, a malformed entry.
 * @returns {string[]}
 */
function validateVendorHosts(patterns, table = {}) {
  const problems = [];
  for (const [name, hosts] of Object.entries(table)) {
    if (name === '_comment') continue;
    if (!patterns[name]) problems.push(`vendor-hosts.json names "${name}", which is not a loaded technology`);
    if (!Array.isArray(hosts) || !hosts.length) problems.push(`vendor-hosts.json "${name}" must be a non-empty array`);
    else for (const h of hosts) if (!isValidHostEntry(h)) problems.push(`vendor-hosts.json "${name}": bad host ${JSON.stringify(h)}`);
  }
  for (const [name, def] of Object.entries(patterns)) {
    if (!def || typeof def !== 'object' || def._hosts === undefined) continue;
    if (!Array.isArray(def._hosts)) { problems.push(`${name}: _hosts must be an array`); continue; }
    for (const h of def._hosts) if (!isValidHostEntry(h)) problems.push(`${name}: bad _hosts entry ${JSON.stringify(h)}`);
  }
  return problems;
}

module.exports = { applyVendorHosts, validateVendorHosts, isValidHostEntry };
