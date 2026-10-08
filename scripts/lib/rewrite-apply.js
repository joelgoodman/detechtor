// scripts/lib/rewrite-apply.js -- where a verified rewrite is written.
//
// Never to patterns/generated/ (the importer rewrites it wholesale). A technology DEFINED in a curated
// file is edited there, with a minimal diff; one that comes only from the generated artifact (or from
// an alias union) gets an entry in patterns/pattern-rewrites.json, a load-time layer that names the
// exact original text.
'use strict';
const { editJsonText } = require('./pattern-edit.js');

const fieldOf = (loc) => (loc.channel === 'dom' ? 'dom' : loc.field);

/** Is `from` present at this location of a curated definition? */
function presentIn(def, loc, from) {
  if (!def || typeof def !== 'object') return false;
  if (loc.channel === 'dom') {
    const dom = def.dom;
    if (!dom || typeof dom !== 'object' || Array.isArray(dom)) return false;
    const v = dom[loc.dom.selector];
    if (loc.dom.kind === 'text') return v === from || (!!v && typeof v === 'object' && v.text === from);
    return !!(v && typeof v === 'object' && v[loc.dom.kind] && v[loc.dom.kind][loc.dom.name] === from);
  }
  if (Array.isArray(def[loc.field])) return def[loc.field].includes(from);
  return !!def[loc.field] && typeof def[loc.field] === 'object' && def[loc.field][loc.key] === from;
}

/**
 * Decide, for each (location, from -> to), whether a curated file or the layer carries it.
 * @param {Array<{from:string, to:string, basis:string, locations:object[]}>} applied
 * @param {Map<string, object>} curated  file path -> parsed JSON
 * @returns {{curatedEdits: Map<string, object[]>, layerEntries: object[]}}
 */
function planPlacement(applied, curated) {
  const curatedEdits = new Map([...curated.keys()].map((f) => [f, []]));
  const layerEntries = [];
  for (const a of applied) {
    for (const loc of a.locations) {
      let edited = false;
      for (const [file, data] of curated) {
        if (!presentIn(data[loc.tech], loc, a.from)) continue;
        curatedEdits.get(file).push({
          tech: loc.tech, field: fieldOf(loc), key: loc.channel === 'dom' ? undefined : loc.key,
          selector: loc.dom && loc.dom.selector, kind: loc.dom && loc.dom.kind, name: loc.dom && loc.dom.name,
          from: a.from, to: a.to,
        });
        edited = true;
      }
      if (!edited) layerEntries.push({ loc, from: a.from, to: a.to, basis: a.basis });
    }
  }
  return { curatedEdits, layerEntries };
}

/** Apply the planned edits to the files' text; returns file -> new text (only files that change). */
function renderCurated(curatedEdits, readText) {
  const out = new Map();
  for (const [file, edits] of curatedEdits) {
    if (!edits.length) continue;
    const seen = new Set();
    const uniq = edits.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
    out.set(file, { text: editJsonText(readText(file), uniq), count: uniq.length });
  }
  return out;
}

/** Add entries to a parsed layer file (idempotent). */
function addLayerEntries(layer, entries) {
  layer.rewrites = layer.rewrites || {};
  for (const { loc, from, to, basis } of entries) {
    const field = fieldOf(loc);
    const t = (layer.rewrites[loc.tech] = layer.rewrites[loc.tech] || {});
    const list = (t[field] = t[field] || []);
    let e;
    if (loc.channel === 'dom') e = { selector: loc.dom.selector, kind: loc.dom.kind, ...(loc.dom.name ? { name: loc.dom.name } : {}), from, to, basis };
    else if (['headers', 'meta', 'cookies'].includes(loc.field)) e = { key: loc.key, from, to, basis };
    else e = { from, to, basis };
    const same = (x) => x.from === e.from && x.key === e.key && x.selector === e.selector && x.kind === e.kind && x.name === e.name;
    if (!list.some(same)) list.push(e);
  }
  return layer;
}

/** Deterministic file: technologies sorted, entries in a stable order. */
function serializeLayer(layer) {
  const out = { _comment: layer._comment, rewrites: {} };
  for (const tech of Object.keys(layer.rewrites || {}).sort()) {
    const t = {};
    for (const field of Object.keys(layer.rewrites[tech]).sort()) {
      t[field] = [...layer.rewrites[tech][field]].sort((a, b) => (a.from + (a.key || '') + (a.selector || '')).localeCompare(b.from + (b.key || '') + (b.selector || '')));
    }
    out.rewrites[tech] = t;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

module.exports = { planPlacement, renderCurated, addLayerEntries, serializeLayer, presentIn };
