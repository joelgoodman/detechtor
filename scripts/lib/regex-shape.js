// scripts/lib/regex-shape.js -- read a JavaScript regex's STRUCTURE, not its text.
//
// WHY THIS EXISTS. Every earlier attempt at "unbounded wildcard in a detection pattern" judged the
// pattern's TEXT: longest literal run <= 4 chars, dictionary words, corpus fire rate. `i.*clicker`
// has a seven-letter literal and passed all of them while costing 67% of all match CPU. A wildcard's
// cost is a property of the regex's shape (what repeats, over which characters, in which position),
// so this module parses the source into an AST and asks structural questions.
//
// Scope: JavaScript regex source in NON-unicode mode (the engine compiles every pattern with the
// single flag `i`), including named groups and lookbehind. It exists for static analysis and for
// splicing a rewritten quantifier back into the source text, so every node carries its source offsets.
// It is deliberately small. It is not a general regex library, and `analyze()` documents below what
// it does NOT catch.
'use strict';

/** A bound this large on a span-eating atom is unbounded in practice (see `huge-bound`). */
const MAX_BOUND = 1000;
/** A class matching at least this many of the 256 Latin-1 code units is as wide as `\w` (63). */
const WIDE_CLASS_COVERAGE = 60;

// ---------------------------------------------------------------------------------------------
// Character sets (256 Latin-1 code units + one "everything else" bucket), computed by asking V8.
// ---------------------------------------------------------------------------------------------

const OTHER = 256;
const setCache = new Map();

/** Which code units does this single-character atom match under the engine's `i` flag? */
function charsetOfSource(raw) {
  let cached = setCache.get(raw);
  if (cached) return cached;
  const set = new Uint8Array(257);
  const re = new RegExp('^(?:' + raw + ')$', 'i');
  for (let c = 0; c < 256; c++) if (re.test(String.fromCharCode(c))) set[c] = 1;
  if (re.test('Ā') || re.test('一')) set[OTHER] = 1;
  setCache.set(raw, set);
  return set;
}

function intersects(a, b) {
  for (let i = 0; i < 257; i++) if (a[i] && b[i]) return true;
  return false;
}
function unionInto(target, src) {
  for (let i = 0; i < 257; i++) if (src[i]) target[i] = 1;
  return target;
}
function coverage(set) {
  let n = 0;
  for (let i = 0; i < 256; i++) n += set[i];
  return n;
}
const EMPTY = new Uint8Array(257);
const ALL = new Uint8Array(257).fill(1);

// ---------------------------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------------------------

function countCaptureGroups(src) {
  let n = 0;
  let named = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') {
      for (i++; i < src.length && src[i] !== ']'; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c !== '(') continue;
    if (src[i + 1] !== '?') { n++; continue; }
    if (src[i + 2] === '<' && src[i + 3] !== '=' && src[i + 3] !== '!') { n++; named = true; }
  }
  return { n, named };
}

class Parser {
  constructor(src) {
    this.s = src;
    this.i = 0;
    const g = countCaptureGroups(src);
    this.groups = g.n;
    this.hasNamedGroups = g.named;
    this.backrefs = 0;
  }

  fail(msg) { throw new SyntaxError(`${msg} at ${this.i} in /${this.s}/`); }

  parse() {
    const alt = this.parseAlt(0);
    if (this.i < this.s.length) this.fail('unbalanced )');
    return alt;
  }

  parseAlt(depth) {
    const start = this.i;
    const branches = [this.parseSeq(depth)];
    while (this.s[this.i] === '|') { this.i++; branches.push(this.parseSeq(depth)); }
    return { type: 'alt', branches, start, end: this.i };
  }

  parseSeq(depth) {
    const start = this.i;
    const items = [];
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '|') break;
      if (c === ')') { if (depth === 0) this.fail('unbalanced )'); break; }
      items.push(this.parseTerm(depth));
    }
    return { type: 'seq', items, start, end: this.i };
  }

  parseTerm(depth) {
    const atom = this.parseAtom(depth);
    const q = this.parseQuantifier();
    if (!q) return atom;
    return { type: 'quant', atom, min: q.min, max: q.max, lazy: q.lazy, start: atom.start, qStart: q.qStart, end: this.i };
  }

  parseQuantifier() {
    const s = this.s;
    const c = s[this.i];
    const qStart = this.i;
    let min, max;
    if (c === '*') { min = 0; max = Infinity; this.i++; }
    else if (c === '+') { min = 1; max = Infinity; this.i++; }
    else if (c === '?') { min = 0; max = 1; this.i++; }
    else if (c === '{') {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(s.slice(this.i));
      if (!m) return null; // a lone `{` is a literal in non-unicode mode
      min = Number(m[1]);
      max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min;
      this.i += m[0].length;
    } else return null;
    let lazy = false;
    if (s[this.i] === '?') { lazy = true; this.i++; }
    return { min, max, lazy, qStart };
  }

  parseAtom(depth) {
    const s = this.s;
    const start = this.i;
    const c = s[this.i];
    if (c === '(') return this.parseGroup(depth);
    if (c === '[') return this.parseClass();
    if (c === '.') { this.i++; return { type: 'char', kind: 'dot', raw: '.', start, end: this.i }; }
    if (c === '^' || c === '$') { this.i++; return { type: 'anchor', kind: c, start, end: this.i }; }
    if (c === '\\') return this.parseEscape();
    if (c === '*' || c === '+' || c === '?') this.fail(`nothing to repeat (${c})`);
    this.i++;
    return { type: 'char', kind: 'lit', raw: c, start, end: this.i };
  }

  parseGroup(depth) {
    const s = this.s;
    const start = this.i;
    this.i++; // (
    let kind = 'capture';
    if (s[this.i] === '?') {
      const c2 = s[this.i + 1];
      if (c2 === ':') { kind = 'noncapture'; this.i += 2; }
      else if (c2 === '=') { kind = 'lookahead'; this.i += 2; }
      else if (c2 === '!') { kind = 'neglookahead'; this.i += 2; }
      else if (c2 === '<' && s[this.i + 2] === '=') { kind = 'lookbehind'; this.i += 3; }
      else if (c2 === '<' && s[this.i + 2] === '!') { kind = 'neglookbehind'; this.i += 3; }
      else if (c2 === '<') {
        const close = s.indexOf('>', this.i);
        if (close === -1) this.fail('unterminated group name');
        kind = 'named';
        this.i = close + 1;
      } else this.fail('invalid group');
    }
    const body = this.parseAlt(depth + 1);
    if (s[this.i] !== ')') this.fail('unterminated group, missing )');
    this.i++;
    return { type: 'group', kind, body, start, end: this.i };
  }

  parseClass() {
    const s = this.s;
    const start = this.i;
    this.i++; // [
    let negated = false;
    if (s[this.i] === '^') { negated = true; this.i++; }
    let wideEscape = false;
    while (this.i < s.length && s[this.i] !== ']') {
      if (s[this.i] === '\\') {
        const e = s[this.i + 1];
        if (e && 'sSwWD'.includes(e)) wideEscape = true;
        this.i += 2;
        if (e === 'c' || e === 'x' || e === 'u') { /* the hex digits that follow are ordinary class chars */ }
      } else this.i++;
    }
    if (s[this.i] !== ']') this.fail('unterminated character class');
    this.i++;
    return { type: 'char', kind: 'class', negated, wideEscape, raw: s.slice(start, this.i), start, end: this.i };
  }

  parseEscape() {
    const s = this.s;
    const start = this.i;
    const e = s[this.i + 1];
    if (e === undefined) this.fail('\\ at end of pattern');
    if ('dDwWsS'.includes(e)) { this.i += 2; return { type: 'char', kind: 'escape', raw: '\\' + e, letter: e, start, end: this.i }; }
    if (e === 'b' || e === 'B') { this.i += 2; return { type: 'anchor', kind: '\\' + e, start, end: this.i }; }
    if (e === 'k' && this.hasNamedGroups) {
      const close = s.indexOf('>', this.i);
      if (s[this.i + 2] !== '<' || close === -1) this.fail('invalid named reference');
      this.i = close + 1;
      this.backrefs++;
      return { type: 'backref', start, end: this.i };
    }
    if (e >= '1' && e <= '9') {
      const m = /^\d+/.exec(s.slice(this.i + 1));
      if (Number(m[0]) <= this.groups) {
        this.i += 1 + m[0].length;
        this.backrefs++;
        return { type: 'backref', start, end: this.i };
      }
      // Annex B: not a group reference -> legacy octal escape or identity escape.
      const oct = /^[0-7]{1,3}/.exec(s.slice(this.i + 1));
      this.i += 1 + (oct ? oct[0].length : 1);
      return { type: 'char', kind: 'lit', raw: s.slice(start, this.i), start, end: this.i };
    }
    if (e === 'x') {
      const m = /^x[0-9a-fA-F]{2}/.exec(s.slice(this.i + 1));
      this.i += 1 + (m ? m[0].length : 1);
    } else if (e === 'u') {
      const m = /^u[0-9a-fA-F]{4}/.exec(s.slice(this.i + 1));
      this.i += 1 + (m ? m[0].length : 1);
    } else if (e === 'c' && /[a-zA-Z]/.test(s[this.i + 2] || '')) {
      this.i += 3;
    } else if (e === '0') {
      const oct = /^0[0-7]{0,2}/.exec(s.slice(this.i + 1));
      this.i += 1 + oct[0].length;
    } else {
      this.i += 2;
    }
    return { type: 'char', kind: 'lit', raw: s.slice(start, this.i), start, end: this.i };
  }
}

/** @returns {{ast: object, source: string, groupCount: number, hasBackrefs: boolean}} */
function parse(source) {
  const p = new Parser(String(source));
  const ast = p.parse();
  return { ast, source: String(source), groupCount: p.groups, hasBackrefs: p.backrefs > 0 };
}

// ---------------------------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------------------------

const isMatcher = (n) => n && n.type === 'char';
const charsetOf = (n) => charsetOfSource(n.raw);

/**
 * Span-eating atoms: those that swallow arbitrary text when repeated without a bound.
 *   `.`, any negated class (`[^x]`, `[^]`), `\s \S \w \W \D`, a class containing one of those escapes
 *   (`[\s\S]`, `[\w\W]`, `[\w-]`), and any class as wide as `\w` (`[a-z0-9_-]`).
 * Deliberately NOT span-eating: `\d`, `[a-f]`, a literal -- repeating those is only a hazard in a
 * position that can rescan, which the `unbounded-run` rule covers separately.
 */
function isSpanEater(n) {
  if (!isMatcher(n)) return false;
  switch (n.kind) {
    case 'dot': return true;
    case 'escape': return 'sSwWD'.includes(n.letter);
    case 'class':
      if (n.negated || n.wideEscape) return true;
      return coverage(charsetOf(n)) >= WIDE_CLASS_COVERAGE;
    default: return false;
  }
}

/**
 * A repeated group of single-character alternatives is a wildcard in disguise: `(?:.|\n)*`,
 * `(\s|\S)*`, `([^x]|x)*`. The alternatives are disjoint, so it is not "ambiguous", but their union is
 * as wide as `[\s\S]`. Returns the union set when `g` is such a group, else null.
 */
function singleCharGroupSet(g) {
  if (g.type !== 'group' || /look/.test(g.kind)) return null;
  const set = new Uint8Array(257);
  for (const b of g.body.branches) {
    if (b.items.length !== 1) return null;
    const it = b.items[0];
    if (isMatcher(it)) unionInto(set, charsetOf(it));
    else if (it.type === 'group') {
      const inner = singleCharGroupSet(it);
      if (!inner) return null;
      unionInto(set, inner);
    } else return null;
  }
  return set;
}

/** Span-eating atom: a span-eating matcher, or a group of single-char alternatives as wide as one. */
function isSpanEaterAtom(n) {
  if (isMatcher(n)) return isSpanEater(n);
  const set = singleCharGroupSet(n);
  if (!set) return false;
  return g_anyWide(n) || coverage(set) >= WIDE_CLASS_COVERAGE;
}
function g_anyWide(g) {
  return g.body.branches.some((b) => {
    const it = b.items[0];
    return isMatcher(it) ? isSpanEater(it) : g_anyWide(it);
  });
}

const isZeroWidth = (n) => n.type === 'anchor' || (n.type === 'group' && /look/.test(n.kind));

function firstInfo(n) {
  switch (n.type) {
    case 'char': return { set: charsetOf(n), nullable: false };
    case 'anchor': return { set: EMPTY, nullable: true };
    case 'backref': return { set: ALL, nullable: true };
    case 'group':
      if (/look/.test(n.kind)) return { set: EMPTY, nullable: true };
      return firstInfo(n.body);
    case 'alt': {
      const set = new Uint8Array(257);
      let nullable = false;
      for (const b of n.branches) { const i = firstInfo(b); unionInto(set, i.set); nullable = nullable || i.nullable; }
      return { set, nullable };
    }
    case 'seq': {
      const set = new Uint8Array(257);
      for (const it of n.items) {
        const i = firstInfo(it);
        unionInto(set, i.set);
        if (!i.nullable) return { set, nullable: false };
      }
      return { set, nullable: true };
    }
    case 'quant': {
      const i = firstInfo(n.atom);
      return { set: i.set, nullable: i.nullable || n.min === 0 };
    }
    default: return { set: ALL, nullable: true };
  }
}

function lastInfo(n) {
  switch (n.type) {
    case 'group':
      if (/look/.test(n.kind)) return { set: EMPTY, nullable: true };
      return lastInfo(n.body);
    case 'alt': {
      const set = new Uint8Array(257);
      let nullable = false;
      for (const b of n.branches) { const i = lastInfo(b); unionInto(set, i.set); nullable = nullable || i.nullable; }
      return { set, nullable };
    }
    case 'seq': {
      const set = new Uint8Array(257);
      for (let k = n.items.length - 1; k >= 0; k--) {
        const i = lastInfo(n.items[k]);
        unionInto(set, i.set);
        if (!i.nullable) return { set, nullable: false };
      }
      return { set, nullable: true };
    }
    case 'quant': {
      const i = lastInfo(n.atom);
      return { set: i.set, nullable: i.nullable || n.min === 0 };
    }
    default: return firstInfo(n);
  }
}

/** Does this subtree contain a span-eating atom, however it is bounded? */
function containsSpanEater(n) {
  switch (n.type) {
    case 'char': return isSpanEater(n);
    case 'quant': return containsSpanEater(n.atom);
    case 'group': return containsSpanEater(n.body);
    case 'alt': return n.branches.some(containsSpanEater);
    case 'seq': return n.items.some(containsSpanEater);
    default: return false;
  }
}

/** The largest number of span-eating unbounded quantifiers any single match path can pass through. */
function wildcardPathCount(n) {
  switch (n.type) {
    case 'quant': {
      const own = n.max === Infinity && isSpanEaterAtom(n.atom) ? 1 : 0;
      return own + (isMatcher(n.atom) || own ? 0 : wildcardPathCount(n.atom));
    }
    case 'group': return wildcardPathCount(n.body);
    case 'alt': return Math.max(0, ...n.branches.map(wildcardPathCount));
    case 'seq': return n.items.reduce((a, it) => a + wildcardPathCount(it), 0);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Static rules
// ---------------------------------------------------------------------------------------------

/**
 * Walk the AST once, collecting every quantifier together with the positional facts the rules need.
 *
 *   tail      nothing can follow it in the pattern, so there is nothing to backtrack into and
 *             `RegExp#test` stops at its first success: the span is scanned at most once.
 *   anchored  in a top-level branch that begins with `^` (no `m` flag is ever used): one start
 *             position, so nothing in it is retried per start.
 *   leading   nothing consuming precedes it in its branch and there is no `^`: V8 retries it from
 *             every start position.
 *   depth     0 = not inside any group.
 *   follow    the set of characters that may come right after it, INCLUDING the loop-back into the
 *             next iteration when it sits in a repeated group.
 *   inUnbounded  it sits inside a group that is itself repeated without an upper bound.
 */
function collectQuantifiers(root) {
  const out = [];
  const copy = (set) => new Uint8Array(set);

  function visitAlt(alt, ctx) { for (const b of alt.branches) visitSeq(b, ctx); }

  function visitSeq(seq, ctx) {
    const items = seq.items;
    // follow[i]: what may come right after item i.
    const follow = new Array(items.length);
    let f = ctx.follow;
    for (let i = items.length - 1; i >= 0; i--) {
      follow[i] = f;
      const fi = firstInfo(items[i]);
      f = fi.nullable ? unionInto(copy(f), fi.set) : fi.set;
    }
    let leading = ctx.leading;
    // A top-level branch that BEGINS with `^` has exactly one start position (no `m` flag is ever
    // used), so nothing in it is retried per start; the whole branch inherits that.
    const branchAnchored = ctx.anchored || (ctx.depth === 0 && items.length > 0 && items[0].type === 'anchor' && items[0].kind === '^');
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      visitNode(it, {
        ...ctx,
        tail: ctx.tail && idx === items.length - 1,
        leading: leading && !branchAnchored,
        anchored: branchAnchored,
        follow: follow[idx],
      });
      if (!isZeroWidth(it) && !firstInfo(it).nullable) leading = false;
    }
  }

  function visitNode(n, ctx) {
    if (n.type === 'quant') {
      out.push({ node: n, ctx });
      if (n.atom.type === 'group') {
        const repeats = n.max > 1;
        const body = n.atom.body;
        const look = /look/.test(n.atom.kind);
        visitAlt(body, {
          ...ctx,
          tail: look ? false : ctx.tail && !repeats,
          follow: repeats ? unionInto(copy(ctx.follow), firstInfo(body).set) : ctx.follow,
          depth: ctx.depth + 1,
          inUnbounded: ctx.inUnbounded || n.max === Infinity,
          inLook: ctx.inLook || look,
          inNegLook: ctx.inNegLook || /^neg/.test(n.atom.kind),
        });
      }
    } else if (n.type === 'group') {
      const look = /look/.test(n.kind);
      visitAlt(n.body, {
        ...ctx,
        tail: look ? false : ctx.tail,
        depth: ctx.depth + 1,
        inLook: ctx.inLook || look,
        inNegLook: ctx.inNegLook || /^neg/.test(n.kind),
      });
    }
  }

  visitAlt(root, { tail: true, leading: true, anchored: false, follow: new Uint8Array(257), depth: 0, inUnbounded: false, inLook: false, inNegLook: false });
  return out;
}

/**
 * Structural violations of the wildcard rules. Empty array = clean.
 *
 *   unbounded-span        `*` `+` `{n,}` over a span-eating atom (`.`, a negated class, `\s \S \w \W \D`,
 *                         a class holding one of those or as wide as `\w`, or a repeated group of
 *                         single-character alternatives as wide as one), anywhere except where it
 *                         cannot rescan: TERMINAL (nothing follows) or anywhere in a branch that begins
 *                         with `^` (one start position).
 *   unbounded-run         the same over a narrower class (`\d+x`, `[a-f0-9]+x`) when it is the first
 *                         thing in the pattern: V8 retries it from every start position.
 *   huge-bound            `{0,100000}` over a span-eating atom: bounded on paper, unbounded in practice.
 *   multiple-wildcards    two or more unbounded span-eaters on one match path (`a.*b.*c`).
 *   nested-quantifier     an unbounded repeat INSIDE an unbounded repeat whose characters overlap what
 *                         may come next (`(a+)+b`, `(.*x)*`). `(?:\d+\.)+` is fine: the `.` the next
 *                         iteration needs can never be absorbed by `\d+`, so there is one way to match.
 *   ambiguous-alternation an unbounded repeat of a group whose alternatives can start with the same
 *                         character, or can be empty: `(a|a)*`, `(a|ab)+`.
 *
 * What this does NOT catch (the measured check in scripts/lint-pattern-cost.js is the backstop):
 *   - ambiguity that first-character reasoning cannot see: `(?:ab|a)+` against `ab`/`a` overlap deeper
 *     than the first character;
 *   - adjacent unbounded atoms over overlapping sets when neither is a span-eater: `\d+\d+x`;
 *   - an unbounded run in a position that is not the very first thing but can still sit inside its own
 *     run (`x[a-z]+y` on `xaxaxa...`), and a leading run inside an optional or repeated group;
 *   - backreference-driven blowup (`(.+)\1`), lookaround-driven cost;
 *   - a small bound that is nested: `(?:[^<>]{0,80}x){0,80}`;
 *   - anything about input shape: it knows the regex, not the page.
 *
 * @returns {Array<{rule: string, message: string, index: number, text: string}>}
 */
function analyze(source) {
  const { ast } = parse(source);
  const src = String(source);
  const violations = [];
  const add = (rule, node, message) => violations.push({ rule, message, index: node.start, text: src.slice(node.start, node.end) });

  for (const { node: q, ctx } of collectQuantifiers(ast)) {
    const atom = q.atom;
    const cannotRescan = ctx.tail || ctx.anchored;
    if (isMatcher(atom)) {
      if (q.max === Infinity) {
        if (isSpanEater(atom)) {
          if (!cannotRescan) add('unbounded-span', q, `unbounded \`${src.slice(q.atom.start, q.end)}\` rescans on a failed match; bound it`);
        } else if (ctx.leading && ctx.depth === 0 && !cannotRescan) {
          add('unbounded-run', q, `unbounded \`${src.slice(q.atom.start, q.end)}\` leads the pattern, so it is retried from every start; bound it`);
        }
        // Nested: an unbounded repeat inside an unbounded repeat is only catastrophic when the inner
        // atom can absorb what the loop (or the rest of the pattern) needs next.
        if (ctx.inUnbounded && intersects(charsetOf(atom), ctx.follow)) {
          add('nested-quantifier', q, 'unbounded repeat inside an unbounded repeat can match the same text two ways');
        }
      } else if (q.max > MAX_BOUND && isSpanEater(atom)) {
        add('huge-bound', q, `bound {${q.min},${q.max}} is larger than ${MAX_BOUND}; it is unbounded in practice`);
      }
    } else if (atom.type === 'group' && q.max === Infinity) {
      if (isSpanEaterAtom(atom)) {
        if (!cannotRescan) add('unbounded-span', q, `unbounded repeat of \`${src.slice(atom.start, atom.end)}\` is a wildcard in disguise; bound it`);
      } else if (containsSpanEater(atom.body)) {
        // `(?:[^/]{1,80}/)*`: each iteration is bounded, but the number of iterations is not, so the
        // group as a whole spans arbitrarily far. A bounded atom inside does not make it a bounded span.
        if (!cannotRescan) add('unbounded-span', q, `unbounded repeat of \`${src.slice(atom.start, atom.end)}\` spans arbitrarily far even though each iteration is bounded; bound the repeat count`);
      } else if (atom.body.branches.length > 1 || firstInfo(atom.body).nullable) {
        const branches = atom.body.branches;
        let ambiguous = branches.some((b) => firstInfo(b).nullable);
        for (let a = 0; !ambiguous && a < branches.length; a++) {
          const fa = firstInfo(branches[a]).set;
          for (let b = a + 1; b < branches.length; b++) if (intersects(fa, firstInfo(branches[b]).set)) { ambiguous = true; break; }
        }
        if (ambiguous) add('ambiguous-alternation', q, 'unbounded repeat of overlapping or empty alternatives');
      }
    }
  }

  if (wildcardPathCount(ast) > 1) {
    violations.push({ rule: 'multiple-wildcards', message: 'more than one unbounded wildcard on one match path', index: 0, text: src });
  }
  return violations;
}

/**
 * Every unbounded span-eating quantifier in the source, with offsets, for the rewriter.
 * `allowed` marks the ones the static rules would let stand alone (terminal / head-anchored).
 */
function spanQuantifiers(source) {
  const { ast, hasBackrefs, groupCount } = parse(source);
  const src = String(source);
  const out = [];
  for (const { node: q, ctx } of collectQuantifiers(ast)) {
    if (q.max !== Infinity || !isSpanEaterAtom(q.atom)) continue;
    out.push({
      start: q.start, end: q.end, atomStart: q.atom.start, atomEnd: q.atom.end, qStart: q.qStart,
      atomText: src.slice(q.atom.start, q.atom.end), quantText: src.slice(q.qStart, q.end),
      min: q.min, max: q.max, lazy: q.lazy, kind: q.atom.type === 'group' ? 'group' : q.atom.kind,
      allowed: ctx.tail || ctx.anchored,
      // Position facts for the rewriter. `leading`/`tail` here mean "first/last thing in a top-level
      // branch": a wildcard there is redundant for RegExp#test and can be dropped, not just bounded.
      leading: ctx.leading && ctx.depth === 0, tail: ctx.tail && ctx.depth === 0,
      anchored: ctx.anchored, depth: ctx.depth, inLook: ctx.inLook, inNegLook: ctx.inNegLook,
      hasBackrefs, groupCount,
    });
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((o, i) => { o.ordinal = i; });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Required literals (corpus prefilter)
// ---------------------------------------------------------------------------------------------

function literalChar(raw) {
  if (raw[0] !== '\\') return raw;
  const e = raw[1];
  if (e === 'x' && raw.length === 4) return String.fromCharCode(parseInt(raw.slice(2), 16));
  if (e === 'u' && raw.length === 6) return String.fromCharCode(parseInt(raw.slice(2), 16));
  if (e === '0' && raw.length === 2) return '\0';
  if (e === 't') return '\t';
  if (e === 'n') return '\n';
  if (e === 'r') return '\r';
  if (e === 'v') return '\v';
  if (e === 'f') return '\f';
  if (/[a-zA-Z0-9]/.test(e) && raw.length > 2) return null; // octal / control escapes: not worth modelling
  return raw.slice(1);
}

/**
 * For each top-level alternative: the longest literal that EVERY match of that alternative must
 * contain, lowercased. A page lacking all of them cannot match. Null when some alternative has no
 * certain literal (the caller must not prefilter).
 *
 * Conservative by construction: a literal is taken only from the unconditional spine of a branch --
 * never from an optional part, a repetition, an alternation inside a group, or a lookaround.
 */
function requiredLiterals(source) {
  const { ast } = parse(source);
  const found = [];
  for (const branch of ast.branches) {
    const best = bestRun(branch);
    if (!best) return null;
    found.push(best.toLowerCase());
  }
  return [...new Set(found)];
}

function bestRun(seq) {
  const runs = [];
  let cur = '';
  const flush = () => { if (cur) runs.push(cur); cur = ''; };
  function spine(s) {
    for (const it of s.items) {
      if (it.type === 'char' && it.kind === 'lit') {
        const ch = literalChar(it.raw);
        if (ch === null) flush(); else cur += ch;
      } else if (it.type === 'quant' && it.min >= 1 && it.atom.type === 'char' && it.atom.kind === 'lit') {
        const ch = literalChar(it.atom.raw);
        if (ch !== null) cur += ch;
        flush(); // repeated: the run does not continue past it
      } else if (it.type === 'group' && (it.kind === 'noncapture' || it.kind === 'capture' || it.kind === 'named') && it.body.branches.length === 1) {
        spine(it.body.branches[0]);
      } else if (it.type === 'anchor' || isZeroWidth(it)) {
        flush();
      } else {
        flush();
      }
    }
  }
  spine(seq);
  flush();
  if (!runs.length) return null;
  return runs.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Literal fragments in source order (used to build near-miss adversarial inputs). */
function literalFragments(source) {
  const { ast } = parse(source);
  const frags = [];
  function walkSeq(seq) {
    let cur = '';
    const flush = () => { if (cur) frags.push(cur); cur = ''; };
    for (const it of seq.items) {
      if (it.type === 'char' && it.kind === 'lit') {
        const ch = literalChar(it.raw);
        if (ch === null) flush(); else cur += ch;
      } else if (it.type === 'group' && it.body.branches.length >= 1) {
        flush();
        walkSeq(it.body.branches[0]);
      } else if (it.type === 'quant' && it.atom.type === 'group') {
        flush();
        walkSeq(it.atom.body.branches[0]);
      } else flush();
    }
    flush();
  }
  walkSeq(ast.branches[0]);
  for (let b = 1; b < ast.branches.length; b++) walkSeq(ast.branches[b]);
  return frags;
}

/** A representative character for each distinct unbounded atom (to build "pump" runs). */
function pumpChars(source) {
  const { ast } = parse(source);
  const chars = new Set();
  for (const { node: q } of collectQuantifiers(ast)) {
    if (!isMatcher(q.atom) || q.max < 8) continue;
    const set = charsetOf(q.atom);
    let pick = null;
    for (const c of 'a0 -_.e1') { const code = c.charCodeAt(0); if (set[code]) { pick = c; break; } }
    if (pick === null) for (let c = 33; c < 127; c++) if (set[c]) { pick = String.fromCharCode(c); break; }
    if (pick !== null) chars.add(pick);
  }
  return [...chars];
}

module.exports = {
  parse, analyze, spanQuantifiers, requiredLiterals, literalFragments, pumpChars,
  isSpanEater, MAX_BOUND, WIDE_CLASS_COVERAGE,
};
