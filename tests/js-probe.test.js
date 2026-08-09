// tests/js-probe.test.js — UNI-225.
//
// The probe list is generated FROM the pattern files and exported by the package, so it cannot
// drift from the patterns the engine will actually evaluate. Hardcoding it downstream -- which is
// what src/detechtor.js:648-694 does today with its 40-odd hand-listed globals -- is the drift risk
// this replaces.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { probeNames, isPresent, probeGlobals, PROBE_SOURCE } =
  require(path.resolve(__dirname, '../src/js-probe.js'));
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

test('probeNames collects distinct js keys across patterns, sorted', () => {
  const names = probeNames({
    A: { js: { Foo: '' }, cats: [1] },
    B: { js: { Bar: '', Foo: '' }, cats: [1] },
    C: { html: ['x'], cats: [1] },
    _metadata: { anything: true },
  });
  assert.deepStrictEqual(names, ['Bar', 'Foo']);
});

test('a nested path resolves without eval', () => {
  const root = { M: { core: { version: '4' } } };
  assert.strictEqual(isPresent(root, 'M.core'), true);
  assert.strictEqual(isPresent(root, 'M.core.version'), true);
  assert.strictEqual(isPresent(root, 'M.core.missing'), false);
  assert.strictEqual(isPresent(root, 'Nope.deep.path'), false);
});

test('names containing characters illegal in a dotted identifier still resolve', () => {
  // 21 of the 5,082 pattern globals are not valid dotted identifiers, e.g. `pmg-mail-tracker`
  // and `litElementVersions.0`. A path built for eval would throw on these; bracket access works.
  const root = { 'pmg-mail-tracker': {}, litElementVersions: ['2.0.0'] };
  assert.strictEqual(isPresent(root, 'pmg-mail-tracker'), true);
  assert.strictEqual(isPresent(root, 'litElementVersions.0'), true);
});

test('a global explicitly set to undefined counts as absent', () => {
  assert.strictEqual(isPresent({ Foo: undefined }, 'Foo'), false);
});

test('a falsy-but-present global counts as present', () => {
  // typeof window.X !== "undefined" is the semantic the engine already uses at detechtor.js:1111.
  assert.strictEqual(isPresent({ Foo: 0 }, 'Foo'), true);
  assert.strictEqual(isPresent({ Foo: null }, 'Foo'), true);
});

test('probeGlobals returns only the names actually present', () => {
  const root = { Drupal: {}, jQuery: () => {} };
  assert.deepStrictEqual(probeGlobals(root, ['Drupal', 'jQuery', 'Absent']), ['Drupal', 'jQuery']);
});

test('PROBE_SOURCE evaluates to a function that agrees with probeGlobals', () => {
  // The browser-side probe is derived from isPresent at module load. If someone edits one and not
  // the other, this test fails -- which is the point.
  const fn = eval(PROBE_SOURCE);
  const root = { Drupal: {}, 'pmg-mail-tracker': {} };
  const names = ['Drupal', 'pmg-mail-tracker', 'Absent'];
  assert.deepStrictEqual(fn.call(root, names), probeGlobals(root, names));
});

test('the shipped patterns yield a large, plain probe list', () => {
  const names = probeNames(new DeTECHtor().patterns);
  assert.ok(names.length > 4000, `expected >4000 globals, got ${names.length}`);
  // `$` and `.` are excluded from this check on purpose: both are legal in a property path
  // (`$`, `$.fn.dataTable.version`, `M.core`). What must NOT appear is regex structure -- a name
  // carrying `\`, `^`, `*`, `+`, `?`, a group or a character class is a pattern, not a lookup.
  const withMetachars = names.filter((n) => /[\\^*+?()[\]{}|]/.test(n));
  assert.deepStrictEqual(withMetachars, [], 'probe names must be property paths, not regexes');
});
