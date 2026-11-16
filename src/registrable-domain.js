// src/registrable-domain.js — the registrable domain of a host, without a Public Suffix List.
//
// Rule-match evidence (artifact schema 2) asks two questions of every URL a rule matched in:
//   firstParty — is it the page's own site?   (same registrable domain as the page host)
//   vendorHost — is it the technology's own? (registrable domain is one of the vendor's domains)
// Both compare REGISTRABLE domains, so www.kent.ac.uk and cdn.kent.ac.uk are one party while
// hijack.wearesmile.com is another.
//
// The registrable domain is the last two labels, or the last three when the second-to-last label
// pair is a known public second level (co.uk, ac.uk, com.au, ...). The list below is deliberately
// small: it covers the second levels the corpus actually carries (UK, AU, NZ and the other
// countries with a ".ac/.edu/.co + ccTLD" convention). It is not the Public Suffix List, and it
// does not split hosting platforms (x.github.io, y.azurewebsites.net stay "github.io",
// "azurewebsites.net"). A host missing from the list is compared on two labels, which can only
// merge two parties under one ccTLD second level, never split one party in two.
'use strict';

const PUBLIC_SECOND_LEVELS = new Set([
  // United Kingdom
  'ac.uk', 'co.uk', 'org.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'police.uk',
  // Australia
  'com.au', 'edu.au', 'org.au', 'net.au', 'gov.au', 'asn.au', 'id.au',
  // New Zealand
  'ac.nz', 'co.nz', 'org.nz', 'net.nz', 'govt.nz', 'school.nz', 'iwi.nz',
  // Others with the same convention
  'ac.za', 'co.za', 'org.za', 'ac.jp', 'co.jp', 'ac.kr', 'co.kr', 'ac.in', 'co.in', 'edu.in',
  'ac.il', 'co.il', 'com.br', 'edu.br', 'com.cn', 'edu.cn', 'com.hk', 'edu.hk', 'com.sg', 'edu.sg',
  'com.mx', 'edu.mx', 'com.tr', 'edu.tr', 'com.my', 'edu.my', 'ac.th', 'co.th', 'com.ph', 'edu.ph',
  'com.pk', 'edu.pk', 'com.ng', 'edu.ng', 'ac.ke', 'co.ke', 'com.ar', 'edu.ar', 'com.co', 'edu.co',
]);

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Lower-case a host and drop a trailing dot and any port. Returns null for empty or non-string input. */
function normalizeHost(host) {
  if (typeof host !== 'string') return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith('[')) return h; // IPv6 literal: compared whole
  h = h.replace(/:\d+$/, '').replace(/\.$/, '');
  return h || null;
}

/**
 * @param {string} host e.g. "www.kent.ac.uk"
 * @returns {string|null} e.g. "kent.ac.uk"; an IP literal or single-label host is returned whole
 */
function registrableDomain(host) {
  const h = normalizeHost(host);
  if (!h) return null;
  if (h.startsWith('[') || IPV4.test(h)) return h;
  const labels = h.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (PUBLIC_SECOND_LEVELS.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

/** The host of a URL-ish string (absolute or protocol-relative), or null. */
function hostOf(url) {
  if (typeof url !== 'string') return null;
  const m = url.trim().match(/^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#\s]+)/i);
  if (!m) return null;
  const authority = m[1].replace(/^[^@]*@/, '');
  return normalizeHost(authority);
}

/**
 * Does `host` sit on `domain`? True when it is the domain itself or a subdomain of it.
 * `domain` may be a registrable domain ("hubspot.com") or a longer host suffix ("cdn.example.net").
 */
function hostOnDomain(host, domain) {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

module.exports = { registrableDomain, hostOf, hostOnDomain, normalizeHost, PUBLIC_SECOND_LEVELS };
