// scripts/lib/wildcard-rewrite.js -- the mechanical part of the wildcard rewriter.
//
// Two rewrites, both exact for how the engine uses a regex (`RegExp#test`: a verdict per input):
//
//   DROP   a wildcard that is the first or last thing in a top-level branch is redundant. `.*altcha`
//          matches exactly the inputs `altcha` matches; `foo.*` exactly those `foo` matches;
//          `foo.+` those `foo.` matches. Dropping it removes the cost entirely, so it is preferred.
//   BOUND  every other wildcard becomes `{min,N}` over the SAME class (`.` becomes the tag-local
//          `[^<>\n]` when asked), with N chosen from the spans real pages show.
//
// The choice of N is the point of the tool: max(80, 2 x observed max), rounded up. With no evidence
// at all the bound is a documented default, never the floor, so an unobserved pattern is not
// silently truncated.
'use strict';
const { spanQuantifiers, literalFragments } = require('./regex-shape.js');

/** Spec floor: no bound is smaller than this when there is evidence. */
const FLOOR_BOUND = 80;
/** A wildcard no real page ever exercised: bounded generously, flagged `unobserved` in the report. */
const UNOBSERVED_BOUND = 250;
/** The tag-local replacement for `.` : stays inside one tag and one line. */
const TAG_LOCAL_DOT = '[^<>\\n]';

/** Round up to a number a human can read in a diff: 10s below 200, 50s below 1000, 100s above. */
function roundUpBound(n) {
  const step = n < 200 ? 10 : n < 1000 ? 50 : 100;
  return Math.ceil(n / step) * step;
}

/** @param {number|null} observedMax the largest minimal span seen, or null when none was seen */
function chooseBound(observedMax) {
  if (observedMax === null || observedMax === undefined) return UNOBSERVED_BOUND;
  return Math.max(FLOOR_BOUND, roundUpBound(2 * observedMax));
}

/**
 * Splice rewrites into `source`.
 * @param {string} source
 * @param {Array<{ordinal:number, action:'drop'|'bound', bound?:number}>} wild
 *        one entry per wildcard to touch, by the ordinal `spanQuantifiers(source)` assigns.
 * @param {{tagLocal?: boolean}} opts tagLocal: write `.` as `[^<>\n]`
 */
function buildRewrite(source, wild, opts = {}) {
  const q = spanQuantifiers(source);
  const byOrdinal = new Map(wild.map((w) => [w.ordinal, w]));
  const edits = [];
  for (const w of q) {
    const todo = byOrdinal.get(w.ordinal);
    if (!todo) continue;
    let text;
    if (todo.action === 'drop') {
      // X* -> (nothing)   X+ -> X   X{n,} -> X{n}      (exact at the ends of a branch, for test())
      if (w.min === 0) text = '';
      else if (w.min === 1) text = w.atomText;
      else text = `${w.atomText}{${w.min}}`;
    } else {
      const atom = w.kind === 'dot' && opts.tagLocal ? TAG_LOCAL_DOT : w.atomText;
      const max = Math.max(todo.bound, w.min);
      text = `${atom}{${w.min},${max}}${w.lazy ? '?' : ''}`;
    }
    edits.push({ start: w.start, end: w.end, text });
  }
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * A copy of the regex in which each chosen wildcard is wrapped in a LAZY named group, so reading the
 * group back gives the shortest span that still lets the match succeed at that start -- the span a
 * bound has to cover. Greedy spans would measure the distance to the LAST suffix on the line
 * (up to a whole 3 MB page) and make every bound enormous.
 *
 * Returns null when the regex has back-references: wrapping adds groups and shifts their numbers.
 *
 * @param {string} source
 * @param {{only?: number[]}} [opts] limit to these wildcard ordinals (the others stay as written)
 * @returns {{source:string, wildcards:Array<{ordinal:number, group:string}>}|null}
 */
function measurementRegex(source, opts = {}) {
  const q = spanQuantifiers(source);
  if (q.length && q[0].hasBackrefs) return null;
  const chosen = q.filter((w) => !opts.only || opts.only.includes(w.ordinal));
  let out = source;
  const wildcards = [];
  for (const w of [...chosen].sort((a, b) => b.start - a.start)) {
    const lazyQuant = w.lazy ? w.quantText : `${w.quantText}?`;
    out = `${out.slice(0, w.start)}(?<__w${w.ordinal}>${w.atomText}${lazyQuant})${out.slice(w.end)}`;
    wildcards.push({ ordinal: w.ordinal, group: `__w${w.ordinal}` });
  }
  wildcards.sort((a, b) => a.ordinal - b.ordinal);
  return { source: out, wildcards };
}

/**
 * Precision-suspect: the literal parts are too short or too bare to make the pattern safe even once
 * bounded. The existing specificity lint's definition (scripts/lint-patterns.js: nothing over 4
 * characters, or 3 or fewer in all), plus a fragment that is a bare word of 3 letters or fewer next to
 * another fragment: `ebs.*tribal` is bounded and still fires on "webs ... tribal", `canva.*for.*schools`
 * on any "for". Fragments like `.js`, `/` or `.com` are structure, not words, and do not count.
 * This only TAGS the pattern in the review file; it is a cost fix, not a precision review.
 * @returns {string|null} why, or null
 */
function precisionSuspect(source) {
  let frags;
  try { frags = literalFragments(source); } catch { frags = []; }
  const longest = frags.reduce((m, f) => Math.max(m, f.length), 0);
  const total = frags.join('').length;
  if (total <= 3) return `literal text only ${total} chars`;
  if (longest <= 4) return `longest literal run is ${longest} chars`;
  const bare = frags.filter((f) => f.length <= 3 && /^[a-z]+$/i.test(f));
  if (bare.length && frags.length > 1) return `a bare ${bare[0].length}-letter fragment "${bare[0]}"`;
  return null;
}

module.exports = {
  FLOOR_BOUND, UNOBSERVED_BOUND, TAG_LOCAL_DOT,
  roundUpBound, chooseBound, buildRewrite, measurementRegex, precisionSuspect,
};
