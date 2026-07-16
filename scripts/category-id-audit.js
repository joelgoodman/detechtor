#!/usr/bin/env node
// scripts/category-id-audit.js — empirical id -> real category inference.
// For each numeric cats id used in webappanalyzer-merged.json, list how many
// techs carry it and a sample of their names, plus the CURRENT mapped name.
const fs = require('fs');
const path = require('path');
const { categoryMapping } = require('../src/category-mapping.js');
const base = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../patterns/webappanalyzer-merged.json'), 'utf8'));
const byId = {};
for (const [name, def] of Object.entries(base)) {
  if (name === '_metadata' || !def || !Array.isArray(def.cats)) continue;
  for (const id of def.cats) {
    (byId[id] ||= { count: 0, sampleTechs: [] });
    byId[id].count++;
    if (byId[id].sampleTechs.length < 15) byId[id].sampleTechs.push(name);
  }
}
const out = {};
for (const id of Object.keys(byId).sort((a, b) => byId[b].count - byId[a].count)) {
  out[id] = { ...byId[id], currentName: categoryMapping[id] || 'Unknown' };
}
fs.writeFileSync(path.resolve(__dirname, '../docs/category-id-audit.json'), JSON.stringify(out, null, 2));
console.table(Object.entries(out).map(([id, v]) => ({ id, count: v.count, currentName: v.currentName, sample: v.sampleTechs.slice(0, 5).join(', ') })));
