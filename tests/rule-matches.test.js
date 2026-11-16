// tests/rule-matches.test.js — artifact schema 2: every fired rule reports what it matched.
//
// The loader used to grade a row "anchored" from the channel a rule lives in. These pin the engine half
// of the fix: `matches[]` carries the matched text, where it sits in the URL, and whose host it is.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const DeTECHtor = require('../src/detechtor.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');
const { MAX_PER_RULE, MAX_PER_DETECTION, selectorSubjects, isLinkRule } = require('../src/rule-matches.js');

const log = console.log;
console.log = () => {};
const REAL = new DeTECHtor();
console.log = log;

function engineWith(patterns) {
  const e = Object.create(DeTECHtor.prototype);
  e.patterns = patterns;
  e.domPlan = e.buildDomPlan();
  return e;
}
const detect = (engine, html, pageUrl) => engine.matchPatterns(evidenceFromHtml(html, engine.domPlan, { pageUrl }));
const find = (list, name) => list.find((t) => t.name === name);

test('a `force` rule on https://x.edu/js/workforce.js matches in the path, off the vendor host', () => {
  const e = engineWith({ SF: { website: 'https://www.salesforce.com', scripts: ['force'], categories: ['CRM'] } });
  const [t] = detect(e, '<script src="https://x.edu/js/workforce.js"></script>', 'https://www.x.edu/');
  assert.deepStrictEqual(t.evidence, ['Script: force']);
  assert.strictEqual(t.matches.length, 1);
  const m = t.matches[0];
  assert.deepStrictEqual(m, {
    rule: 'Script: force', channel: 'Script', matched: 'force', src: 'https://x.edu/js/workforce.js',
    host: 'x.edu', part: 'path', firstParty: true, vendorHost: false, link: false,
  });
});

test('Ghost on www.ghostplugins.dev is not Ghost\'s host', () => {
  const html = '<script src="https://www.ghostplugins.dev/static/ghost-embed.js"></script>';
  const t = find(detect(REAL, html, 'https://www.example.edu/'), 'Ghost');
  assert.ok(t, 'the Ghost script rule still fires (rules are unchanged)');
  const m = t.matches.find((x) => x.channel === 'Script');
  assert.strictEqual(m.host, 'www.ghostplugins.dev');
  assert.strictEqual(m.vendorHost, false);
  assert.strictEqual(m.firstParty, false);
});

test('a WordPress wp-content match on the page\'s own host is first-party; off-site WordPress is not', () => {
  const own = find(detect(REAL, '<script src="/wp-content/themes/x/app.js"></script>', 'https://www.example.edu/'), 'WordPress');
  const m = own.matches.find((x) => x.channel === 'Script');
  assert.strictEqual(m.host, 'www.example.edu');
  assert.strictEqual(m.part, 'path');
  assert.strictEqual(m.firstParty, true);
  assert.strictEqual(m.vendorHost, false);

  const cdn = find(detect(REAL, '<script src="https://cdn.kent.ac.uk/wp-content/a.js"></script>', 'https://www.kent.ac.uk/'), 'WordPress');
  assert.strictEqual(cdn.matches.find((x) => x.channel === 'Script').firstParty, true, 'same registrable domain under ac.uk');

  const other = find(detect(REAL, '<script src="https://hijack.wearesmile.com/kent/wp-content/a.js"></script>', 'https://www.kent.ac.uk/'), 'WordPress');
  assert.strictEqual(other.matches.find((x) => x.channel === 'Script').firstParty, false);
});

test('an a[href*=\'.my.salesforce-sites.com\'] DOM match is a link on the vendor host', () => {
  const e = engineWith({
    SF: { website: 'https://www.salesforce.com', _hosts: ['salesforce-sites.com'], categories: ['CRM'],
      dom: ["a[href*='.my.salesforce-sites.com']"] },
  });
  const [t] = detect(e, '<a href="https://uncp.my.salesforce-sites.com/apply">Apply</a>', 'https://www.example.edu/');
  assert.deepStrictEqual(t.evidence, ["DOM: a[href*='.my.salesforce-sites.com']"]);
  assert.deepStrictEqual(t.matches[0], {
    rule: "DOM: a[href*='.my.salesforce-sites.com']", channel: 'DOM', matched: '.my.salesforce-sites.com',
    src: 'https://uncp.my.salesforce-sites.com/apply', host: 'uncp.my.salesforce-sites.com', part: 'host',
    firstParty: false, vendorHost: true, link: true,
  });

  // The shipped definition declares the same vendor host.
  const real = find(detect(REAL, '<a href="https://uncp.my.salesforce-sites.com/apply">Apply</a>', 'https://www.example.edu/'),
    'Salesforce Education Cloud');
  assert.ok(real, 'Salesforce Education Cloud fires on the tenant link');
  const link = real.matches.find((x) => x.channel === 'DOM');
  assert.strictEqual(link.link, true);
  assert.strictEqual(link.vendorHost, true);
});

test('Meta, HTML, attribute-DOM, text-DOM and JS channels each report their own shape', () => {
  const e = engineWith({
    T: {
      website: 'https://vendor.example', categories: ['CMS'],
      meta: { generator: 'VendorCMS' },
      html: ['vendor-marker'],
      dom: { 'div.v': { attributes: { 'data-src': 'cdn\\.vendor\\.example' } }, 'span.p': 'Powered by Vendor' },
      js: { VendorGlobal: '' },
    },
  });
  const html = '<meta name="generator" content="VendorCMS 5"><p>vendor-marker</p>'
    + '<div class="v" data-src="https://cdn.vendor.example/a.png"></div><span class="p">Powered by Vendor</span>';
  const ev = evidenceFromHtml(html, e.domPlan, { pageUrl: 'https://www.example.edu/', jsGlobals: ['VendorGlobal'] });
  const [t] = e.matchPatterns(ev);
  const by = Object.fromEntries(t.matches.map((m) => [m.rule, m]));
  assert.deepStrictEqual(t.matches.map((m) => m.rule), t.evidence, 'one match per fired rule, in rule order');
  assert.strictEqual(by['Meta: generator=VendorCMS'].matched, 'VendorCMS');
  assert.strictEqual(by['Meta: generator=VendorCMS'].src, 'VendorCMS 5');
  assert.strictEqual(by['Meta: generator=VendorCMS'].host, null);
  assert.strictEqual(by['HTML: vendor-marker'].src, null);
  const attr = by["DOM: div.v[attributes.data-src]"];
  assert.strictEqual(attr.vendorHost, true);
  assert.strictEqual(attr.part, 'host');
  assert.strictEqual(attr.link, false);
  assert.strictEqual(by['DOM: span.p[text]'].matched, 'Powered by Vendor');
  assert.strictEqual(by['DOM: span.p[text]'].host, null);
  assert.strictEqual(by['JS: VendorGlobal'].matched, 'VendorGlobal');
});

test('caps: 3 per rule, 20 per detection, deterministic; `evidence` is unchanged', () => {
  const scripts = Array.from({ length: 30 }, (_, i) => `<script src="https://cdn.v.example/r${i}/a.js"></script>`).join('');
  const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, `r${i}/`]));
  const e = engineWith({ V: { website: 'https://v.example', categories: ['CMS'], scripts: ['a\\.js', ...Object.values(many)] } });
  const a = detect(e, scripts, 'https://www.example.edu/')[0];
  const b = detect(e, scripts, 'https://www.example.edu/')[0];
  assert.deepStrictEqual(a.matches, b.matches);
  assert.strictEqual(a.matches.filter((m) => m.rule === 'Script: a\\.js').length, MAX_PER_RULE);
  assert.ok(a.matches.length <= MAX_PER_DETECTION);
  assert.strictEqual(a.evidence.length, 11);
  assert.deepStrictEqual(a.matches.slice(0, 3).map((m) => m.src),
    ['https://cdn.v.example/r0/a.js', 'https://cdn.v.example/r1/a.js', 'https://cdn.v.example/r2/a.js']);
});

test('without a page URL, relative srcs have no host and firstParty is null', () => {
  const e = engineWith({ W: { website: 'https://wordpress.org', categories: ['CMS'], scripts: ['wp-content'] } });
  const [t] = e.matchPatterns(evidenceFromHtml('<script src="/wp-content/a.js"></script>', e.domPlan));
  assert.strictEqual(t.matches[0].host, null);
  assert.strictEqual(t.matches[0].firstParty, null);
  assert.strictEqual(t.matches[0].vendorHost, null);
});

test('query and fragment positions; protocol-relative hosts', () => {
  const e = engineWith({ G: { website: 'https://maps.example', categories: ['CRM'], scripts: ['element451', 'frag'] } });
  const [t] = detect(e, '<script src="//maps.googleapis.com/js?callback=element451Init#frag"></script>', 'https://www.example.edu/');
  const by = Object.fromEntries(t.matches.map((m) => [m.rule, m]));
  assert.strictEqual(by['Script: element451'].part, 'query');
  assert.strictEqual(by['Script: element451'].host, 'maps.googleapis.com');
  assert.strictEqual(by['Script: frag'].part, 'fragment');
});

test('link detection reads the selector subject', () => {
  assert.ok(isLinkRule({ selector: "a[href*='x.com']", kind: 'exists' }));
  assert.ok(isLinkRule({ selector: "div.footer area[href^='https://x']", kind: 'exists' }));
  assert.ok(isLinkRule({ selector: "form[action*='.list-manage.com/subscribe']", kind: 'exists' }));
  assert.ok(isLinkRule({ selector: 'a.apply', kind: 'attributes', name: 'href' }));
  assert.ok(!isLinkRule({ selector: "a[href*='x.com'] img", kind: 'exists' }));
  assert.ok(!isLinkRule({ selector: "script[src*='x.com']", kind: 'exists' }));
  assert.deepStrictEqual(selectorSubjects("a[href *= 'a, b'] , form[action$=\"/go\"]").map((s) => s.tag), ['a', 'form']);
});

test('the browser path merges matches across pages without exceeding the caps', () => {
  const e = engineWith({ V: { website: 'https://v.example', categories: ['CMS'], scripts: ['v\\.js'] } });
  const p1 = detect(e, '<script src="https://cdn.v.example/v.js"></script>', 'https://www.example.edu/');
  const p2 = detect(e, '<script src="https://cdn.v.example/v.js"></script><script src="/v.js"></script>', 'https://www.example.edu/');
  const [merged] = e.mergeTechnologies([...p1, ...p2]);
  assert.strictEqual(merged.matches.length, 2, 'duplicates dropped, new match kept');
});
