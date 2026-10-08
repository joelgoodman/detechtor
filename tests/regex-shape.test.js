// tests/regex-shape.test.js -- the static rules behind scripts/lint-pattern-cost.js.
//
// Every earlier attempt at this problem used a HEURISTIC about the pattern's text (longest literal
// run, dictionary words, corpus fire rate). `i.*clicker` has a seven-letter literal and sailed through
// all of them while costing 67% of all match CPU. These rules look at the regex's STRUCTURE, so they
// cannot be argued with by a long literal.
//
// One fixture list per shape. A new banned shape is added here first.
const { test } = require('node:test');
const assert = require('node:assert');
const { parse, analyze, spanQuantifiers, requiredLiterals } = require('../scripts/lib/regex-shape.js');

const rules = (src) => analyze(src).map((v) => v.rule);
const flagged = (src) => analyze(src).length > 0;

test('every span-eating construct is banned when it can rescan', () => {
  const banned = [
    'a.*b', 'a.+b', 'a.*?b', 'a.{2,}b', 'a.{0,}b',
    'a[^"]*b', 'a[^<>]+b', 'a[^x]{3,}b',
    'a\\S+b', 'a\\S*b', 'a\\s*b', 'a\\s+b', 'a\\w+b', 'a\\w*b', 'a\\W+b', 'a\\D+b',
    'a[\\s\\S]*b', 'a[\\w\\W]+b', 'a[\\w-]+b', 'a[\\s]*b',
    'i.*clicker', 'reef.*iclicker', 'canva.*for.*schools',
  ];
  for (const src of banned) assert.ok(rules(src).includes('unbounded-span'), `${src} must be banned`);
});

test('an unanchored LEADING wildcard is banned: V8 retries it from every start position', () => {
  // Measured: /.*foo/i on a 200 KB line with no "foo" takes 22 s. Leading is the WORST position.
  for (const src of ['.*foo', '.+foo', '\\s*foo', '[^<]*foo', '(?:.*)foo']) {
    assert.ok(rules(src).includes('unbounded-span'), `${src} must be banned`);
  }
});

test('a wildcard that cannot rescan is allowed: terminal, or after a start anchor', () => {
  // TERMINAL: nothing follows it, so there is nothing to backtrack into and test() stops at the
  // first success. HEAD-ANCHORED: `^` gives one start position, so the span is scanned once.
  // A branch that BEGINS with `^` has a single start position, so one wildcard anywhere in it is
  // scanned once (the header/meta idiom `^Name (.*)$`).
  for (const src of ['foo.*', 'foo.+', 'foo[^"]*', 'foo\\s*', '^.*foo', '^\\s*foo', '^\\s*foo.*', '(?:foo|bar.*)',
    '^AMP Plugin v(\\d+\\.\\d+.*)$', '^a.*b$', '^(.+)$', '^https?:\\/\\/.+\\.agilone\\.com']) {
    assert.deepStrictEqual(rules(src).filter((r) => r === 'unbounded-span'), [], `${src} must be allowed`);
  }
});

test('terminal must mean terminal: a following `$`, group, or repetition makes it rescan again', () => {
  // `$` can fail after the wildcard stops at a newline, which re-enters backtracking per start.
  for (const src of ['foo.*$', '(?:foo.*)bar', '(?:foo.*)+', 'foo(?=.*bar)', 'foo.*(?!x)']) {
    assert.ok(flagged(src), `${src} must be flagged`);
  }
});

test('bounded wildcards are fine, including the form the rewriter emits', () => {
  for (const src of [
    'foo[^<>\\n]{0,80}bar', 'foo[^<>\\n]{1,80}bar', 'foo.{0,120}bar', 'foo\\s{0,10}bar', 'a[^"]{0,200}"',
    'foo(?:bar|baz)?', 'colou?r', 'a{2,5}', '\\bi(?:&gt;|[\\s_>-])?clicker',
  ]) {
    assert.deepStrictEqual(analyze(src), [], `${src} must pass`);
  }
});

test('a bound so large it is unbounded in practice is banned', () => {
  assert.ok(rules('a[^<>\\n]{0,100000}b').includes('huge-bound'));
  assert.ok(rules('a.{0,5000}b').includes('huge-bound'));
  assert.deepStrictEqual(rules('a.{0,500}b'), []);
});

test('more than one unbounded wildcard in a pattern is banned even where each would be allowed alone', () => {
  assert.ok(rules('a.*b.*c').includes('multiple-wildcards'));
  assert.ok(rules('^.*foo.*').includes('multiple-wildcards'));
  assert.ok(rules('^\\s*foo[^>]*').includes('multiple-wildcards'));
  // Alternation is not additive: only one branch ever runs.
  assert.ok(!rules('^.*a|b.*').includes('multiple-wildcards'));
  assert.ok(rules('^a.*b.*c$').includes('multiple-wildcards'));
});

test('nested quantifiers are banned when the inner repeat can absorb what comes next', () => {
  // The catastrophic shape needs AMBIGUITY: the inner repeat and the loop (or the rest of the
  // pattern) must be able to claim the same characters, so a failed match tries every split.
  for (const src of ['(a+)+b', '(a*)*b', '(?:a+)*b', '(a+)*b', '(a*)+b', '(.*x)*y', '(?:x|x+)*y', '((a+))+b']) {
    assert.ok(rules(src).includes('nested-quantifier') || rules(src).includes('unbounded-span'), `${src} must be banned`);
  }
  assert.ok(rules('(a+)+b').includes('nested-quantifier'));
  // The Wappalyzer version idioms are NOT ambiguous: each iteration ends in a literal the inner
  // repeat cannot match, so there is exactly one way to split the text. 214 patterns use them.
  for (const src of ['(?:\\d+\\.)+\\d+', '(\\d+(?:\\.\\d+)+)', '(?:[a-z]+\\.)+com', '(?:x\\s*)+y', '((a+)b)+c', '(?:ab)+c', '(a{1,3}b)+c', '(?:foo|bar)+', 'a+b+c']) {
    assert.ok(!rules(src).includes('nested-quantifier'), `${src} must not be flagged as nested`);
  }
});

test('ambiguous alternation under an unbounded repeat is banned', () => {
  for (const src of ['(a|a)*b', '(a|ab)+c', '(?:x|x+)*y', '(?:\\w|a)+z', '(?:a|b|)*c']) {
    assert.ok(flagged(src), `${src} must be banned`);
  }
  for (const src of ['(a|a)*b', '(a|ab)+c', '(?:a|b|)*c']) assert.ok(rules(src).includes('ambiguous-alternation'), src);
  assert.ok(!rules('(?:foo|bar)+').includes('ambiguous-alternation'));
});

test('a wildcard in disguise -- a repeated group of single-character alternatives -- is a wildcard', () => {
  // `(.|\n)*` and `(\s|\S)*` are the old idiom for "anything including newlines". The alternatives are
  // disjoint (so not ambiguous) but their union is everything: it is `[\s\S]*` spelled the long way.
  for (const src of ['a(?:.|\n)*b', 'a(\\s|\\S)*b', 'a([^x]|x)*b', 'a(?:[a-z]|[0-9]|[_-])*b']) {
    assert.ok(rules(src).includes('unbounded-span'), `${src} must be banned`);
  }
  assert.deepStrictEqual(rules('a(?:x|y)*b'), []);
});

test('an unbounded run quantifier as the FIRST thing in a pattern is banned even for a plain class', () => {
  // Measured: /\d+x/ on a 200 KB digit run takes 30 s; /[a-z]+\.js/ on a 200 KB letter run 25 s.
  for (const src of ['\\d+x', '[a-f0-9]{8,}x', 'a+b', '[a-z]+\\.js']) {
    assert.ok(rules(src).includes('unbounded-run'), `${src} must be banned`);
  }
  // A class as wide as \w is a span-eater in its own right (any position), not just a run.
  for (const src of ['[a-z0-9-]+\\.js', 'x[a-z0-9_]+y']) assert.ok(rules(src).includes('unbounded-span'), `${src}`);
  // A literal in front re-anchors it: each start enters a fresh run.
  for (const src of ['jquery-[\\d.]+\\.js', 'foo\\d+bar', 'v\\d+\\.\\d+\\.\\d+', '/wp-content/themes/[a-f]+/', '\\.min\\.js\\?ver=[\\d.]+']) {
    assert.ok(!rules(src).includes('unbounded-run'), `${src} must not be flagged as a run`);
  }
  // Terminal and anchored runs cannot rescan.
  for (const src of ['\\d+', '^\\d+x', 'foo\\d+']) assert.ok(!rules(src).includes('unbounded-run'), src);
});

test('escapes, classes and lookups are read as one atom, not as quantifiers', () => {
  // The previous test helper counted `*` inside `[...]` and after `\\` as quantifiers.
  for (const src of ['a\\.\\*b', 'a[.*+]b', 'a\\+b', 'a[*]b', '\\[.*\\]x'.replace('.*', '\\.'), 'foo\\{2,\\}']) {
    assert.deepStrictEqual(analyze(src), [], `${src} contains no quantifier`);
  }
});

test('parse accepts what the engine accepts and reports what it rejects', () => {
  for (const src of ['(?<y>\\d{4})-\\k<y>', '(?<=a)b', '(?<!a)b', '[^]', '[]', 'a{', 'a{,3}', 'a}', ']', '\\8', '\\cJ', '\\u00e9', '\\x41', '(?:)']) {
    new RegExp(src, 'i'); // must be valid for the engine
    assert.doesNotThrow(() => parse(src), `${src} must parse`);
  }
  assert.throws(() => parse('(a'), /unterminated|unbalanced|missing/i);
});

test('spanQuantifiers locates each unbounded quantifier by source offset so the rewriter can splice it', () => {
  const src = 'canva.*for.+schools';
  const q = spanQuantifiers(src);
  assert.strictEqual(q.length, 2);
  assert.deepStrictEqual(q.map((x) => src.slice(x.start, x.end)), ['.*', '.+']);
  assert.deepStrictEqual(q.map((x) => [x.min, x.max, x.lazy, x.atomText]), [[0, Infinity, false, '.'], [1, Infinity, false, '.']]);
  const lazy = spanQuantifiers('a[^"]*?b')[0];
  assert.strictEqual(lazy.lazy, true);
  assert.strictEqual(lazy.atomText, '[^"]');
  const braces = spanQuantifiers('a\\s{3,}b')[0];
  assert.deepStrictEqual([braces.min, braces.max, braces.atomText], [3, Infinity, '\\s']);
  // Terminal / head-anchored wildcards are reported with their position so the rewriter can leave them.
  assert.strictEqual(spanQuantifiers('foo.*')[0].allowed, true);
  assert.strictEqual(spanQuantifiers('foo.*bar')[0].allowed, false);
});

test('requiredLiterals gives a per-branch literal any match must contain (used to prefilter the corpus)', () => {
  assert.deepStrictEqual(requiredLiterals('canva.*for.*schools'), ['schools']); // the longest certain run
  assert.deepStrictEqual(requiredLiterals('i.*clicker'), ['clicker']);
  assert.deepStrictEqual(requiredLiterals('reef[^<>\\n]{0,80}iclicker'), ['iclicker']);
  // Alternation: one literal per branch, a page must contain at least one.
  assert.deepStrictEqual(requiredLiterals('foo.*barbaz|baz[^"]*quux').sort(), ['barbaz', 'quux']);
  // A required literal never comes from an optional or repeated part.
  assert.deepStrictEqual(requiredLiterals('(?:foo)?.*bar'), ['bar']);
  // Nothing certain to be present -> null (the caller must not prefilter).
  assert.strictEqual(requiredLiterals('.*'), null);
  assert.strictEqual(requiredLiterals('\\d+'), null);
});
