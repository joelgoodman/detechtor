// tests/one-product-one-row.test.js — 2026-11-16 detection review, findings 6 and 7.
//
// Finding 7: one signal produced two ledger rows. The same product shipped under two names with
// identical rules (Crisp / Crisp Live Chat, Zopim / Zendesk Chat, Bold Chat / Genesys Chat, Sumo /
// BDOW, TYPO3 / TYPO3 CMS, Kentico / Kentico CMS), and one HubSpot tracking tag produced both a
// Marketing Automation row (HubSpot) and a CRM row (HubSpot for Education). Canonical names are the
// ones the other ledger sources (BuiltWith, WhatCMS) already use, so rows corroborate across sources.
//
// Finding 6 (ruling 2026-11-16): WP Accessibility counts only when its toolbar loads; the plugin's
// skip-link fixes alone are not an accessibility product.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../src/detechtor.js'));
const { evidenceFromHtml } = require(path.resolve(__dirname, '../src/evidence-from-html.js'));

const d = new DeTECHtor();

function detect(headHtml) {
  const html = `<html><head>${headHtml}</head><body></body></html>`;
  return d.matchPatterns(evidenceFromHtml(html, d.domPlan, { pageUrl: 'https://www.example.edu/' }))
    .map((m) => m.name);
}

const script = (src) => `<script src="${src}"></script>`;

for (const [alias, canonical] of [
  ['TYPO3 CMS', 'TYPO3'],
  ['Kentico CMS', 'Kentico'],
  ['Crisp Live Chat', 'Crisp'],
  ['Zendesk Chat', 'Zopim'],
  ['Genesys Chat', 'Bold Chat'],
  ['BDOW', 'Sumo'],
]) {
  test(`${alias} is merged into ${canonical}`, () => {
    assert.ok(!(alias in d.patterns), `${alias} must not survive as its own technology`);
    assert.ok(canonical in d.patterns, `${canonical} must exist`);
  });
}

test('each duplicated product fires once, under its canonical name', () => {
  const cases = [
    [script('https://client.crisp.chat/l.js'), 'Crisp', 'Crisp Live Chat'],
    [script('https://v2.zopim.com/?abc'), 'Zopim', 'Zendesk Chat'],
    [script('https://vmss.boldchat.com/aid/123456789012345678/bc.vms4/vms.js'), 'Bold Chat', 'Genesys Chat'],
    [script('https://load.sumo.com/'), 'Sumo', 'BDOW'],
    ['<meta name="generator" content="TYPO3 CMS">', 'TYPO3', 'TYPO3 CMS'],
    [script('https://www.example.edu/CMSPages/GetResource.ashx?scriptfile=x.js'), 'Kentico', 'Kentico CMS'],
  ];
  for (const [head, canonical, alias] of cases) {
    const names = detect(head);
    assert.ok(names.includes(canonical), `${canonical} expected from ${head}; got ${names.join(', ')}`);
    assert.ok(!names.includes(alias), `${alias} must not fire beside ${canonical}`);
  }
});

test('one HubSpot tracking tag is ONE Marketing Automation row, never a CRM row', () => {
  for (const src of [
    'https://js.hs-analytics.net/analytics/1700000000000/123.js',
    'https://js.hs-scripts.com/123.js',
    '//js.hsforms.net/forms/embed/v2.js',
  ]) {
    const names = detect(script(src));
    assert.ok(names.includes('HubSpot'), `HubSpot expected from ${src}; got ${names.join(', ')}`);
    assert.ok(!names.includes('HubSpot for Education'), `no CRM row from the tracking tag ${src}`);
  }
});

test('a first-party file named after HubSpot is not HubSpot for Education', () => {
  const names = detect(script('https://www.example.edu/js/hubspot-form-custom-logic.js'));
  assert.ok(!names.includes('HubSpot for Education'), names.join(', '));
});

test('HubSpot regional hublets are detected', () => {
  for (const src of [
    'https://js-na2.hs-scripts.com/123.js',
    'https://js-eu1.hs-analytics.net/analytics/1700000000000/123.js',
    '//js-na1.hsforms.net/forms/embed/v2.js',
  ]) {
    assert.ok(detect(script(src)).includes('HubSpot'), `HubSpot expected from ${src}`);
  }
  for (const head of [
    '<link rel="preload" href="https://js-na2.hs-scripts.com/123.js">',
  ]) {
    assert.ok(detect(head).includes('HubSpot'), `HubSpot expected from ${head}`);
  }
});

test('HubSpot rules do not fire on a lookalike host', () => {
  const names = detect(script('https://cdn.example.edu/js.hs-scripts.com.backup.js'));
  assert.ok(!names.includes('HubSpot'), names.join(', '));
});

test('WP Accessibility with skip-link fixes only (no toolbar) is not detected', () => {
  const names = detect(
    '<link rel="stylesheet" id="wpa-style-css" href="https://www.example.edu/wp-content/plugins/wp-accessibility/css/wpa-style.css?ver=2.4.4">'
    + script('https://www.example.edu/wp-content/plugins/wp-accessibility/js/wp-accessibility.min.js?ver=2.4.4'),
  );
  assert.ok(!names.includes('WP Accessibility'), names.join(', '));
});

test('WP Accessibility with its toolbar is detected', () => {
  for (const head of [
    script('https://www.example.edu/wp-content/plugins/wp-accessibility/js/wpa-toolbar.min.js?ver=2.4.4'),
    '<link rel="stylesheet" href="https://www.example.edu/wp-content/plugins/wp-accessibility/toolbar/fonts/css/a11y-toolbar.css?ver=2.4.4">',
    '<link rel="stylesheet" href="https://www.example.edu/wp-content/plugins/wp-accessibility/toolbar/css/a11y.css?ver=2.4.4">',
    script('https://www.example.edu/wp-content/cache/min/1/wp-content/plugins/wp-accessibility/js/render-blocking-dbc2b85fe4dc8140c67b48cf72f4cb02.wpa-toolbar.min.js'),
  ]) {
    const names = detect(head);
    assert.ok(names.includes('WP Accessibility'), `expected from ${head}; got ${names.join(', ')}`);
  }
});
