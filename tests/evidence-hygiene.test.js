// tests/evidence-hygiene.test.js — evidence the matcher sees must be the page's own markup.
//
// 2026-11-16 review, finding 12 (cohort 143):
//  - one value per meta name: 1,408 evaluated pages print two or more `generator` tags and the
//    last one won, so the WordPress generator was lost on 653 pages and a CMS went undetected on 18
//    home pages;
//  - html rules ran over CSS and comments: of 9,879 html-only signal detections, 2,632 first matched
//    Font Awesome icon CSS (`.fa-umbraco`, `.fa-algolia`, `.fa-salesforce`, `.fa-hubspot`) and 126 a
//    comment. None loaded, but each set `status: detected` and stopped tier escalation.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { evidenceFromHtml } = require(path.resolve(__dirname, '../src/evidence-from-html.js'));
const { htmlForMatching, ruleSeesRawHtml } = require(path.resolve(__dirname, '../src/html-for-matching.js'));
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const engine = new DeTECHtor();
const detect = (html) => engine.matchPatterns(evidenceFromHtml(html, engine.domPlan, { pageUrl: 'https://www.riverside.edu/' }));
const find = (html, name) => detect(html).find((t) => t.name === name);
const page = (head, body = '') => `<!doctype html><html><head><title>Riverside State University</title>${head}</head>` +
  `<body><p>Riverside offers more than eighty programmes.</p>${body}</body></html>`;

// ---------------------------------------------------------------- meta: every value per name

test('evidenceFromHtml keeps every value of a repeated meta name', () => {
  const e = evidenceFromHtml(page(
    '<meta name="generator" content="WordPress 6.6.2"><meta name="generator" content="Site Kit by Google 1.140.0">' +
    '<meta name="Generator" content="Elementor 3.24.7; features: additional_custom_breakpoints">'), []);
  assert.deepStrictEqual(e.metaValues.generator,
    ['WordPress 6.6.2', 'Site Kit by Google 1.140.0', 'Elementor 3.24.7; features: additional_custom_breakpoints']);
  // `meta` keeps its documented shape (one string per name) for existing consumers.
  assert.strictEqual(typeof e.meta.generator, 'string');
});

test('a CMS generator followed by a plugin generator is still detected (the 653-page loss)', () => {
  const html = page('<meta name="generator" content="WordPress 6.6.2"><meta name="generator" content="Site Kit by Google 1.140.0">');
  const wp = find(html, 'WordPress');
  assert.ok(wp, 'WordPress must be detected from its own generator tag');
  assert.ok(wp.evidence.some((r) => r.startsWith('Meta: generator=')), wp.evidence.join(', '));
  const m = wp.matches.find((x) => x.channel === 'Meta');
  assert.match(m.src, /^WordPress 6\.6\.2$/, 'the match records the value that matched, not another tag');
});

test('two products named by two generator tags are both detected', () => {
  const html = page('<meta name="generator" content="WordPress 6.6.2"><meta name="generator" content="Elementor 3.24.7">');
  assert.ok(find(html, 'WordPress'));
  assert.ok(find(html, 'Elementor'));
});

test('an evidence object without metaValues (browser fixtures, probes) still matches meta', () => {
  const ev = evidenceFromHtml(page(''), []);
  delete ev.metaValues;
  ev.meta = { generator: 'WordPress 6.6.2' };
  assert.ok(engine.matchPatterns(ev).some((t) => t.name === 'WordPress'));
});

// ---------------------------------------------------------------- html: no CSS, no comments

const FONT_AWESOME = '<style>.fa-umbraco:before{content:"\\f8e8"}.fa-algolia:before{content:"\\f36c"}' +
  '.fa-salesforce:before{content:"\\f83b"}.fa-hubspot:before{content:"\\f3b2"}</style>';

test('Font Awesome icon CSS is not evidence of the brand it draws', () => {
  const html = page(FONT_AWESOME);
  for (const name of ['Umbraco', 'Algolia']) assert.strictEqual(find(html, name), undefined, name);
});

test('an inline SVG <style> block is not evidence either', () => {
  const html = page('', '<svg viewBox="0 0 10 10"><style>.fa-umbraco{fill:#000}</style><path d="M0 0"/></svg>');
  assert.strictEqual(find(html, 'Umbraco'), undefined);
});

test('commented-out markup is not evidence', () => {
  const html = page('', '<!-- <img src="/umbraco/media/1/old.jpg"> --><!-- <script src="https://cdn.jsdelivr.net/npm/algoliasearch@4"></script> -->' +
    '<!--[if lte IE 8]><script src="//js.hsforms.net/forms/v2-legacy.js"></script><![endif]-->');
  assert.strictEqual(find(html, 'Umbraco'), undefined);
  assert.strictEqual(find(html, 'Algolia'), undefined);
});

test('a prose comment, the site\'s own annotation, is still evidence', () => {
  const html = page('', '<!--\n  Running Squiz Matrix\n  Developed by Squiz - http://www.squiz.net\n-->');
  assert.ok(find(html, 'Squiz DXP'));
});

test('the same product in the page markup is still detected', () => {
  const html = page(FONT_AWESOME, '<img src="/umbraco/media/1234/hero.jpg" alt="">');
  const u = find(html, 'Umbraco');
  assert.ok(u, 'a /umbraco/ media path in markup is real evidence');
});

test('a rule that names a comment still sees comments', () => {
  // Yoast's fingerprint IS a comment; stripping comments from it would delete the rule.
  const html = page('<!-- This site is optimized with the Yoast SEO plugin v23.5 - https://yoast.com/wordpress/plugins/seo/ -->');
  assert.ok(find(html, 'Yoast SEO'));
});

test('htmlForMatching drops style blocks and comments and keeps everything else', () => {
  const html = '<head><style type="text/css">.a{b:c}</style><STYLE>x</STYLE></head><!-- <b>c</b> --><p>keep</p>' +
    '<script>var umbraco = 1;</script><div style="color:red">inline style attribute kept</div>';
  const out = htmlForMatching(html);
  assert.ok(!/\.a\{b:c\}|<style|<!--/i.test(out), out);
  assert.ok(out.includes('<p>keep</p>') && out.includes('var umbraco = 1;') && out.includes('inline style attribute kept'));
});

test('htmlForMatching leaves an unterminated comment or style block in place', () => {
  assert.strictEqual(htmlForMatching('<p>a</p><!-- <b>never closed umbraco'), '<p>a</p><!-- <b>never closed umbraco');
  assert.strictEqual(htmlForMatching('<p>a</p><!-- a note --><p>b</p>'), '<p>a</p><!-- a note --><p>b</p>');
  assert.strictEqual(htmlForMatching('<p>a</p><style>.x{}'), '<p>a</p><style>.x{}');
});

test('htmlForMatching is linear on adversarial input', () => {
  const evil = '<!--'.repeat(250000) + '<style>'.repeat(140000); // ~2 MB, nothing ever closes
  const t0 = process.hrtime.bigint();
  htmlForMatching(evil);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `took ${ms.toFixed(0)} ms`);
});

test('ruleSeesRawHtml is true only for rules that name a comment or a style block', () => {
  assert.strictEqual(ruleSeesRawHtml('<!-- This site is optimized with the Yoast'), true);
  assert.strictEqual(ruleSeesRawHtml('<style[^>]{0,40}id="foo"'), true);
  assert.strictEqual(ruleSeesRawHtml('umbraco'), false);
});

test('a comment or style opener inside an inline script is not stripped', () => {
  const html = '<script>document.write("<!--"); var umbraco = "<style>";</script><p>after</p><!-- <p>gone</p> -->';
  assert.strictEqual(htmlForMatching(html), '<script>document.write("<!--"); var umbraco = "<style>";</script><p>after</p> ');
});
