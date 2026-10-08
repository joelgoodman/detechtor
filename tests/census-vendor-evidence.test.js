// tests/census-vendor-evidence.test.js -- curated technologies whose rules matched another product's
// name (2026-10-08 census audit). Each now keeps only evidence that names the vendor: its host, its
// namespaced global, its product token.
//
// NEGATIVES are real false positives from the cohort-140 archive (institution id given). POSITIVES are
// quoted from the archive where the corpus carries the vendor's marker; the corpus has no Lucidworks
// and no tophat.com marker at all, so those two positives are the vendor's own host.
const { test } = require('node:test');
const assert = require('node:assert');
const { engine, score, FLOOR } = require('./helpers/census-page.js');

// ---------------------------------------------------------------------------------- Lucidworks Fusion
test('Lucidworks Fusion: the Avada theme\'s fusion-* assets and classes are not Lucidworks', () => {
  const avadaScript = '<script id="fusion-scripts-js" src="https://www.na.edu/wp-content/uploads/fusion-scripts/4adf6e993215581231e9b7f1d430e643.min.js?ver=3.16.2"></script>'; // 4471
  const avadaBody = '<body class="avada-responsive fusion-top-header menu-text-align-center fusion-search-form-clean fusion-main-menu-search-dropdown">'; // 4471
  const savannah = '<script src="https://www.savannahtech.edu/wp-content/uploads/fusion-scripts/8589908551f4554a5bfc3a622db30f65.min.js?ver=3.1"></script>'; // 40
  for (const html of [avadaScript, avadaBody, savannah]) assert.strictEqual(score('Lucidworks Fusion', html), 0, html);
});

test('Lucidworks Fusion: a Lucidworks host still matches', () => {
  assert.ok(score('Lucidworks Fusion', '<script src="https://acme.b.lucidworks.cloud/js/search-ui.js"></script>') >= FLOOR);
});

// ------------------------------------------------------------------------------- Cornerstone OnDemand
test('Cornerstone OnDemand: the WordPress Cornerstone builder, a site\'s own /js/cornerstone/ and "vccsoda" are not Cornerstone OnDemand', () => {
  const cases = {
    4310: '<script src="https://www.helms.edu/wp-content/plugins/cornerstone/assets/js/site/cs.6f62d0f.js"></script>',
    4812: '<script src="https://wcc.yccd.edu/wp-content/themes/pro/cornerstone/assets/js/site/cs-classic.7.9.1.js?ver=7.9.1"></script>',
    2577: '<script src="/js/cornerstone/framework/globals-min.v-5yn5pumvc8urbkoqk8na.js"></script>',
    3686: '<script src="https://chatui.ida.gideontaylor.com/vccsoda/scripts/IS_CORE_CONFIG_JS.js"></script>',
  };
  for (const [id, html] of Object.entries(cases)) assert.strictEqual(score('Cornerstone OnDemand', html), 0, id);
});

test('Cornerstone OnDemand: a *.csod.com tenant link still matches (below the floor: html evidence only)', () => {
  assert.strictEqual(score('Cornerstone OnDemand', '<a href="https://sanfordhealth.csod.com/" target="_blank" rel="noopener noreferrer">Success Center</a>'), 40); // 5662
  assert.strictEqual(score('Cornerstone OnDemand', '<script src="https://acme.csod.com/client/acme/js/app.js"></script>'), 100);
});

// -------------------------------------------------------------------------------------------- Top Hat
test('Top Hat: a page\'s own "tophat" header bar is not Top Hat; the vendor host is', () => {
  assert.strictEqual(score('Top Hat', '<div id="umass--global-tophat-container"><a id="umass--global-tophat-wordmark" class="ir" href="https://www.umass.edu/">UMass Amherst</a></div>'), 0); // 2185
  assert.strictEqual(score('Top Hat', '<div id="section-tophat" class="clearfix full-width"><div class="tophat_navigation"></div></div>'), 0); // 1684
  assert.ok(score('Top Hat', '<a href="https://app.tophat.com/e/123456">Join on Top Hat</a>') > 0);
});

// ------------------------------------------------------------------------------------- Cambridge Core
test('Cambridge Core: "Cambridge" prose near "core" and the cambridge.org home page are not Cambridge Core', () => {
  assert.strictEqual(score('Cambridge Core', '<p>The BS in Business: Business Administration major offered at Cambridge College Boston at Bay Path University builds a core set of business skills</p>'), 0); // 898
  assert.strictEqual(score('Cambridge Core', '<li><a href="https://www.cambridge.org/?ucam-ref=global-footer">Cambridge University Press &amp; Assessment</a></li>'), 0); // 450
  assert.strictEqual(score('Cambridge Core', '<a href="https://michiganassessment.org">CaMLA (Cambridge Michigan Language Assessments)</a> test. Core requirements'), 0); // 6532 shape
});

test('Cambridge Core: a cambridge.org/core link still matches (html only, below the floor)', () => {
  assert.strictEqual(score('Cambridge Core', '<p>Dr. Engel contributed Chapter 10 in <a href="https://www.cambridge.org/core/books/abs/memory-and-affect-in-shakespeares-england/tug-of-memory/977435B0DDC39E41EBC8F9C4BE0675E6">'), 40); // 1800
});

// --------------------------------------------------------------------------------------------- Padlet
test('Padlet: the Font Awesome .fa-padlet icon class is not Padlet; a padlet.com embed is', () => {
  assert.strictEqual(score('Padlet', '<style>.fa-nfc-directional{--fa:"\\e49b"}.fa-padlet{--fa:"\\e4a0"}</style>'), 0); // 50
  assert.strictEqual(score('Padlet', '<iframe allow="camera;microphone;geolocation" frameborder="0" height="600" src="https://padlet.com/embed/vmc9sn1l4xm4ocos" width="100%"></iframe>'), 40); // 800
});

// -------------------------------------------------------------------------------------------- YouTube
test('YouTube: the API callback a Google tag injects is not a YouTube embed', () => {
  // 15,853 cohort-140 pages carry onYouTubeIframeAPIReady; 81% of them have no YouTube reference in the HTML.
  assert.strictEqual(score('YouTube', '<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>', ['onYouTubeIframeAPIReady', 'YT', 'dataLayer']), 0);
  assert.deepStrictEqual(Object.keys(engine.patterns.YouTube.js), ['ytplayer']);
});

test('YouTube: a real embed still detects', () => {
  const embed = '<iframe class="upeivideo" allowfullscreen="" frameborder="0" height="505" src="https://www.youtube.com/embed/IbtmC96pRzA" width="853"></iframe>'; // 45
  assert.ok(score('YouTube', embed) > 0);
});
