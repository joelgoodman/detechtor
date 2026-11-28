#!/usr/bin/env node
/**
 * Ledger category review gate
 * ===========================
 * scripts/category-audit.js checks that a category is canonical and non-empty. Nothing checked that it
 * is RIGHT: Merit Pages (student-achievement press releases) and Feathr (ad-tech) reached the tech
 * ledger as Marketing Automation on an inherited BuiltWith label, and every gate passed.
 *
 * patterns/ledger-category-review.json holds one entry per technology that can reach the ledger
 * (filed under CMS, CRM, Marketing Automation, Chatbot, Accessibility or Site Search, with a script,
 * meta or dom rule), and entries that record a "no" for products reviewed OUT of the six:
 *   { "<technology>": { "ledger_categories": ["CRM"] | [], "status": "reviewed" | "agent-reviewed" | "unreviewed",
 *                       "what_it_is": "...", "reviewer": "...", "date": "YYYY-MM-DD", "known_mismatch"?: "..." } }
 * `ledger_categories` is what the REVIEW says, not a copy of the engine's value. `reviewed` = Joel
 * (or another person) decided; `agent-reviewed` = an agent review, named in `reviewer`, that a person
 * has not confirmed yet (counted on every run).
 *
 * FAILS on
 *   NEW         a ledger-category technology with an anchored channel and no entry
 *               (a new technology, or one re-categorised INTO the six)
 *   MISMATCH    the engine's ledger categories differ from the review's (re-categorised, or the review
 *               said no). `known_mismatch` (a dated note naming the fix) reports it instead, and fails
 *               as stale once the engine agrees.
 *   UNREVIEWED  a technology with ledger rows in the last corpus run
 *               (tests/fixtures/ledger-observed.json) whose entry is still `unreviewed`
 *   STALE       an entry for a technology that is not loaded, or a malformed entry
 *
 * Usage: node scripts/lint-ledger-categories.js [--gate] [--table FILE] [--observed FILE] [--show N]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadEffective } = require('./lib/pattern-channels.js');
const { checkCategoryTable } = require('./lib/ledger-gates.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const GATE = argv.includes('--gate');
const SHOW = Number(arg('--show', 40));
const tablePath = path.resolve(arg('--table', path.join(ROOT, 'patterns/ledger-category-review.json')));
const observedPath = path.resolve(arg('--observed', path.join(ROOT, 'tests/fixtures/ledger-observed.json')));
const t0 = Date.now();

const tableDoc = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
const table = tableDoc.technologies || {};
const observedDoc = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const observed = new Map(Object.entries(observedDoc.institutions || {}));
if (Object.keys(table).length < 100 || observed.size < 10) {
  console.error(`FATAL: the table has ${Object.keys(table).length} entries and the observed list ${observed.size} -- refusing to pass on an empty review`);
  process.exit(2);
}

const patterns = loadEffective();
const { problems, known, live } = checkCategoryTable(patterns, table, observed);
const entries = Object.values(table);
const count = (s) => entries.filter((e) => e && e.status === s).length;
const observedAgent = [...observed.keys()].filter((n) => table[n] && table[n].status === 'agent-reviewed' && live.has(n));
console.log(`ledger category review gate -- ${live.size} technologies in the six ledger categories ` +
  `(${[...live.values()].filter((v) => v.anchored).length} with a script/meta/dom rule) -- table ${Object.keys(table).length} entries: ` +
  `${count('reviewed')} reviewed by a person, ${count('agent-reviewed')} agent-reviewed, ${count('unreviewed')} unreviewed -- ` +
  `observed ${observed.size} (${observedDoc.source || '?'}) -- ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${observedAgent.length} technologies with ledger rows rest on an agent review a person has not confirmed (status agent-reviewed)`);
if (known.length) {
  console.log(`\nKNOWN MISMATCH -- ${known.length} (reported, not failed, until the engine agrees):`);
  for (const k of known) console.log(`  ! ${k}`);
}
let total = 0;
for (const [kind, list] of Object.entries(problems)) {
  total += list.length;
  if (!list.length) continue;
  console.log(`\n${kind} -- ${list.length}`);
  for (const x of list.slice(0, SHOW)) console.log(`  ✖ ${x}`);
  if (list.length > SHOW) console.log(`  … ${list.length - SHOW} more (--show N)`);
}
if (GATE && total) {
  console.error(`\n❌ ledger category review gate: ${Object.entries(problems).map(([k, v]) => `${v.length} ${k}`).join(', ')}`);
  process.exit(1);
}
if (GATE) console.log('\nOK: every ledger-category technology has a review entry that agrees with the engine.');
