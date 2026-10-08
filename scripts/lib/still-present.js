// scripts/lib/still-present.js -- after a rewrite is written, which original patterns does the
// EFFECTIVE set still contain?
//
// Run in a FRESH process on purpose: src/detechtor.js `require`s patterns/pattern-rewrites.json once, so
// the process that just wrote that file would still see the old layer.
//
//   node scripts/lib/still-present.js <in.json>   in: [{tech, channel, key, pattern}]  out: indexes still present
'use strict';
const fs = require('fs');
const { loadEffective, enumerateRegexes } = require('./pattern-channels.js');

const wanted = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const have = new Set(enumerateRegexes(loadEffective()).map((r) => `${r.tech}\u0000${r.channel}\u0000${r.key}\u0000${r.pattern}`));
console.log(JSON.stringify(wanted.map((w, i) => (have.has(`${w.tech}\u0000${w.channel}\u0000${w.key}\u0000${w.pattern}`) ? i : -1)).filter((i) => i >= 0)));
