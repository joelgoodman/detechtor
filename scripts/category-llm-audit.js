#!/usr/bin/env node
/**
 * Local-model category adjudication (UNI-235)
 * ===========================================
 * Asks whether a technology is FILED under the right category. Runs entirely against local Ollama
 * models — no API, no cost.
 *
 * Five measurements from the design pass govern this file. Do not undo them without re-measuring:
 *
 *  1. UNION, NOT INTERSECTION. cogito:70b scored best overall (11/12) yet missed Ellucian CRM
 *     Recruit — the one live mismatch that matters. Requiring model agreement would delete exactly
 *     the findings worth having. Flag if EITHER model objects; disagreement is `contested`.
 *  2. CONFIDENCE IS WORTHLESS. Every answer came back 0.9–1.0, including all four wrong ones.
 *     Recorded, never gated on.
 *  3. VERDICT IS RELIABLE, PROPOSED CATEGORY IS NOT. Both models flagged Slate correctly and both
 *     proposed SIS. `correct_category` is advisory metadata for the human, never applied.
 *  4. THE NAME BEATS THE DESCRIPTION. Evidence packets lead with name and detection hosts;
 *     description comes last.
 *  5. THE VERDICT TEST NEEDS EXACTLY ONE COHERENT RULE — TWO RULES IN TENSION LET A WEAK MATCH
 *     LAUNDER A WRONG ONE. Three prompt versions were measured before this shipped, because getting
 *     this test wrong is not a symmetric error: it either wastes review time (false flag) or
 *     silently drops a real mismatch (missed flag) — and the fixture's one LIVE case, Ellucian CRM
 *     Recruit (18 institutions), is exactly what a missed flag costs.
 *       v1 — "FLAG means WRONG, not merely a label you'd have chosen instead." With all 56
 *         canonical categories on offer there is nearly always a more specific or more fashionable
 *         label available than the one already assigned, and mistral-small3.2:24b treated that
 *         availability itself as evidence of wrong — FLAGging Cloudflare with reason "Primary
 *         function is CDN", the category it was ALREADY filed under, plus TargetX and Slate
 *         (Technolutions) on the identical shape. 8/12, 4 false flags, 0 missed. Union recall was
 *         still 4/4 — mistral independently caught Ellucian CRM Recruit — so this was NOT a recall
 *         failure; the pair failed only mistral's own ≥9/12 floor by wasting review time.
 *       v2 — added "if ANY current category is a defensible description, answer OK" to curb v1's
 *         over-flagging. It worked on false flags (mistral 4→1) but "any one defensible label
 *         rescues the whole set" let a keyword-superficial match launder a genuinely wrong one: both
 *         models read "HR / Recruiting" as defensible-by-keyword-overlap with "recruiting" for
 *         Ellucian CRM Recruit and stopped flagging it, even though CRM is still what they judged
 *         the better label (reasons: "CRM is more accurate" / "Primary function is
 *         recruiting/admissions"). 10/12 each, 1 false flag each (LiveChat), but union recall
 *         dropped to 3/4 — the one case that must never be missed, missed by both models at once.
 *       v3 — deleted the "defensible" sentence outright rather than qualifying it, leaving one test
 *         built on MISLEAD, which is what rule 1 (PRIMARY function) already implies. First wording
 *         (v3a) illustrated the mislead test with two concrete examples that turned out to be
 *         near-verbatim paraphrases of real technologies in the corpus (a recruiting-CRM-vs-
 *         HR-recruiting pair, and an ecommerce-search-vs-site-search pair) — one of which is a case
 *         Task 7's sweep is supposed to judge independently, so v3a pre-answered a sweep case from
 *         inside the calibration prompt: mistral 9/12 (3 false flags: TargetX, Slate (Technolutions),
 *         LiveChat; 0 missed), nemotron 11/12 (1 false flag: LiveChat; 0 missed), union 4/4.
 *         Replaced (v3b, shipped) with abstract statements of the error CLASS — "a category naming a
 *         different market that shares vocabulary" and "a category describing packaging/delivery
 *         rather than function" — naming no product, market pair, or vertical traceable to this
 *         corpus. mistral held at 9/12 (same 3 false flags, 0 missed) but nemotron's OWN recall on
 *         Ellucian CRM Recruit partly depended on the leaked example: nemotron alone dropped to
 *         10/12, now missing that case (1 false flag: LiveChat; 1 missed: Ellucian CRM Recruit).
 *         Union recall still held at 4/4 because mistral independently catches it — the PAIR's
 *         qualification did not depend on the leak, but be aware nemotron's solo score did.
 *     Do not reintroduce a "defensible" escape hatch — v2 is the reason it is gone. Never shrink the
 *     category list to fix a false-flag rate either — that hides the failure instead of instructing
 *     around it. Never illustrate a rule with an example specific enough to double as an answer to a
 *     real corpus technology — v3a is why.
 *
 * Usage:
 *   node scripts/category-llm-audit.js --calibrate --models mistral-small3.2:24b,nemotron-3-nano:30b
 *   node scripts/category-llm-audit.js --sweep     --models mistral-small3.2:24b,nemotron-3-nano:30b
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { CANONICAL_CATEGORIES } = require('../src/category-mapping.js');

const OLLAMA = { host: process.env.OLLAMA_HOST || '127.0.0.1', port: Number(process.env.OLLAMA_PORT || 11434) };

const SYSTEM_PROMPT = `You classify web technologies into categories for a higher-education website scanner.

Allowed categories: ${[...CANONICAL_CATEGORIES].sort().join(', ')}

You are given a technology's name, its current assigned categories, the hosts and markers it is
detected by, and a description. Decide whether the CURRENT categories correctly describe what this
product IS.

Rules:
- Judge the product's PRIMARY function, not incidental features it also has.
- A product BUILT ON another vendor's platform is categorised by what it DOES, not what it runs on.
- The detection hosts are strong evidence of the real vendor. Trust them over marketing prose.
- FLAG means the current categories are WRONG — not that you personally would have filed the
  product under a different one of the categories listed above. With this many categories on offer
  there is nearly always another plausible label; that alone is not evidence of an error.
- FLAG when a current category would MISLEAD someone about what this product is — for example a
  category that names a different MARKET but happens to share vocabulary with this product's own
  domain, or a category that describes how the product is PACKAGED OR DELIVERED rather than what it
  actually does.
- Otherwise answer OK. A more specific or more fashionable label merely existing is not grounds to
  FLAG.
- If you do not recognise the product, set "known": false and verdict "OK". Never guess.
- Reply with ONLY a JSON object, no prose:
{"verdict":"OK"|"FLAG","correct_category":"<one allowed category>","known":true|false,"confidence":0.0-1.0,"reason":"<15 words max>"}`;

/** One Ollama chat call. Never throws — a failure is returned as {error} so a sweep continues. */
function askModel(model, userPrompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      stream: false,
      format: 'json',
      // ⚠️ REASONING MODELS. num_predict must cover thinking tokens AS WELL AS the JSON, because
      // they share the budget. nemotron-3-nano:30b emits ~900 thinking chars and at 600 it
      // truncated mid-JSON on exactly the two hardest FLAG cases — which scored as misses and
      // would have silently disqualified a good model. 3000 is comfortable for every model tested.
      options: { temperature: 0, num_predict: 3000 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      keep_alive: '30m',
    });
    const req = http.request({
      host: OLLAMA.host, port: OLLAMA.port, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        // A non-2xx (model not pulled, Ollama not running, etc.) is a distinct failure from a
        // malformed JSON body — surfacing both as "unparseable response" sends triage chasing a
        // JSON bug when the real problem is the model name or the server.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ error: `HTTP ${res.statusCode}: ${s.slice(0, 120)}` });
          return;
        }
        try { resolve(JSON.parse(JSON.parse(s).message.content)); }
        catch (err) { resolve({ error: `unparseable response: ${String(err).slice(0, 80)}` }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(180000, () => { req.destroy(); resolve({ error: 'timeout after 180s' }); });
    req.write(body);
    req.end();
  });
}

/** Evidence packet. Order matters: name first, description last — the name is the stronger feature. */
function buildPrompt(entry) {
  const lines = [`Technology: ${entry.name}`, `Current categories: ${JSON.stringify(entry.cats)}`];
  if (entry.hosts && entry.hosts.length) lines.push(`Detected by: ${entry.hosts.slice(0, 6).join(', ')}`);
  if (entry.cooccurs && entry.cooccurs.length) lines.push(`Commonly appears alongside: ${entry.cooccurs.slice(0, 5).join(', ')}`);
  if (typeof entry.institutions === 'number') lines.push(`Seen on ${entry.institutions} institution homepages`);
  lines.push(`Description: ${entry.desc || '(none)'}`);
  return lines.join('\n');
}

async function scoreGoldSet(model) {
  const fixture = require(path.resolve(__dirname, '../tests/fixtures/category-gold-set.json'));
  let correct = 0, falseFlags = 0, missedFlags = 0, errors = 0;
  const rows = [];
  const t0 = Date.now();
  for (const c of fixture.cases) {
    const r = await askModel(model, buildPrompt({ name: c.name, cats: c.cats, desc: c.desc }));
    const verdict = (r.verdict || 'ERR').toUpperCase();
    const errored = Boolean(r.error) || verdict === 'ERR';
    const ok = !errored && verdict === c.expect;
    // A FLAG-expected case that came back OK, or that errored outright, is a genuine miss either
    // way — the mismatch went unseen. An error on an OK-expected case is different: nothing was
    // actually missed (there was no flag to miss), so it must NOT inflate missedFlags — it gets its
    // own tally instead, or it would misreport "how many real mismatches slipped through."
    if (ok) correct++;
    else if (c.expect === 'FLAG') missedFlags++;
    else if (errored) errors++;
    else falseFlags++;   // verdict === 'FLAG' on an OK-expected case
    rows.push({
      name: c.name, expect: c.expect, got: verdict, ok,
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
      known: typeof r.known === 'boolean' ? r.known : null,
      reason: r.reason || r.error || '',
    });
    console.log(`  ${ok ? '✅' : '❌'} ${c.name.padEnd(28)} want=${c.expect.padEnd(4)} got=${verdict.padEnd(4)} ${(r.reason || r.error || '').slice(0, 50)}`);
  }
  const seconds = (Date.now() - t0) / 1000;
  return { model, correct, total: fixture.cases.length, falseFlags, missedFlags, errors, seconds, rows };
}

async function main() {
  const args = process.argv.slice(2);
  const mi = args.indexOf('--models');
  const models = mi === -1 ? ['mistral-small3.2:24b'] : args[mi + 1].split(',');

  if (args.includes('--calibrate')) {
    const results = [];
    for (const m of models) {
      console.log(`\n${'='.repeat(90)}\nCALIBRATE: ${m}\n${'='.repeat(90)}`);
      const r = await scoreGoldSet(m);
      results.push(r);
      console.log(`\n  ${r.correct}/${r.total}  falseFlags=${r.falseFlags}  missedFlags=${r.missedFlags}  errors=${r.errors}  ` +
        `${r.seconds.toFixed(0)}s (${(r.seconds / r.total).toFixed(1)}s each)`);
      console.log(`  extrapolated over 6,504 technologies: ${((r.seconds / r.total) * 6504 / 3600).toFixed(1)} h`);
    }
    // `seconds` is wall-clock and varies run to run even at temperature 0 (model load state, host
    // load) — it's useful on the console for sizing the Task 7 sweep, but committing it here would
    // dirty the tree on every rerun with no way to tell "same result" from "something changed." Keep
    // the committed artifact fully deterministic, the same discipline docs/category-audit.json uses.
    const resultsForFile = results.map(({ seconds, ...rest }) => rest);
    const out = path.resolve(__dirname, '../docs/category-llm-calibration.json');
    fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), results: resultsForFile }, null, 2));
    console.log(`\nwrote ${out}`);

    // The bar is on the PAIR, not each model. The combiner is a union, so what matters is that
    // BETWEEN them every FLAG case is caught; an individual model missing one is tolerable.
    //
    // This is not a loosened standard, it is the right one. Measured: nemotron-3-nano:30b and
    // cogito:70b BOTH miss Ellucian CRM Recruit with identical reasoning ("primary function is
    // recruitment/admissions" → HR / Recruiting). mistral-small3.2:24b catches it. Scoring models
    // individually would have rejected a model whose real contribution is covering the cases the
    // anchor misses.
    //
    // Each model must still clear >=9/12 so we never pair the anchor with a dud.
    const fixture = require(path.resolve(__dirname, '../tests/fixtures/category-gold-set.json'));
    const flagCases = fixture.cases.filter((c) => c.expect === 'FLAG').map((c) => c.name);
    const caughtByUnion = flagCases.filter((name) =>
      results.some((r) => r.rows.find((row) => row.name === name && row.got === 'FLAG')));
    const weak = results.filter((r) => r.correct < 9);

    console.log(`\nUNION RECALL: ${caughtByUnion.length}/${flagCases.length} flag cases caught by at least one model`);
    const missedByAll = flagCases.filter((n) => !caughtByUnion.includes(n));
    if (missedByAll.length) console.error(`  MISSED BY EVERY MODEL: ${missedByAll.join(', ')}`);

    if (missedByAll.length || weak.length) {
      console.error(`\n⚠️  NOT QUALIFIED: ` +
        (missedByAll.length ? `${missedByAll.length} flag case(s) no model caught. ` : '') +
        (weak.length ? `${weak.map((w) => w.model).join(', ')} below 9/12. ` : '') +
        `Add or swap a model before sweeping.`);
      process.exit(1);
    }
    console.log(`\nOK: the pair qualifies — union catches every flag case.`);
    return;
  }

  console.error('Nothing to do. Pass --calibrate (or --sweep, added in Task 7).');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { askModel, buildPrompt, scoreGoldSet, SYSTEM_PROMPT };
