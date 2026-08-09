// src/evidence-from-html.js — build engine evidence from archived HTML, with no browser.
//
// UNI-225. benchmark-agent already captures and archives ~5 rendered pages per institution
// (UNI-119, Wasabi via scan_pages.content_archive_key), and page.content() serializes the RENDERED
// DOM -- so JS-injected markup is already in the archive. Tech detection therefore needs no crawl
// for html/scripts/meta/dom rules; it is a pure post-run pass over artifacts already paid for.
//
// This must mirror collectEvidence() in src/detechtor.js. Where it cannot (live DOM properties),
// it says so rather than guessing.
'use strict';
const cheerio = require('cheerio');

const MAX_NODES = 25;   // same bound as the browser path: enough for "any match"
const MAX_TEXT = 500;   // dom text regexes are anchored and short

/**
 * @param {string} html archived rendered HTML
 * @param {Array<{selector:string,text:boolean,attrs:string[],props:string[]}>} domPlan from buildDomPlan()
 * @param {{headers?: object, jsGlobals?: string[]|null}} [options]
 * @returns {object} evidence, as consumed by DeTECHtor#matchPatterns
 */
function evidenceFromHtml(html, domPlan, options = {}) {
  const $ = cheerio.load(html || '');

  const scripts = $('script[src]')
    .map((_, s) => {
      const src = $(s).attr('src') || '';
      return { src, version: (src.match(/[?&]ver=([^&]+)/) || [, null])[1] };
    })
    .get()
    .filter((s) => s.src);

  const meta = {};
  $('meta').each((_, m) => {
    const name = $(m).attr('name') || $(m).attr('property');
    const content = $(m).attr('content');
    if (name && content) meta[name.toLowerCase()] = content;
  });

  const domNodes = {};
  for (const spec of domPlan || []) {
    let els;
    try {
      els = $(spec.selector);
    } catch {
      continue; // malformed selector; lint-dom-rules gates these at CI
    }
    if (!els.length) continue;
    const nodes = [];
    els.slice(0, MAX_NODES).each((_, el) => {
      const node = {};
      if (spec.text) node.text = ($(el).text() || '').slice(0, MAX_TEXT);
      if (spec.attrs.length) {
        node.attributes = {};
        for (const a of spec.attrs) {
          const v = $(el).attr(a);
          if (v !== undefined) node.attributes[a] = v;
        }
      }
      // `properties` are LIVE DOM properties (el.value, el.checked) that do not exist in a parsed
      // static document. Emit the key so the shape matches the browser path, but never synthesize
      // a value -- an unobservable property must read as absent, not as false.
      if (spec.props.length) node.properties = {};
      nodes.push(node);
    });
    domNodes[spec.selector] = nodes;
  }

  // Absent jsGlobals means NOT PROBED (unknown), which is not the same as "no globals present".
  // The engine cannot tell the difference from jsObjects alone, so carry it explicitly.
  const probed = Array.isArray(options.jsGlobals);
  const jsObjects = {};
  if (probed) for (const name of options.jsGlobals) jsObjects[name] = true;

  return {
    html: html || '',
    headers: options.headers || {},
    scripts,
    meta,
    cookies: [],
    dom: { jsObjects },
    domNodes,
    apiEndpoints: [],
    networkHosts: [],
    versionInfo: {},
    jsProbed: probed,
  };
}

module.exports = { evidenceFromHtml, MAX_NODES, MAX_TEXT };
