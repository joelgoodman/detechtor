// src/html-for-matching.js — the text `html` rules run against: the page's markup, without its CSS
// or its comments.
//
// 2026-11-16 review, finding 12 (cohort 143): of 9,879 html-only signal-category detections, 2,632
// first matched Font Awesome icon CSS inlined in a <style> block (`.fa-umbraco` 682, `.fa-algolia`
// 680, `.fa-salesforce` 642, `.fa-hubspot` 628) and 126 matched a comment. An icon class names a
// brand; it is not that brand's software. None of those detections could load, but each set the
// institution's status to `detected` and stopped tier escalation.
//
// Comments: only a comment that holds markup is dropped (`<!-- <script src="…userway…"> -->`,
// `<!--[if lte IE 8]><script …><![endif]-->`): commented-out code that never loads. Measured on
// cohort 143, every sampled comment-only loss was of that kind (a disabled SiteImprove tag, a
// commented-out UserWay or HubSpot loader). A comment of prose is the site's own annotation and is
// often the only fingerprint a CMS leaves (Squiz Matrix's "Running Squiz Matrix" banner), so it stays.
//
// A rule whose own text names a comment or a style block (Yoast's `<!-- This site is optimized with
// the Yoast SEO plugin`, Mobirise's `<!-- Site made with Mobirise`) is looking for exactly that, so
// it still runs against the raw HTML (ruleSeesRawHtml).
'use strict';

const OPEN = /<!--|<style\b|<script\b/gi;
const STYLE_CLOSE = /<\/style\s*>/gi;
const SCRIPT_CLOSE = /<\/script\s*>/gi;
const COMMENTED_MARKUP = /<[a-zA-Z\/!]/;

/**
 * Replace every `<style>…</style>` block with the URLs it loads, and remove every `<!-- … -->`
 * comment that holds markup. Inline `<script>` text is
 * skipped over untouched: it is evidence, and a `<!--` or `<style>` inside a script string is not a
 * comment or a style block. Linear: each character is visited a bounded number of times. An
 * unterminated block or comment is left in place (the rest of the document is kept rather than
 * guessed away).
 * @param {string} html
 * @returns {string}
 */
function htmlForMatching(html) {
  if (typeof html !== 'string' || html.length === 0) return '';
  let out = '';
  let from = 0;
  OPEN.lastIndex = 0;
  let m;
  while ((m = OPEN.exec(html)) !== null) {
    const start = m.index;
    let end;
    if (m[0].length === 7 && m[0].toLowerCase() === '<script') {
      SCRIPT_CLOSE.lastIndex = start + m[0].length;
      const close = SCRIPT_CLOSE.exec(html);
      if (!close) break;
      OPEN.lastIndex = close.index + close[0].length;
      continue;
    }
    if (m[0] === '<!--') {
      const close = html.indexOf('-->', start + 4);
      if (close === -1) break;
      end = close + 3;
      // A comment of prose is the site's own annotation ("Running Squiz Matrix", "Primo VE Script
      // that converts the query string", a TerminalFour SiteManager URL) and stays. A comment that
      // holds markup is commented-out code or an IE conditional block: the browser loads none of it.
      if (!COMMENTED_MARKUP.test(html.slice(start + 4, close))) {
        OPEN.lastIndex = end;
        continue;
      }
    } else {
      STYLE_CLOSE.lastIndex = start + m[0].length;
      const close = STYLE_CLOSE.exec(html);
      if (!close) break;
      end = close.index + close[0].length;
      out += html.slice(from, start) + ' ' + stylesheetUrls(html.slice(start, end)) + ' ';
      from = end;
      OPEN.lastIndex = end;
      continue;
    }
    out += html.slice(from, start) + ' ';
    from = end;
    OPEN.lastIndex = end;
  }
  return from === 0 ? html : out + html.slice(from);
}

// What a stylesheet loads is the page's own: a font under /wp-content/, WordPress's inlined block CSS
// with its `sourceURL=/wp-includes/…` (cohort 143: 3750, 672, 3975 are WordPress sites whose only
// html trace is there). Selectors are not (`.fa-umbraco`, `.sqs-block-button-element`).
const CSS_URL = /url\(\s*['"]?([^'")\s]{1,500})|@import\s+['"]([^'"]{1,500})|sourceURL=([^\s*]{1,500})/gi;
function stylesheetUrls(block) {
  const urls = [];
  CSS_URL.lastIndex = 0;
  let u;
  while ((u = CSS_URL.exec(block)) !== null) {
    const v = u[1] || u[2] || u[3];
    if (v && !/^data:/i.test(v)) urls.push(v);
  }
  return urls.join(' ');
}

/** True when an html rule names a comment or a style block itself, so it must see the raw page. */
function ruleSeesRawHtml(regexText) {
  return /<\\?!--|<style/i.test(String(regexText));
}

module.exports = { htmlForMatching, ruleSeesRawHtml };
