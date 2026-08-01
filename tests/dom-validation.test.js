// tests/dom-validation.test.js — Phase C guardrails (UNI-224).
//
// The defect this ticket exists for was SILENT: 1,456 techs carried dom rules the engine could not
// evaluate, and nothing errored. Every guard we owned asked "is this pattern too BROAD?" (semantic);
// none asked "is this pattern the SHAPE the engine consumes?" (structural). These tests cover both,
// because both failure modes are "a value the engine cannot use".
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { checkDomRules, isOverBroadSelector } = require(path.resolve(__dirname, '../src/dom-rules.js'));
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

// --- structural: is it the shape the engine consumes? ----------------------------------

test('a well-formed definition reports no problems', () => {
  const { rules, problems } = checkDomRules('Fine', { dom: { 'div.x': { text: '^ok$' } } });
  assert.strictEqual(problems.length, 0);
  assert.strictEqual(rules.length, 1);
});

test('an unknown condition key is reported, not silently dropped', () => {
  const { problems } = checkDomRules('Bad', { dom: { div: { hasClass: 'x' } } });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].message, /hasClass/);
  assert.strictEqual(problems[0].kind, 'shape');
});

test('a selector the engine cannot parse is reported', () => {
  const { problems } = checkDomRules('Broken', { dom: ["form[name='x'][id='y']\\;confidence:0"] });
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].kind, 'selector');
});

test('a denied rule produces no problem — it is already quarantined', () => {
  // Progress WS_FTP's malformed selector is on the Phase A denylist; validation must not
  // re-report what we have deliberately excluded.
  const { problems } = checkDomRules('Progress WS_FTP', {
    dom: ["form[name='formLogin'][action='login.aspx' i][id='formLogin']\\;confidence:40"],
  });
  assert.deepStrictEqual(problems, []);
});

// --- semantic: is it too broad? --------------------------------------------------------

test('over-broad substring selectors are flagged', () => {
  // The three Phase A denials, which the existing lint could never see because it reads
  // only `html` and `scripts`.
  assert.ok(isOverBroadSelector("[class*='fa']"), "[class*='fa'] matches 'default'");
  assert.ok(isOverBroadSelector("[class*='el-']"), "[class*='el-'] matches 'level-', 'label-'");
  assert.ok(isOverBroadSelector('div'), 'a bare element name matches everywhere');
  assert.ok(isOverBroadSelector('noscript'), 'bare element, existence-only, is meaningless');
});

test('specific selectors are not flagged', () => {
  assert.ok(!isOverBroadSelector("link[href*='cdn.jsdelivr.net']"));
  assert.ok(!isOverBroadSelector('div.swiper-wrapper'));
  assert.ok(!isOverBroadSelector("a[href*='a.cms.omniupdate.com/11/']"));
  assert.ok(!isOverBroadSelector("script[class*='yoast-schema-graph']"));
});

// --- the live pattern set ---------------------------------------------------------------

test('every admitted dom rule in the shipped patterns is evaluable', () => {
  const d = new DeTECHtor();
  const problems = [];
  for (const [name, def] of Object.entries(d.patterns)) {
    if (name === '_metadata' || !def || typeof def !== 'object' || def.dom === undefined) continue;
    problems.push(...checkDomRules(name, def).problems);
  }
  assert.deepStrictEqual(
    problems.map((p) => `${p.tech}: ${p.message}`),
    [],
    'a pattern shipped that the engine cannot evaluate — this is the silent-death class',
  );
});

test('loading patterns in strict mode throws on an unevaluable dom rule', () => {
  const d = new DeTECHtor();
  d.patterns = { Bogus: { dom: { div: { hasClass: 'x' } }, cats: [1] } };
  assert.throws(() => d.buildDomPlan({ strict: true }), /Bogus/);
});

test('non-strict loading skips the bad rule instead of aborting a scan', () => {
  const d = new DeTECHtor();
  d.patterns = { Bogus: { dom: { div: { hasClass: 'x' } }, cats: [1] } };
  const plan = d.buildDomPlan({ strict: false });
  assert.deepStrictEqual(plan, []);
});

test('breadth is judged on the RULE, not the selector alone', () => {
  const { isOverBroadRule } = require(path.resolve(__dirname, '../src/dom-rules.js'));
  // curated Pleroma: a bare `noscript` selector, but a paired text regex constrains it to 0%.
  assert.ok(!isOverBroadRule({ selector: 'noscript', kind: 'text', regex: '^To use Pleroma$' }),
    'a paired regex makes a broad selector acceptable');
  // existence alone on the same selector is meaningless.
  assert.ok(isOverBroadRule({ selector: 'noscript', kind: 'exists' }));
  // attribute presence with no regex is existence in disguise.
  assert.ok(isOverBroadRule({ selector: 'div', kind: 'attributes', name: 'id', regex: '' }));
});
