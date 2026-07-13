#!/usr/bin/env node
// Regression test for UNI-139: JS-object detection must be RUNTIME-PRESENCE ONLY.
// There must be NO fallback to substring-matching the object's name against the HTML
// (that produced the false-positive flood: bare `s`/`va`/`wp` match nearly every page).

const DeTECHtor = require('../src/detechtor');

let failures = 0;
function check(cond, msg) {
  if (cond) { console.log('  ok:  ' + msg); }
  else { console.error('  FAIL: ' + msg); failures++; }
}

function baseEvidence(overrides) {
  return Object.assign({
    // HTML deliberately contains the bare tokens as substrings:
    html: '<html><body>var s=1; let va=2; wp_data; ga(); PS.init(); window.Banner;</body></html>',
    headers: {}, scripts: [], meta: {}, cookies: [],
    dom: { jsObjects: {}, title: '', bodyClasses: '', bodyId: '', headContent: '', hasElements: {} },
    apiEndpoints: [], versionInfo: {}
  }, overrides || {});
}

console.log('UNI-139: js-object detection = runtime presence only\n');
const d = new DeTECHtor();

// 1. Bare js tokens present in HTML but absent from runtime jsObjects -> MUST NOT match.
{
  const p = { js: { s: {}, va: {}, wp: {}, ga: {}, PS: {}, Banner: {} } };
  const r = d.evaluatePattern('FakeTech', p, baseEvidence());
  check(r.confidence === 0, 'no HTML-substring fallback: confidence=' + r.confidence + ' (expected 0)');
}

// 2. Runtime jsObject present -> matches (+80).
{
  const ev = baseEvidence({ dom: { jsObjects: { algoliasearch: true }, title:'', bodyClasses:'', bodyId:'', headContent:'', hasElements:{} } });
  const r = d.evaluatePattern('Algolia', { js: { algoliasearch: {} } }, ev);
  check(r.confidence === 80, 'runtime jsObject matches: confidence=' + r.confidence + ' (expected 80)');
}

// 3. Regression: a real html pattern still matches.
{
  const r = d.evaluatePattern('UserWay', { html: ['userway'] }, baseEvidence({ html: '<script src="https://cdn.userway.org/widget.js"></script>' }));
  check(r.confidence >= 40, 'html pattern still works: confidence=' + r.confidence + ' (expected >=40)');
}

// 4. Regression: a scripts-src pattern still matches (the evidence type our rebuilt patterns use).
{
  const r = d.evaluatePattern('UserWay', { scripts: ['userway\\.org'] }, baseEvidence({ scripts: [{ src: 'https://cdn.userway.org/widget.js' }] }));
  check(r.confidence > 0, 'scripts pattern still works: confidence=' + r.confidence + ' (expected >0)');
}

console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
