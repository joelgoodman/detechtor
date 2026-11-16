// tests/census-salesforce-script-hosts.test.js -- the Salesforce family: Salesforce (CRM, the generic org signal; formerly
// "Salesforce Education Cloud"), TargetX, EnrollmentRx and Salesforce Live Agent (Chatbot).
// 2026-10-26 blind audit: 29 rows rested on the bare script rule `force` ('workforce' in a Google Ads URL, 4149).
// 2026-11-16 review (findings 4, 5, 10): TargetX / EnrollmentRx org links were credited to a generic edition name, chat
// assets were counted as CRM, the Data Cloud beacon (a CDP) was counted as CRM, and vendor orgs were carved out by a
// hard-coded lookahead instead of being detected and flagged (patterns/shared-tenants.json). Every src / href below is
// verbatim from the cohort-143 archive unless marked synthetic.
const { test } = require('node:test');
const assert = require('node:assert');
const { engine, detectAll, score, FLOOR } = require('./helpers/census-page.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');

/** The Script rules the engine fires for `tech` on a page carrying only this script tag. */
const scriptRules = (tech, src) => {
  const evidence = evidenceFromHtml(`<script src="${src}"></script>`, engine.domPlan, {});
  const r = engine.evaluatePattern(tech, engine.patterns[tech], evidence);
  return (r.evidence || []).filter((rule) => rule.startsWith('Script:'));
};
/** The anchored (Script / DOM) rules the engine fires for `tech` on a page. */
const anchored = (tech, html) => {
  const evidence = evidenceFromHtml(html, engine.domPlan, {});
  const r = engine.evaluatePattern(tech, engine.patterns[tech], evidence);
  return (r.evidence || []).filter((rule) => /^(Script|DOM):/.test(rule));
};
/** Technologies the engine reports for a page, after excludes. */
const names = (html) => Object.keys(detectAll(html));

// ------------------------------------------------------------------------------------------- one name
test('one product, one name: "Salesforce Education Cloud" is gone and aliased to Salesforce', () => {
  assert.strictEqual(engine.patterns['Salesforce Education Cloud'], undefined);
  assert.ok(engine.patterns.Salesforce);
  assert.strictEqual(require('../patterns/technology-aliases.json').aliases['Salesforce Education Cloud'], 'Salesforce');
});

test('the old unbounded force.com rule is gone: no match inside another word or host', () => {
  const { html, scripts, dom } = engine.patterns.Salesforce;
  assert.doesNotMatch(JSON.stringify({ html, scripts, dom }), /\(\?<!work\)force/);
  for (const src of [
    '/pages/workforce/workforceMain.js?v=11', // a first-party workforce page script
    'https://lfccworkforce.com/js/app.js', // synthetic: a workforce host
    'https://www.salesforce.com.evil.example/x.js', // synthetic: salesforce.com as a label of another host
  ]) assert.deepStrictEqual(scriptRules('Salesforce', src), [], src);
});

// ------------------------------------------------------------------------------------------- CRM host evidence
test('an institution\'s own Salesforce org or a force.com host is CRM script evidence', () => {
  for (const src of [
    'https://letourneau--dev.sandbox.my.salesforce.com/lightning/lightning.out.delegate.js?v=1792847548011',
    'https://sgu.my.salesforce-sites.com/resource/countryjs',
    'https://smccmedev--smccmedev.lightning.force.com/lightning/lightning.out.js',
    '//b.static.lightning.force.com/usa1224.sfdc-x2ia9m/auraFW/javascript/x/aura_prod.js',
  ]) assert.ok(scriptRules('Salesforce', src).length > 0, src);
});

test('the word force or lightning in another host\'s script URL is not Salesforce', () => {
  for (const src of [
    'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/726604686/?url=https%3A%2F%2Fwww.brightpoint.edu%2Ftraining-workforce%2Ftraining%2F', // 4149
    'https://wilberforce.edu/wp-content/themes/Divi/includes/builder-5/visual-builder/build/script-library-fitvids-functions.js',
    'https://monitor.fraudblocker.com/mp.js?sid=N4QxEBfdvBiidngTquY74',
    'https://theliveforce.app/v3/widget/script/ubbqfrzvanel^1139',
    '//cdn-akamai.mookie1.com/LB/LightningBolt.js',
    'https://ruidoso.enmu.edu/wp-content/themes/lightning/_g2/library/bootstrap-4/js/bootstrap.min.js?ver=4.5.0',
  ]) assert.deepStrictEqual(scriptRules('Salesforce', src), [], src);
});

test('a script on the institution\'s own host that merely names Salesforce is not host evidence', () => {
  for (const src of [
    'https://www.parker.edu/wp-content/plugins/parker-salesforce-integration/classes/shortcodes/assets/application-shortcode/app.js',
    '/_resources/platforms/salesforce/chatbot/chatbot.js?1.0.1',
    'https://formulate.geonetric.com/Scripts/require/integrations/salesforce.js',
  ]) assert.deepStrictEqual(scriptRules('Salesforce', src), [], src);
});

test('the Data Cloud web SDK beacon is a CDP, not CRM evidence', () => {
  assert.deepStrictEqual(scriptRules('Salesforce',
    'https://cdn.c360a.salesforce.com/beacon/c360a/12721e2f-e322-42b0-aa17-49a056355bdf/scripts/c360a.min.js'), []);
});

// ------------------------------------------------------------------------------------------- chat is Chatbot only
test('chat assets are Salesforce Live Agent evidence and never CRM evidence', () => {
  for (const src of [
    'https://distance-mn.my.site.com/ESWMinnesotaStateInfoHu1750082607874/assets/js/bootstrap.min.js', // 625 (Minnesota State's shared org)
    'https://naturalhealth.my.site.com/ESWAgentforceAdmissiosA1783450903939/assets/js/bootstrap.min.js',
    'https://service.force.com/embeddedservice/5.0/esw.min.js',
    'https://hull.my.salesforce.com/embeddedservice/menu/fab.min.js', // 228
    'https://hull.my.salesforce-scrt.com/embeddedservice/v1/embeddedServiceMenu.jsonp?Settings.prefix=EmbeddedService',
    'https://c.la1-c1-ph2.salesforceliveagent.com/content/g/js/44.0/deployment.js?ver=1.0.0',
  ]) {
    assert.deepStrictEqual(scriptRules('Salesforce', src), [], `CRM: ${src}`);
    assert.ok(scriptRules('Salesforce Live Agent', src).length > 0, `Chatbot: ${src}`);
  }
  // The ESW inert helper is part of the same deployment: not CRM either.
  assert.deepStrictEqual(scriptRules('Salesforce',
    'https://distance-mn.my.site.com/ESWMinnesotaStateInfoHu1750082607874/assets/js/inert.min.js'), []);
});

test('an Embedded Messaging bootstrap page yields Live Agent and no CRM row', () => {
  const html = '<script onload="initEmbeddedMessaging()" type="text/javascript" src="https://distance-mn.my.site.com/ESWMinnesotaStateInfoHu1750082607874/assets/js/bootstrap.min.js"></script>'
    + '<script id="inert-script" type="text/javascript" src="https://distance-mn.my.site.com/ESWMinnesotaStateInfoHu1750082607874/assets/js/inert.min.js"></script>';
  assert.ok(names(html).includes('Salesforce Live Agent'));
  assert.deepStrictEqual(anchored('Salesforce', html), []);
});

test('the bare embeddedservice / esw.min.js words are no longer Live Agent evidence on their own', () => {
  for (const src of [
    '/wp-content/plugins/embeddedservice-helper/esw.min.js', // synthetic: a first-party file named like the loader
    'https://cdn.example.com/embeddedservice.js', // synthetic
  ]) assert.deepStrictEqual(scriptRules('Salesforce Live Agent', src), [], src);
  assert.ok(scriptRules('Salesforce Live Agent', 'https://cdn.example.com/embeddedservice/5.0/esw.min.js').length > 0,
    'the versioned loader path stays evidence wherever it is served from');
});

// ------------------------------------------------------------------------------------------- vendor tenants
test('vendor-operated orgs are DETECTED (and flagged later by the shared-tenants registry), not carved out', () => {
  // UniQuest's Embedded Service menu: the only Salesforce script on 457, 494, 550 (and uniquest-global on 1380).
  assert.ok(scriptRules('Salesforce Live Agent', 'https://uniquest.my.salesforce.com/embeddedservice/menu/fab.min.js').length > 0);
  assert.ok(scriptRules('Salesforce Live Agent', 'https://uniquest-global.my.salesforce-scrt.com/embeddedservice/v1/embeddedServiceMenu.jsonp').length > 0);
  // Athena's org (593 UWE Bristol; 3387, 3479 Waikato) and its channel menu.
  assert.ok(scriptRules('Salesforce Live Agent', 'https://athena-aus.my.salesforce.com/embeddedservice/menu/fab.min.js').length > 0);
  assert.ok(scriptRules('Salesforce Live Agent', 'https://athena-gbr.my.salesforce.com/embeddedservice/menu/1678932281/channelMenu.min.js').length > 0);
  // These are chat assets, so they are not CRM evidence whoever operates them.
  assert.deepStrictEqual(scriptRules('Salesforce', 'https://uniquest.my.salesforce.com/embeddedservice/menu/fab.min.js'), []);
  assert.deepStrictEqual(scriptRules('Salesforce', 'https://athena-aus.my.salesforce.com/embeddedservice/5.0/utils/common.min.js'), []);
  // A non-chat page on a vendor org is CRM evidence; the registry, not the regex, says whose.
  assert.ok(scriptRules('Salesforce', 'https://uniquest-global.my.salesforce-sites.com/resource/app.js').length > 0); // synthetic path
  // SpanTran's credential-evaluation application (128): a link to SpanTran's own org.
  const spantran = '<p><a class="ctaLink" href="https://spanside.my.salesforce-sites.com/SpantranApplication?Id=3a82283d-e4bd-4ded-a666-3811a31bdea5"><span>Access the TEC Application - UDC</span></a></p>';
  assert.ok(anchored('Salesforce', spantran).length > 0);
});

// ------------------------------------------------------------------------------------------- TargetX / EnrollmentRx
test('TargetX: an org link carrying the TargetX namespace is TargetX, and excludes the generic Salesforce row', () => {
  const links = [
    '<a id="t8MS" href="https://cranbrookacademyofart.my.salesforce-sites.com/inquiry/TargetX_Base__InquiryForm#?formId=a0Bam00000D9GXVEA3&amp;formType=general&amp;txf1=Web%20Form%20-%20Fiber">Inquire</a>', // 1035
    '<a href="https://wm-recruitment.my.site.com/TX_SiteLogin?startURL=%2FTargetX_Portal__PB">Portal</a>',
    '<a href="https://tnwesleyan.secure.force.com/Inquiry/TargetX_Base__InquiryForm#?formId=a1p1K000006Sm0hQAC">Request info</a>',
    '<a href="https://applytwu.force.com/apply/TX_SiteLogin?startURL=%2Fapply%2FTargetX_Portal__PB">Apply</a>',
  ];
  for (const html of links) {
    assert.ok(anchored('TargetX', html).some((r) => r.startsWith('DOM:')), html);
    assert.ok(score('TargetX', html) >= FLOOR, html);
    const found = names(html);
    assert.ok(found.includes('TargetX'), html);
    assert.ok(!found.includes('Salesforce'), `excluded on the page: ${html}`);
  }
  // The dead script rule (the html rule copied) is gone.
  assert.strictEqual(engine.patterns.TargetX.scripts, undefined);
});

test('TargetX: the namespace word in prose or on a non-Salesforce host is not anchored TargetX evidence', () => {
  assert.deepStrictEqual(anchored('TargetX', '<a href="https://www.example.edu/TargetX_Base__InquiryForm">x</a>'), []); // synthetic
  assert.deepStrictEqual(anchored('TargetX', '<a href="https://x.my.salesforce-sites.com/inquiry/form">x</a>'), []); // synthetic
  assert.deepStrictEqual(anchored('TargetX', '<p>We moved off TargetX_Base__InquiryForm last year.</p>'), []); // synthetic
});

test('EnrollmentRx: an org link carrying erx_forms__ is EnrollmentRx, and excludes the generic Salesforce row', () => {
  for (const html of [
    '<a style="color: #d6d6d6;" href="https://smccd.my.salesforce-sites.com/SMCCDRFI/apex/ERx_Forms__PageMaker?pageId=RFI_Ca%C3%B1ada_College&amp;Brand=Canada">RFI</a>', // 801
    '<a class="elementor-button elementor-button-link elementor-size-sm" href="https://centralwyoming.my.salesforce-sites.com/inquiry/apex/ERx_Forms__PageMaker?pageId=Inquiry%20Form">Inquire</a>',
  ]) {
    assert.ok(anchored('EnrollmentRx', html).some((r) => r.startsWith('DOM:')), html);
    const found = names(html);
    assert.ok(found.includes('EnrollmentRx'), html);
    assert.ok(!found.includes('Salesforce'), html);
  }
});

test('an org link with no package namespace stays the generic Salesforce signal', () => {
  const html = '<a href="https://bellevuecollege.my.salesforce-sites.com/events#/list?type=Campus%20Tour">Tour</a>'; // 680
  const found = names(html);
  assert.ok(found.includes('Salesforce'));
  assert.ok(!found.includes('TargetX') && !found.includes('EnrollmentRx'));
});
