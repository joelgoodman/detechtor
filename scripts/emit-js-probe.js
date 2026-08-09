#!/usr/bin/env node
// scripts/emit-js-probe.js — emit the JS-global probe list as JSON.
//
// UNI-225. benchmark-agent is Ruby orchestrating Node, so it consumes the probe list by shelling
// out to this script rather than requiring the module. Node consumers should require
// `@speedyu/detechtor/src/js-probe.js` directly. Either way the list comes from the patterns, so
// it cannot drift from what the engine evaluates.
//
// Usage:
//   node scripts/emit-js-probe.js                # full list + probe source
//   node scripts/emit-js-probe.js --names-only   # just the names array
'use strict';
const DeTECHtor = require('../src/detechtor.js');
const { probeNames, PROBE_SOURCE } = require('../src/js-probe.js');

const engine = new DeTECHtor();
const names = probeNames(engine.patterns);

if (process.argv.includes('--names-only')) {
  process.stdout.write(JSON.stringify(names));
} else {
  process.stdout.write(JSON.stringify({
    patternCount: Object.keys(engine.patterns).length,
    globalCount: names.length,
    names,
    probeSource: PROBE_SOURCE,
  }));
}
