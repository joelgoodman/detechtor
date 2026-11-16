// tests/vendor-hosts.test.js — `_hosts` (in curated files and patterns/vendor-hosts.json) is well formed and
// names technologies that exist, and the loader applies the table.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const DeTECHtor = require('../src/detechtor.js');
const TABLE = require('../patterns/vendor-hosts.json');
const { applyVendorHosts, validateVendorHosts, isValidHostEntry } = require('../src/vendor-hosts.js');
const { vendorDomains } = require('../src/rule-matches.js');

const log = console.log;
console.log = () => {};
const engine = new DeTECHtor();
console.log = log;

test('every vendor-hosts.json entry names a loaded technology, and every _hosts entry is a host name', () => {
  assert.deepStrictEqual(validateVendorHosts(engine.patterns, TABLE.hosts), []);
});

test('vendor-hosts.json only covers technologies the curated files cannot (generated-only definitions)', () => {
  for (const name of Object.keys(TABLE.hosts)) {
    assert.ok(engine.patterns[name]._generated, `${name} is curated: put _hosts in its pattern file`);
  }
});

test('the loader unions the table into _hosts and vendorDomains reads website + _hosts', () => {
  const out = applyVendorHosts({ X: { website: 'https://www.x.com', _hosts: ['a.net'] } }, { X: ['b.net', 'a.net'] });
  assert.deepStrictEqual(out.X._hosts, ['a.net', 'b.net']);
  assert.deepStrictEqual(vendorDomains(out.X), ['x.com', 'a.net', 'b.net']);
  for (const name of Object.keys(TABLE.hosts)) {
    for (const h of TABLE.hosts[name]) assert.ok(engine.patterns[name]._hosts.includes(h), `${name} lacks ${h}`);
  }
});

test('host entries are bare host names', () => {
  assert.ok(isValidHostEntry('hs-scripts.com'));
  assert.ok(isValidHostEntry('dl.episerver.net'));
  assert.ok(!isValidHostEntry('https://hs-scripts.com'));
  assert.ok(!isValidHostEntry('*.hs-scripts.com'));
  assert.ok(!isValidHostEntry('com'));
  assert.ok(!isValidHostEntry('HubSpot.com'));
});
