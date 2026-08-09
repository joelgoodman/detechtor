// tests/dom-rules.test.js — shape contract for the `dom` pattern field.
//
// Context: `detechtor.js:942` did `new RegExp(domPattern, 'i')` against a fixed six-key
// `evidence.dom` bag, while every pattern keys `dom` on a CSS selector. Result: 1,456 techs
// carried `dom` rules and NONE could fire. normalizeDomRules() is the single place that turns
// all three on-disk shapes into one internal form the engine can evaluate, and it must FAIL
// LOUDLY on anything it cannot represent — silent death is the defect being fixed.
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeDomRules } = require('../src/dom-rules.js');

test('absent dom field yields no rules', () => {
  assert.deepStrictEqual(normalizeDomRules({}), []);
});

test('string shape becomes a text rule carrying the regex', () => {
  // curated fediverse Pleroma: dom.noscript = "^To use Pleroma…$"
  const rules = normalizeDomRules({ dom: { noscript: '^To use Pleroma$' } });
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].selector, 'noscript');
  assert.strictEqual(rules[0].kind, 'text');
  assert.strictEqual(rules[0].regex, '^To use Pleroma$');
});

test('array shape becomes existence rules, one per selector', () => {
  // curated Plone: dom: ["link[href^='/++resource++']"] — existence IS the whole rule
  const rules = normalizeDomRules({ dom: ["link[href^='/++resource++']", 'div.foo'] });
  assert.strictEqual(rules.length, 2);
  assert.deepStrictEqual(rules.map((r) => r.kind), ['exists', 'exists']);
  assert.strictEqual(rules[0].selector, "link[href^='/++resource++']");
  assert.strictEqual(rules[1].selector, 'div.foo');
  assert.strictEqual(rules[0].regex, undefined, 'existence rules carry no regex');
});

test('object text shape becomes a text rule', () => {
  const rules = normalizeDomRules({ dom: { title: { text: '^Pleroma$' } } });
  assert.deepStrictEqual(rules, [{ selector: 'title', kind: 'text', regex: '^Pleroma$' }]);
});

test('object attributes shape yields one rule per attribute', () => {
  const rules = normalizeDomRules({
    dom: { 'a[href]': { attributes: { href: 'omniupdate\\.com', title: 'CMS' } } },
  });
  assert.strictEqual(rules.length, 2);
  assert.deepStrictEqual(rules.map((r) => r.name).sort(), ['href', 'title']);
  for (const r of rules) {
    assert.strictEqual(r.kind, 'attributes');
    assert.strictEqual(r.selector, 'a[href]');
  }
});

test('object exists shape becomes an existence rule regardless of its value', () => {
  // on-disk `exists` values are the empty string; the value carries no meaning
  const rules = normalizeDomRules({ dom: { '#recaptcha': { exists: '' } } });
  assert.deepStrictEqual(rules, [{ selector: '#recaptcha', kind: 'exists' }]);
});

test('object properties shape yields one rule per property', () => {
  const rules = normalizeDomRules({ dom: { div: { properties: { __k: '' } } } });
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].kind, 'properties');
  assert.strictEqual(rules[0].name, '__k');
});

test('one selector carrying several condition types expands to several rules', () => {
  const rules = normalizeDomRules({
    dom: { 'link[rel]': { exists: '', attributes: { href: 'cdn\\.example' } } },
  });
  assert.strictEqual(rules.length, 2);
  assert.deepStrictEqual(rules.map((r) => r.kind).sort(), ['attributes', 'exists']);
});

// --- fail loudly: the whole point of the contract -------------------------------------

test('an unknown condition key throws rather than being silently dropped', () => {
  assert.throws(
    () => normalizeDomRules({ dom: { div: { hasClass: 'x' } } }),
    /hasClass/,
    'unknown keys must name themselves in the error',
  );
});

test('a non-string, non-object dom value throws', () => {
  assert.throws(() => normalizeDomRules({ dom: { div: 42 } }), /div/);
});

test('a non-string entry in the array shape throws', () => {
  assert.throws(() => normalizeDomRules({ dom: ['div.ok', { nope: true }] }), /array/i);
});

test('a dom field that is neither object nor array throws', () => {
  assert.throws(() => normalizeDomRules({ dom: 'div.foo' }), /dom/);
});
