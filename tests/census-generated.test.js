// tests/census-generated.test.js -- generated (upstream WebAppAnalyzer) technologies the 2026-10-08
// census audit found reporting something else, fixed through the load-time layers
// (patterns/pattern-overrides.json removals and retire, patterns/pattern-rewrites.json replacements).
//
// Every NEGATIVE is a real false positive from the cohort-140 archive, quoted verbatim with the
// institution id it came from. A POSITIVE is quoted from the archive wherever the corpus carries the
// genuine marker; where it does not, the test says so.
const { test } = require('node:test');
const assert = require('node:assert');
const { engine, score, FLOOR } = require('./helpers/census-page.js');

// ------------------------------------------------------------------------------- Allyant / Accessible360
const SLICK_CDN = '<script id="slider-script-js" src="//cdn.jsdelivr.net/npm/@accessible360/accessible-slick@1.0.1/slick/slick.min.js" type="text/javascript"></script>'; // 2448
const SLICK_SELF = '<script src="/admission/libraries/accessible360--accessible-slick/slick/slick.min.js?v=1.0.1"></script>'; // 762

test('Allyant / Accessible360: the accessible-slick carousel package is not the accessibility vendor', () => {
  for (const tech of ['Allyant', 'Accessible360']) {
    assert.strictEqual(score(tech, SLICK_CDN), 0, `${tech} on the jsdelivr slick script (2448, audited wrong)`);
    assert.strictEqual(score(tech, SLICK_SELF), 0, `${tech} on a self-hosted slick script (762)`);
  }
});

test('Allyant / Accessible360: the accessible360.com badge link (the upstream dom rule) still detects', () => {
  // No such link exists in the cohort-140 corpus; this is the shape of the upstream rule itself.
  const badge = '<a href="https://accessible360.com/" target="_blank"><img src="/img/a360-badge.png" alt="Accessible360 badge"></a>';
  for (const tech of ['Allyant', 'Accessible360']) assert.ok(score(tech, badge) >= FLOOR, tech);
});

// ------------------------------------------------------------------------------------------- Squiz DXP
test('Squiz DXP: bare dxp / squiz / matrix substrings that are not Squiz', () => {
  const cases = {
    'Wilson College (2487): @viewdo/dxp-nent': '<script type="module" src="https://cdn.jsdelivr.net/npm/@viewdo/dxp-nent/dist/dxp/dxp.esm.js"></script>',
    'campus.edu (2864): dxp inside a GTM container id': '<script async src="https://metrics.campus.edu/gtm.js?id=GTM-PDXPMG7"></script>',
    'Marjon (456): a Funnelback SEARCH script': '<script src="https://dxp-uk-search.funnelback.squiz.cloud/stencils/resources/base/v15.8/js/base.js"></script>',
    'Louisville (2806): a Funnelback SEARCH script': '<script src="https://dxp-us-stage-search.funnelback.squiz.cloud/s/resources-global/thirdparty/bootstrap-3.3.7/js/bootstrap.min.js"></script>',
    'Naval War College (3611): program-matrix.js': '<script src="https://usnwc.edu/_files/js/program-matrix.js"></script>',
    'TTUHSC (1628): Funnelback config': '<script>{"ttuhscSquiz":{"baseUrl":"https:\\/\\/dxp02-us-search.funnelback.squiz.cloud","collection":"ttus~sp-search-redesign","profile":"search-redesign","show":8}}</script>',
    '6651: an SVG feColorMatrix and a later "asset"': '<img src="data:image/svg+xml,%3cfeColorMatrix%20in=\'SourceAlpha\'%20type=\'matrix\'/%3e"><a href="/assets/brochure.pdf">x</a>',
  };
  for (const [what, html] of Object.entries(cases)) assert.strictEqual(score('Squiz DXP', html), 0, what);
  assert.strictEqual(score('Squiz DXP', '<p>x</p>', ['Matrix']), 0, 'a site\'s own window.Matrix (816) is not Squiz');
});

test('Squiz DXP: the real Squiz markers on Bradford (355) and Greenwich (230) still detect', () => {
  const component = '<script src="https://components-cdn.stg.dx.squiz.cloud/squiz-edge-bundlers/latest/bundle.js" type="module"></script>'; // 355
  const matrixJs = '<script defer="" src="https://www.bradford.ac.uk/__data/assets/js_file/0023/62168/components.js"></script>'; // 355
  const comment = '<!--\n  Running Squiz Matrix\n  Developed by Squiz - http://www.squiz.net\n  Squiz, Squiz Matrix, MySource, MySource Matrix and Squiz.net are registered Trademarks of Squiz Pty Ltd\n-->'; // 230
  assert.strictEqual(score('Squiz DXP', component), 60, 'the DXP component service script');
  assert.strictEqual(score('Squiz DXP', matrixJs), 60, 'a Squiz Matrix /__data/assets/js_file/ script');
  assert.ok(score('Squiz DXP', comment) >= FLOOR, 'the Squiz Matrix comment block');
});

// ------------------------------------------------------------------------------------------- Varbase
test('Varbase: the generic Drupal global is not Varbase; the Varbase markup is', () => {
  const drupal = '<meta name="Generator" content="Drupal 10 (https://www.drupal.org)">';
  assert.strictEqual(score('Varbase', drupal, ['drupalSettings', 'drupalSettings.ajaxPageState.libraries']), 0);
  assert.ok(score('Varbase', '<meta name="generator" content="Varbase">') >= FLOOR, 'generator meta (1634)');
  assert.ok(score('Varbase', '<div class="varbase-video-player embed-responsive embed-responsive-16by9"></div>') >= FLOOR, 'varbase- block class (3141)');
});

// ------------------------------------------------------------------------------------------------ Ova
test('Ova: retired; the Custom Facebook Feed globals report no website builder', () => {
  assert.strictEqual(engine.patterns.Ova, undefined, 'Ova must not load');
  const cff = engine.matchPatterns(require('../src/evidence-from-html.js').evidenceFromHtml('<p>x</p>', engine.domPlan,
    { jsGlobals: ['cffOptions', 'cffOptions.placeholder', 'cffOptions.resized_url'] }));
  assert.ok(!cff.some((t) => t.name === 'Ova'));
});

// -------------------------------------------------------------------------------------------- core-js
test('core-js: the __core-js_shared__ global a third-party bundle sets is not evidence', () => {
  assert.strictEqual(score('core-js', '<p>x</p>', ['__core-js_shared__', '__core-js_shared__.versions.0.version', 'dataLayer']), 0);
  assert.strictEqual(score('core-js', '<p>x</p>', ['_babelPolyfill']), 80, 'the remaining globals still count');
});

// --------------------------------------------------------------------------------------- Akamai mPulse
test('Akamai mPulse: the boomerang loader host is matched as a plain literal', () => {
  // 3570, verbatim start of the inline loader; the <script>...</script> frame of the old rule is gone.
  const loader = '<script>!function(e){var n="https://s.go-mpulse.net/boomerang/";if("False"=="True")e.BOOMR_config=e.BOOMR_config||{};}(window);</script>';
  assert.strictEqual(score('Akamai mPulse', loader), 40);
  assert.strictEqual(score('Akamai mPulse', '<script>var x="https://s.example.net/boomerang/";</script>'), 0);
  assert.deepStrictEqual(engine.patterns['Akamai mPulse'].html, ['go-mpulse\\.net/boomerang']);
});

// ------------------------------------------------------------------------------------------------ RxJS
test('RxJS: a random widget id ending in "rx" is not RxJS; an rx.*.js file is', () => {
  assert.strictEqual(score('RxJS', '<script src="https://app.heyhalda.com/widgets/smart-forms/cl29imffs08zs080eakthrvrx.js"></script>'), 0, '3543');
  assert.strictEqual(score('RxJS', '<script src="/js/vendor/rx.all.min.js"></script>'), 60);
});
