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
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { evidenceFromHtml } = require(path.resolve(__dirname, '../src/evidence-from-html.js'));

const d = new DeTECHtor();

// UNI-225: this used to inline its own cheerio evidence builder — an ad-hoc copy of the browser
// path that could drift from it silently. It now goes through the same builder the tiered runner
// uses, so a divergence fails here instead of hiding.
function evidenceFromFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/pages', name), 'utf8');
  return evidenceFromHtml(html, d.domPlan);
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

test('a Modern Campus CMS footer login link is detected', () => {
  // The dom rule `a[href*='a.cms.omniupdate.com/11/']` is this technology's ONLY evidence path —
  // before UNI-224 it was 100% undetectable despite ~374 institutions carrying the marker.
  //
  // Reported as `Modern Campus CMS` since UNI-233: the vendor renamed the product (OU Campus →
  // OmniUpdate/OmniCMS → Omni CMS → Modern Campus CMS) and all four names were shipping as
  // separate technologies. The merge carries this dom rule onto the canonical entry, which the
  // curated `Modern Campus CMS` definition did not have — so this assertion is also the guard
  // that the rename did not quietly undo UNI-224.
  const names = detect('omni-cms.html');
  assert.ok(names.includes('Modern Campus CMS'),
    `Modern Campus CMS should be detected — got: ${names.join(', ') || 'none'}`);
});
