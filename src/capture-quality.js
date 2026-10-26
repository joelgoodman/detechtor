// src/capture-quality.js — is this capture something we can actually draw conclusions from?
//
// UNI-225. The tiered runner must distinguish "we looked and found nothing" from "we could not
// look". 7 of 29 sampled institutions (QUB, Imperial, Durham, UCD, SUNY, South Wales, Wheaton IL)
// return a CloudFront/Cloudflare block on every page. Treating those as evidence of absence would
// be fabricating data.
'use strict';

// Measured over 506 archived pages (2026-08-01): every block capture was 923 bytes; the 25th
// percentile of real pages was 27,658. 5,000 sits in the empty band between the two populations.
const MIN_PLAUSIBLE_BYTES = 5000;

// Matched against the <title> ONLY. Matching the whole document would condemn any university page
// that happens to discuss HTTP errors in help content -- a real risk on .edu IT support pages.
const BLOCK_TITLE_SIGNATURES = [
  /the request could not be satisfied/i,  // CloudFront
  /403 error/i,
  /request blocked/i,
  /access denied/i,
  /just a moment/i,                       // Cloudflare challenge
  /attention required/i,                  // Cloudflare block
  /radware captcha page/i,                // Radware Bot Manager (census 2026-10: institution 3856)
  /pardon our interruption/i,             // Imperva / Distil
  /checking your browser/i,
  /verifying you are human/i,
  /robot or human\?/i,
  /are you a robot\?/i,
];

// Bot-wall challenge pages, matched in the document. Only markers that exist on the challenge page
// itself qualify. Deliberately NOT here, because real university pages carry them (cohort-140 census
// re-check, 2026-10-26: 2,367 archived pages): Cloudflare's bot-management beacon
// `/cdn-cgi/challenge-platform/scripts/jsd/`, a Turnstile or hCaptcha form widget, Incapsula's
// resource script and Radware's `cdn.perfdrive.com` agent. The census had counted those as challenge
// pages; all 38 such institutions it listed were real, readable sites.
const CHALLENGE_BODY_SIGNATURES = [
  /window\._cf_chl_opt\b/,                  // Cloudflare managed / JS challenge
  /captcha\.perfdrive\.com\/captcha-public\//i, // Radware Bot Manager captcha
];
// A challenge page is short; a page that quotes a marker in thousands of words of content is not one.
const CHALLENGE_MAX_VISIBLE_CHARS = 2000;

function visibleTextLength(html) {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * @param {string} html a captured page
 * @returns {{scannable: boolean, reason: string|null}} reason: empty | undersized | blocked | challenge
 */
function classifyCapture(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return { scannable: false, reason: 'empty' };
  }

  if (Buffer.byteLength(html, 'utf8') < MIN_PLAUSIBLE_BYTES) {
    return { scannable: false, reason: 'undersized' };
  }

  const title = (html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i) || [, ''])[1];
  for (const sig of BLOCK_TITLE_SIGNATURES) {
    if (sig.test(title)) return { scannable: false, reason: 'blocked' };
  }

  if (CHALLENGE_BODY_SIGNATURES.some((sig) => sig.test(html)) &&
      visibleTextLength(html) < CHALLENGE_MAX_VISIBLE_CHARS) {
    return { scannable: false, reason: 'challenge' };
  }

  return { scannable: true, reason: null };
}

module.exports = {
  classifyCapture, MIN_PLAUSIBLE_BYTES, BLOCK_TITLE_SIGNATURES, CHALLENGE_BODY_SIGNATURES, CHALLENGE_MAX_VISIBLE_CHARS,
};
