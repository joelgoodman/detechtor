// tests/registrable-domain.test.js — the registrable-domain helper behind matches[].firstParty / vendorHost.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { registrableDomain, hostOf, hostOnDomain } = require('../src/registrable-domain.js');

test('two labels by default, three under a known public second level', () => {
  assert.strictEqual(registrableDomain('www.huntington.edu'), 'huntington.edu');
  assert.strictEqual(registrableDomain('js.hs-scripts.com'), 'hs-scripts.com');
  assert.strictEqual(registrableDomain('www.kent.ac.uk'), 'kent.ac.uk');
  assert.strictEqual(registrableDomain('cdn.kent.ac.uk'), 'kent.ac.uk');
  assert.strictEqual(registrableDomain('www.monash.edu.au'), 'monash.edu.au');
  assert.strictEqual(registrableDomain('www.auckland.ac.nz'), 'auckland.ac.nz');
  assert.strictEqual(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  assert.strictEqual(registrableDomain('hijack.wearesmile.com'), 'wearesmile.com');
});

test('case, trailing dot and port are spelling; IPs and single labels stay whole; junk is null', () => {
  assert.strictEqual(registrableDomain('WWW.Example.EDU.'), 'example.edu');
  assert.strictEqual(registrableDomain('cdn.example.com:8443'), 'example.com');
  assert.strictEqual(registrableDomain('10.0.0.12'), '10.0.0.12');
  assert.strictEqual(registrableDomain('localhost'), 'localhost');
  assert.strictEqual(registrableDomain(''), null);
  assert.strictEqual(registrableDomain(null), null);
});

test('hostOf reads absolute and protocol-relative URLs only', () => {
  assert.strictEqual(hostOf('https://User@CDN.Example.com:443/a.js'), 'cdn.example.com');
  assert.strictEqual(hostOf('//js.hs-scripts.com/1.js'), 'js.hs-scripts.com');
  assert.strictEqual(hostOf('/wp-content/x.js'), null);
  assert.strictEqual(hostOf('data:text/javascript,1'), null);
});

test('hostOnDomain is equality or a label-boundary suffix, never a substring', () => {
  assert.ok(hostOnDomain('js.hs-scripts.com', 'hs-scripts.com'));
  assert.ok(hostOnDomain('hs-scripts.com', 'hs-scripts.com'));
  assert.ok(!hostOnDomain('evilhs-scripts.com', 'hs-scripts.com'));
  assert.ok(!hostOnDomain('www.ghostplugins.dev', 'ghost.org'));
});
