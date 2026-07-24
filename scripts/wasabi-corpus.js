#!/usr/bin/env node
// scripts/wasabi-corpus.js — fetch cohort-128 rendered HTML from Wasabi by content_archive_key.
// Keys look like: content/{institution_id}/{slug}/{sha12}.html.gz  (gzipped raw HTML)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.WASABI_BUCKET || 'benchmark-scans';
const ENDPOINT = process.env.WASABI_ENDPOINT || 'https://s3.eu-west-3.wasabisys.com';
const REGION = (ENDPOINT.match(/s3\.([a-z0-9-]+)\.wasabisys/) || [, 'eu-west-3'])[1];
const CORPUS_DIR = process.env.CORPUS_DIR || path.resolve(__dirname, '../corpus');

const s3 = new S3Client({
  region: REGION, endpoint: ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.WASABI_ACCESS_KEY, secretAccessKey: process.env.WASABI_SECRET_KEY },
});

const CONCURRENCY = Number(process.env.WASABI_CONCURRENCY) || 8;

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

// Simple bounded-concurrency promise pool: runs `worker` over `items` with at most
// `limit` in flight at a time. No dependency — just a shared cursor + N runner loops.
async function pooledForEach(items, limit, worker) {
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
}

async function main() {
  if (!process.env.WASABI_ACCESS_KEY || !process.env.WASABI_SECRET_KEY) {
    console.error('FATAL: WASABI_ACCESS_KEY / WASABI_SECRET_KEY not set'); process.exit(1); // fail loud, no fallback
  }
  const manifestPath = process.argv[2];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const index = {};
  let ok = 0, miss = 0;
  await pooledForEach(manifest, CONCURRENCY, async ({ institution_id, content_archive_key }) => {
    if (!content_archive_key) { miss++; return; }
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: content_archive_key }));
      const gz = await streamToBuffer(res.Body);
      const html = zlib.gunzipSync(gz).toString('utf8');
      const match = content_archive_key.match(/([0-9a-f]{12})\.html\.gz$/);
      if (!match) console.error(`WARN: content_archive_key did not match {sha12}.html.gz pattern, using 'nohash' (may overwrite a prior file): ${content_archive_key}`);
      const sha12 = match ? match[1] : 'nohash';
      const dir = path.join(CORPUS_DIR, String(institution_id));
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, `${sha12}.html`);
      fs.writeFileSync(p, html);
      (index[institution_id] ||= []).push(p);
      ok++;
    } catch (e) { miss++; console.error(`miss ${content_archive_key}: ${e.name}`); }
  });
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CORPUS_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`fetched ${ok}, missed ${miss}, institutions ${Object.keys(index).length}`);
}
main();
