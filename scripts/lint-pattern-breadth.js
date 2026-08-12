#!/usr/bin/env node
/**
 * Measured breadth gate (UNI-237)
 * ===============================
 * Replaces the hand-maintained STOPWORDS list in scripts/lint-patterns.js, which cannot tell
 * `ghost` (5 chars, matches btn-ghost on 16% of homepages) from `algolia` (7 chars, a distinctive
 * vendor string). Breadth is empirical, not lexical -- BUT empirical alone is not enough either.
 *
 * REVISION (2026-08-11): a measured-excess-only gate was built and calibrated against the full
 * corpus, and it FAILED -- it flagged `Yoast SEO Premium`, `Canvas LMS` (`instructure\.com`) and
 * `Algolia` (`algolia`) as violations. Root cause: `strongest` (docs/pattern-breadth.json) only
 * counts a technology's non-html channels (Script/DOM/Meta), and the corpus -- bare rendered HTML
 * -- structurally cannot evaluate `js`/`cookies`/`headers`. So any technology whose REAL marker
 * arrives as an html-embedded vendor string (a domain, a plugin-signature comment) has
 * `strongest ~= 0` and its entire match count reads as "excess", indistinguishable from an
 * over-broad prose regex like `class=".*row"`.
 *
 * The fix pairs measurement with a specificity SCREEN. A pattern fails only when BOTH stages
 * agree:
 *
 *   Stage 1 (isSuspect) -- does the pattern's regex LOOK like it could collide with ordinary
 *   English? A wildcard between/around dictionary words (`event.*calendar`, `power.*bi`) or a
 *   bare token that is entirely dictionary words (`ghost`, `diaspora`) is suspect. A vendor
 *   string (`instructure\.com`, `algolia`, `omniupdate`) or an anchored literal (Yoast's HTML
 *   comment) contains non-dictionary tokens and is correctly spared.
 *
 *   Stage 2 (measured excess) -- exactly the original design. An html pattern's EXCESS over the
 *   technology's strongest independent signal is either more than ABS_PCT of scanned homepages,
 *   or more than REL_PCT of the technology's own detections (with a MIN_FIRES floor).
 *
 * Bootstrap's `class=".*row"` fails both: "class" and "row" are dictionary words (suspect), and
 * the excess is thousands of homepages over the absolute limit. TargetX's `targetx` -- matching
 * `targetUrl:d,targetXP:l` in a minified bundle on 35 of its 122 detections -- fails stage 2
 * (relative) but NOT stage 1 ("targetx" is not a dictionary word), so it is a known blind spot the
 * gate cannot catch; see the BLIND SPOT line below.
 *
 * The dictionary is vendored to patterns/dictionary.txt (a copy of macOS's /usr/share/dict/words,
 * ~234k entries) rather than read from /usr/share/dict/words directly, because that path does not
 * exist on most Linux CI images -- a gate whose verdict depends on the machine it runs on is not a
 * gate.
 *
 * Exemptions live in patterns/breadth-allowlist.json, one reason each, and are themselves
 * validated: a stale or no-op entry fails the build, so the allowlist cannot silently accumulate
 * dead weight.
 *
 * ⚠️⚠️ KNOWN BASELINE INVERSION (documented, not fixed — UNI-237 code-review follow-up; see
 * scripts/pattern-breadth.js for the full writeup of `strongest`). `strongest` -- what an html
 * pattern's excess is measured AGAINST -- comes from the non-html channels (scripts/scriptSrc, dom,
 * meta, js, cookies), which this gate never screens for precision. `excess = matched - strongest`,
 * so the NOISIER a technology's script pattern is, the more html breadth this gate permits it --
 * backwards from what a precision gate should do. Confirmed on five shipped technologies, e.g.
 * `Rave Mobile Safety`: html `getrave` (precise, 46 matches) is judged against script `rave` (48
 * matches, collides with `brave-popup-builder`) and reads excess 0. The unscreened script channel
 * outnumbers html patterns ~4 to 1 (4,229 vs 1,052 at current counts). Printed on every run
 * (BASELINE_INVERSION_NOTICE below) per the no-silent-caps rule -- a known limitation must stay
 * visible, not just live in a comment nobody reads. Be blunt: this gate raised the floor on
 * dictionary-word html patterns, and nothing else.
 *
 * Usage:
 *   node scripts/lint-pattern-breadth.js           # report
 *   node scripts/lint-pattern-breadth.js --gate    # exit 1 on any violation
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ABS_PCT = 0.02;   // of scanned homepages
const REL_PCT = 0.25;   // of the technology's own detections
const MIN_FIRES = 20;   // below this, the relative test is noise

const GATE = process.argv.includes('--gate');

// --breadth / --allowlist let tests point the gate at fixtures without copying the whole repo into
// a temp dir. src/detechtor.js requires ~12 pattern files by relative path, so a symlinked copy in
// a scratch directory cannot load -- the gate must run in place.
function argPath(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? path.join(ROOT, fallback) : path.resolve(process.argv[i + 1]);
}

const breadthPath = argPath('--breadth', 'docs/pattern-breadth.json');
if (!fs.existsSync(breadthPath)) {
  console.error(`FATAL: ${breadthPath} missing. Run \`npm run breadth\` first.`);
  process.exit(1);
}
const breadth = JSON.parse(fs.readFileSync(breadthPath, 'utf8'));
const allowlist = JSON.parse(fs.readFileSync(argPath('--allowlist', 'patterns/breadth-allowlist.json'), 'utf8'));
const allowed = allowlist.allow || {};

// A gate whose input is empty passes trivially. That is indistinguishable from "nothing is wrong",
// so refuse it: an artifact with no scanned pages or no patterns is a broken measurement.
if (!breadth.scanned || !breadth.patterns || Object.keys(breadth.patterns).length === 0) {
  console.error('FATAL: pattern-breadth.json reports no scanned pages or no patterns -- the measurement is broken.');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Stage 1: specificity screen
// ---------------------------------------------------------------------------------------------
// Dictionary is always read from the vendored copy, never /usr/share/dict/words -- see file header.
const dictPath = argPath('--dictionary', 'patterns/dictionary.txt');
if (!fs.existsSync(dictPath)) {
  console.error(`FATAL: ${dictPath} missing. Run \`cp -L /usr/share/dict/words patterns/dictionary.txt\` (macOS) and commit it.`);
  process.exit(1);
}
const WORDS = new Set(
  fs.readFileSync(dictPath, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean)
);
if (WORDS.size < 1000) {
  console.error(`FATAL: ${dictPath} has only ${WORDS.size} entries -- looks truncated, refusing to screen against it.`);
  process.exit(1);
}

function isSuspect(regex, WORDS) {
  const tokens = String(regex).toLowerCase().match(/[a-z]{3,}/g) || [];
  const dictTokens = tokens.filter((t) => WORDS.has(t));
  // A wildcard between dictionary words matches ordinary prose: `event.*calendar`, `power.*bi`.
  // A bare token that is entirely dictionary words collides with English: `ghost`, `diaspora`.
  // Vendor strings (`instructure\.com`, `algolia`, `omniupdate`) and anchored literals (Yoast's
  // HTML comment) contain non-dictionary tokens and are correctly spared.
  return /\.\*|\.\+/.test(regex) ? dictTokens.length > 0
                                   : (tokens.length > 0 && dictTokens.length === tokens.length);
}

// ---------------------------------------------------------------------------------------------
// Stage 2: measured excess, plus stage-1 gating
// ---------------------------------------------------------------------------------------------
const absLimit = breadth.scanned * ABS_PCT;
const violations = [];
const allowHits = new Set();
let sparedByScreen = 0;      // high excess, but stage 1 does not think it looks suspect
let sparedByMeasurement = 0; // looks suspect, but excess does not clear either threshold

for (const [tech, p] of Object.entries(breadth.patterns)) {
  for (const [regex, matched] of Object.entries(p.html || {})) {
    const excess = Math.max(0, matched - (p.strongest || 0));
    const failsAbs = excess > absLimit;
    const failsRel = p.fires >= MIN_FIRES && excess / p.fires > REL_PCT;
    const excessive = failsAbs || failsRel;
    const suspect = isSuspect(regex, WORDS);

    if (excessive && !suspect) { sparedByScreen++; continue; }
    if (suspect && !excessive) { sparedByMeasurement++; continue; }
    if (!excessive) continue; // neither stage has anything against this pattern

    const key = JSON.stringify([tech, regex]);
    if (Array.isArray(allowed[tech]) && allowed[tech].some((e) => e.pattern === regex)) {
      allowHits.add(key);
      continue;
    }
    violations.push({
      tech, regex, matched, strongest: p.strongest || 0, fires: p.fires, excess,
      why: [failsAbs && 'absolute', failsRel && 'relative'].filter(Boolean).join('+'),
    });
  }
}

// Allowlist hygiene: an entry that no longer names a real technology, or that no longer exempts
// anything, is dead weight that reads as a considered decision.
//
// UNI-237 code review hardening: three integrity holes let dead weight in silently --
//   - a one-character `reason` ("r") passed the old `!e.reason.trim()` check, which only rejects
//     empty/whitespace strings, not non-justifications. MIN_REASON_LEN enforces an actual
//     explanation, not a placeholder.
//   - a duplicate {tech, pattern} entry passed silently -- exactly the dead weight this hygiene
//     check exists to prevent.
//   - `allow[tech]` given as an object instead of an array reached `for (const e of entries)` below
//     and threw an unhandled TypeError instead of a diagnostic.
const MIN_REASON_LEN = 20; // below this a "reason" is a placeholder, not a justification
const allowProblems = [];
for (const [tech, entries] of Object.entries(allowed)) {
  if (tech === '_comment') continue;
  const p = breadth.patterns[tech];
  if (!p) { allowProblems.push(`${tech}: no such technology in the breadth artifact -- stale`); continue; }
  if (!Array.isArray(entries)) {
    allowProblems.push(`${tech}: allow["${tech}"] must be an array of {pattern, reason} entries, got ${typeof entries}`);
    continue;
  }
  const seenPatterns = new Set();
  for (const e of entries) {
    if (!e || typeof e.pattern !== 'string' || typeof e.reason !== 'string' || !e.reason.trim()) {
      allowProblems.push(`${tech}: every entry needs {pattern, reason}`);
      continue;
    }
    if (e.reason.trim().length < MIN_REASON_LEN) {
      allowProblems.push(
        `${tech}: reason for ${JSON.stringify(e.pattern)} is ${e.reason.trim().length} chars, below the ` +
        `${MIN_REASON_LEN}-char minimum -- a placeholder is not a justification, explain what was checked`
      );
      continue;
    }
    if (seenPatterns.has(e.pattern)) {
      allowProblems.push(
        `${tech}: duplicate allowlist entry for pattern ${JSON.stringify(e.pattern)} -- ` +
        'exactly the dead weight this hygiene check exists to prevent'
      );
      continue;
    }
    seenPatterns.add(e.pattern);
    if (!(e.pattern in (p.html || {}))) {
      allowProblems.push(`${tech}: pattern ${JSON.stringify(e.pattern)} is no longer declared -- stale`);
      continue;
    }
    if (!allowHits.has(JSON.stringify([tech, e.pattern]))) {
      allowProblems.push(`${tech}: pattern ${JSON.stringify(e.pattern)} no longer exceeds both stages -- no-op`);
    }
  }
}

// The override layer is validated here too, so a reimport that reverts a decision fails the build.
const DeTECHtor = require('../src/detechtor.js');
const { validatePatternOverrides } = require('../src/pattern-overrides.js');
const PATTERN_OVERRIDES = require('../patterns/pattern-overrides.json');
const pristine = new DeTECHtor().loadPatterns({ applyOverrides: false });
const overrideProblems = validatePatternOverrides(pristine, PATTERN_OVERRIDES.overrides || {});

violations.sort((a, b) => b.excess - a.excess);

// Known blind spots -- printed on EVERY run, gate or report, so a future change that quietly fixes
// (or, worse, papers over) one of these does not slip past unnoticed. Per the no-silent-caps rule:
// a limitation we know about and choose not to fix here must still be visible on every run.
// Patterns this gate provably CANNOT catch, declared so the coverage hole is visible on every run
// rather than being discovered later as a surprise (the no-silent-caps rule).
//
// ⚠️ Validated like the allowlist: an entry naming a pattern the technology no longer declares is
// STALE and fails the build. Without that check this list rots into a set of warnings about
// problems that were fixed years ago, which is worse than no list -- a reader cannot tell the live
// holes from the historical ones. TargetX was the founding entry; it was fixed in UNI-237 by
// tightening `targetx` to the Salesforce package namespace `targetx_[a-z]+__`, and its entry was
// removed by this very check. The blind-spot CLASS it illustrates is documented in the header.
const KNOWN_BLIND_SPOTS = [];

// Permanent, unconditional notice -- NOT gated on GATE, NOT tied to a single pattern's presence,
// and not part of the pass/fail count. This is a structural property of the measurement itself
// (see the header comment above and in scripts/pattern-breadth.js), not a per-technology finding
// that could go stale the way KNOWN_BLIND_SPOTS entries can. It stays visible on every run --
// report or gate -- so nobody mistakes a clean gate run for "the html patterns are precise";
// it means "the html patterns are precise relative to an unscreened non-html baseline."
const BASELINE_INVERSION_NOTICE =
  'KNOWN BASELINE INVERSION (documented, not fixed -- UNI-237 follow-up): `strongest` comes from ' +
  'the non-html channels (scripts/scriptSrc, dom, meta, js, cookies), which this gate does not ' +
  'screen. excess = matched - strongest, so a NOISIER script pattern makes a technology\'s html ' +
  'breadth look MORE justified, not less -- backwards. e.g. Rave Mobile Safety: html `getrave` ' +
  '(precise, 46 matches) is judged against script `rave` (48 matches, collides with ' +
  '`brave-popup-builder`) and reads excess 0. Unscreened script channel ~4x the html volume ' +
  '(4,229 vs 1,052 regexes at current counts). This gate raised the floor on dictionary-word html ' +
  'patterns, and nothing else.';

console.log(`breadth gate -- ${breadth.scanned} homepages -- absolute >${absLimit.toFixed(0)} -- relative >${REL_PCT * 100}% (min ${MIN_FIRES} fires) -- dictionary ${WORDS.size} words\n`);
console.log(`⚠️  ${BASELINE_INVERSION_NOTICE}\n`);
console.log(`spared by screen (excessive but not suspect): ${sparedByScreen}`);
console.log(`spared by measurement (suspect but not excessive): ${sparedByMeasurement}\n`);
const blindSpotProblems = [];
for (const b of KNOWN_BLIND_SPOTS) {
  const p = breadth.patterns[b.tech];
  if (!p) {
    blindSpotProblems.push(`${b.tech}: no such technology in the breadth artifact -- stale`);
  } else if (!(b.pattern in (p.html || {}))) {
    blindSpotProblems.push(
      `${b.tech}: pattern ${JSON.stringify(b.pattern)} is no longer declared -- stale, ` +
      'the blind spot was fixed and the entry must be removed'
    );
  } else {
    console.log(`BLIND SPOT  ${b.tech} :: ${JSON.stringify(b.pattern)} -- ${b.note}`);
  }
}
if (KNOWN_BLIND_SPOTS.length === 0) console.log('no declared blind spots');
console.log('');
if (violations.length) {
  console.log('VIOLATIONS');
  for (const v of violations) {
    console.log(
      `  ${String(v.excess).padStart(5)} excess  ${(v.excess / v.fires * 100).toFixed(0).padStart(3)}%  ` +
      `[${v.why}]  ${v.tech} :: ${JSON.stringify(v.regex)}  (matched ${v.matched}, strongest ${v.strongest}, fires ${v.fires})`
    );
  }
  console.log('');
}
for (const p of blindSpotProblems) console.log(`BLIND SPOT ${p}`);
for (const p of allowProblems) console.log(`ALLOWLIST  ${p}`);
for (const p of overrideProblems) console.log(`OVERRIDE   ${p.name}: ${p.problem}`);

const failures = violations.length + allowProblems.length + overrideProblems.length + blindSpotProblems.length;
console.log(`\n${violations.length} violation(s) (${new Set(violations.map((v) => v.tech)).size} technologies) -- ${allowProblems.length} allowlist problem(s) -- ${overrideProblems.length} override problem(s) -- ${blindSpotProblems.length} blind-spot problem(s)`);

if (GATE && failures > 0) process.exit(1);
