#!/usr/bin/env node
/**
 * Build the committed negative-corpus fixture of real `<script src>` values
 * =========================================================================
 * Input: the full harvest TSV (one line per distinct normalised script URL of the archived corpus,
 *     <registrable domain>\t<institutions>\t<first-party 0|1>\t<raw src>
 * built from the cohort-143 page archive by the 2026-11 detection review; it lives outside this repo,
 * in speedyu-data, because it is 26 MB). Output: tests/fixtures/negcorpus/script-urls.tsv.gz, read by
 * scripts/lint-script-negcorpus.js.
 *
 * Reduction (verdict-preserving for the gate, which counts DISTINCT registrable domains per rule):
 *   third-party rows  one group per (registrable domain, normalised path without query); keep the
 *                     shortest example and, when different, the one with the longest query
 *   first-party rows  one group per normalised path ACROSS institutions; keep at most CAP domains
 *                     (a rule that fails at K still fails as long as CAP > K)
 *
 * Sanitisation (the repo is public; the fixture holds script URLs only, never page content):
 *   - every query value is replaced by `x` unless it is a plain lowercase word list (letters, `-`,
 *     `_`, `.`, `/`, `,` only; at most 40 characters) AND its parameter name is not secret-shaped
 *     (key, token, secret, sig, auth, session, password, client/org/account ids ...). Words survive
 *     because rules match words (`workforce` in a query is exactly the 135 defect class); keys,
 *     ids and encoded URLs do not.
 *   - a path or fragment run of 20+ characters mixing letters and digits (tokens, hashes, tenant
 *     ids) becomes `REDACTED`
 *   - userinfo (`user:pass@`) and anything shaped like an email address is removed
 *
 * Usage: node scripts/build-script-url-fixture.js <full.tsv> [--cap N] [--out FILE]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const input = argv[0];
if (!input || input.startsWith('--')) {
  console.error('usage: node scripts/build-script-url-fixture.js <full.tsv> [--cap N] [--out FILE]');
  process.exit(2);
}
const CAP = Number(arg('--cap', 4));
const OUT = path.resolve(arg('--out', path.join(__dirname, '../tests/fixtures/negcorpus/script-urls.tsv.gz')));

const SECRET_PARAM = /(key|token|secret|sig|signature|auth|session|sess|sid|pass|pwd|password|hash|nonce|client|org|account|acct|user|uid|email|mail|id)$/i;
const WORDY = /^[a-z][a-z._\/,-]{0,39}$/;

function sanitize(src) {
  let s = String(src);
  // userinfo and email-shaped strings
  s = s.replace(/^(\s*(?:[a-z][a-z0-9+.-]*:)?\/\/)[^\/?#@]*@/i, '$1');
  s = s.replace(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi, 'REDACTED');
  const hashAt = s.indexOf('#');
  const qAt = s.indexOf('?');
  const qEnd = hashAt === -1 ? s.length : hashAt;
  let head = qAt === -1 || qAt > qEnd ? s.slice(0, qEnd) : s.slice(0, qAt);
  let query = qAt === -1 || qAt > qEnd ? '' : s.slice(qAt + 1, qEnd);
  let frag = hashAt === -1 ? '' : s.slice(hashAt + 1);
  // keep the host untouched; redact token-like runs in the path
  const hm = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\/[^\/]*/i.exec(head);
  const host = hm ? hm[0] : '';
  const redactRuns = (t) => t.replace(/[A-Za-z0-9_-]{20,}/g, (run) => (/[0-9]/.test(run) && /[A-Za-z]/.test(run) ? 'REDACTED' : run));
  head = host + redactRuns(head.slice(host.length));
  if (query) {
    query = query.split('&').map((kv) => {
      const eq = kv.indexOf('=');
      if (eq === -1) return WORDY.test(kv) ? kv : 'x';
      const k = kv.slice(0, eq), v = kv.slice(eq + 1);
      const keep = v === '' || (WORDY.test(v) && !SECRET_PARAM.test(k));
      return `${/^[A-Za-z0-9_.\-[\]]{1,40}$/.test(k) ? k : 'x'}=${keep ? v : 'x'}`;
    }).join('&');
  }
  frag = frag ? redactRuns(frag) : '';
  return head + (qAt !== -1 && qAt < qEnd ? '?' + query : '') + (hashAt !== -1 ? '#' + frag : '');
}

const rows = fs.readFileSync(input, 'utf8').split('\n').filter(Boolean).map((l) => {
  const p = l.split('\t');
  return { d: p[0], n: Number(p[1]), fp: p[2] === '1', src: sanitize(p.slice(3).join('\t')) };
});
const stripHost = (s) => s.replace(/^\s*(?:[a-z][a-z0-9+.-]*:)?\/{2,}[^\/?#]+/i, '');
const normPath = (s) => stripHost(s).split(/[?#]/)[0].replace(/[0-9a-f]{8,}/gi, '#').replace(/\d{2,}/g, '#').toLowerCase();
const tp = new Map();
const fp = new Map();
for (const r of rows) {
  if (!r.fp) {
    const k = r.d + '\t' + normPath(r.src);
    const g = tp.get(k) || { short: r, long: r, n: 0 };
    g.n += r.n;
    if (r.src.length < g.short.src.length) g.short = r;
    if ((r.src.split('?')[1] || '').length > (g.long.src.split('?')[1] || '').length) g.long = r;
    tp.set(k, g);
  } else {
    const k = normPath(r.src);
    const g = fp.get(k) || new Map();
    if (!g.has(r.d) || r.src.length < g.get(r.d).src.length) g.set(r.d, r);
    fp.set(k, g);
  }
}
const out = [];
for (const g of tp.values()) {
  out.push({ ...g.short, n: g.n });
  if (g.long.src !== g.short.src) out.push({ ...g.long, n: g.n });
}
for (const g of fp.values()) {
  for (const r of [...g.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(0, CAP)) out.push(r);
}
const seen = new Set();
const lines = out
  .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.src < b.src ? -1 : a.src > b.src ? 1 : 0))
  .map((x) => `${x.d}\t${x.n}\t${x.fp ? 1 : 0}\t${x.src.slice(0, 300).replace(/[\t\n\r]/g, ' ')}`)
  .filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
const tsv = lines.join('\n') + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// mtime 0 in the gzip header keeps a rebuild byte-identical
fs.writeFileSync(OUT, zlib.gzipSync(tsv, { level: 9 }));
console.log(JSON.stringify({ rowsIn: rows.length, rowsOut: lines.length, cap: CAP,
  domains: new Set(lines.map((l) => l.split('\t')[0])).size, tsvMB: +(tsv.length / 1e6).toFixed(2),
  gzKB: Math.round(fs.statSync(OUT).size / 1e3), out: path.relative(process.cwd(), OUT) }));
