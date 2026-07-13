#!/usr/bin/env node

/**
 * Phase 4 — Pattern Validation
 *
 * Tests each pattern in docs/pattern-validation-ledger.csv against the
 * captured evidence snapshots in tests/evidence/, classifying each as:
 *
 *   verified       — fires on ≥1 snapshot for the correct technology
 *   false-positive — fires ONLY on wrong-tech snapshots (never correct)
 *   needs-review   — verified AND also fires on wrong-tech snapshots
 *   suspect        — never fires on any snapshot
 *   no-evidence    — no snapshots exist for this technology
 *
 * Updates docs/pattern-validation-ledger.csv (status + source_evidence).
 * Writes  docs/PATTERN_VALIDATION_REPORT.md with per-file / per-tech summary.
 *
 * Usage:
 *   node scripts/validate-patterns.js [options]
 *
 * Options:
 *   --tech <name>   Validate only patterns for a specific technology (exact match)
 *   --force         Re-validate rows that already have a status set
 *   --report-only   Regenerate report from current ledger without re-validating
 *   --verbose       Log each pattern result
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT         = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'tests', 'evidence');
const LEDGER_PATH  = path.join(ROOT, 'docs', 'pattern-validation-ledger.csv');
const REPORT_PATH  = path.join(ROOT, 'docs', 'PATTERN_VALIDATION_REPORT.md');

// ─── CLI args ────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const techFilter = getArg(args, '--tech');
const force      = args.includes('--force');
const reportOnly = args.includes('--report-only');
const verbose    = args.includes('--verbose');

function getArg(list, flag) {
  const i = list.indexOf(flag);
  return i !== -1 && list[i + 1] ? list[i + 1] : null;
}

// ─── Statuses this script sets automatically (safe to overwrite on re-run) ───
const AUTO_STATUSES = new Set([
  '', 'verified', 'suspect', 'false-positive', 'needs-review', 'no-evidence'
]);

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseCSV(raw) {
  const lines = raw.trim().split('\n');
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
    return row;
  });
  return { headers: headers.map(h => h.trim()), rows };
}

function splitCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowToCSV(row, headers) {
  return headers.map(h => csvEscape(row[h] ?? '')).join(',');
}

// ─── Evidence loading ─────────────────────────────────────────────────────────

function loadEvidence() {
  const snapshots = [];

  if (!fs.existsSync(EVIDENCE_DIR)) {
    console.warn('No evidence directory found:', EVIDENCE_DIR);
    return snapshots;
  }

  const entries = fs.readdirSync(EVIDENCE_DIR, { withFileTypes: true });
  const techDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

  for (const dir of techDirs) {
    const dirPath  = path.join(EVIDENCE_DIR, dir);
    const jsonFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));

    for (const jsonFile of jsonFiles) {
      const jsonPath = path.join(dirPath, jsonFile);
      try {
        const snapshot = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Load companion HTML — it can be large but we cache it on the object
        let htmlContent = '';
        if (snapshot.html_file) {
          const htmlPath = path.join(ROOT, snapshot.html_file);
          if (fs.existsSync(htmlPath)) {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
          }
        }

        snapshots.push({
          tech:        snapshot.technology,
          url:         snapshot.url,
          snapshot,
          htmlContent,
        });
      } catch (err) {
        if (verbose) console.warn(`  ✗ could not load ${jsonPath}: ${err.message}`);
      }
    }
  }

  return snapshots;
}

// ─── Pattern matching ─────────────────────────────────────────────────────────

/**
 * Strip WebAppAnalyzer capture-group extensions before compiling a regex.
 * e.g. "3\.(\d+)\;version:\1" → "3\.(\d+)"
 */
function stripWAExtensions(p) {
  return p
    .replace(/\\;version:[^\\]*/g, '')
    .replace(/\\;confidence:\d+/g, '')
    .trim();
}

/**
 * Split a key=value pattern (used for headers/js/cookies/meta).
 * Split only on the first '=' so value regexes can contain '='.
 */
function splitKV(p) {
  const idx = p.indexOf('=');
  if (idx === -1) return { key: p, valPattern: '' };
  return { key: p.slice(0, idx), valPattern: p.slice(idx + 1) };
}

function testPattern(field, rawPattern, evidence, htmlContent) {
  try {
    const p = stripWAExtensions(rawPattern);
    if (!p) return false;

    switch (field) {

      case 'html': {
        return new RegExp(p, 'i').test(htmlContent || '');
      }

      case 'scripts': {
        const re  = new RegExp(p, 'i');
        const srcs = (evidence.scripts || []).map(s =>
          typeof s === 'string' ? s : (s.src || '')
        );
        return srcs.some(src => re.test(src));
      }

      case 'headers': {
        const { key, valPattern } = splitKV(p);
        const headers  = evidence.headers || {};
        const matchKey = Object.keys(headers).find(k =>
          k.toLowerCase() === key.toLowerCase()
        );
        if (!matchKey) return false;
        if (!valPattern) return true;
        return new RegExp(valPattern, 'i').test(String(headers[matchKey] ?? ''));
      }

      case 'js': {
        const { key, valPattern } = splitKV(p);
        const jsObjects = (evidence.dom && evidence.dom.jsObjects) || {};

        // Primary: direct jsObjects lookup
        if (Object.prototype.hasOwnProperty.call(jsObjects, key)) {
          if (!valPattern) return true;
          return new RegExp(valPattern, 'i').test(String(jsObjects[key] ?? ''));
        }

        // Fallback: scan HTML for the identifier (mirrors detechtor.js behaviour)
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('\\b' + escaped + '\\b', 'i').test(htmlContent || '');
      }

      case 'cookies': {
        const { key, valPattern } = splitKV(p);
        const nameRe = new RegExp(key, 'i');
        return (evidence.cookies || []).some(c => {
          if (!nameRe.test(c.name || '')) return false;
          if (!valPattern) return true;
          return new RegExp(valPattern, 'i').test(c.value || '');
        });
      }

      case 'meta': {
        const { key, valPattern } = splitKV(p);
        const meta     = evidence.meta || {};
        const matchKey = Object.keys(meta).find(k =>
          k.toLowerCase() === key.toLowerCase()
        );
        if (!matchKey) return false;
        if (!valPattern) return true;
        return new RegExp(valPattern, 'i').test(String(meta[matchKey] ?? ''));
      }

      default:
        return false;
    }
  } catch {
    return false; // invalid regex — treat as non-matching
  }
}

// ─── Normalise tech names for comparison ─────────────────────────────────────

function normTech(name) {
  return (name || '').toLowerCase().trim();
}

// ─── Validation pass ──────────────────────────────────────────────────────────

function validatePatterns(rows, snapshots) {
  // Group snapshots by normalised tech name
  const byTech = new Map();
  for (const s of snapshots) {
    const key = normTech(s.tech);
    if (!byTech.has(key)) byTech.set(key, []);
    byTech.get(key).push(s);
  }

  const counts = { verified: 0, suspect: 0, falsePositive: 0, needsReview: 0, noEvidence: 0 };

  for (const row of rows) {
    if (techFilter && row.technology !== techFilter) continue;

    // Preserve manual status edits — only overwrite auto-set values
    if (!force && !AUTO_STATUSES.has(row.status)) continue;

    const techKey           = normTech(row.technology);
    const correctSnapshots  = byTech.get(techKey) || [];
    const wrongSnapshots    = snapshots.filter(s => normTech(s.tech) !== techKey);

    if (correctSnapshots.length === 0) {
      if (!row.status) row.status = 'no-evidence';
      counts.noEvidence++;
      continue;
    }

    // Test against correct-tech snapshots
    const correctHits = [];
    for (const { snapshot, htmlContent } of correctSnapshots) {
      if (testPattern(row.field, row.pattern, snapshot.evidence, htmlContent)) {
        correctHits.push(snapshot.url);
      }
    }

    // Test against wrong-tech snapshots (false positive check)
    const wrongHits = [];
    for (const { snapshot, htmlContent } of wrongSnapshots) {
      if (testPattern(row.field, row.pattern, snapshot.evidence, htmlContent)) {
        wrongHits.push(`${snapshot.technology}@${snapshot.url}`);
      }
    }

    const fires        = correctHits.length > 0;
    const hasFalseHits = wrongHits.length > 0;

    if (fires && hasFalseHits) {
      row.status = 'needs-review';
      counts.needsReview++;
    } else if (fires) {
      row.status = 'verified';
      counts.verified++;
    } else if (hasFalseHits) {
      row.status = 'false-positive';
      counts.falsePositive++;
    } else {
      row.status = 'suspect';
      counts.suspect++;
    }

    // source_evidence: record first correct hit (don't overwrite manual citations)
    if (correctHits.length > 0 && (!row.source_evidence || force)) {
      row.source_evidence = correctHits[0];
    }

    // notes: append FP info when it fires on wrong snapshots
    if (hasFalseHits) {
      const fpNote = 'FP on: ' + wrongHits.slice(0, 2).map(h => h.split('@')[0]).join(', ')
        + (wrongHits.length > 2 ? ` +${wrongHits.length - 2}` : '');
      if (!row.notes) {
        row.notes = fpNote;
      } else if (!row.notes.includes('FP on:')) {
        row.notes = row.notes + ' | ' + fpNote;
      }
    }

    if (verbose) {
      const icon = row.status === 'verified' ? '✓'
        : row.status === 'needs-review'  ? '△'
        : row.status === 'false-positive' ? '⚠'
        : '✗';
      console.log(`  ${icon} [${row.field}] ${row.technology}: ${String(row.pattern).slice(0, 60)}`);
    }
  }

  return counts;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function generateReport(rows, meta) {
  const date = new Date().toISOString().slice(0, 10);

  const total = rows.filter(r => !techFilter || r.technology === techFilter).length;

  function count(status) {
    return rows.filter(r =>
      r.status === status && (!techFilter || r.technology === techFilter)
    ).length;
  }

  function pct(n) {
    return total ? Math.round(100 * n / total) : 0;
  }

  const verified    = count('verified');
  const suspect     = count('suspect');
  const fp          = count('false-positive');
  const review      = count('needs-review');
  const noEvidence  = count('no-evidence');

  const lines = [];

  lines.push(`# Pattern Validation Report`);
  lines.push(``);
  lines.push(`Generated: ${date}  `);
  lines.push(`Evidence snapshots: ${meta.snapshotCount} across ${meta.techCount} technologies  `);
  lines.push(`Patterns evaluated: ${total}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Status | Count | % |`);
  lines.push(`|--------|------:|--:|`);
  lines.push(`| ✅ Verified | ${verified} | ${pct(verified)}% |`);
  lines.push(`| 🔍 Needs review (verified + FP hits) | ${review} | ${pct(review)}% |`);
  lines.push(`| ❓ Suspect (never fires) | ${suspect} | ${pct(suspect)}% |`);
  lines.push(`| ⚠️ False positive (fires only on wrong tech) | ${fp} | ${pct(fp)}% |`);
  lines.push(`| ⬜ No evidence captured | ${noEvidence} | ${pct(noEvidence)}% |`);
  lines.push(`| **Total** | **${total}** | |`);
  lines.push(``);
  lines.push(`> **Suspect** patterns may be valid but untested — re-run after expanding the reference-site ledger.`);
  lines.push(`> **Needs review** patterns fire on both correct and incorrect sites — inspect the FP hits in the ledger.`);
  lines.push(``);

  // Per-file sections
  const byFile = new Map();
  for (const row of rows) {
    if (techFilter && row.technology !== techFilter) continue;
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file).push(row);
  }

  for (const [file, fileRows] of [...byFile.entries()].sort()) {
    const fVerified  = fileRows.filter(r => r.status === 'verified').length;
    const fReview    = fileRows.filter(r => r.status === 'needs-review').length;
    const fSuspect   = fileRows.filter(r => r.status === 'suspect').length;
    const fFP        = fileRows.filter(r => r.status === 'false-positive').length;
    const fNoEv      = fileRows.filter(r => r.status === 'no-evidence').length;

    // Group by technology
    const techGroups = {};
    for (const row of fileRows) {
      if (!techGroups[row.technology]) techGroups[row.technology] = [];
      techGroups[row.technology].push(row);
    }

    lines.push(`## ${file}`);
    lines.push(``);
    lines.push(`${Object.keys(techGroups).length} technologies · ${fileRows.length} patterns · ` +
      `${fVerified} verified · ${fReview} needs-review · ${fSuspect} suspect · ${fFP} false-positive · ${fNoEv} no-evidence`);
    lines.push(``);
    lines.push(`| Technology | Total | Verified | Review | Suspect | FP | No Evidence |`);
    lines.push(`|------------|------:|---------:|-------:|--------:|---:|------------:|`);

    for (const [tech, techRows] of Object.entries(techGroups).sort()) {
      const v  = techRows.filter(r => r.status === 'verified').length;
      const rv = techRows.filter(r => r.status === 'needs-review').length;
      const s  = techRows.filter(r => r.status === 'suspect').length;
      const fp = techRows.filter(r => r.status === 'false-positive').length;
      const ne = techRows.filter(r => r.status === 'no-evidence').length;
      lines.push(`| ${tech} | ${techRows.length} | ${v} | ${rv} | ${s} | ${fp} | ${ne} |`);
    }

    lines.push(``);

    // Patterns needing attention
    const attn = fileRows.filter(r =>
      r.status === 'suspect' || r.status === 'false-positive' || r.status === 'needs-review'
    );

    if (attn.length > 0) {
      lines.push(`### Patterns needing attention`);
      lines.push(``);
      for (const row of attn) {
        const icon = row.status === 'false-positive' ? '⚠️'
          : row.status === 'needs-review' ? '🔍'
          : '❓';
        const noteStr = row.notes ? ` — _${row.notes}_` : '';
        lines.push(`- ${icon} **${row.technology}** \`[${row.field}]\` \`${row.pattern}\` — ${row.status}${noteStr}`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('\ndeTECHtor Phase 4 — Pattern Validation');

  // Load ledger
  if (!fs.existsSync(LEDGER_PATH)) {
    console.error('Ledger not found:', LEDGER_PATH);
    console.error('Run: node scripts/generate-validation-ledger.js first');
    process.exit(1);
  }

  const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
  const { headers, rows } = parseCSV(raw);
  const filterLabel = techFilter ? ` (filtered to: ${techFilter})` : '';
  console.log(`  ${rows.length} patterns loaded${filterLabel}`);

  let snapshotCount = 0;
  let techCount     = 0;
  let counts        = { verified: 0, suspect: 0, falsePositive: 0, needsReview: 0, noEvidence: 0 };

  if (!reportOnly) {
    // Load evidence
    console.log('\nLoading evidence snapshots…');
    const snapshots = loadEvidence();
    snapshotCount = snapshots.length;
    techCount     = new Set(snapshots.map(s => normTech(s.tech))).size;
    console.log(`  ${snapshotCount} snapshots · ${techCount} technologies`);

    if (snapshotCount === 0) {
      console.error('No evidence found. Run capture-evidence first.');
      process.exit(1);
    }

    // Validate
    console.log('\nValidating patterns…');
    counts = validatePatterns(rows, snapshots);

    // Write updated ledger
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      csvLines.push(rowToCSV(row, headers));
    }
    fs.writeFileSync(LEDGER_PATH, csvLines.join('\n') + '\n', 'utf8');
    console.log(`\n  Ledger updated: docs/pattern-validation-ledger.csv`);
  } else {
    // report-only: derive counts from existing ledger
    for (const row of rows) {
      if (techFilter && row.technology !== techFilter) continue;
      counts.verified    += row.status === 'verified'       ? 1 : 0;
      counts.needsReview += row.status === 'needs-review'   ? 1 : 0;
      counts.suspect     += row.status === 'suspect'        ? 1 : 0;
      counts.falsePositive += row.status === 'false-positive' ? 1 : 0;
      counts.noEvidence  += row.status === 'no-evidence'    ? 1 : 0;
    }
  }

  // Write report
  const report = generateReport(rows, { snapshotCount, techCount });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`  Report written: docs/PATTERN_VALIDATION_REPORT.md`);

  console.log(`\n─── Summary ─────────────────────────────────`);
  console.log(`  Verified       : ${counts.verified}`);
  console.log(`  Needs review   : ${counts.needsReview}  (verified + fires on wrong tech)`);
  console.log(`  Suspect        : ${counts.suspect}  (never fired)`);
  console.log(`  False positive : ${counts.falsePositive}  (fires only on wrong tech)`);
  console.log(`  No evidence    : ${counts.noEvidence}`);
}

main();
