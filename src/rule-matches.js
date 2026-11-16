// src/rule-matches.js — what a fired rule actually matched (artifact schema 2).
//
// Until now the engine reported only the RULE (`Script: elastic`), never what it matched, so the
// ledger loader graded rows on the channel a rule lives in. `Script: elastic` matching an Avada
// slider plugin, `Script: force` matching "workforce" and another site's WordPress all graded as
// anchored (deTECHtor review 2026-11-15, the class finding). Each fired rule now also yields
// `matches[]` entries:
//
//   { rule, channel, matched, src, host, part, firstParty, vendorHost, link }
//
//   rule        the exact string pushed to `evidence` / `rules` (unchanged, for audit continuity)
//   channel     Script | DOM | Meta | HTML | JS
//   matched     the matched substring, at most 200 characters
//   src         what the rule ran against: the script src, the DOM attribute value, the meta content;
//               null for HTML and JS (and for a DOM rule with no attribute to read)
//   host        lower-cased host of src when src is an absolute or protocol-relative URL; a relative
//               src resolves against the page URL (script src and URL attributes only); else null
//   part        host | path | query | fragment: where inside src the match starts; null when src is
//               not a URL
//   firstParty  registrable(host) == registrable(page host); null when either is unknown
//   vendorHost  host is on one of the technology's vendor domains; null when there is no host
//   link        a DOM rule whose selector targets a[href], area[href] or form[action]
//
// Caps: at most MAX_PER_RULE entries per rule and MAX_PER_DETECTION per detection, in evaluation
// order (the order of `rules`, then document order), so the output is deterministic.
'use strict';

const { registrableDomain, hostOf, hostOnDomain, normalizeHost } = require('./registrable-domain');

const MAX_MATCHED = 200;
const MAX_SRC = 500;
const MAX_PER_RULE = 3;
const MAX_PER_DETECTION = 20;

// Attributes whose value is a URL, so a relative value resolves against the page URL.
const URL_ATTRS = new Set(['src', 'href', 'action', 'data-src', 'data-href', 'data-url', 'poster', 'formaction']);

// ------------------------------------------------------------------ URLs

/**
 * Split a URL-ish string into spans. Returns null when it is not a URL reference we can place
 * (a non-hierarchical scheme such as data: or javascript:, or text with whitespace).
 * @returns {{absolute:boolean, hostStart:number, hostEnd:number, pathEnd:number, queryEnd:number}|null}
 */
function urlSpans(src) {
  if (typeof src !== 'string' || !src) return null;
  let hostStart = 0;
  let hostEnd = 0;
  let absolute = false;
  const scheme = src.match(/^([a-z][a-z0-9+.-]*):/i);
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src)) {
    absolute = true;
    hostStart = src.indexOf('//') + 2;
    const rest = src.slice(hostStart).search(/[/?#]/);
    hostEnd = rest === -1 ? src.length : hostStart + rest;
  } else if (scheme) {
    return null; // data:, javascript:, mailto:, ... carry no host
  } else if (/\s/.test(src.trim())) {
    return null; // free text, not a URL reference
  }
  const q = src.indexOf('?', hostEnd);
  const f = src.indexOf('#', hostEnd);
  const fragStart = f === -1 ? src.length : f;
  const queryStart = q === -1 || q > fragStart ? fragStart : q;
  return { absolute, hostStart, hostEnd, pathEnd: queryStart, queryEnd: fragStart };
}

/** host | path | query | fragment for a match starting at `index` of `src`; null if src is not a URL. */
function partAt(spans, index) {
  if (!spans || typeof index !== 'number' || index < 0) return null;
  if (spans.absolute && index < spans.hostEnd) return 'host'; // the scheme counts as the host part
  if (index < spans.pathEnd) return 'path';
  if (index < spans.queryEnd) return 'query';
  return 'fragment';
}

/** Page host from a page URL (string), or null. */
function pageHostOf(pageUrl) {
  if (typeof pageUrl !== 'string' || !pageUrl) return null;
  try {
    return normalizeHost(new URL(pageUrl).hostname);
  } catch {
    return hostOf(pageUrl);
  }
}

// ------------------------------------------------------------------ vendor domains

/**
 * Vendor domains of a technology: the registrable domain of its `website`, plus every entry of its
 * optional `_hosts` array (registrable domains or host suffixes, see docs/PATTERN_GUIDELINES.md).
 * @returns {string[]}
 */
function vendorDomains(pattern) {
  const out = [];
  const site = pattern && typeof pattern.website === 'string' ? pattern.website : null;
  if (site) {
    const h = hostOf(site) || hostOf(`//${site.replace(/^[a-z]+:\/*/i, '')}`);
    const reg = registrableDomain(h);
    if (reg) out.push(reg);
  }
  if (pattern && Array.isArray(pattern._hosts)) {
    for (const h of pattern._hosts) {
      const n = normalizeHost(String(h).replace(/^\*?\./, ''));
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

// ------------------------------------------------------------------ selectors

/** Split at top-level occurrences of `pred` (outside [], () and quotes). */
function splitTopLevel(s, isSep) {
  const parts = [];
  let depthB = 0;
  let depthP = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[') depthB++;
    else if (c === ']') depthB = Math.max(0, depthB - 1);
    else if (c === '(') depthP++;
    else if (c === ')') depthP = Math.max(0, depthP - 1);
    else if (depthB === 0 && depthP === 0 && isSep(c)) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

const ATTR_SEL = /\[\s*([\w:-]+)\s*(?:([*^$~|]?=)\s*(?:'([^']*)'|"([^"]*)"|([^\]\s]+))\s*([is])?\s*)?\]/g;

const subjectCache = new Map();

/**
 * The subject compound of each comma alternative of a selector: its tag and attribute selectors.
 * `div.footer a[href*='x'], area[href*='x']` -> [{tag:'a', attrs:[{name:'href',op:'*=',value:'x'}]}, {tag:'area', ...}]
 */
function selectorSubjects(selector) {
  if (subjectCache.has(selector)) return subjectCache.get(selector);
  const out = [];
  for (const alt of splitTopLevel(String(selector), (c) => c === ',')) {
    const compounds = splitTopLevel(alt.trim(), (c) => /[\s>+~]/.test(c)).filter((x) => x.trim());
    const subject = (compounds[compounds.length - 1] || '').trim();
    const tag = (subject.match(/^([a-z][a-z0-9-]*)/i) || [, null])[1];
    const attrs = [];
    for (const m of subject.matchAll(ATTR_SEL)) {
      attrs.push({ name: m[1].toLowerCase(), op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null });
    }
    out.push({ tag: tag ? tag.toLowerCase() : null, attrs });
  }
  subjectCache.set(selector, out);
  return out;
}

/** Attributes the DOM plan must collect so an `exists` rule's match can be placed (its src). */
function existsRuleAttrs(selector) {
  const names = new Set();
  for (const s of selectorSubjects(selector)) {
    for (const a of s.attrs) names.add(a.name);
    if (s.tag === 'a' || s.tag === 'area') names.add('href');
    if (s.tag === 'form') names.add('action');
  }
  return [...names];
}

/** A DOM rule whose selector targets a[href], area[href] or form[action]. */
function isLinkRule(rule) {
  return selectorSubjects(rule.selector).some((s) => {
    const want = s.tag === 'a' || s.tag === 'area' ? 'href' : s.tag === 'form' ? 'action' : null;
    if (!want) return false;
    return s.attrs.some((a) => a.name === want) || (rule.kind === 'attributes' && rule.name === want);
  });
}

/**
 * For an `exists` rule: which attribute of a matched node the selector constrained, and where its
 * operand sits in the value. Prefers URL attributes. Returns null when the subject has no attribute
 * selector we can read.
 */
function existsSource(rule, node) {
  const attrsOf = (node && node.attributes) || {};
  const candidates = [];
  for (const s of selectorSubjects(rule.selector)) for (const a of s.attrs) candidates.push(a);
  candidates.sort((x, y) => (URL_ATTRS.has(y.name) ? 1 : 0) - (URL_ATTRS.has(x.name) ? 1 : 0));
  for (const a of candidates) {
    const value = attrsOf[a.name];
    if (value === undefined || value === null) continue;
    const v = String(value);
    if (a.value === null || a.value === '') return { attr: a.name, src: v, matched: v, index: 0 };
    let index = -1;
    if (a.op === '$=') index = v.toLowerCase().lastIndexOf(a.value.toLowerCase());
    else index = v.toLowerCase().indexOf(a.value.toLowerCase());
    if (index === -1) continue; // this alternative did not select the node
    return { attr: a.name, src: v, matched: v.substr(index, a.value.length), index };
  }
  // A link subject with no attribute selector still has the href the plan collected.
  for (const s of selectorSubjects(rule.selector)) {
    const want = s.tag === 'a' || s.tag === 'area' ? 'href' : s.tag === 'form' ? 'action' : null;
    if (want && attrsOf[want] !== undefined) return { attr: want, src: String(attrsOf[want]), matched: null, index: -1 };
  }
  return null;
}

// ------------------------------------------------------------------ the record

/**
 * Collects match records for one detection, enforcing the caps.
 */
class MatchCollector {
  /**
   * @param {{pageHost:string|null, vendor:string[]}} ctx
   */
  constructor(ctx) {
    this.pageHost = ctx.pageHost || null;
    this.pageReg = registrableDomain(this.pageHost);
    this.vendor = ctx.vendor || [];
    this.out = [];
    this.perRule = new Map();
  }

  full() {
    return this.out.length >= MAX_PER_DETECTION;
  }

  /** May this rule take another entry? */
  room(rule) {
    return !this.full() && (this.perRule.get(rule) || 0) < MAX_PER_RULE;
  }

  /**
   * @param {object} m
   * @param {string} m.rule
   * @param {string} m.channel
   * @param {string|null} m.matched
   * @param {string|null} [m.src]
   * @param {number} [m.index] where `matched` starts inside `src`
   * @param {boolean} [m.urlValued] src is a URL reference (a relative src resolves against the page)
   * @param {boolean} [m.link]
   */
  add({ rule, channel, matched, src = null, index = -1, urlValued = false, link = false }) {
    if (!this.room(rule)) return false;
    let host = null;
    let part = null;
    if (typeof src === 'string') {
      const spans = urlSpans(src);
      if (spans && (spans.absolute || urlValued)) {
        host = spans.absolute ? hostOf(src) : this.pageHost;
        part = partAt(spans, index);
      }
    }
    const reg = registrableDomain(host);
    const record = {
      rule,
      channel,
      matched: matched === null || matched === undefined ? null : String(matched).slice(0, MAX_MATCHED),
      src: typeof src === 'string' ? src.slice(0, MAX_SRC) : null,
      host,
      part,
      firstParty: reg && this.pageReg ? reg === this.pageReg : null,
      vendorHost: host ? this.vendor.some((d) => hostOnDomain(host, d)) : null,
      link: Boolean(link),
    };
    this.out.push(record);
    this.perRule.set(rule, (this.perRule.get(rule) || 0) + 1);
    return true;
  }
}

/**
 * Union two match lists across pages (multi-page merges): first occurrence wins, duplicates are
 * dropped, the per-rule and per-detection caps still hold.
 */
function mergeMatches(a, b) {
  const out = [];
  const seen = new Set();
  const perRule = new Map();
  for (const m of [...(a || []), ...(b || [])]) {
    if (out.length >= MAX_PER_DETECTION) break;
    const key = JSON.stringify(m);
    if (seen.has(key)) continue;
    const n = perRule.get(m.rule) || 0;
    if (n >= MAX_PER_RULE) continue;
    seen.add(key);
    perRule.set(m.rule, n + 1);
    out.push(m);
  }
  return out;
}

module.exports = {
  MatchCollector,
  mergeMatches,
  vendorDomains,
  pageHostOf,
  urlSpans,
  partAt,
  selectorSubjects,
  existsRuleAttrs,
  existsSource,
  isLinkRule,
  URL_ATTRS,
  MAX_MATCHED,
  MAX_PER_RULE,
  MAX_PER_DETECTION,
};
