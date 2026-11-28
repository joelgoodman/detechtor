// tests/census-bare-token-script-rules.test.js -- script rules whose token was not the vendor's own (a word, or a
// vendor name with no host) and matched other people's files; and the anchored host rules added for recall.
// 2026-11-15 detection review, findings 1, 10, 12 and 14. Under the loader's one-CMS rule a false second CMS also
// cancels the true one, so each negative below cost a real row (985, 1710, 1232, 1876, 356, 2538).
// Every src / href below is verbatim from the cohort-143 archive (the institution id follows it) unless marked
// synthetic. Each fix is pinned both ways: the string that matched wrongly no longer fires, the real one still does.
const { test } = require('node:test');
const assert = require('node:assert');
const { engine } = require('./helpers/census-page.js');
const { evidenceFromHtml } = require('../src/evidence-from-html.js');

/** The Script rules the engine fires for `tech` on a page carrying only this script tag. */
const scriptRules = (tech, src) => {
  const evidence = evidenceFromHtml(`<script src="${src}"></script>`, engine.domPlan, {});
  const r = engine.evaluatePattern(tech, engine.patterns[tech], evidence);
  return (r.evidence || []).filter((rule) => rule.startsWith('Script:'));
};
/** The DOM rules the engine fires for `tech` on a page. */
const domRules = (tech, html) => {
  const evidence = evidenceFromHtml(html, engine.domPlan, {});
  const r = engine.evaluatePattern(tech, engine.patterns[tech], evidence);
  return (r.evidence || []).filter((rule) => rule.startsWith('DOM:'));
};
/** The JS rules the engine fires for `tech` given these probed globals. */
const jsRules = (tech, globals) => {
  const evidence = evidenceFromHtml('<html></html>', engine.domPlan, { jsGlobals: globals });
  const r = engine.evaluatePattern(tech, engine.patterns[tech], evidence);
  return (r.evidence || []).filter((rule) => rule.startsWith('JS:'));
};
const fires = (tech, src) => assert.ok(scriptRules(tech, src).length > 0, `${tech} should fire on ${src}`);
const silent = (tech, src) => assert.deepStrictEqual(scriptRules(tech, src), [], `${tech} must not fire on ${src}`);

test('Elasticsearch: a slider plugin or the APM agent is not search', () => {
  for (const src of [
    'https://www.example.edu/wp-content/themes/Avada/includes/lib/assets/min/js/library/jquery.elasticslider.js', // synthetic path, the Avada file name seen on 8 institutions
    'https://cdn.jsdelivr.net/npm/@elastic/apm-rum@5.16.0/dist/bundles/elastic-apm-rum.umd.min.js', // synthetic version, the RUM agent seen on 2
  ]) silent('Elasticsearch', src);
  for (const src of [
    'https://www.example.edu/wp-content/plugins/elasticpress/dist/js/autosuggest-script.js', // synthetic
    'https://cdn.jsdelivr.net/npm/@elastic/search-ui@1.21.0/lib/index.js', // synthetic
  ]) fires('Elasticsearch', src);
  assert.deepStrictEqual(jsRules('Elasticsearch', ['elastic']), []);
});

test('Ghost: a Squarespace plugin vendor or a theme file named ghosts is not Ghost', () => {
  for (const src of [
    'https://www.ghostplugins.dev/assets/helpers/swiper/swiper.js', // 102, 980 (Squarespace)
    'https://www.indianatech.edu/wp-content/themes/beckyb/partials/embed/ghosts/lib/ghosts.js?ver=4', // 985 (WordPress)
  ]) silent('Ghost', src);
  assert.deepStrictEqual(jsRules('Ghost', ['ghost']), []);
  const meta = (content) => {
    const evidence = evidenceFromHtml(`<meta name="generator" content="${content}">`, engine.domPlan, {});
    return engine.evaluatePattern('Ghost', engine.patterns.Ghost, evidence).evidence || [];
  };
  assert.ok(meta('Ghost 5.82').some((r) => r.startsWith('Meta:')), 'the real generator still fires');
  assert.ok(!meta('GhostKit Page Builder').some((r) => r.startsWith('Meta:')), 'synthetic: a generator merely containing Ghost');
});

test('Modern Campus CMS: other Modern Campus products and first-party file names are not the CMS', () => {
  for (const src of [
    'https://widget.calendar.moderncampus.net/app.js', // 704
    'https://widget.pathways.moderncampus.net/public.loader.js', // 722
    'https://widget.forms.moderncampus.net/app.js', // 1508
    'https://support.moderncampus.com/_resources/product-resources/cms/pathways-test-script.js', // 1232 (WordPress)
    'https://prodtemplates.kccd.edu/_resources/js/interface/table-omni.js', // 760, 1169, 2717
  ]) silent('Modern Campus CMS', src);
  for (const src of [
    'https://matomo.personalization.moderncampus.net/matomo.js', // 719 and 52 more
    'https://cdn.omniupdate.com/ou-alerts/v1/ou-alerts.js', // synthetic path on the CMS's asset CDN
    '/_resources/js/omnicms-gadgets.js', // synthetic file name on the CMS's _resources path
  ]) fires('Modern Campus CMS', src);
  assert.ok(domRules('Modern Campus CMS', '<a href="https://a.cms.omniupdate.com/11/?skin=oucampus#ouvalidate/x/y.pcf">©</a>').length > 0);
  assert.ok(domRules('Modern Campus CMS', '<a href="https://a.cms.omniupdate.com/10/#oucampus/x">©</a>').length > 0, 'synthetic: any DirectEdit path');
});

test('Optimizely Content Management: Content Recommendations (idio) is another product', () => {
  silent('Optimizely Content Management', '//s.APAC01.idio.episerver.net/ia.js'); // 594
  silent('Optimizely Content Management', '//s.USEA01.idio.episerver.net/ip.js'); // 1736
  fires('Optimizely Content Management', 'https://dl.episerver.net/13.6.1/epi-util/find.js'); // 776, 2450
});

test('Finalsite: the AI chatbot is not the CMS; the site\'s own theme assets and resources CDN are', () => {
  silent('Finalsite', 'https://ask.ai.finalsite.com/chatbot/static/widget.js'); // 1876 (WordPress) and 9 more
  for (const src of [
    'https://myptecorg.finalsite.com/theme-assets/clients/myptecorg/themes/2/theme-2-westborough-modular-theme-pinellas-technical-college.js?t=1785311026', // 5054
    'https://eastmsedu5.finalsite.com/theme-assets/clients/eastmsedu5/themes/4/theme-4-windsor.js?t=1785830413', // 3018
    'https://resources.finalsite.net/scripts/fs.min.js', // synthetic path on Finalsite's resources CDN
  ]) fires('Finalsite', src);
  assert.ok(domRules('Finalsite', '<body class="fsLiveMode fsSiteHome"></body>').length > 0);
  assert.ok(domRules('Finalsite', '<link rel="stylesheet" href="https://resources.finalsite.net/images/v1/x.css">').length > 0); // synthetic path
  assert.deepStrictEqual(domRules('Finalsite', '<body class="home page-template"></body>'), []);
});

test('Sitecore: a query string that names Sitecore is not Sitecore; its modules path, Coveo connector and file names are', () => {
  silent('Sitecore', 'https://events.uta.edu/widget/view?schools=arlington&days=90&num=4&tags=Homepage&experience=inperson&container=localist-widget-27529658&template=list-horizontal-sitecore'); // 1665
  for (const src of [
    '/sitecore%20modules/Web/ExperienceForms/scripts/jquery.validate.min.js', // 213
    'https://static.cloud.coveo.com/coveoforsitecore/ui/v0.64.7/js/CoveoForSitecoreConfigureSearchHub.min.js', // 3165
    '/assets/js/compiled/sitecore.min.js', // 318
    '/assets/dist/js/sitecoreForms.min.js?v=20260120091048', // 5769
  ]) fires('Sitecore', src);
});

test('Ingeniux CMS: igx- inside a Drupal aggregate hash is not Ingeniux; an igx-*.js file is', () => {
  silent('Ingeniux CMS', '/sites/default/files/js/js_6AKaYJL7fdYXwl_GTqQ6ffGHeWCgIgX-OBiXHxHatUs.js?scope=header&delta=1&language=en&theme=fuqua'); // 356 (Drupal)
  for (const src of [
    '/Content/js/igx-dev.js', // 720, 1456, 2559
    '/dist/ui/js/igx-js.js', // 1079
    '/Content/js/jquery-igx-dev.js', // 3009
    'Content/assets/js/igx-dev.js?v=3.1', // 3295
  ]) fires('Ingeniux CMS', src);
});

test('Drupal: any file under sites/default/files is not Drupal; its JS aggregate and core scripts are', () => {
  for (const src of [
    '/sites/default/files/ou-alerts/alerts.js', // synthetic: another CMS's file under that path
    '/sites/default/files/2024-08/banner.js', // synthetic: an uploaded file
  ]) silent('Drupal', src);
  for (const src of [
    '/sites/default/files/js/js_6AKaYJL7fdYXwl_GTqQ6ffGHeWCgIgX-OBiXHxHatUs.js?scope=header&delta=1&language=en&theme=fuqua', // 356
    '/sites/default/files/assets/js/js_CClv37pI4k2hWHrHGiInO7MeuHE_bRm991I6anuBa6U.js?scope=header&delta=0&language=fr&theme=ulaval', // 317
    '/core/misc/drupal.js?v=11.4.7', // 296
    'https://live-csu-northridge.pantheonsite.io/core/misc/drupal.js?v=10.6.17', // 896
    '/core/misc/drupalSettingsLoader.js?v=10.6.20', // synthetic version
  ]) fires('Drupal', src);
});

test('Azure Cognitive Search: Sitecore Search on an Azure CDN is not Azure search', () => {
  silent('Azure Cognitive Search', 'https://mc-34647c8d-0ad3-4e6c-832a-7092-cdn.azureedge.net/FrontEnd/Scripts/Body/iu.feature.sitecoresearch.min.js?rev=0865310830800f0f612d52299cae15007ae4b4bfaf7'); // 498
  fires('Azure Cognitive Search', 'https://cdn.jsdelivr.net/npm/@azure/search-documents@12.1.0/dist/index.js'); // synthetic
});

test('Squarespace: its own asset hosts are script evidence', () => {
  fires('Squarespace', 'https://assets.squarespace.com/universal/scripts-compressed/extract-css-runtime-6d6c6d4b6f2e3a1b-min.en-US.js'); // synthetic hash
  fires('Squarespace', '//static1.squarespace.com/static/vta/5c5a519771c10ba3470d8101/scripts/site-bundle.js'); // synthetic id
  silent('Squarespace', 'https://www.example.edu/js/squarespace-import.js'); // synthetic: a file merely named after it
});

test('TerminalFour: a stylesheet or image on the CMS host is DOM evidence', () => {
  assert.ok(domRules('TerminalFour', '<link rel="stylesheet" href="https://example.terminalfour.net/media/x/style.css">').length > 0); // synthetic tenant
  assert.ok(domRules('TerminalFour', '<img src="https://example.terminalfour.net/media/x/logo.png">').length > 0); // synthetic tenant
  assert.deepStrictEqual(domRules('TerminalFour', '<a href="https://www.terminalfour.com/">TerminalFour</a>'), []);
});

test('Mailchimp: reused embed markup is not Mailchimp; a form posting to list-manage.com is', () => {
  assert.deepStrictEqual(domRules('Mailchimp',
    '<form id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" action="https://Luzerne.elluciancrmrecruit.com/Apply/Account/ProspectInquiry" method="post"></form>'), []); // 3638
  assert.ok(domRules('Mailchimp',
    '<form action="https://example.us8.list-manage.com/subscribe/post?u=abc&amp;id=def" method="post"></form>').length > 0); // synthetic account
});

test('the four dead DOM rules are gone; the Pardot iframe is detected as Pardot', () => {
  const selectors = (tech) => (engine.patterns[tech]._domRules || []).map((r) => r.selector);
  assert.ok(!selectors('Salesforce Marketing Cloud Account Engagement').some((s) => s.includes('[scr*=')));
  assert.ok(!selectors('SimplyCast').some((s) => s.includes('[scr*=')));
  assert.ok(!selectors('Systeme.io').some((s) => s.startsWith('from[')));
  assert.ok(!selectors('AllClients').some((s) => s.startsWith('iframe[href*=')));
  assert.ok(domRules('Pardot', '<iframe src="https://go.pardot.com/l/123/2024-01-01/abc" width="100%"></iframe>').length > 0); // synthetic form
});
