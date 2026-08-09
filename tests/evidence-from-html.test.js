// tests/evidence-from-html.test.js — UNI-225.
//
// The offline evidence builder must produce the SAME shape the browser path produces
// (src/detechtor.js collectEvidence), or patterns that work live will silently fail offline --
// which is precisely the class of defect UNI-224 was opened for.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { evidenceFromHtml } = require(path.resolve(__dirname, '../src/evidence-from-html.js'));

const PAGE = `<!doctype html><html><head>
<title>Riverside State University</title>
<meta name="generator" content="Terminalfour">
<meta property="og:title" content="Riverside">
<script src="/assets/app.js?ver=4.2"></script>
</head><body>
<a class="edit-link" href="/terminalfour/page/directEdit" data-t4-id="99">Edit</a>
<noscript>To use Pleroma, please enable JavaScript.</noscript>
</body></html>`;

const PLAN = [
  { selector: 'a.edit-link', text: true, attrs: ['href', 'data-t4-id'], props: [] },
  { selector: 'noscript', text: true, attrs: [], props: [] },
  { selector: 'input#nope', text: false, attrs: [], props: ['value'] },
];

test('meta tags are keyed by lowercased name or property', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  assert.strictEqual(e.meta.generator, 'Terminalfour');
  assert.strictEqual(e.meta['og:title'], 'Riverside');
});

test('scripts are {src, version} objects, matching the browser path', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  assert.deepStrictEqual(e.scripts, [{ src: '/assets/app.js?ver=4.2', version: '4.2' }]);
});

test('domNodes carries text and only the requested attributes', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  const nodes = e.domNodes['a.edit-link'];
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].text, 'Edit');
  assert.deepStrictEqual(nodes[0].attributes, { href: '/terminalfour/page/directEdit', 'data-t4-id': '99' });
});

test('a selector matching nothing is absent from domNodes, not present-and-empty', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  assert.ok(!('input#nope' in e.domNodes));
});

test('an unprobed page reports jsProbed false with no globals', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  assert.strictEqual(e.jsProbed, false, 'absent jsGlobals means UNKNOWN, not "none present"');
  assert.deepStrictEqual(e.dom.jsObjects, {});
});

test('a probed page with no globals present is distinguishable from an unprobed one', () => {
  const e = evidenceFromHtml(PAGE, PLAN, { jsGlobals: [] });
  assert.strictEqual(e.jsProbed, true);
  assert.deepStrictEqual(e.dom.jsObjects, {});
});

test('probed globals populate evidence.dom.jsObjects as the engine consumes it', () => {
  const e = evidenceFromHtml(PAGE, PLAN, { jsGlobals: ['TerminalFour', 'jQuery'] });
  assert.strictEqual(e.jsProbed, true);
  assert.deepStrictEqual(e.dom.jsObjects, { TerminalFour: true, jQuery: true });
});

test('the evidence shape carries every key matchPatterns reads', () => {
  const e = evidenceFromHtml(PAGE, PLAN);
  for (const key of ['html', 'headers', 'scripts', 'meta', 'cookies', 'dom', 'domNodes',
                     'apiEndpoints', 'networkHosts', 'versionInfo']) {
    assert.ok(key in e, `missing evidence key: ${key}`);
  }
});

test('an unparseable selector in the plan is skipped, not thrown', () => {
  const e = evidenceFromHtml(PAGE, [{ selector: 'a[[[bad', text: true, attrs: [], props: [] }]);
  assert.deepStrictEqual(e.domNodes, {});
});
