// tests/census-bare-substrings.test.js -- leftover short-fragment rules from patterns/wildcard-review.tsv
// (tagged precision-suspect) that FIRED in the 2026-10-08 census and were wrong there. Each now requires
// the product name or the vendor host. NEGATIVES are the census matches, verbatim with the institution
// id; POSITIVES are the genuine forms from the same corpus where it has one.
const { test } = require('node:test');
const assert = require('node:assert');
const { score } = require('./helpers/census-page.js');

test('Ex Libris Primo: "primordial ... ve" is not Primo VE; the product name is', () => {
  assert.strictEqual(score('Ex Libris Primo', '<span class="teaser-title">Evidence of primordial black holes may be hiding in planets, or even everyday objects here on Earth</span>'), 0); // 284
  assert.strictEqual(score('Ex Libris Primo', '<!-- Primo VE Script that converts the query string into valid parameter -->'), 40); // 1236
});

test('FOLIO LSP: "portfolio" is not FOLIO', () => {
  const cases = {
    'salient-portfolio script (11 floor-50 detections)': '<script src="https://example.edu/wp-content/plugins/salient-portfolio/js/third-party/imagesLoaded.min.js?ver=4.1.4"></script>',
    'Enfold portfolio isotope script': '<script src="https://example.edu/wp-content/themes/enfold/config-templatebuilder/avia-shortcodes/portfolio/isotope.min.js"></script>',
    '4118: Divi portfolio grid CSS then "library"': '<style>.et_pb_portfolio_grid .et_pb_portfolio_item h2{}</style><a href="/library">Library</a>',
    '8260: Interfolio nav entry then "library"': '<script>{"Href":"/en/faculty/interfolio","NavigationTitle":{"value":"Interfolio"}},{"Href":"/library"}</script>',
  };
  for (const [what, html] of Object.entries(cases)) assert.strictEqual(score('FOLIO LSP', html), 0, what);
  assert.strictEqual(score('FOLIO LSP', '<p>Our catalog moved to FOLIO LSP, the open source library services platform.</p>'), 80, 'the product name still matches both html rules');
});

test('Innovative Interfaces Sierra / SirsiDynix Symphony: a college name or an orchestra is not an ILS', () => {
  assert.strictEqual(score('Innovative Interfaces Sierra', '<span>By submitting this form, you agree to be contacted by La Sierra University via email, phone, or text. For more details, please see our</span>'), 0); // 1561
  assert.strictEqual(score('SirsiDynix Symphony', '<p>A thriving arts community supports local theatre, a symphony orchestra, galleries and festivals. And you can walk or bike trails along three rivers</p>'), 0); // 700
  assert.strictEqual(score('Innovative Interfaces Sierra', '<p>Search the catalog (Sierra ILS)</p>'), 40);
  assert.strictEqual(score('SirsiDynix Symphony', '<p>Our catalog runs on Symphony ILS</p>'), 40);
});

test('Tribal Student Management: "website" near "Tribal College" is not Tribal; its hosted ebs host is', () => {
  const lltc = '<script type="application/ld+json">{"@type":"WebSite","@id":"https:\\/\\/www.lltc.edu\\/#website","url":"https:\\/\\/www.lltc.edu\\/","name":"Leech Lake Tribal College","description":"Come Find Your Place!"}</script>'; // 1898
  assert.strictEqual(score('Tribal Student Management', lltc), 0);
  assert.strictEqual(score('Tribal Student Management', '<li class="list-inline-item"> <a title="View Urutauira" href="https://ebsontrackprospect-twwoa.tribal-ebs.com/"> Urutauira </a> </li>'), 40); // 204
});

test('CampusVue: "campus" and a later "...vue" are not CampusVue; the product name is', () => {
  const bellevue = '<img alt="STudents walk to class on BC\'s campus." width="300" height="300" srcset="https://www.bellevuecollege.edu/wp-content/uploads/2023/03/Background_WYSIWYG_320x320-300x300.jpg 300w">'; // 680
  assert.strictEqual(score('CampusVue', bellevue), 0);
  assert.strictEqual(score('CampusVue', '<span class="avia-menu-text">CampusVue</span>'), 40); // 2028
});
