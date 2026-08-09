// tests/pattern-normalize.test.js — UNI-226.
//
// Upstream Wappalyzer patterns carry modifier suffixes separated by an escaped semicolon:
// `\;confidence:NN` and `\;version:\1`. Our importer never stripped them, so for every field the
// engine REGEX-TESTS the suffix became a literal requirement no real page can satisfy:
//
//   new RegExp('adocean\\.pl\\;confidence:80', 'i').test('cdn.adocean.pl/lib.js')  // false
//
// 939 values silently dead across scriptSrc/meta/headers/html/cookies/scripts, plus 79 dom
// selectors that fail to parse. Same class as the UNI-224 dom defect — unparsed upstream syntax
// causing silent death — on a much larger surface.
//
// Measured across the whole shipped set, the ONLY segment kinds appearing after the separator are
// `version` (1,289) and `confidence` (208). Nothing else, so dropping exactly those two is safe.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { stripModifiers, normalizeDefinition, hasModifier } =
  require(path.resolve(__dirname, '../src/pattern-normalize.js'));
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

test('a confidence modifier is removed', () => {
  assert.strictEqual(stripModifiers('adocean\\.pl\\;confidence:80'), 'adocean\\.pl');
});

test('a version modifier is removed', () => {
  assert.strictEqual(stripModifiers('jquery-([\\d.]+)\\.js\\;version:\\1'), 'jquery-([\\d.]+)\\.js');
});

test('both modifiers on one value are removed', () => {
  assert.strictEqual(
    stripModifiers('wp-content\\;confidence:50\\;version:\\1'), 'wp-content');
});

test('a clean value is returned unchanged', () => {
  assert.strictEqual(stripModifiers('cdn\\.jsdelivr\\.net'), 'cdn\\.jsdelivr\\.net');
  assert.strictEqual(stripModifiers(''), '');
});

test('an unrecognised segment is KEPT, not silently truncated', () => {
  // Only `confidence` and `version` appear in the shipped set. If upstream ever adds another
  // modifier, dropping it blind would silently change a pattern's meaning -- so keep it and let
  // the lint surface it instead.
  assert.strictEqual(stripModifiers('foo\\;sometag:9'), 'foo\\;sometag:9');
});

test('the stripped pattern matches content the original could not', () => {
  // The whole point. Without this the regex demands the literal text ";confidence:80".
  const raw = 'adocean\\.pl\\;confidence:80';
  assert.strictEqual(new RegExp(raw, 'i').test('cdn.adocean.pl/lib.js'), false);
  assert.strictEqual(new RegExp(stripModifiers(raw), 'i').test('cdn.adocean.pl/lib.js'), true);
});

test('normalizeDefinition strips values in every field shape', () => {
  const def = normalizeDefinition({
    html: ['a\\;confidence:80', 'b'],
    meta: { generator: 'X\\;version:\\1' },
    headers: { 'x-powered-by': 'Y\\;confidence:50' },
    dom: { 'div.z': { attributes: { 'data-q': 'v\\;confidence:20' } } },
    cats: [1],
  });
  assert.deepStrictEqual(def.html, ['a', 'b']);
  assert.strictEqual(def.meta.generator, 'X');
  assert.strictEqual(def.headers['x-powered-by'], 'Y');
  assert.strictEqual(def.dom['div.z'].attributes['data-q'], 'v');
});

test('normalizeDefinition strips a dom ARRAY selector, which is a key position', () => {
  // Progress WS_FTP ships its whole selector with a trailing modifier, which is why
  // querySelectorAll could not parse it. This is the one key-position case in the shipped set.
  const def = normalizeDefinition({
    dom: ["form[name='formLogin'][id='formLogin']\\;confidence:40"],
    cats: [1],
  });
  assert.deepStrictEqual(def.dom, ["form[name='formLogin'][id='formLogin']"]);
});

test('normalizeDefinition leaves js KEYS alone', () => {
  // js keys are global NAMES, looked up as property paths -- never regex-tested. The modifier
  // lives in the value there, which is why the 452 js cases were harmless.
  const def = normalizeDefinition({ js: { 'window.Foo': 'x\\;confidence:50' }, cats: [1] });
  assert.deepStrictEqual(Object.keys(def.js), ['window.Foo']);
  assert.strictEqual(def.js['window.Foo'], 'x');
});

// --- the definition of done -------------------------------------------------------------

test('no loaded pattern value carries a modifier', () => {
  const d = new DeTECHtor();
  const offenders = [];
  const walk = (v, name, trail) => {
    if (typeof v === 'string') {
      if (hasModifier(v)) offenders.push(`${name}${trail}: ${v}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, name, `${trail}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (hasModifier(k)) offenders.push(`${name}${trail} key: ${k}`);
        walk(x, name, `${trail}.${k}`);
      }
    }
  };
  for (const [name, def] of Object.entries(d.patterns)) {
    if (name === '_metadata' || !def || typeof def !== 'object') continue;
    for (const f of ['html', 'scriptSrc', 'scripts', 'meta', 'headers', 'cookies', 'js', 'dom',
                     'url', 'text', 'network']) {
      if (def[f] !== undefined) walk(def[f], name, `.${f}`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 20), [],
    `${offenders.length} pattern values still carry an unstripped modifier`);
});
