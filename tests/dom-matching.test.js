// tests/dom-matching.test.js — the engine actually evaluating `dom` rules (UNI-224 Phase B).
//
// Before this, `evidence.dom` was a fixed six-key bag and every selector-keyed rule was dropped
// at detechtor.js:940. The engine now collects real selector matches into `evidence.domNodes`,
// shaped { selector: [ { text, attributes, properties } ] }, and matches normalized rules against it.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { admittedDomRules } = require(path.resolve(__dirname, '../src/dom-rules.js'));

const DOM_CONFIDENCE = 70;

/** Minimal evidence object — only domNodes populated, so any confidence comes from dom rules. */
function evidenceWith(domNodes) {
  return {
    html: '', headers: {}, scripts: [], meta: {}, cookies: [],
    dom: { jsObjects: {} }, domNodes, apiEndpoints: [], networkHosts: [], versionInfo: {},
  };
}
function node({ text = '', attributes = {}, properties = {} } = {}) {
  return { text, attributes, properties };
}

const d = new DeTECHtor();

test('an exists rule fires when the selector matched nodes', () => {
  const pattern = { dom: ['div.swiper-wrapper'], cats: [1] };
  const r = d.evaluatePattern('Swiper', pattern, evidenceWith({ 'div.swiper-wrapper': [node()] }));
  assert.strictEqual(r.confidence, DOM_CONFIDENCE);
});

test('a rule does not fire when the selector matched nothing', () => {
  const pattern = { dom: ['div.swiper-wrapper'], cats: [1] };
  const r = d.evaluatePattern('Swiper', pattern, evidenceWith({}));
  assert.strictEqual(r.confidence, 0);
});

test('a text rule fires only when the element text matches its regex', () => {
  const pattern = { dom: { noscript: '^To use Pleroma, please enable JavaScript\\.$' }, cats: [1] };
  const hit = d.evaluatePattern('Pleroma', pattern,
    evidenceWith({ noscript: [node({ text: 'To use Pleroma, please enable JavaScript.' })] }));
  assert.strictEqual(hit.confidence, DOM_CONFIDENCE);

  const miss = d.evaluatePattern('Pleroma', pattern,
    evidenceWith({ noscript: [node({ text: 'Please enable JavaScript to view this site.' })] }));
  assert.strictEqual(miss.confidence, 0, 'a present <noscript> with different text must NOT match');
});

test('an attributes rule matches on the named attribute value', () => {
  const pattern = { dom: { 'a[href]': { attributes: { href: 'a\\.cms\\.omniupdate\\.com' } } }, cats: [1] };
  const hit = d.evaluatePattern('Omni CMS', pattern,
    evidenceWith({ 'a[href]': [node({ attributes: { href: 'https://a.cms.omniupdate.com/11/' } })] }));
  assert.strictEqual(hit.confidence, DOM_CONFIDENCE);

  const miss = d.evaluatePattern('Omni CMS', pattern,
    evidenceWith({ 'a[href]': [node({ attributes: { href: 'https://example.edu/' } })] }));
  assert.strictEqual(miss.confidence, 0);
});

test('a properties rule matches on a DOM property, which cheerio could never evaluate', () => {
  const pattern = { dom: { '#app': { properties: { __k: '' } } }, cats: [1] };
  const hit = d.evaluatePattern('Preact', pattern,
    evidenceWith({ '#app': [node({ properties: { __k: 'present' } })] }));
  assert.strictEqual(hit.confidence, DOM_CONFIDENCE);

  const miss = d.evaluatePattern('Preact', pattern, evidenceWith({ '#app': [node()] }));
  assert.strictEqual(miss.confidence, 0);
});

test('any one of several matched nodes satisfies the rule', () => {
  const pattern = { dom: { 'link[href]': { attributes: { href: 'typekit' } } }, cats: [1] };
  const r = d.evaluatePattern('Adobe Fonts', pattern, evidenceWith({
    'link[href]': [
      node({ attributes: { href: '/style.css' } }),
      node({ attributes: { href: 'https://use.typekit.net/abc.css' } }),
    ],
  }));
  assert.strictEqual(r.confidence, DOM_CONFIDENCE);
});

// --- admission gate (Phase A evidence) -------------------------------------------------

test('a denied rule is not evaluated even when its selector matches', () => {
  // Element UI [class*='el-'] fired on 10.3% of institutions and matched zero real Element UI —
  // only level-/label-/carousel- classes. Phase A denied it.
  const rules = admittedDomRules('Element UI', { dom: ["[class*='el-']"] });
  assert.deepStrictEqual(rules, [], 'denylisted rule must be filtered out');

  const r = d.evaluatePattern('Element UI', { dom: ["[class*='el-']"], cats: [1] },
    evidenceWith({ "[class*='el-']": [node({ attributes: { class: 'mega-nav__level-three-plus-link' } })] }));
  assert.strictEqual(r.confidence, 0, 'denied dom rule must contribute no confidence');
});

test('admission is per-rule, not per-tech', () => {
  // Font Awesome's [class*='fa'] is denied; a hypothetical tighter rule on the same tech is not.
  const rules = admittedDomRules('Font Awesome', { dom: ["[class*='fa']", "link[href*='fontawesome']"] });
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].selector, "link[href*='fontawesome']");
});

test('a denylisted malformed selector is not admitted', () => {
  // The trailing \;confidence:40 is unstripped upstream Wappalyzer modifier syntax, which makes
  // the selector unparseable. Structural rejection is checkDomRules' job (see dom-validation
  // tests); this asserts the Phase A denylist also quarantines it by name.
  const rules = admittedDomRules('Progress WS_FTP', {
    dom: ["form[name='formLogin'][action='login.aspx' i][id='formLogin']\\;confidence:40"],
  });
  assert.deepStrictEqual(rules, []);
});

// --- the regression this ticket exists for ---------------------------------------------

test('REGRESSION: a generic university homepage yields no Pleroma detection', () => {
  const real = new DeTECHtor();
  real.patterns = real.loadPatterns();

  // A real university page: has a <noscript>, an <og:> meta, a normal title — none of it Pleroma.
  const hits = real.matchPatterns(evidenceWith({
    noscript: [node({ text: 'Please enable JavaScript to use this site.' })],
    "meta[property*='og:']": [node({ attributes: { property: 'og:title', content: 'Riverside State University' } })],
    title: [node({ text: 'Riverside State University' })],
  }));

  const names = hits.map((h) => h.name);
  assert.ok(!names.includes('Pleroma'), `Pleroma must not be detected, got: ${names.join(', ')}`);
});
