// tests/version-extraction.test.js — a version comes only from a rule that fired for that technology.
//
// 2026-11-16 detection review, finding 3: `extractVersion` was handed `{ name }` only, so a pattern's
// own `\;version:\1` template was never read, and it then fell back to the FIRST versioned script on
// the page. Every technology on a page reported the same number: 1,865 of 3,547 stored versions
// were 3.7.1 (jQuery), on Slate, Siteimprove, UserWay and the rest.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { normalizeDefinition } = require(path.resolve(__dirname, '../src/pattern-normalize.js'));
const { evidenceFromHtml } = require(path.resolve(__dirname, '../src/evidence-from-html.js'));

function engineWith(patterns) {
  const e = new DeTECHtor();
  for (const def of Object.values(patterns)) normalizeDefinition(def);
  e.patterns = patterns;
  e.domPlan = e.buildDomPlan();
  return e;
}

const EVIDENCE = (over = {}) => ({
  html: '', headers: {}, scripts: [], meta: {}, cookies: [],
  dom: { jsObjects: {} }, domNodes: {}, apiEndpoints: [], networkHosts: [],
  versionInfo: {}, jsProbed: false, finalUrl: 'https://example.edu/',
  ...over,
});

const byName = (matches) => Object.fromEntries(matches.map((m) => [m.name, m]));

test('a technology never inherits another script\'s version', () => {
  const e = engineWith({
    jQuery: { scripts: ['jquery[.-]([\\d.]+)(?:\\.min)?\\.js\\;version:\\1'], categories: ['JavaScript Library'] },
    Siteimprove: { scripts: ['siteimproveanalytics\\.com'], categories: ['Accessibility'] },
  });
  const m = byName(e.matchPatterns(EVIDENCE({
    scripts: [
      { src: 'https://example.edu/js/jquery-3.7.1.min.js', version: '3.7.1' },
      { src: 'https://siteimproveanalytics.com/js/siteanalyze_123.js', version: null },
    ],
  })));
  assert.strictEqual(m.jQuery.version, '3.7.1', 'jQuery\'s own rule captured it');
  assert.strictEqual(m.Siteimprove.version, null, 'Siteimprove has no capturing rule: no version');
});

test('a rule with a capture group but no version template gives no version', () => {
  const e = engineWith({ Widget: { scripts: ['widget-(\\d+)\\.js'], categories: ['Widget'] } });
  const [m] = e.matchPatterns(EVIDENCE({ scripts: [{ src: 'https://cdn.test/widget-42.js', version: '42' }] }));
  assert.strictEqual(m.version, null);
});

test('a page-wide versionInfo entry is not a rule and gives no version', () => {
  const e = engineWith({ 'jQuery UI': { scripts: ['jquery-ui'], categories: ['JavaScript Library'] } });
  const [m] = e.matchPatterns(EVIDENCE({
    scripts: [{ src: 'https://cdn.test/jquery-ui.min.js', version: null }],
    versionInfo: { jquery: '3.7.1' },
  }));
  assert.strictEqual(m.version, null);
});

test('the WordPress generator meta gives its version (shipped patterns)', () => {
  const d = new DeTECHtor();
  const html = '<html><head><meta name="generator" content="WordPress 6.4.2">'
    + '<script src="https://example.edu/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script>'
    + '<script src="https://siteimproveanalytics.com/js/siteanalyze_123.js"></script>'
    + '</head><body></body></html>';
  const m = byName(d.matchPatterns(evidenceFromHtml(html, d.domPlan, { pageUrl: 'https://example.edu/' })));
  assert.ok(m.WordPress, 'WordPress detected');
  assert.strictEqual(m.WordPress.version, '6.4.2');
  assert.ok(m.Siteimprove, 'Siteimprove detected');
  assert.strictEqual(m.Siteimprove.version, null, 'not jQuery\'s 3.7.1');
});

test('a meta version template resolves from the meta value, a missing group gives null', () => {
  const e = engineWith({ WordPress: { meta: { generator: 'WordPress ?([\\d.]+)?\\;version:\\1' }, categories: ['CMS'] } });
  const [withV] = e.matchPatterns(EVIDENCE({ meta: { generator: 'WordPress 6.4.2' } }));
  const [noV] = e.matchPatterns(EVIDENCE({ meta: { generator: 'WordPress' } }));
  assert.strictEqual(withV.version, '6.4.2');
  assert.strictEqual(noV.version, null);
});

test('a ternary version template follows the upstream syntax', () => {
  const e = engineWith({ Thing: { html: ['thing(-pro)?\\;version:\\1?pro:basic'], categories: ['Widget'] } });
  assert.strictEqual(e.matchPatterns(EVIDENCE({ html: 'x thing-pro y' }))[0].version, 'pro');
  assert.strictEqual(e.matchPatterns(EVIDENCE({ html: 'x thing y' }))[0].version, 'basic');
});

test('the shipped patterns hold no page-wide fallback: no two technologies share an uncaptured version', () => {
  const d = new DeTECHtor();
  const html = '<html><head>'
    + '<script src="https://example.edu/js/jquery.min.js?ver=3.7.1"></script>'
    + '<script src="https://js.hs-scripts.com/123.js"></script>'
    + '<script src="https://cdn.userway.org/widget.js"></script>'
    + '</head><body></body></html>';
  const ms = d.matchPatterns(evidenceFromHtml(html, d.domPlan, { pageUrl: 'https://example.edu/' }));
  for (const m of ms) {
    if (m.name === 'jQuery') continue;
    assert.notStrictEqual(m.version, '3.7.1', `${m.name} must not carry jQuery's version`);
  }
});

test('a rule rewritten by pattern-rewrites.json keeps its version template (shipped Autoptimize)', () => {
  const d = new DeTECHtor();
  const html = '<html><head>'
    + '<script src="https://example.edu/wp-content/plugins/autoptimize/classes/js/x.js?ao_version=3.1.12"></script>'
    + '</head><body></body></html>';
  const m = byName(d.matchPatterns(evidenceFromHtml(html, d.domPlan, { pageUrl: 'https://example.edu/' })));
  assert.ok(m.Autoptimize, 'Autoptimize detected');
  assert.strictEqual(m.Autoptimize.version, '3.1.12');
});

test('applyPatternRewrites moves a version template to the rewritten text', () => {
  const { applyPatternRewrites } = require(path.resolve(__dirname, '../src/pattern-rewrites.js'));
  const out = applyPatternRewrites(
    { T: { scripts: ['a.+b(\\d)'], meta: { generator: 'G.+(\\d)' }, _versions: { 'a.+b(\\d)': '\\1', 'G.+(\\d)': '\\1' } } },
    { T: { scripts: [{ from: 'a.+b(\\d)', to: 'a.{1,9}b(\\d)' }], meta: [{ key: 'generator', from: 'G.+(\\d)', to: 'G.{1,9}(\\d)' }] } },
  );
  assert.strictEqual(out.T._versions['a.{1,9}b(\\d)'], '\\1');
  assert.strictEqual(out.T._versions['G.{1,9}(\\d)'], '\\1');
});
