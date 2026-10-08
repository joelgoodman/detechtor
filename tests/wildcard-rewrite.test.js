// tests/wildcard-rewrite.test.js -- the pure part of scripts/rewrite-unbounded-wildcards.js:
// turning a flagged regex into a bounded one, and picking the bound from evidence.
const { test } = require('node:test');
const assert = require('node:assert');
const { analyze, spanQuantifiers } = require('../scripts/lib/regex-shape.js');
const {
  roundUpBound, chooseBound, buildRewrite, measurementRegex, FLOOR_BOUND, UNOBSERVED_BOUND,
} = require('../scripts/lib/wildcard-rewrite.js');

const spans = (src) => analyze(src).filter((v) => v.rule === 'unbounded-span' || v.rule === 'multiple-wildcards');

test('the bound is max(80, 2 x observed max), rounded UP to a readable number', () => {
  assert.strictEqual(FLOOR_BOUND, 80);
  assert.strictEqual(chooseBound(0), 80);
  assert.strictEqual(chooseBound(12), 80);
  assert.strictEqual(chooseBound(40), 80);
  assert.strictEqual(chooseBound(41), 90);   // 2 x 41 = 82 -> 90
  assert.strictEqual(chooseBound(81), 170);  // 162 -> 170
  assert.strictEqual(chooseBound(240), 500); // 480 -> 500
  assert.strictEqual(chooseBound(700), 1400);
  for (const n of [1, 79, 80, 81, 163, 480, 999, 1234, 5000]) assert.ok(roundUpBound(n) >= n);
});

test('a wildcard never observed gets the documented default, not the floor', () => {
  assert.strictEqual(chooseBound(null), UNOBSERVED_BOUND);
  assert.ok(UNOBSERVED_BOUND > FLOOR_BOUND, 'with no evidence the bound must not silently truncate real markup');
});

test('buildRewrite bounds each wildcard, keeping the original class, with the tag-local form for `.`', () => {
  const cases = [
    // [source, bounds, tagLocal, expected]
    ['canva.*for.*schools', [80, 120], true, 'canva[^<>\\n]{0,80}for[^<>\\n]{0,120}schools'],
    ['canva.*for.*schools', [80, 120], false, 'canva.{0,80}for.{0,120}schools'],
    ['a.+b', [90], true, 'a[^<>\\n]{1,90}b'],
    ['<a-scene[^<>]*>', [300], true, '<a-scene[^<>]{0,300}>'],
    ['a[\\s\\S]*?b', [400], true, 'a[\\s\\S]{0,400}?b'],
    ['a.*?b', [80], true, 'a[^<>\\n]{0,80}?b'],
    ['a\\s{3,}b', [80], true, 'a\\s{3,80}b'],
    ['sites/\\w*/files', [80], true, 'sites/\\w{0,80}/files'],
    ['a(?:.|\\n)*b', [200], true, 'a(?:.|\\n){0,200}b'],
    ['x\\S+y', [80], false, 'x\\S{1,80}y'],
  ];
  for (const [src, bounds, tagLocal, want] of cases) {
    const wild = spanQuantifiers(src).map((q, i) => ({ ordinal: q.ordinal, action: 'bound', bound: bounds[i] }));
    assert.strictEqual(buildRewrite(src, wild, { tagLocal }), want, src);
    assert.doesNotThrow(() => new RegExp(want, 'i'));
    assert.deepStrictEqual(spans(want), [], `${want} must pass the static rules`);
  }
});

test('a leading or trailing wildcard is DROPPED, not bounded: it is redundant for RegExp#test', () => {
  // `.*altcha` matches exactly the inputs `altcha` matches. Bounding it would only add a cost.
  const cases = [
    ['.*altcha\\.(org|js)', 'altcha\\.(org|js)'],
    ['\\s*foo', 'foo'],
    ['foo.*', 'foo'],
    ['foo.+', 'foo.'],
    ['.+Localised Inc\\..+', '.Localised Inc\\..'],
    ['x{2,}\\s{3,}y', null], // not a wildcard-eater lead: left alone by this test
  ];
  for (const [src, want] of cases) {
    if (want === null) continue;
    const wild = spanQuantifiers(src).map((q) => ({ ordinal: q.ordinal, action: 'drop' }));
    assert.strictEqual(buildRewrite(src, wild, { tagLocal: true }), want, src);
  }
  // Mixed: drop the redundant ends, bound the middle.
  const src = '.*a.*b.*';
  const q = spanQuantifiers(src);
  const wild = q.map((x, i) => (i === 1 ? { ordinal: x.ordinal, action: 'bound', bound: 100 } : { ordinal: x.ordinal, action: 'drop' }));
  assert.strictEqual(buildRewrite(src, wild, { tagLocal: true }), 'a[^<>\\n]{0,100}b');
});

test('spanQuantifiers says which wildcards are droppable and which are inside a negative look-around', () => {
  const q = spanQuantifiers('.*a.*b.*');
  assert.deepStrictEqual(q.map((x) => [x.leading, x.tail]), [[true, false], [false, false], [false, true]]);
  const neg = spanQuantifiers('^(?!.*player)x.*y');
  assert.strictEqual(neg[0].inNegLook, true);
  assert.strictEqual(neg[1].inNegLook, false);
  assert.strictEqual(spanQuantifiers('(?:a.*b)').every((x) => x.leading === false), true);
});

test('measurementRegex wraps each wildcard in a lazy named group so its span can be read back', () => {
  const m = measurementRegex('canva.*for.+schools');
  assert.ok(m);
  const re = new RegExp(m.source, 'dgi');
  const text = 'xx CANVA is a tool for the schools';
  const r = re.exec(text);
  assert.ok(r);
  const spansOut = m.wildcards.map((w) => { const [a, b] = r.indices.groups[w.group]; return b - a; });
  // lazy => the SHORTEST span that still matches, which is what a bound has to cover
  assert.deepStrictEqual(spansOut, [' is a tool '.length, ' the '.length]);
});

test('measurementRegex is not offered for a regex with back-references (group numbers would shift)', () => {
  assert.strictEqual(measurementRegex('(a).*\\1'), null);
});
