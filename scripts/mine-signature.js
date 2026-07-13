#!/usr/bin/env node

/**
 * Signature Mining Harness (UNI-141)
 * ==================================
 *
 * Turns the ad-hoc "deduce -> validate" SQL from the 2026-07-13 pilot into a
 * reusable generator. Given a candidate signature for a vendor, it produces the
 * exact validation SQL against the shared Supabase corpus and scores it:
 *
 *   Recall    = fraction of BuiltWith-POSITIVE institutions (that have captured
 *               HTML) whose home/canonical HTML contains the signature.
 *   Neg-hit % = fraction of NON-positive institutions whose HTML contains it.
 *
 * ⚠️ METHODOLOGY (learned 2026-07-13, do not forget):
 *   BuiltWith is a GOOD POSITIVE oracle but a BAD NEGATIVE oracle — it badly
 *   under-labels higher-ed vendors. So neg-hit % is NOT precision: a dedicated
 *   vendor domain (technolutions.net, omniupdate.com, acsbapp.com) that shows a
 *   few % "neg hits" is almost always finding BuiltWith's OWN MISSES, not false
 *   positives. Precision comes from (a) signature SPECIFICITY — is this a
 *   dedicated vendor host? — and (b) a manual spot-check (`--spotcheck`).
 *   A correct detector is MORE complete than BuiltWith; that's the goal.
 *
 * Ground-truth shapes (verified live 2026-07-13):
 *   Positives : institutions.tech_profile->'categories'-><Category>->'current'[]
 *               (optionally + 'historical'[]) element .name == vendor
 *               OR .raw_names ? vendor
 *   HTML      : scan_pages.content->>'html', join scan_pages.scan_id -> scans.id
 *               -> scans.institution_id  (cohort-128 home + canonical pages)
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node scripts/mine-signature.js \
 *     --category "Site Search" --vendor "SearchStax" --signature "searchstax.com"
 *
 *   Options:
 *     --category  <name>   BuiltWith category key (exact, e.g. "CMS", "CRM",
 *                          "Site Search", "Accessibility & QA", "Chatbot")
 *     --vendor    <name>   Vendor .name inside that category (exact)
 *     --signature <str>    Host/token to look for in the HTML (literal substring
 *                          unless --regex). Escape backslashes for the shell.
 *     --regex              Treat --signature as a POSIX regex (uses ~*), else ILIKE '%sig%'
 *     --historical         Count 'historical'[] vendors as positives too
 *     --sample    <n>      Negative-sample size (default 600). We only detoast &
 *                          match HTML for positives + this many random negatives,
 *                          so the query fits a short (MCP) statement timeout —
 *                          the full corpus is ~23k toasted pages and times out.
 *                          neg_hit_pct is therefore over the SAMPLE, not the
 *                          whole population (it's a specificity proxy anyway).
 *     --spotcheck          Emit the spot-check SQL (sample neg-hits + pos-misses)
 *                          instead of the metrics SQL
 *     --run                Execute against SUPABASE_DB_URL via `pg` and print the
 *                          scorecard (requires a postgres:// conn string + `pg`).
 *                          Default: print SQL to stdout (run it via the Supabase
 *                          MCP / SQL editor — the corpus HTML is toasted and must
 *                          be matched server-side).
 *     --project <ref>      Supabase project ref (doc only; default jlnpqppnyuevdpuvpsiz)
 *
 * The generator keeps detechtor DB-free: no creds are required to PRINT SQL, and
 * `pg` is an optional peer used only with --run.
 */

'use strict';

const args = process.argv.slice(2);

function getArg(flag, def = null) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}
function hasFlag(flag) { return args.includes(flag); }

const category   = getArg('--category');
const vendor     = getArg('--vendor');
const signature  = getArg('--signature');
const asRegex    = hasFlag('--regex');
const historical = hasFlag('--historical');
const sampleN    = parseInt(getArg('--sample', '600'), 10);
const posSampleN = parseInt(getArg('--pos-sample', '250'), 10);
const spotcheck  = hasFlag('--spotcheck');
const run        = hasFlag('--run');
const projectRef = getArg('--project', 'jlnpqppnyuevdpuvpsiz');

if (!category || !vendor || !signature) {
  console.error('Missing required args. Example:\n' +
    '  node scripts/mine-signature.js --category "Site Search" --vendor "SearchStax" --signature "searchstax.com"');
  process.exit(1);
}

// ─── SQL literal escaping (single-quote) ─────────────────────────────────────
function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

// Build the HTML-match expression. Literal signatures use ILIKE '%sig%' (fast,
// index-agnostic substring); --regex uses POSIX ~* against the html text.
function matchExpr(col) {
  if (asRegex) return `${col} ~* ${sqlStr(signature)}`;
  return `${col} ILIKE ${sqlStr('%' + signature + '%')}`;
}

// Positive-membership predicate over the tech_profile categories JSON.
// Scans 'current'[] (+ 'historical'[] when --historical) for name/raw_names match.
const arraysExpr = historical
  ? `coalesce(i.tech_profile->'categories'->${sqlStr(category)}->'current','[]'::jsonb) ` +
    `|| coalesce(i.tech_profile->'categories'->${sqlStr(category)}->'historical','[]'::jsonb)`
  : `coalesce(i.tech_profile->'categories'->${sqlStr(category)}->'current','[]'::jsonb)`;

const positivesCTE = `
positives AS (
  SELECT i.id
  FROM institutions i
  WHERE i.tech_profile ? 'categories'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${arraysExpr}) e
      WHERE e->>'name' = ${sqlStr(vendor)}
         OR (e->'raw_names') ? ${sqlStr(vendor)}
    )
)`;

// `scanned` = institutions with >=1 captured page. Uses only join keys — no HTML
// detoast — so sampling is cheap. `universe` = all positives that were scanned +
// a random negative sample. Only universe pages get their HTML decompressed below.
const universeCTE = `
scanned AS (
  SELECT DISTINCT s.institution_id AS id
  FROM scan_pages sp JOIN scans s ON s.id = sp.scan_id
),
pos_sample AS (
  SELECT id FROM positives WHERE id IN (SELECT id FROM scanned)
  ORDER BY random() LIMIT ${Number.isFinite(posSampleN) ? posSampleN : 250}
),
neg_sample AS (
  SELECT id FROM scanned
  WHERE id NOT IN (SELECT id FROM positives)
  ORDER BY random() LIMIT ${Number.isFinite(sampleN) ? sampleN : 600}
),
universe AS (
  SELECT id FROM pos_sample
  UNION
  SELECT id FROM neg_sample
)`;

// One row per universe institution that has captured HTML: did ANY page match?
// html detoasted once per page, but ONLY for universe institutions.
const instPagesCTE = `
inst_pages AS (
  SELECT s.institution_id AS id,
         bool_or(${matchExpr("sp.content->>'html'")}) AS hit,
         (array_agg(sp.content->>'url')
            FILTER (WHERE ${matchExpr("sp.content->>'html'")}))[1] AS sample_hit_url,
         count(*) AS pages
  FROM scan_pages sp
  JOIN scans s ON s.id = sp.scan_id
  WHERE s.institution_id IN (SELECT id FROM universe)
    AND sp.content ? 'html'
  GROUP BY s.institution_id
)`;

const metricsSQL = `-- mine-signature: ${vendor} [${category}] sig=${signature}${asRegex ? ' (regex)' : ''}${historical ? ' +historical' : ''} neg_sample=${sampleN}
WITH ${positivesCTE},${universeCTE},${instPagesCTE},
classified AS (
  SELECT ip.hit, (ip.id IN (SELECT id FROM positives)) AS is_pos
  FROM inst_pages ip
)
SELECT
  ${sqlStr(vendor)}                                          AS vendor,
  ${sqlStr(category)}                                        AS category,
  ${sqlStr(signature)}                                       AS signature,
  (SELECT count(*) FROM positives)                           AS bw_positives_total,
  count(*) FILTER (WHERE is_pos)                             AS pos_with_html,
  count(*) FILTER (WHERE is_pos AND hit)                     AS pos_hit,
  round(100.0 * count(*) FILTER (WHERE is_pos AND hit)
        / nullif(count(*) FILTER (WHERE is_pos), 0), 1)      AS recall_pct,
  count(*) FILTER (WHERE NOT is_pos)                         AS neg_with_html,
  count(*) FILTER (WHERE NOT is_pos AND hit)                 AS neg_hit,
  round(100.0 * count(*) FILTER (WHERE NOT is_pos AND hit)
        / nullif(count(*) FILTER (WHERE NOT is_pos), 0), 3)  AS neg_hit_pct
FROM classified;`;

const spotcheckSQL = `-- spotcheck: ${vendor} [${category}] sig=${signature} neg_sample=${sampleN}
WITH ${positivesCTE},${universeCTE},${instPagesCTE},
classified AS (
  SELECT ip.id, ip.hit, ip.sample_hit_url,
         (ip.id IN (SELECT id FROM positives)) AS is_pos
  FROM inst_pages ip
)
-- Neg-hits: matched but NOT BuiltWith-labeled — eyeball whether real (BuiltWith miss) or FP.
(SELECT 'neg_hit'  AS kind, c.id, i.name, i.website_url AS website, c.sample_hit_url
 FROM classified c JOIN institutions i ON i.id = c.id
 WHERE c.hit AND NOT c.is_pos
 ORDER BY random() LIMIT 12)
UNION ALL
-- Pos-misses: BuiltWith-labeled, has HTML, but signature did NOT fire — recall gap.
(SELECT 'pos_miss' AS kind, c.id, i.name, i.website_url AS website, NULL
 FROM classified c JOIN institutions i ON i.id = c.id
 WHERE c.is_pos AND NOT c.hit
 ORDER BY random() LIMIT 12);`;

const sql = spotcheck ? spotcheckSQL : metricsSQL;

// ─── Output / run ────────────────────────────────────────────────────────────
async function main() {
  if (!run) {
    console.log(sql);
    return;
  }
  const connStr = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error('--run needs SUPABASE_DB_URL (a postgres:// connection string).');
    console.error('None found. Printing SQL instead — run it via the Supabase MCP / SQL editor:\n');
    console.log(sql);
    process.exit(1);
  }
  let Client;
  try { ({ Client } = require('pg')); }
  catch {
    console.error('`pg` not installed (npm i -D pg). Printing SQL instead:\n');
    console.log(sql);
    process.exit(1);
  }
  const client = new Client({ connectionString: connStr });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    console.table(rows);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
