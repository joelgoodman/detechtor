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
];

/**
 * @param {string} html a captured page
 * @returns {{scannable: boolean, reason: string|null}}
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

  return { scannable: true, reason: null };
}

module.exports = { classifyCapture, MIN_PLAUSIBLE_BYTES, BLOCK_TITLE_SIGNATURES };
