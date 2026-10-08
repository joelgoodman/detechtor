// scripts/lib/cost-worker.js -- child process for scripts/lib/cost-measure.js.
//
// One regex at a time, in a process the parent can SIGKILL. A catastrophic regex blocks the event
// loop and cannot be interrupted from inside plain JS; the vm `timeout` below interrupts it in
// practice, and the parent's watchdog is the backstop for the day it does not.
//
// Protocol: parent sends { type: 'job', i, source, exhaustive, timeoutMs }; child answers
// { i, shapes: { dense, 'near-miss', ... : ms }, timedOut: [shape...] }.
'use strict';
const vm = require('vm');
const { literalFragments, pumpChars } = require('./regex-shape.js');

const INPUT_BYTES = 1_000_000;

// Deterministic PRNG so every run measures the same text.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "Dense": a single line of lowercase letters with `<` `>` `/` `=` `"` and digits mixed in the way
// markup mixes them, so every wildcard has something to eat and every tag-local class has an edge.
// No newline: `.` does not cross one, so a single-line page is the worst case for it, and archived
// pages are minified onto one line.
function denseInput() {
  const rnd = mulberry32(0xc0ffee);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const out = new Array(INPUT_BYTES);
  for (let i = 0; i < INPUT_BYTES; i++) {
    const r = rnd();
    out[i] = r < 0.64 ? alphabet[Math.floor(rnd() * 26)]
      : r < 0.72 ? ' ' : r < 0.77 ? '<' : r < 0.82 ? '>' : r < 0.85 ? '/' : r < 0.88 ? '='
        : r < 0.92 ? '"' : r < 0.97 ? String(Math.floor(rnd() * 10)) : r < 0.98 ? '-' : r < 0.99 ? '.' : '_';
  }
  return out.join('');
}

// "Near-miss": the pattern's own literal prefixes, repeated, never completing. Every position then
// starts a match attempt that runs as far as the pattern lets it and fails -- the access pattern
// that made `i.*clicker` quadratic.
function nearMissInput(source) {
  let frags;
  try { frags = literalFragments(source); } catch { frags = []; }
  frags = frags.filter(Boolean);
  let unit;
  if (frags.length >= 2) unit = frags.slice(0, -1).join(' ') + ' ';
  else if (frags.length === 1) unit = frags[0].length > 1 ? frags[0].slice(0, -1) + ' ' : frags[0] + ' ';
  else unit = 'a b ';
  return unit.repeat(Math.ceil(INPUT_BYTES / unit.length)).slice(0, INPUT_BYTES);
}

// "Pump" (exhaustive only): one unbroken run of a character the pattern's repeated atoms accept --
// the shape that makes `\d+x` quadratic.
function pumpInputs(source) {
  let chars;
  try { chars = pumpChars(source); } catch { chars = []; }
  return chars.slice(0, 3).map((c) => ({ shape: `pump(${JSON.stringify(c)})`, text: c.repeat(INPUT_BYTES) }));
}

let dense = null;
const ctx = vm.createContext({});
const test = new vm.Script('re.test(text)');

function timeOnce(re, text, timeoutMs) {
  ctx.re = re; ctx.text = text;
  const t0 = process.hrtime.bigint();
  try { test.runInContext(ctx, { timeout: timeoutMs }); } catch (e) {
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return { ms: timeoutMs, timedOut: true };
    throw e;
  }
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, timedOut: false };
}

function runJob({ source, exhaustive, timeoutMs }) {
  if (dense === null) dense = denseInput();
  const re = new RegExp(source, 'i');
  // V8 runs a regex in its bytecode interpreter the first time and tiers up to native code after;
  // warming on a short string keeps the measured run to what production sees (every page is a
  // second-or-later execution of a cached regex).
  re.test('warm up <a href="x">'); re.test('warm up again');
  const inputs = [{ shape: 'dense', text: dense }, { shape: 'near-miss', text: nearMissInput(source) }];
  if (exhaustive) inputs.push(...pumpInputs(source));
  const shapes = {};
  const timedOut = [];
  for (const { shape, text } of inputs) {
    let r = timeOnce(re, text, timeoutMs);
    // Best of two for anything that is not trivially fast: one GC pause must not fail the build.
    if (!r.timedOut && r.ms > 20) { const r2 = timeOnce(re, text, timeoutMs); if (r2.ms < r.ms) r = r2; }
    shapes[shape] = +r.ms.toFixed(2);
    if (r.timedOut) timedOut.push(shape);
  }
  return { shapes, timedOut };
}

if (require.main === module) {
  process.on('message', (msg) => {
    if (msg.type !== 'job') return;
    let out;
    try { out = runJob(msg); } catch (e) { out = { error: String(e && e.message || e) }; }
    process.send({ i: msg.i, ...out });
  });
  process.send({ ready: true });
}

module.exports = { runJob, INPUT_BYTES };
