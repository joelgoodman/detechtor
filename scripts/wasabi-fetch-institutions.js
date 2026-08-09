#!/usr/bin/env node
// scripts/wasabi-fetch-institutions.js — pull ALL archived pages for specific institutions.
//
// wasabi-corpus.js takes a manifest of exact content_archive_keys (one homepage per institution).
// For fingerprint mining we want every archived page of a named set of institutions, so this lists
// Wasabi by the `content/{institution_id}/` prefix instead of going back to the database.
//
// Usage: CORPUS_DIR=corpus-t4 node scripts/wasabi-fetch-institutions.js 1321 2153 478 ...
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const BUCKET = process.env.WASABI_BUCKET || 'benchmark-scans';
const ENDPOINT = process.env.WASABI_ENDPOINT || 'https://s3.eu-west-3.wasabisys.com';
const REGION = (ENDPOINT.match(/s3\.([a-z0-9-]+)\.wasabisys/) || [, 'eu-west-3'])[1];
const CORPUS_DIR = process.env.CORPUS_DIR || path.resolve(__dirname, '../corpus-extra');

if (!process.env.WASABI_ACCESS_KEY || !process.env.WASABI_SECRET_KEY) {
  console.error('FATAL: WASABI_ACCESS_KEY / WASABI_SECRET_KEY not set'); process.exit(1);
}

const s3 = new S3Client({
  region: REGION, endpoint: ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.WASABI_ACCESS_KEY, secretAccessKey: process.env.WASABI_SECRET_KEY },
});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function listAll(prefix) {
  const keys = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents || []) if (o.Key.endsWith('.html.gz')) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error('usage: wasabi-fetch-institutions.js <institution_id> ...'); process.exit(1); }
  const index = {};
  let ok = 0, miss = 0;
  for (const id of ids) {
    let keys = [];
    try {
      keys = await listAll(`content/${id}/`);
    } catch (e) {
      console.error(`list failed for ${id}: ${e.name}`); continue;
    }
    for (const key of keys) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const html = zlib.gunzipSync(await streamToBuffer(res.Body)).toString('utf8');
        const dir = path.join(CORPUS_DIR, String(id));
        fs.mkdirSync(dir, { recursive: true });
        const name = key.split('/').slice(-2).join('__');
        const p = path.join(dir, name.replace(/\.gz$/, ''));
        fs.writeFileSync(p, html);
        (index[id] ||= []).push(p);
        ok++;
      } catch (e) { miss++; console.error(`miss ${key}: ${e.name}`); }
    }
    console.log(`${id}: ${keys.length} keys`);
  }
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CORPUS_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`fetched ${ok}, missed ${miss}, institutions ${Object.keys(index).length}`);
}
main();
