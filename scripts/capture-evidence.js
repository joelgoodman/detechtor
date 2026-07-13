#!/usr/bin/env node

/**
 * Phase 3 Evidence Capture
 *
 * Reads docs/reference-site-ledger.csv, navigates to each reference URL with
 * Puppeteer, captures raw evidence (HTML, headers, scripts, meta, cookies, DOM
 * globals, probe-path responses), and writes the snapshot to:
 *
 *   tests/evidence/<tech-slug>/<host-slug>.json   — structured evidence
 *   tests/evidence/<tech-slug>/<host-slug>.html   — raw HTML (separate, can be large)
 *
 * Also runs config.probePaths against each unique domain to surface admin/API
 * endpoints that are never linked from public pages.
 *
 * Usage:
 *   node scripts/capture-evidence.js [options]
 *
 * Options:
 *   --tech <name>      Capture only the named technology (exact match, case-sensitive)
 *   --dry-run          Print what would be captured; do not navigate or write files
 *   --concurrency <n>  Max parallel captures (default: 2)
 *   --verbose          Extra logging
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const puppeteer = require('puppeteer');
const fsExtra   = require('fs-extra');
const config    = require('../src/config');
const DeTECHtor = require('../src/detechtor');

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const techFilter  = getArg(args, '--tech');
const dryRun      = args.includes('--dry-run');
const concurrency = parseInt(getArg(args, '--concurrency') || '2', 10);
const verbose     = args.includes('--verbose') || config.verbose;

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT         = path.resolve(__dirname, '..');
const LEDGER_PATH  = path.join(ROOT, 'docs', 'reference-site-ledger.csv');
const EVIDENCE_DIR = path.join(ROOT, 'tests', 'evidence');

// ─── CSV parser (no external deps) ───────────────────────────────────────────

function parseCSV(raw) {
  const lines = raw.trim().split('\n');
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').trim(); });
    return row;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
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

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function techSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hostSlug(url) {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname)
      .replace(/[^a-z0-9.]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 100);
  } catch {
    return url.replace(/[^a-z0-9]+/g, '-').slice(0, 100);
  }
}

// ─── Probe path checker (plain HTTP, no Puppeteer) ───────────────────────────

function probeUrl(url, timeoutMs = 8000) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => resolve({ status: 'timeout', body: '' }), timeoutMs);
    try {
      const req = mod.get(url, {
        headers: { 'User-Agent': config.userAgent },
        rejectUnauthorized: false,
      }, res => {
        clearTimeout(timer);
        let body = '';
        res.on('data', chunk => { if (body.length < 4096) body += chunk; });
        res.on('end', () => resolve({
          status: res.statusCode,
          finalUrl: res.headers.location || url,
          body: body.slice(0, 4096),
          headers: res.headers,
        }));
      });
      req.on('error', err => {
        clearTimeout(timer);
        resolve({ status: 'error', error: err.message, body: '' });
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        clearTimeout(timer);
        resolve({ status: 'timeout', body: '' });
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({ status: 'error', error: err.message, body: '' });
    }
  });
}

async function runProbePaths(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const results = {};
  for (const probePath of config.probePaths) {
    const target = origin + probePath;
    if (verbose) process.stdout.write(`  probe ${target} ... `);
    const res = await probeUrl(target);
    results[probePath] = {
      url: target,
      status: res.status,
      redirect_to: res.finalUrl !== target ? res.finalUrl : undefined,
      body_excerpt: res.body ? res.body.slice(0, 512) : undefined,
    };
    if (verbose) console.log(res.status);
  }
  return results;
}

// ─── Stealth page setup (mirrors detechtor.js) ───────────────────────────────

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(config.userAgent);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });
  await page.setViewport({ width: 1920, height: 1080 });
  return page;
}

// ─── Single URL capture ───────────────────────────────────────────────────────

async function captureUrl(detector, browser, tech, url, outDir) {
  const slug = hostSlug(url);
  const jsonPath = path.join(outDir, `${slug}.json`);
  const htmlPath = path.join(outDir, `${slug}.html`);

  if (verbose) console.log(`  → ${url}`);

  const page = await setupPage(browser);
  let evidence = null;
  let matched  = [];
  let status   = null;
  let finalUrl = url;

  try {
    const response = await page.goto(url, {
      waitUntil: config.waitUntil,
      timeout: config.timeout,
    });

    status   = response.status();
    finalUrl = response.url();

    // Use DeTECHtor's evidence collection (bypasses excludePaths check)
    evidence = await detector.collectEvidence(page, response);
    matched  = detector.matchPatterns(evidence);

  } catch (err) {
    console.warn(`    ✗ navigation failed: ${err.message}`);
    await page.close().catch(() => {});
    return { url, error: err.message };
  }

  await page.close();

  // Probe paths against this domain
  const probeResults = await runProbePaths(url);

  // Save HTML separately (can be large)
  if (evidence.html) {
    fsExtra.outputFileSync(htmlPath, evidence.html, 'utf8');
  }

  // Build snapshot (strip raw HTML — stored in .html file)
  const snapshot = {
    technology: tech,
    url,
    final_url: finalUrl,
    captured_at: new Date().toISOString(),
    response_status: status,
    html_file: path.relative(ROOT, htmlPath),
    evidence: {
      headers: evidence.headers,
      scripts: evidence.scripts,
      meta: evidence.meta,
      cookies: evidence.cookies.map(c => ({ name: c.name, value: c.value.slice(0, 64), domain: c.domain })),
      dom: evidence.dom,
      api_endpoints: evidence.apiEndpoints,
      version_info: evidence.versionInfo,
    },
    probe_results: probeResults,
    matched_patterns: matched.map(m => ({
      name: m.name,
      confidence: m.confidence,
      evidence: m.evidence,
    })),
    // Quick check: did the target tech itself fire?
    target_tech_matched: matched.some(
      m => m.name.toLowerCase() === tech.toLowerCase() && m.confidence >= config.minConfidence
    ),
  };

  fsExtra.outputJsonSync(jsonPath, snapshot, { spaces: 2 });

  const techMatched  = snapshot.target_tech_matched ? '✓' : '✗ missed';
  const topMatches   = matched.slice(0, 3).map(m => `${m.name}(${m.confidence})`).join(', ');
  console.log(`    ${techMatched}  top: ${topMatches || 'none'}`);

  return snapshot;
}

// ─── Concurrency queue ────────────────────────────────────────────────────────

async function runQueue(tasks, limit) {
  const results = [];
  const queue   = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load ledger
  const raw  = fs.readFileSync(LEDGER_PATH, 'utf8');
  const rows = parseCSV(raw);

  // Build work list: one entry per (tech, url) pair
  const work = [];
  for (const row of rows) {
    const tech = row.technology;
    if (techFilter && tech !== techFilter) continue;
    if (row.unverifiable_public === 'true') continue;

    for (const field of ['customer_url_1', 'customer_url_2', 'customer_url_3']) {
      const url = row[field];
      if (url) work.push({ tech, url, priority: row.priority });
    }
    // Include vendor demo url only if no customer urls exist
    const hasCustomer = ['customer_url_1', 'customer_url_2', 'customer_url_3']
      .some(f => row[f]);
    if (!hasCustomer && row.vendor_demo_url) {
      work.push({ tech, url: row.vendor_demo_url, priority: row.priority });
    }
  }

  // Sort: high priority first
  work.sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return  1;
    return 0;
  });

  console.log(`\ndeTECHtor Phase 3 — Evidence Capture`);
  console.log(`URLs to capture: ${work.length}${techFilter ? ` (filtered to: ${techFilter})` : ''}`);

  if (dryRun) {
    console.log('\nDRY RUN — would capture:');
    work.forEach(({ tech, url, priority }) =>
      console.log(`  [${priority}] ${tech}: ${url}`));
    return;
  }

  // Launch browser
  const browser   = await puppeteer.launch(config.browserOptions);
  const detector  = new DeTECHtor();

  const summary = { captured: 0, errors: 0, matched: 0, missed: 0 };

  try {
    const tasks = work.map(({ tech, url }) => async () => {
      const slug   = techSlug(tech);
      const outDir = path.join(EVIDENCE_DIR, slug);
      fsExtra.ensureDirSync(outDir);

      console.log(`\n[${tech}]`);
      const result = await captureUrl(detector, browser, tech, url, outDir);

      if (result.error) {
        summary.errors++;
      } else {
        summary.captured++;
        if (result.target_tech_matched) summary.matched++;
        else summary.missed++;
      }
      return result;
    });

    await runQueue(tasks, concurrency);

  } finally {
    await browser.close();
  }

  // Write summary manifest
  const manifestPath = path.join(EVIDENCE_DIR, 'capture-manifest.json');
  const existing = fsExtra.existsSync(manifestPath)
    ? fsExtra.readJsonSync(manifestPath)
    : { captures: [] };

  existing.last_run  = new Date().toISOString();
  existing.summary   = summary;
  fsExtra.outputJsonSync(manifestPath, existing, { spaces: 2 });

  console.log(`\n─── Summary ───────────────────────────────`);
  console.log(`  Captured : ${summary.captured}`);
  console.log(`  Matched  : ${summary.matched}  (target tech detected)`);
  console.log(`  Missed   : ${summary.missed}   (target tech not detected)`);
  console.log(`  Errors   : ${summary.errors}`);
  console.log(`  Output   : tests/evidence/`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
