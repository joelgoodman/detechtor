// tests/golden-pages.test.js — offline golden fixtures (UNI-224 Phase C).
//
// `tests/fixtures/known-sites.json` already carried `must_not_match` expectations, but the runner
// that reads it (scripts/regression-test.js) performs LIVE scans and is not part of `npm test` —
// so those expected-absent assertions had never guarded anything.
//
// These fixtures are committed HTML and run in the gate. Expected-ABSENT matters at least as much
// as expected-present: the defect that opened UNI-224 was a technology firing where it had no
// business firing, and no test could see it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));

const d = new DeTECHtor();

/** Build engine evidence from static HTML, mirroring what the browser path collects. */
function evidenceFromFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/pages', name), 'utf8');
  const $ = cheerio.load(html);
  const domNodes = {};
  for (const spec of d.domPlan) {
    let els;
    try {
      els = $(spec.selector);
    } catch {
      continue;
    }
    if (!els.length) continue;
    const nodes = [];
    els.slice(0, 25).each((_, el) => {
      const node = {};
      if (spec.text) node.text = ($(el).text() || '').slice(0, 500);
      if (spec.attrs.length) {
        node.attributes = {};
        for (const a of spec.attrs) {
          const v = $(el).attr(a);
          if (v !== undefined) node.attributes[a] = v;
        }
      }
      if (spec.props.length) node.properties = {};
      nodes.push(node);
    });
    domNodes[spec.selector] = nodes;
  }
  const scripts = $('script[src]').map((_, s) => ({ src: $(s).attr('src') })).get();
  const meta = {};
  $('meta[name]').each((_, m) => { meta[($(m).attr('name') || '').toLowerCase()] = $(m).attr('content') || ''; });
  return {
    html, headers: {}, scripts, meta, cookies: [],
    dom: { jsObjects: {} }, domNodes, apiEndpoints: [], networkHosts: [], versionInfo: {},
  };
}

const detect = (fixture) => d.matchPatterns(evidenceFromFixture(fixture)).map((h) => h.name);

test('a generic university page detects no CMS-class false positives', () => {
  const names = detect('generic-university.html');

  // Each of these fired in cohort 128 or in the Phase A audit, for a reason that is now fixed.
  for (const absent of [
    'Pleroma',        // /[object Object]/i via the engine misreading object-form dom
    'Element UI',     // [class*='el-'] matching mega-nav__level-three-plus-link, level-2
    'Font Awesome',   // [class*='fa'] matching "main-default.css"
    'TerminalFour',   // the historical 't4' substring false positive
  ]) {
    assert.ok(!names.includes(absent), `${absent} must NOT be detected — got: ${names.join(', ') || 'none'}`);
  }
});

test('the generic page still detects what is genuinely present', () => {
  const names = detect('generic-university.html');
  assert.ok(names.includes('Open Graph'), `Open Graph should be detected — got: ${names.join(', ') || 'none'}`);
});

test('an Omni CMS footer login link is detected', () => {
  // Omni CMS (Modern Campus) has NO evidence path other than this dom rule — before UNI-224 it
  // was 100% undetectable despite ~374 institutions carrying the marker.
  const names = detect('omni-cms.html');
  assert.ok(names.includes('Omni CMS'), `Omni CMS should be detected — got: ${names.join(', ') || 'none'}`);
});
