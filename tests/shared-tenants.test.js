// tests/shared-tenants.test.js -- the vendor-operated tenant registry (patterns/shared-tenants.json) and its reader.
const { test } = require('node:test');
const assert = require('node:assert');
const { operatorForHosts, validateRegistry, REGISTRY } = require('../src/shared-tenants.js');
const { engine } = require('./helpers/census-page.js');

test('the shipped registry is valid: schema, dates, no duplicate hosts, known technologies', () => {
  const technologies = new Set(Object.keys(engine.patterns));
  assert.deepStrictEqual(validateRegistry(REGISTRY, { technologies }), []);
  for (const t of REGISTRY.tenants) {
    assert.strictEqual(t.decided, '2026-11-16', t.host);
    assert.strictEqual(t.decider, 'Joel', t.host);
  }
});

test('UniQuest, Athena and SpanTran orgs are vendor-operated', () => {
  assert.deepStrictEqual(operatorForHosts('Salesforce', ['uniquest.my.salesforce.com']),
    { operator: 'UniQuest', hosts: ['uniquest.my.salesforce.com'] }); // 457, 494, 550
  assert.deepStrictEqual(operatorForHosts('Salesforce Live Agent', ['UNIQUEST-GLOBAL.my.salesforce-scrt.com', 'uniquest-global.my.salesforce.com']),
    { operator: 'UniQuest', hosts: ['uniquest-global.my.salesforce-scrt.com', 'uniquest-global.my.salesforce.com'] }); // 1380
  assert.strictEqual(operatorForHosts('Salesforce Live Agent', ['athena-gbr.my.salesforce.com']).operator.startsWith('Athena'), true); // 593
  assert.strictEqual(operatorForHosts('Salesforce', ['athena-aus.my.site.com']).operator.startsWith('Athena'), true); // 3387, 3479
  assert.strictEqual(operatorForHosts('Salesforce', ['spanside.my.salesforce-sites.com']).operator, 'SpanTran'); // 128
});

test('one host the registry does not know means the institution may run it: null', () => {
  assert.strictEqual(operatorForHosts('Salesforce', ['uniquest.my.salesforce.com', 'leedstrinity.my.site.com']), null);
  assert.strictEqual(operatorForHosts('Salesforce', ['distance-mn.my.site.com']), null); // a system's shared org, not a vendor
  assert.strictEqual(operatorForHosts('Salesforce', []), null);
  assert.strictEqual(operatorForHosts('Salesforce', [null]), null);
  // exact entries do not cover a sibling or a subdomain
  assert.strictEqual(operatorForHosts('Salesforce', ['x.uniquest.my.salesforce.com']), null);
  assert.strictEqual(operatorForHosts('Salesforce', ['uniquestx.my.salesforce.com']), null);
});

test('technology lists and suffix entries are honoured', () => {
  const reg = { tenants: [
    { host: 'campaigns.example.org', match: 'suffix', operator: 'Agency', technologies: ['Mautic'], ruling: 'vendor_operated',
      reason: 'r', decided: '2026-11-16', decider: 'Joel' },
  ] };
  assert.deepStrictEqual(operatorForHosts('Mautic', ['go.campaigns.example.org', 'campaigns.example.org'], reg),
    { operator: 'Agency', hosts: ['campaigns.example.org', 'go.campaigns.example.org'] });
  assert.strictEqual(operatorForHosts('HubSpot', ['go.campaigns.example.org'], reg), null);
});

test('the validator rejects malformed entries', () => {
  const ok = { host: 'a.my.salesforce.com', match: 'exact', operator: 'V', technologies: '*', ruling: 'vendor_operated',
    reason: 'r', decided: '2026-11-16', decider: 'Joel' };
  assert.deepStrictEqual(validateRegistry({ tenants: [ok] }), []);
  const bad = (patch) => validateRegistry({ tenants: [{ ...ok, ...patch }] });
  assert.ok(bad({ host: 'A.my.salesforce.com' }).length);
  assert.ok(bad({ match: 'prefix' }).length);
  assert.ok(bad({ decided: '' }).length);
  assert.ok(bad({ decided: '16/11/2026' }).length);
  assert.ok(bad({ decider: undefined }).length);
  assert.ok(bad({ reason: ' ' }).length);
  assert.ok(bad({ ruling: 'ignore' }).length);
  assert.ok(bad({ technologies: [] }).length);
  assert.ok(bad({ extra: 1 }).length);
  assert.ok(validateRegistry({ tenants: [ok, { ...ok }] }).some((p) => /duplicate host/.test(p)));
  assert.ok(validateRegistry({ tenants: [ok, { ...ok, host: 'my.salesforce.com', match: 'suffix' }] })
    .some((p) => /suffix entry/.test(p)));
  assert.ok(validateRegistry({ tenants: [{ ...ok, technologies: ['Nope'] }] }, { technologies: new Set(['Salesforce']) }).length);
});

test('no Salesforce-family rule carves a tenant out with a hard-coded lookahead any more', () => {
  for (const name of ['Salesforce', 'TargetX', 'EnrollmentRx', 'Salesforce Live Agent']) {
    const { html, scripts, dom } = engine.patterns[name];
    assert.doesNotMatch(JSON.stringify({ html, scripts, dom }), /spanside|uniquest|athena/i, name);
  }
});
