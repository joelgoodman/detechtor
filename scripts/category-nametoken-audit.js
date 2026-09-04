#!/usr/bin/env node
/**
 * Name-token category screen (UNI-235)
 * ====================================
 * The existing MISSING_SIGNAL check in category-audit.js matches DESCRIPTIONS and is mostly noise:
 * 293 candidates of which 5 mattered. A vendor mentioning "CRM" in prose is not thereby a CRM.
 *
 * Matching the NAME is a far stronger claim, and measurably so — 31 candidates across all 6,504
 * technologies, at high apparent precision. All 15 products with "CRM" in the name sit in
 * `Business Software`; all 6 with "Accessibility" in the name sit in `JavaScript Framework`, and
 * `Accessibility` holds only 10 technologies in total, so that is a live false-negative pool
 * containing real higher-ed vendors (eSSENTIAL Accessibility, Accessible360).
 *
 * Reports; never rewrites. `Blackbaud CRM` is currently `Fundraising` and is genuinely both;
 * `Rapid Search` may be ecommerce product search rather than site search. A human settles those.
 *
 * Usage:
 *   node scripts/category-nametoken-audit.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DeTECHtor = require('../src/detechtor.js');
const { mapCategory } = require('../src/category-mapping.js');

// Word-boundary tokens matched against the technology NAME only.
const TOKENS = {
  CRM: /\bCRM\b/i,
  CMS: /\bCMS\b/i,
  LMS: /\bLMS\b/i,
  SIS: /\bSIS\b/i,
  Chatbot: /\b(chat|chatbot)\b/i,
  'Site Search': /\bsearch\b/i,
  Accessibility: /\b(accessib\w*|a11y)\b/i,
  'Marketing Automation': /\bmarketing\b/i,
};

const engine = new DeTECHtor();
const techs = Object.entries(engine.patterns)
  .filter(([n, d]) => n !== '_metadata' && d && typeof d === 'object');

const candidates = [];
for (const [name, def] of techs) {
  const current = ((def.categories || def.cats) || []).map(mapCategory);
  for (const [category, re] of Object.entries(TOKENS)) {
    if (!re.test(name)) continue;
    if (current.includes(category)) continue;
    candidates.push({
      name,
      token: category,
      current,
      curated: !!def._curated,
      source: def._sourceFile || null,
      description: (def.description || '').slice(0, 200),
    });
  }
}

const byToken = new Map();
for (const c of candidates) byToken.set(c.token, (byToken.get(c.token) || 0) + 1);

console.log(`name-token screen — ${candidates.length} candidates across ${techs.length} technologies\n`);
console.log('TOKEN IN NAME'.padEnd(24), 'NOT FILED THERE');
for (const [k, v] of [...byToken].sort((a, b) => b[1] - a[1])) {
  console.log(k.padEnd(24), String(v).padStart(5));
}
for (const token of Object.keys(TOKENS)) {
  const sub = candidates.filter((c) => c.token === token);
  if (!sub.length) continue;
  console.log(`\n--- ${token} (${sub.length}) ---`);
  for (const c of sub) {
    console.log(`   ${c.curated ? 'CURATED' : '       '} ${c.name.padEnd(40)} ${JSON.stringify(c.current)}`);
  }
}

const out = path.resolve(__dirname, '../docs/category-nametoken-queue.json');
fs.writeFileSync(out, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  ticket: 'UNI-235',
  note: 'Technologies whose NAME contains a category token but which are not filed there. A SCREEN, ' +
        'not a verdict — adjudicate each. Confirmed decisions go to patterns/category-overrides.json.',
  candidates,
}, null, 2));
console.log(`\nwrote ${out}`);
