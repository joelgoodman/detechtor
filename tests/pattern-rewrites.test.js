// tests/pattern-rewrites.test.js -- the load-time rewrite layer, and the JSON editor that writes curated files.
//
// 6,202 of the 6,504 technologies live in patterns/generated/webappanalyzer-merged.json, which the
// importer rewrites wholesale, so a fix made there is reverted by the next import. The rewrite layer is
// the durable form of "replace this wildcard pattern with its bounded twin": it names the exact original
// text, so a re-import that brings the original back is fixed again at load, and one that changes the
// original makes the rule stale -- which the lint turns into a failure instead of a silent no-op.
const { test } = require('node:test');
const assert = require('node:assert');
const { applyPatternRewrites, validatePatternRewrites } = require('../src/pattern-rewrites.js');
const { editJsonText } = require('../scripts/lib/pattern-edit.js');

const BASE = () => ({
  Canva: { html: ['canva.*for.*schools', 'canva-edu'], scriptSrc: ['cdn\\.canva\\.com/.*/x\\.js'], headers: { 'x-canva': 'ab.*cd' }, categories: ['Design'] },
  Plain: { html: ['plain'], dom: { 'link[href]': { attributes: { href: 'a.*b' } }, '.x': 'c.+d', '#y': { text: 'e.*f' } }, categories: ['CMS'] },
  DomArray: { dom: ['#a'], html: ['x'] },
});

test('replaces the named pattern and nothing else', () => {
  const out = applyPatternRewrites(BASE(), { Canva: { html: [{ from: 'canva.*for.*schools', to: 'canva[^<>\\n]{0,80}for[^<>\\n]{0,80}schools' }] } });
  assert.deepStrictEqual(out.Canva.html, ['canva[^<>\\n]{0,80}for[^<>\\n]{0,80}schools', 'canva-edu']);
  assert.deepStrictEqual(out.Canva.scriptSrc, ['cdn\\.canva\\.com/.*/x\\.js']);
  assert.deepStrictEqual(out.Canva.categories, ['Design']);
});

test('does not mutate the input map or its definitions', () => {
  const input = BASE();
  applyPatternRewrites(input, { Canva: { html: [{ from: 'canva.*for.*schools', to: 'canva[^<>\\n]{0,80}for' }] } });
  assert.deepStrictEqual(input.Canva.html, ['canva.*for.*schools', 'canva-edu']);
});

test('a replacement that lands on an existing pattern does not duplicate it', () => {
  const out = applyPatternRewrites(BASE(), { Canva: { html: [{ from: 'canva.*for.*schools', to: 'canva-edu' }] } });
  assert.deepStrictEqual(out.Canva.html, ['canva-edu']);
});

test('object fields are rewritten by key', () => {
  const out = applyPatternRewrites(BASE(), { Canva: { headers: [{ key: 'x-canva', from: 'ab.*cd', to: 'ab.{0,80}cd' }] } });
  assert.deepStrictEqual(out.Canva.headers, { 'x-canva': 'ab.{0,80}cd' });
});

test('dom regexes are rewritten in every on-disk shape', () => {
  const out = applyPatternRewrites(BASE(), {
    Plain: {
      dom: [
        { selector: 'link[href]', kind: 'attributes', name: 'href', from: 'a.*b', to: 'a.{0,80}b' },
        { selector: '.x', kind: 'text', from: 'c.+d', to: 'c.{1,80}d' },
        { selector: '#y', kind: 'text', from: 'e.*f', to: 'e.{0,80}f' },
      ],
    },
  });
  assert.deepStrictEqual(out.Plain.dom, {
    'link[href]': { attributes: { href: 'a.{0,80}b' } },
    '.x': 'c.{1,80}d',
    '#y': { text: 'e.{0,80}f' },
  });
});

test('records provenance on the rewritten definition', () => {
  const out = applyPatternRewrites(BASE(), { Canva: { html: [{ from: 'canva.*for.*schools', to: 'canva.{0,80}for', basis: 'corpus:IDENTICAL' }] } });
  assert.deepStrictEqual(out.Canva._patternRewrite, [{ field: 'html', from: 'canva.*for.*schools', to: 'canva.{0,80}for', basis: 'corpus:IDENTICAL' }]);
});

test('a rule for a missing technology is inert at load and a failure in validation', () => {
  const rules = { Ghost: { html: [{ from: 'a.*b', to: 'a.{0,80}b' }] } };
  assert.doesNotThrow(() => applyPatternRewrites(BASE(), rules));
  assert.ok(validatePatternRewrites(BASE(), rules).some((p) => p.name === 'Ghost' && /no such technology/.test(p.problem)));
});

test('validation fails a stale original, a no-op, a regex that does not compile and a malformed rule', () => {
  const v = (rules) => validatePatternRewrites(BASE(), rules).map((p) => p.problem).join(' | ');
  assert.match(v({ Canva: { html: [{ from: 'not-there', to: 'x' }] } }), /not present/);
  assert.match(v({ Canva: { html: [{ from: 'canva-edu', to: 'canva-edu' }] } }), /identical/);
  assert.match(v({ Canva: { html: [{ from: 'canva-edu', to: '(unclosed' }] } }), /does not compile/);
  assert.match(v({ Canva: { html: 'nope' } }), /malformed/);
  assert.match(v({ Canva: { categories: [{ from: 'a', to: 'b' }] } }), /not a pattern field/);
  assert.match(v({ Canva: { headers: [{ from: 'ab.*cd', to: 'ab.{0,80}cd' }] } }), /key/);
  assert.strictEqual(v({ Canva: { html: [{ from: 'canva-edu', to: 'canva-education' }] } }), '');
});

// ---- editJsonText: minimal-diff edits of a curated file ------------------------------------------

const FILE = `{
  "Alpha": {
    "html": ["foo.*bar", "baz"],
    "scripts": ["foo.*bar"],
    "headers": { "x-a": "p.*q" }
  },
  "Beta": {
    "html": [
      "foo.*bar"
    ]
  }
}
`;

test('editJsonText changes only the targeted technology and field, leaving formatting alone', () => {
  const next = editJsonText(FILE, [{ tech: 'Alpha', field: 'html', from: 'foo.*bar', to: 'foo.{0,80}bar' }]);
  const o = JSON.parse(next);
  assert.deepStrictEqual(o.Alpha.html, ['foo.{0,80}bar', 'baz']);
  assert.deepStrictEqual(o.Alpha.scripts, ['foo.*bar'], 'same text in another field is untouched');
  assert.deepStrictEqual(o.Beta.html, ['foo.*bar'], 'same text in another technology is untouched');
  assert.strictEqual(next.replace('foo.{0,80}bar', 'foo.*bar'), FILE, 'nothing but the one literal changed');
});

test('editJsonText edits an object-field value by key', () => {
  const next = editJsonText(FILE, [{ tech: 'Alpha', field: 'headers', key: 'x-a', from: 'p.*q', to: 'p.{0,80}q' }]);
  assert.strictEqual(JSON.parse(next).Alpha.headers['x-a'], 'p.{0,80}q');
});

test('editJsonText refuses an edit whose original is not there', () => {
  assert.throws(() => editJsonText(FILE, [{ tech: 'Alpha', field: 'html', from: 'absent', to: 'x' }]), /not found/);
  assert.throws(() => editJsonText(FILE, [{ tech: 'Zeta', field: 'html', from: 'a', to: 'b' }]), /no technology/);
});

test('editJsonText handles escapes in the pattern text', () => {
  const text = '{\n  "T": { "html": ["a\\\\.\\\\*b.*\\"c"] }\n}\n';
  const from = JSON.parse(text).T.html[0];
  const next = editJsonText(text, [{ tech: 'T', field: 'html', from, to: 'a\\.\\*b.{0,80}"c' }]);
  assert.strictEqual(JSON.parse(next).T.html[0], 'a\\.\\*b.{0,80}"c');
});

// ---- the shipped files ---------------------------------------------------------------------------

test('the shipped rewrite layer has no stale, no-op or uncompilable rule against the current patterns', () => {
  const DeTECHtor = require('../src/detechtor.js');
  const { applyPatternOverrides } = require('../src/pattern-overrides.js');
  const pristine = new DeTECHtor().loadPatterns({ applyOverrides: false });
  const afterRemovals = applyPatternOverrides(pristine, require('../patterns/pattern-overrides.json').overrides || {});
  const problems = validatePatternRewrites(afterRemovals, require('../patterns/pattern-rewrites.json').rewrites || {});
  assert.deepStrictEqual(problems, []);
});

test('every reviewed wildcard decision says what it decided and why', () => {
  const file = require('../patterns/wildcard-decisions.json');
  assert.ok(file._comment && typeof file._comment === 'string');
  for (const [id, d] of Object.entries(file.decisions || {})) {
    assert.ok(/^(page|src|dom:[^:]*|meta:[^:]*|none:[a-z]+)::/.test(id), `bad decision id ${id}`);
    assert.ok(typeof d.to === 'string' || Array.isArray(d.bounds), `${id}: a decision needs \`to\` or \`bounds\``);
    assert.ok(typeof d.reason === 'string' && d.reason.length >= 30, `${id}: a decision needs a real reason`);
    assert.ok(Number.isFinite(d.acceptPagesLost) && d.acceptPagesLost >= 0, `${id}: acceptPagesLost is the number of page verdicts the reviewer accepted losing`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.decided), `${id}: decided date`);
  }
});
