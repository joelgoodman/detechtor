// tests/vendor-patterns.test.js — what iClicker, Screencast-O-Matic, PowerSchool SIS and Unit4 must
// and must not match, after the unbounded-wildcard rewrite (see tests/pattern-cost.test.js).
//
// Every NEGATIVE below is a real false positive from the 300-institution offline run (cohort 140)
// or the shape of one:
//   * iClicker "Script: reef" fired on all three of its detections, every one a Craft Freeform
//     `.../plugin/freeform.js` ("f-REEF-orm").
//   * Screencast-O-Matic "HTML: screencast.*o.*matic" fired at Keele on the prose "screencasts" and a
//     "...matic" 28,487 characters later on the same minified line.
//   * Unit4 Student Management `coda` fired inside the random id of a Slate beacon URL.
// The POSITIVES are the vendor's real markers, including the one genuine PowerSchool hit in the run
// (a `forbesroad.powerschool.com` portal link).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const engine = new DeTECHtor();

const evidence = ({ html = '', scripts = [] } = {}) => ({
  html, headers: {}, scripts: scripts.map((src) => ({ src })), meta: {}, cookies: [],
  dom: { jsObjects: {} }, domNodes: {}, apiEndpoints: [], networkHosts: [],
  versionInfo: {}, jsProbed: false, finalUrl: 'https://example.edu/',
});

const score = (tech, ev) => engine.evaluatePattern(tech, engine.patterns[tech], evidence(ev)).confidence;
const fires = (tech, ev) => score(tech, ev) > 0;

const gap = (n) => 'x'.repeat(n);

// --------------------------------------------------------------------------------------- iClicker
test('iClicker: the vendor name and its real hosts still match', () => {
  assert.ok(fires('iClicker', { html: '<a href="https://www.iclicker.com/students">Get iClicker</a>' }));
  assert.ok(fires('iClicker', { scripts: ['https://cdn.iclicker.com/embed.js'] }));
  assert.strictEqual(score('iClicker', { scripts: ['https://app.reef-education.com/js/app.js'] }), 60,
    'REEF Polling is served from reef-education.com; a script src there is a script-weight hit');
});

test('iClicker: the "i>clicker" branding matches in rendered HTML, where ">" is serialised as &gt;', () => {
  assert.ok(fires('iClicker', { html: '<p>Bring your i&gt;clicker remote to class.</p>' }));
  assert.ok(fires('iClicker', { html: '<p>Register your i-clicker remote.</p>' }));
  assert.ok(fires('iClicker', { html: '<p>Register your i clicker remote.</p>' }));
});

test('iClicker: REEF alongside iClicker still scores higher than iClicker alone', () => {
  const alone = score('iClicker', { html: '<p>Use iClicker.</p>' });
  const both = score('iClicker', { html: '<p>REEF Polling by iClicker.</p>' });
  assert.ok(both > alone, `REEF + iClicker (${both}) should out-score iClicker alone (${alone})`);
});

test('iClicker: a Craft Freeform script ("f-reef-orm") is not iClicker', () => {
  assert.strictEqual(score('iClicker', {
    scripts: ['https://www.sfc.edu/cpresources/f74d53e1/js/scripts/front-end/plugin/freeform.js?v=1785779515'],
  }), 0);
});

test('iClicker: an "i" and a "clicker" far apart on one line are not iClicker', () => {
  assert.strictEqual(score('iClicker', { html: `<p>ticker${gap(40000)}clicker</p>` }), 0);
  assert.strictEqual(score('iClicker', { html: '<p>Priority applications close with the ticker clicker reset.</p>' }), 0);
});

// -------------------------------------------------------------------------------- Screencast-O-Matic
test('Screencast-O-Matic: its name, with or without separators, still matches', () => {
  assert.ok(fires('Screencast-O-Matic', { html: '<iframe src="https://screencast-o-matic.com/embed?sc=cT1k"></iframe>' }));
  assert.ok(fires('Screencast-O-Matic', { html: '<p>Record with Screencast O Matic.</p>' }));
  assert.ok(fires('Screencast-O-Matic', { html: '<p>screencastomatic</p>' }));
});

test('Screencast-O-Matic: the joined spelling keeps scoring on both rules, as before', () => {
  const joined = score('Screencast-O-Matic', { html: 'screencastomatic' });
  const hyphenated = score('Screencast-O-Matic', { html: 'screencast-o-matic' });
  assert.strictEqual(joined, 80, 'two html rules agree on the joined spelling');
  assert.strictEqual(hyphenated, 40, 'one html rule on the hyphenated spelling');
});

test('Screencast-O-Matic: "screencasts" and a "matic" tens of thousands of characters later is not a match', () => {
  const keele = `<li>lecture notes, screencasts and past exam papers</li>${gap(28000)} problematic`;
  assert.strictEqual(score('Screencast-O-Matic', { html: keele }), 0);
});

// ------------------------------------------------------------------------------------ PowerSchool SIS
test('PowerSchool SIS: a portal link to a powerschool.com host still matches (the one real hit in the run)', () => {
  const html = '<a href="https://forbesroad.powerschool.com/public/"><span>PowerSchool Login</span></a>';
  assert.ok(fires('PowerSchool SIS', { html }));
});

test('PowerSchool SIS: product wording near "SIS" / "student" still matches', () => {
  assert.ok(fires('PowerSchool SIS', { html: '<p>PowerSchool SIS lets families see grades.</p>' }));
  assert.ok(fires('PowerSchool SIS', { html: '<p>Log in to PowerSchool to see your student record.</p>' }));
  assert.ok(fires('PowerSchool SIS', { scripts: ['https://cdn.ps.powerschool.com/app.js'] }));
  assert.ok(fires('PowerSchool SIS', { scripts: ['https://x.powerschool.com/sis/portal.js'] }));
});

test('PowerSchool SIS: "student" / "sis" / "powerschool" far apart, or across a tag boundary, is not a match', () => {
  assert.strictEqual(score('PowerSchool SIS', { html: `<p>PowerSchool ${gap(300)} student</p>` }), 0);
  assert.strictEqual(score('PowerSchool SIS', { html: `<p>PowerSchool ${gap(300)} basis</p>` }), 0);
  assert.strictEqual(score('PowerSchool SIS', { html: `<p>steps ${gap(300)} powerschool</p>` }), 0);
  assert.strictEqual(score('PowerSchool SIS', { html: '<p>tips</p><p>PowerSchool</p>' }), 0,
    'a bare "ps" in one element and a bare "PowerSchool" in the next are two unrelated words');
});

// ------------------------------------------------------------------------- Unit4 Student Management
test('Unit4 Student Management: its own host still matches as a script', () => {
  assert.ok(fires('Unit4 Student Management', { scripts: ['https://studentmanagement.unit4.com/js/app.js'] }));
});

test('Unit4 Student Management: "coda" inside the random id of a Slate beacon URL is not Unit4', () => {
  assert.strictEqual(score('Unit4 Student Management', {
    scripts: ['https://apply.example.edu/slate/beacon/x8codaq91.js'],
  }), 0);
});
