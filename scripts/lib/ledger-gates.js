// scripts/lib/ledger-gates.js -- the logic of the two gates that guard what reaches the tech ledger:
//   scripts/lint-script-negcorpus.js   (script rules run against real <script src> values)
//   scripts/lint-ledger-categories.js  (reviewed category table)
// Kept here, free of file IO, so tests/ledger-gates.test.js can pin each verdict on a hand-made case.
'use strict';
const { enumerateRegexes } = require('./pattern-channels.js');
const { mapCategory } = require('../../src/category-mapping.js');
const { registrableDomain, hostOf, hostOnDomain } = require('../../src/registrable-domain.js');
const { vendorDomains } = require('../../src/rule-matches.js');

/** The six categories the tech ledger loads (benchmark-agent producer, contract C15). */
const LEDGER = new Set(['CMS', 'CRM', 'Marketing Automation', 'Chatbot', 'Accessibility', 'Site Search']);

/** A definition's ledger categories, canonical names, sorted, de-duplicated. */
function ledgerCats(def) {
  if (!def || typeof def !== 'object') return [];
  return [...new Set(((def.categories || def.cats) || []).map(mapCategory).filter((c) => LEDGER.has(c)))].sort();
}

// ------------------------------------------------------------------ negative corpus

const HOST_SPAN = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/{2,}([^\/?#\s]+)/i;

/**
 * One fixture line -> row. Line: <registrable domain>\t<institutions>\t<first-party 0|1>\t<raw src>.
 * For an absolute src the row also carries the spans of the authority (hs..he) and of the registrable
 * LABEL, the label left of the public suffix (ls..le), and `d` is recomputed from the host.
 */
function parseRow(line) {
  const i1 = line.indexOf('\t');
  const i2 = line.indexOf('\t', i1 + 1);
  const i3 = line.indexOf('\t', i2 + 1);
  if (i1 === -1 || i2 === -1 || i3 === -1) return null;
  const src = line.slice(i3 + 1);
  const host = hostOf(src);
  const row = { d: line.slice(0, i1), n: Number(line.slice(i1 + 1, i2)) || 0, fp: line[i2 + 1] === '1', src, host, hs: -1, he: -1, ls: -1, le: -1 };
  const m = HOST_SPAN.exec(src);
  if (m && host) {
    row.he = m[0].length;
    row.hs = row.he - m[1].length;
    const hostAt = row.hs + m[1].toLowerCase().indexOf(host);
    const rd = registrableDomain(host) || host;
    row.ls = hostAt + host.length - rd.length;
    row.le = rd.indexOf('.') === -1 ? row.he : row.ls + rd.indexOf('.');
    row.d = rd;
  }
  return row;
}

/**
 * How a rule's match on one row is anchored: 'vendor' (served from one of the technology's vendor
 * domains), 'host' (the match itself names the host: in the hostname, on a label boundary, covering
 * the registrable label), or null (unanchored -- the rule fired for a reason it does not state).
 * `reG` must be the rule compiled with flags `gi`.
 */
function anchorOf(row, reG, vendors) {
  if (row.host && vendors.some((v) => hostOnDomain(row.host, v))) return 'vendor';
  if (row.hs === -1) return null;
  // ANY occurrence that names the host anchors the match (technolutions in
  // slate-technolutions-net.cdn.technolutions.net: the first is mid-label, the second is the host).
  reG.lastIndex = 0;
  let m;
  let guard = 0;
  while (guard++ < 8 && (m = reG.exec(row.src))) {
    if (m[0].length === 0) { reG.lastIndex++; continue; }
    let s = m.index;
    const e = m.index + m[0].length;
    while (s < e && (row.src[s] === '.' || row.src[s] === '/')) s++; // a leading `\.` or `//` is the boundary itself
    const onBoundary = s <= row.hs || row.src[s - 1] === '.' || row.src[s - 1] === '/' || row.src[s - 1] === '@';
    if (onBoundary && s <= row.ls && e >= row.le && s < row.he) return 'host';
    if (s >= row.he) break;
    reG.lastIndex = m.index + 1;
  }
  return null;
}

/**
 * Run every scripts/scriptSrc rule of every ledger-category technology against the rows.
 * @returns {{results: object[], exercised: number, technologies: number, shared: Map}}
 *   results[i] = {tech, cats, curated, pattern, matched, anchoredVendor, anchoredHost, off, top}
 *   `off` = distinct registrable domains with an unanchored match; `shared` = host -> {rows:Set, techs:Set}
 */
function runNegCorpus(patterns, rows) {
  const names = new Set(Object.entries(patterns)
    .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object' && ledgerCats(d).length).map(([n]) => n));
  const recs = enumerateRegexes(patterns).filter((r) => names.has(r.tech) && (r.channel === 'scripts' || r.channel === 'scriptSrc'));
  const seen = new Set();
  const results = [];
  const shared = new Map();
  let exercised = 0;
  for (const r of recs) {
    const key = r.tech + '\u0000' + r.pattern;
    if (seen.has(key)) continue;
    seen.add(key);
    let re;
    let reG;
    try { re = new RegExp(r.pattern, 'i'); reG = new RegExp(r.pattern, 'gi'); } catch { continue; } // lint-pattern-cost owns compile errors
    const def = patterns[r.tech];
    const vendors = vendorDomains(def);
    const off = new Map();
    let matched = 0;
    let anchoredVendor = 0;
    let anchoredHost = 0;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!re.test(row.src)) continue;
      matched++;
      if (row.host && !row.fp) {
        const s = shared.get(row.host) || { rows: new Set(), techs: new Set() };
        s.rows.add(ri); s.techs.add(r.tech); shared.set(row.host, s);
      }
      const a = anchorOf(row, reG, vendors);
      if (a === 'vendor') { anchoredVendor++; continue; }
      if (a === 'host') { anchoredHost++; continue; }
      const x = off.get(row.d) || { n: 0, fp: row.fp, ex: row.src };
      x.n += row.n;
      off.set(row.d, x);
    }
    if (matched) exercised++;
    results.push({
      tech: r.tech, cats: ledgerCats(def), curated: !!r.curated, pattern: r.pattern, matched, anchoredVendor, anchoredHost,
      off: off.size, top: [...off].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([d, x]) => [d, x.n, x.fp, x.ex.slice(0, 140)]),
    });
  }
  return { results, exercised, technologies: names.size, shared };
}

/** Allowlist document problems (shape only; staleness needs the results). */
function allowlistShapeProblems(entries, k) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e.technology !== 'string' || typeof e.pattern !== 'string') { out.push(`entry needs {technology, pattern, maxOffDomains, reason, decided}: ${JSON.stringify(e)}`); continue; }
    const key = e.technology + '\u0000' + e.pattern;
    if (seen.has(key)) out.push(`${e.technology} · ${e.pattern}: duplicate entry`);
    seen.add(key);
    if (typeof e.reason !== 'string' || e.reason.trim().length < 20) out.push(`${e.technology} · ${e.pattern}: reason must say what was checked (20+ characters)`);
    if (!Number.isInteger(e.maxOffDomains) || e.maxOffDomains <= k) out.push(`${e.technology} · ${e.pattern}: maxOffDomains must be an integer above K=${k}`);
    if (typeof e.decided !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.decided)) out.push(`${e.technology} · ${e.pattern}: decided must be YYYY-MM-DD`);
  }
  return out;
}

/** Verdict of the negative-corpus gate. */
function negCorpusVerdict(results, entries, k) {
  const entryFor = (r) => entries.find((a) => a.technology === r.tech && a.pattern === r.pattern);
  const fails = [];
  const allowed = [];
  for (const r of results) {
    if (r.off <= k) continue;
    const e = entryFor(r);
    if (e && r.off <= e.maxOffDomains) allowed.push({ ...r, entry: e });
    else fails.push({ ...r, entry: e || null });
  }
  fails.sort((a, b) => b.off - a.off);
  const problems = allowlistShapeProblems(entries, k);
  for (const a of entries) {
    const r = results.find((x) => x.tech === a.technology && x.pattern === a.pattern);
    if (!r) problems.push(`${a.technology} · ${a.pattern}: no such script rule on a ledger-category technology -- stale, remove it`);
    else if (r.off <= k) problems.push(`${a.technology} · ${a.pattern}: no longer unanchored on more than K=${k} domains -- no-op, remove it`);
  }
  return { fails, allowed, problems };
}

// ------------------------------------------------------------------ category review table

const STATUSES = new Set(['reviewed', 'agent-reviewed', 'unreviewed']);

/** Has a channel whose evidence can be anchored (script, meta, dom): the loader can grade it. */
function hasAnchoredChannel(def) {
  return !!((Array.isArray(def.scripts) && def.scripts.length) || (Array.isArray(def.scriptSrc) && def.scriptSrc.length)
    || (def.meta && typeof def.meta === 'object' && Object.keys(def.meta).length) || (Array.isArray(def._domRules) && def._domRules.length));
}

/**
 * Check the reviewed category table against the loaded patterns.
 * @param {object} patterns  effective pattern set (loadEffective)
 * @param {object} table     {technology: {ledger_categories, status, what_it_is, reviewer, date, known_mismatch?}}
 * @param {Map<string,number>} observed  technology -> institutions with a ledger row in the last corpus run
 * @returns {{problems: {NEW, MISMATCH, UNREVIEWED, STALE}, known: string[], live: Map}}
 */
function checkCategoryTable(patterns, table, observed = new Map()) {
  const live = new Map();
  for (const [n, d] of Object.entries(patterns)) {
    if (n === '_metadata' || !d || typeof d !== 'object') continue;
    const c = ledgerCats(d);
    if (c.length) live.set(n, { cats: c, anchored: hasAnchoredChannel(d), override: d._categoryOverride || null });
  }
  const problems = { NEW: [], MISMATCH: [], UNREVIEWED: [], STALE: [] };
  const known = [];
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const [n, v] of live) {
    if (!table[n]) {
      if (v.anchored) problems.NEW.push(`${n}: the engine files it under ${v.cats.join('+')} and the table has no entry -- review its category and add one` +
        (v.override ? ` (category override: ${JSON.stringify(v.override.reason || v.override)})` : ''));
    }
  }
  for (const [n, e] of Object.entries(table)) {
    if (n === '_comment' || n === '_metadata') continue;
    const where = `${n}`;
    if (!e || typeof e !== 'object' || !Array.isArray(e.ledger_categories) || !STATUSES.has(e.status)) {
      problems.STALE.push(`${where}: entry needs {ledger_categories: [...], status: ${[...STATUSES].join('|')}}`);
      continue;
    }
    const bad = e.ledger_categories.filter((c) => !LEDGER.has(c));
    if (bad.length) problems.STALE.push(`${where}: ${bad.join(', ')} is not a ledger category`);
    if (e.status !== 'unreviewed' && !(e.what_it_is && e.reviewer && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))) {
      problems.STALE.push(`${where}: an entry with status ${e.status} needs what_it_is, reviewer and date (YYYY-MM-DD)`);
    }
    if (!patterns[n]) { problems.STALE.push(`${where}: no such technology is loaded -- stale, remove it`); continue; }
    const engine = live.has(n) ? live.get(n).cats : [];
    if (!same(engine, e.ledger_categories)) {
      const msg = `${where}: the engine files it under ${engine.join('+') || 'none of the six'}, the review (${e.reviewer || 'unreviewed'}, ${e.date || '?'}) says ${e.ledger_categories.join('+') || 'none of the six'}` +
        (e.what_it_is ? ` -- ${e.what_it_is}` : '');
      if (e.known_mismatch) known.push(`${msg} [known: ${e.known_mismatch}]`);
      else problems.MISMATCH.push(msg);
    } else if (e.known_mismatch) {
      problems.STALE.push(`${where}: known_mismatch is set but the engine now agrees with the review -- remove known_mismatch`);
    } else if (e.status === 'unreviewed' && observed.has(n)) {
      problems.UNREVIEWED.push(`${where} (${engine.join('+')}): ${observed.get(n)} institution(s) had a ledger row in the last corpus run and the category was never reviewed`);
    }
  }
  return { problems, known, live };
}

module.exports = {
  LEDGER, ledgerCats, parseRow, anchorOf, runNegCorpus, allowlistShapeProblems, negCorpusVerdict,
  STATUSES, hasAnchoredChannel, checkCategoryTable,
};
