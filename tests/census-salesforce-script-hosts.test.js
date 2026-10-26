// tests/census-salesforce-script-hosts.test.js -- Salesforce Education Cloud's script rules must name a Salesforce host.
// The 2026-10-26 blind audit of the cohort-143 ledger load found 29 rows whose only anchored evidence was the bare script
// rule `force`, which matched 'workforce' in a Google Ads URL (institution 4149). Every script src below is verbatim from
// the cohort-143 archive.
const { test } = require('node:test');
const assert = require('node:assert');
const { engine } = require('./helpers/census-page.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');

const TECH = 'Salesforce Education Cloud';
/** The Script rules the engine fires for a page carrying only this script tag. */
const scriptRules = (src) => {
  const evidence = evidenceFromHtml(`<script src="${src}"></script>`, engine.domPlan, {});
  const r = engine.evaluatePattern(TECH, engine.patterns[TECH], evidence);
  return (r.evidence || []).filter((rule) => rule.startsWith('Script:'));
};

test('an institution\'s own Salesforce org or a force.com host is script evidence', () => {
  for (const src of [
    'https://naturalhealth.my.site.com/ESWAgentforceAdmissiosA1783450903939/assets/js/bootstrap.min.js',
    'https://letourneau--dev.sandbox.my.salesforce.com/lightning/lightning.out.delegate.js?v=1792847548011',
    'https://sgu.my.salesforce-sites.com/resource/countryjs',
    'https://smccmedev--smccmedev.lightning.force.com/lightning/lightning.out.js',
    'https://service.force.com/embeddedservice/5.0/esw.min.js',
    '//b.static.lightning.force.com/usa1224.sfdc-x2ia9m/auraFW/javascript/x/aura_prod.js',
    'https://cdn.c360a.salesforce.com/beacon/c360a/12721e2f-e322-42b0-aa17-49a056355bdf/scripts/c360a.min.js',
    'https://c.la1-c1-ph2.salesforceliveagent.com/content/g/js/44.0/deployment.js?ver=1.0.0',
    'https://hull.my.salesforce-scrt.com/embeddedservice/v1/embeddedServiceMenu.jsonp?Settings.prefix=EmbeddedService',
  ]) assert.ok(scriptRules(src).length > 0, src);
});

test('the word force or lightning in another host\'s script URL is not Salesforce', () => {
  for (const src of [
    'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/726604686/?url=https%3A%2F%2Fwww.brightpoint.edu%2Ftraining-workforce%2Ftraining%2F', // 4149
    'https://wilberforce.edu/wp-content/themes/Divi/includes/builder-5/visual-builder/build/script-library-fitvids-functions.js',
    'https://monitor.fraudblocker.com/mp.js?sid=N4QxEBfdvBiidngTquY74',
    'https://theliveforce.app/v3/widget/script/ubbqfrzvanel^1139',
    '//cdn-akamai.mookie1.com/LB/LightningBolt.js',
    'https://ruidoso.enmu.edu/wp-content/themes/lightning/_g2/library/bootstrap-4/js/bootstrap.min.js?ver=4.5.0',
  ]) assert.deepStrictEqual(scriptRules(src), [], src);
});

test('a third-party recruiter\'s Salesforce org is not the institution\'s', () => {
  // UniQuest's embedded-service menu loads on 110 archived pages; it was the only Salesforce script on 494, 550 and 1380.
  assert.deepStrictEqual(scriptRules('https://uniquest.my.salesforce.com/embeddedservice/menu/fab.min.js'), []);
  assert.deepStrictEqual(scriptRules('https://uniquest-global.my.salesforce-scrt.com/embeddedservice/v1/embeddedServiceMenu.jsonp'), []);
});

test('a script on the institution\'s own host that merely names Salesforce is not host evidence', () => {
  for (const src of [
    'https://www.parker.edu/wp-content/plugins/parker-salesforce-integration/classes/shortcodes/assets/application-shortcode/app.js',
    '/_resources/platforms/salesforce/chatbot/chatbot.js?1.0.1',
    'https://formulate.geonetric.com/Scripts/require/integrations/salesforce.js',
  ]) assert.deepStrictEqual(scriptRules(src), [], src);
});
