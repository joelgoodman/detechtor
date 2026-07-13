#!/usr/bin/env node
/**
 * Manual smoke test for UNI-140 runtime network capture.
 *   node scripts/test-network-capture.js [url ...]
 * Confirms evidence.networkHosts populates and that a `network` pattern (Algolia/
 * Swiftype) fires when the vendor's API host is requested at load. Needs Chrome.
 * NOTE: catches LOAD-TIME requests only — vendors that call their API solely on
 * user interaction (e.g. Algolia DocSearch on first keystroke) won't appear in a
 * passive scan; those need an interaction-driven test.
 */
'use strict';
const DeTECHtor = require('../src/detechtor');

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://www.algolia.com', 'https://example.com'];

(async () => {
  const d = new DeTECHtor({ captureNetwork: true, networkSettleMs: 3500 });
  await d.initialize();
  for (const url of urls) {
    const page = await d.browser.newPage();
    try {
      const r = await d.scanSinglePage(page, url);
      const hosts = r.networkHosts || [];
      const interesting = hosts.filter(h => /algolia|swiftype|google|segment|cloudfront|typekit|salesforce/i.test(h));
      const netTech = (r.technologies || []).filter(t => (t.evidence || []).some(e => /^Network:/.test(e)));
      console.log(`\n== ${url} ==`);
      console.log(`  networkHosts: ${hosts.length} total; interesting: ${interesting.slice(0, 10).join(', ') || '(none)'}`);
      console.log(`  algolia host seen: ${hosts.some(h => /algolia/i.test(h))}`);
      console.log(`  tech via Network evidence: ${netTech.map(t => `${t.name} ${JSON.stringify(t.evidence.filter(e => /Network/.test(e)))}`).join('; ') || '(none)'}`);
    } catch (e) {
      console.log(`\n== ${url} ==\n  ERR: ${e.message}`);
    } finally {
      await page.close();
    }
  }
  await d.shutdown();
})().catch(e => { console.error(e); process.exit(1); });
