// tests/helpers/census-page.js -- score one technology against an archived-page snippet, through the
// same evidence builder the offline census and the tiered runner use (src/evidence-from-html.js), so
// html, script[src], meta and dom rules are all evaluated exactly as they are on a real page.
//
// The snippets in the census-*.test.js files are copied verbatim from the cohort-140 archive the
// 2026-10-08 census ran over (corpus/<institution_id>/<pageType>__<sha12>.html); each test names the
// institution id it came from.
'use strict';
const path = require('path');
const DeTECHtor = require(path.resolve(__dirname, '../../src/detechtor.js'));
const { evidenceFromHtml } = require(path.resolve(__dirname, '../../src/evidence-from-html.js'));

const engine = new DeTECHtor();

/**
 * @param {string} tech technology name (must exist in the loaded pattern set)
 * @param {string} html page snippet
 * @param {string[]} [jsGlobals] probed JS globals present on the page (the census js_globals.json shape)
 * @returns {number} the engine's confidence for that technology on that page (0 = not detected)
 */
function score(tech, html, jsGlobals) {
  const def = engine.patterns[tech];
  if (!def) throw new Error(`no technology named ${tech} in the loaded pattern set`);
  const evidence = evidenceFromHtml(html, engine.domPlan, { jsGlobals });
  return engine.evaluatePattern(tech, def, evidence).confidence;
}

/** Every technology the engine reports on the page, name -> confidence. */
function detectAll(html, jsGlobals) {
  const evidence = evidenceFromHtml(html, engine.domPlan, { jsGlobals });
  return Object.fromEntries(engine.matchPatterns(evidence).map((t) => [t.name, t.confidence]));
}

const FLOOR = 50; // the ledger's floor: a detection below it is never recorded as true

module.exports = { engine, score, detectAll, FLOOR };
