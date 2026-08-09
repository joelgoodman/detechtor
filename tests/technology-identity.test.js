// tests/technology-identity.test.js — UNI-233.
//
// Two technologies can be the SAME PRODUCT under different names. Detection sets prove it:
// `Slate` (higher-ed-infra, tagged Chatbot+SIS) and `Slate (Technolutions)` (higher-ed-crm,
// tagged CRM) fire on an identical 111 institutions — Jaccard 1.00. UNI-156 added the correct CRM
// entry but never retired the older one, so the product is counted twice with contradictory
// categories, and whichever pattern happens to match decides what kind of thing we think it is.
//
// Merging is NOT the same as deleting. The losing entry usually carries evidence the winner
// lacks — base `Omni CMS` holds the dom rule that UNI-224 recovered Omni CMS with, while curated
// `Modern Campus CMS` has none. Dropping it would silently regress that ticket's whole result.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveIdentities, mergeDefinitions } =
  require(path.resolve(__dirname, '../src/technology-identity.js'));

test('an alias merges into its canonical and disappears', () => {
  const patterns = {
    'Modern Campus CMS': { cats: [1], html: ['omniupdate'] },
    'Omni CMS': { cats: [1], html: ['omni-cms'] },
  };
  const out = resolveIdentities(patterns, { 'Omni CMS': 'Modern Campus CMS' });
  assert.ok(!('Omni CMS' in out), 'the alias name must not survive');
  assert.ok('Modern Campus CMS' in out);
});

test('REGRESSION: merging preserves evidence the canonical lacks', () => {
  // The exact UNI-224 case. `Omni CMS` was 100% undetectable until Phase B implemented dom
  // matching; its dom rule is the only reason it is found at all. Losing it in a rename cleanup
  // would undo that silently — which is the failure mode this whole ticket is about.
  const patterns = {
    'Modern Campus CMS': { cats: [1], html: ['omniupdate'], scripts: ['omnicms'] },
    'Omni CMS': { cats: [1], dom: ["a[href*='a.cms.omniupdate.com/11/']"] },
  };
  const out = resolveIdentities(patterns, { 'Omni CMS': 'Modern Campus CMS' });
  assert.deepStrictEqual(out['Modern Campus CMS'].dom, ["a[href*='a.cms.omniupdate.com/11/']"],
    'the dom rule UNI-224 recovered Omni CMS with must survive the merge');
});

test('mixed dom SHAPES merge without producing an unevaluable field', () => {
  // `dom` ships as an array of selectors OR a selector-keyed object (src/dom-rules.js). Treating
  // it as a plain array wrapped the object form inside an array — a shape normalizeDomRules
  // rejects outright, which would have taken PixelFed's dom rule out of service. Caught by the
  // UNI-224 Phase C validator, which is precisely the guard that class of bug needs.
  const merged = mergeDefinitions(
    { cats: [1], dom: { "a[href='pixelfed.org']": { text: '^Powered by Pixelfed$' } } },
    { cats: [2], dom: ['div.legacy-selector'] },
  );
  assert.ok(!Array.isArray(merged.dom), 'a mixed merge must not yield an array holding an object');
  assert.ok(merged.dom["a[href='pixelfed.org']"], 'the object-form rule survives');
  assert.deepStrictEqual(merged.dom['div.legacy-selector'], { exists: true },
    'a bare selector becomes an explicit existence condition');
});

test('two object-form dom fields merge with the canonical winning a shared selector', () => {
  const merged = mergeDefinitions(
    { cats: [1], dom: { 'div.x': { text: 'canonical' } } },
    { cats: [2], dom: { 'div.x': { text: 'other' }, 'div.y': { exists: true } } },
  );
  assert.strictEqual(merged.dom['div.x'].text, 'canonical');
  assert.ok(merged.dom['div.y']);
});

test('array fields are unioned without duplicates', () => {
  const merged = mergeDefinitions(
    { cats: [1], html: ['a', 'b'] },
    { cats: [52], html: ['b', 'c'] },
  );
  assert.deepStrictEqual(merged.html, ['a', 'b', 'c']);
});

test('object fields are merged, canonical winning on conflict', () => {
  const merged = mergeDefinitions(
    { cats: [303], js: { Technolutions: '' }, headers: { 'x-slate-instance': '.*' } },
    { cats: [52], js: { Other: '' }, headers: { 'x-slate-instance': 'ignored' } },
  );
  assert.deepStrictEqual(merged.js, { Technolutions: '', Other: '' });
  assert.strictEqual(merged.headers['x-slate-instance'], '.*');
});

test("the canonical's categories win — that is the point of choosing a canonical", () => {
  const merged = mergeDefinitions({ cats: [303] }, { cats: [52, 53] });
  assert.deepStrictEqual(merged.cats, [303], 'CRM must not be re-polluted with Chatbot/SIS');
});

test('an alias pointing at a missing canonical is left alone, never dropped', () => {
  // Losing a technology entirely is worse than leaving it unmerged.
  const patterns = { 'Omni CMS': { cats: [1], html: ['omni-cms'] } };
  const out = resolveIdentities(patterns, { 'Omni CMS': 'Modern Campus CMS' });
  assert.ok('Omni CMS' in out, 'do not delete a technology whose canonical is absent');
});

test('names differing only by case or punctuation merge, curated winning', () => {
  // accessiBe (curated, Accessibility) vs AccessiBe (base, JavaScript Framework) both shipped
  // because override was exact-string. The curated categorisation must win.
  const patterns = {
    AccessiBe: { cats: [12], scriptSrc: ['acsbapp?\\.com'], _curated: false },
    accessiBe: { cats: [306], html: ['accessibe\\.com'], _curated: true },
  };
  const out = resolveIdentities(patterns, {});
  const names = Object.keys(out);
  assert.strictEqual(names.length, 1, `expected one entry, got ${names.join(', ')}`);
  assert.deepStrictEqual(out[names[0]].cats, [306], 'curated categories must win');
  assert.ok(out[names[0]].scriptSrc, 'base evidence must still be merged in');
});

test('two base entries colliding still merge deterministically', () => {
  // Tawk.to / tawk.to are both base and both Chatbot — no curated tiebreak, but they must not
  // both survive and double-count prevalence.
  const patterns = {
    'Tawk.to': { cats: [52], html: ['tawk'] },
    'tawk.to': { cats: [52], scriptSrc: ['embed\\.tawk\\.to'] },
  };
  const out = resolveIdentities(patterns, {});
  assert.strictEqual(Object.keys(out).length, 1);
});

test('unrelated technologies are never merged', () => {
  const patterns = {
    Salesforce: { cats: [303], html: ['salesforce'] },
    TargetX: { cats: [303], html: ['targetx'] },
  };
  const out = resolveIdentities(patterns, {});
  assert.deepStrictEqual(Object.keys(out).sort(), ['Salesforce', 'TargetX']);
});
