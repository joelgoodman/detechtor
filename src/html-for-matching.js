// src/html-for-matching.js — the text `html` rules run against: the page's markup, without its CSS
// or its comments.
//
// 2026-11-16 review, finding 12 (cohort 143): of 9,879 html-only signal-category detections, 2,632
// first matched Font Awesome icon CSS inlined in a <style> block (`.fa-umbraco` 682, `.fa-algolia`
// 680, `.fa-salesforce` 642, `.fa-hubspot` 628) and 126 matched a comment. An icon class names a
// brand; it is not that brand's software. None of those detections could load, but each set the
// institution's status to `detected` and stopped tier escalation.
//
// A rule whose own text names a comment or a style block (Yoast's `<!-- This site is optimized with
// the Yoast SEO plugin`, Mobirise's `<!-- Site made with Mobirise`) is looking for exactly that, so
// it still runs against the raw HTML (ruleSeesRawHtml).
'use strict';

const OPEN = /<!--|<style\b|<script\b/gi;
const STYLE_CLOSE = /<\/style\s*>/gi;
const SCRIPT_CLOSE = /<\/script\s*>/gi;

/**
 * Remove every `<style>…</style>` block and every `<!-- … -->` comment. Inline `<script>` text is
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
    } else {
      STYLE_CLOSE.lastIndex = start + m[0].length;
      const close = STYLE_CLOSE.exec(html);
      if (!close) break;
      end = close.index + close[0].length;
    }
    out += html.slice(from, start) + ' ';
    from = end;
    OPEN.lastIndex = end;
  }
  return from === 0 ? html : out + html.slice(from);
}

/** True when an html rule names a comment or a style block itself, so it must see the raw page. */
function ruleSeesRawHtml(regexText) {
  return /<\\?!--|<style/i.test(String(regexText));
}

module.exports = { htmlForMatching, ruleSeesRawHtml };
