// tests/rewrite-apply.test.js -- where a verified rewrite is written: curated files in place, everything
// else through the load-time layer, never to patterns/generated/.
const { test } = require('node:test');
const assert = require('node:assert');
const { planPlacement, renderCurated, addLayerEntries, serializeLayer } = require('../scripts/lib/rewrite-apply.js');
const { applyPatternRewrites, validatePatternRewrites } = require('../src/pattern-rewrites.js');

const CURATED_TEXT = `{
  "Curated Tech": {
    "html": ["foo.*bar", "keep"],
    "headers": { "x-a": "p.*q" },
    "dom": { "a[href]": { "attributes": { "href": "u.*v" } } }
  }
}
`;

const loc = (over) => ({ tech: 'Curated Tech', channel: 'html', field: 'html', key: null, ...over });

test('a curated technology is edited in its file; a generated one goes through the layer', () => {
  const curated = new Map([['curated.json', JSON.parse(CURATED_TEXT)]]);
  const applied = [
    { from: 'foo.*bar', to: 'foo.{0,80}bar', basis: 'corpus:IDENTICAL', locations: [loc()] },
    { from: 'p.*q', to: 'p.{0,80}q', basis: 'corpus:IDENTICAL', locations: [loc({ channel: 'headers', field: 'headers', key: 'x-a' })] },
    { from: 'u.*v', to: 'u.{0,80}v', basis: 'corpus:IDENTICAL', locations: [loc({ channel: 'dom', field: 'dom', dom: { selector: 'a[href]', kind: 'attributes', name: 'href' } })] },
    { from: 'gen.*erated', to: 'gen.{0,250}erated', basis: 'unobservable-channel:default-bound', locations: [loc({ tech: 'Generated Tech' })] },
  ];
  const { curatedEdits, layerEntries } = planPlacement(applied, curated);
  assert.strictEqual(curatedEdits.get('curated.json').length, 3);
  assert.strictEqual(layerEntries.length, 1);
  assert.strictEqual(layerEntries[0].loc.tech, 'Generated Tech');

  const rendered = renderCurated(curatedEdits, () => CURATED_TEXT).get('curated.json');
  const o = JSON.parse(rendered.text);
  assert.deepStrictEqual(o['Curated Tech'].html, ['foo.{0,80}bar', 'keep']);
  assert.strictEqual(o['Curated Tech'].headers['x-a'], 'p.{0,80}q');
  assert.strictEqual(o['Curated Tech'].dom['a[href]'].attributes.href, 'u.{0,80}v');
  assert.strictEqual(rendered.count, 3);
});

test('the layer is deterministic and idempotent, and what it writes validates and applies', () => {
  const entries = [
    { loc: loc({ tech: 'Zed' }), from: 'z.*z', to: 'z.{0,80}z', basis: 'corpus:IDENTICAL' },
    { loc: loc({ tech: 'Alpha', channel: 'headers', field: 'headers', key: 'k' }), from: 'a.*a', to: 'a.{0,80}a', basis: 'x' },
    { loc: loc({ tech: 'Alpha', channel: 'dom', field: 'dom', dom: { selector: '.s', kind: 'text', name: null } }), from: 's.*s', to: 's.{0,80}s', basis: 'x' },
  ];
  const layer = addLayerEntries({ _comment: 'c', rewrites: {} }, entries);
  addLayerEntries(layer, entries); // again: no duplicates
  const text = serializeLayer(layer);
  assert.deepStrictEqual(Object.keys(JSON.parse(text).rewrites), ['Alpha', 'Zed']);
  assert.strictEqual(JSON.parse(text).rewrites.Zed.html.length, 1);

  const patterns = { Zed: { html: ['z.*z'] }, Alpha: { headers: { k: 'a.*a' }, dom: { '.s': 's.*s' } } };
  const rules = JSON.parse(text).rewrites;
  assert.deepStrictEqual(validatePatternRewrites(patterns, rules), []);
  const out = applyPatternRewrites(patterns, rules);
  assert.deepStrictEqual(out.Zed.html, ['z.{0,80}z']);
  assert.strictEqual(out.Alpha.headers.k, 'a.{0,80}a');
  assert.strictEqual(out.Alpha.dom['.s'], 's.{0,80}s');
});
