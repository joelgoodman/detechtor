// tests/helpers/pattern-cost-child.js — runs in a CHILD process so a regression cannot hang `npm test`.
//
// A catastrophic regex blocks the event loop and cannot be interrupted from inside the process that
// is running it. tests/pattern-cost.test.js therefore spawns this script with a hard timeout: a
// quadratic pattern shows up as "killed after N ms", not as a CI job that never returns.
//
//   node tests/helpers/pattern-cost-child.js "<technology name>" [bytes]
//
// Prints one JSON line: { tech, bytes, shapes: [{shape, ms, confidence}], totalMs }.
'use strict';
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../../src/detechtor.js'));

const tech = process.argv[2];
const bytes = Number(process.argv[3] || 1_000_000);

// Each shape is ONE LINE (no newline: `.` does not cross one, so a single-line page is the worst case
// for `.*`, and rendered/minified archives are exactly that) built so that the pattern's FIRST literal
// matches at every unit but the pattern as a whole never completes. Every start position is a wasted
// scan to the end of the line under an unbounded wildcard.
const SHAPES = {
  'i + reef starts': 'i reef ',                  // i.*clicker, reef.*iclicker
  'screencast + o starts': 'screencast o ',      // screencast.*o.*matic
  'ps starts': 'ps ',                            // ps.*powerschool
  'powerschool starts': 'powerschool x ',        // powerschool.*sis, powerschool.*student
  'ordinary minified prose': '<p>Steps in our programs, including screencasts online, are priority.</p>',
};

const engine = new DeTECHtor();
const definition = engine.patterns[tech];
if (!definition) {
  console.error(`no such technology: ${tech}`);
  process.exit(2);
}

const baseEvidence = {
  html: '', headers: {}, scripts: [], meta: {}, cookies: [],
  dom: { jsObjects: {} }, domNodes: {}, apiEndpoints: [], networkHosts: [],
  versionInfo: {}, jsProbed: false, finalUrl: 'https://example.edu/',
};

const out = [];
for (const [shape, unit] of Object.entries(SHAPES)) {
  const html = unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes);
  // Script rules are tested one src at a time, so their input is a short URL in real life; a 2 KB
  // one is a generous stand-in. Neutral text on purpose: this file measures cost, and a script URL
  // that happened to contain a vendor word would score a (correct) match and muddy the assertion.
  const src = '//cdn.example.edu/' + 'a'.repeat(2000) + '.js';
  const evidence = { ...baseEvidence, html, scripts: [{ src }] };
  const t0 = process.hrtime.bigint();
  const match = engine.evaluatePattern(tech, definition, evidence);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  out.push({ shape, ms: +ms.toFixed(1), confidence: match.confidence });
}

console.log(JSON.stringify({
  tech, bytes, shapes: out, totalMs: +out.reduce((a, s) => a + s.ms, 0).toFixed(1),
}));
