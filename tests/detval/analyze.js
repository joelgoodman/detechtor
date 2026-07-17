#!/usr/bin/env node
// UNI-145 validation analyzer: compare deTECHtor --skip-crawl OFF vs ON.
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

// Big signals we care about (per detechtor-signal-strategy). Match case-insensitively
// against tech.categories entries.
const BIG = ['CMS', 'LMS', 'SIS', 'CRM', 'Chatbot', 'Site Search', 'Accessibility', 'Marketing Automation'];

function load(id, mode) {
  const p = path.join(DIR, `${id}-${mode}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function techNames(r) { return new Set((r.technologies || []).map(t => t.name)); }
function cats(r) {
  const s = new Set();
  (r.technologies || []).forEach(t => (t.categories || []).forEach(c => s.add(c)));
  return s;
}
function hasBig(catSet, big) {
  for (const c of catSet) if (c.toLowerCase().includes(big.toLowerCase())) return true;
  return false;
}

const ids = fs.readdirSync(DIR).filter(f => f.endsWith('-off.json')).map(f => f.replace('-off.json',''));
let rows = [], totOff=0, totOn=0, retained=0, lost=0, gained=0;
let durOff=[], durOn=[], missingOff=0, missingOn=0;
const bigStats = {}; BIG.forEach(b => bigStats[b] = {offHas:0, bothHas:0, onOnly:0});
const cmsLosses = [], cmsGains = [];

for (const id of ids) {
  const off = load(id,'off'), on = load(id,'on');
  if (!off) { missingOff++; }
  if (!on) { missingOn++; }
  if (!off || !on) { rows.push({id, note: !off && !on ? 'BOTH missing' : !off ? 'OFF timeout/miss' : 'ON timeout/miss'}); continue; }
  const nOff = techNames(off), nOn = techNames(on);
  const inter = [...nOff].filter(x => nOn.has(x));
  const lostNames = [...nOff].filter(x => !nOn.has(x));
  const gainNames = [...nOn].filter(x => !nOff.has(x));
  totOff += nOff.size; totOn += nOn.size; retained += inter.length; lost += lostNames.length; gained += gainNames.length;
  durOff.push(off.meta.scanDuration); durOn.push(on.meta.scanDuration);
  const cOff = cats(off), cOn = cats(on);
  BIG.forEach(b => {
    const o = hasBig(cOff,b), n = hasBig(cOn,b);
    if (o) { bigStats[b].offHas++; if (n) bigStats[b].bothHas++; }
    if (n && !o) bigStats[b].onOnly++;
  });
  // CMS name-level deltas
  const cmsOff = (off.technologies||[]).filter(t=>(t.categories||[]).some(c=>c.toLowerCase()==='cms')).map(t=>t.name);
  const cmsOn  = (on.technologies||[]).filter(t=>(t.categories||[]).some(c=>c.toLowerCase()==='cms')).map(t=>t.name);
  cmsOff.filter(x=>!cmsOn.includes(x)).forEach(x=>cmsLosses.push(`${id}:${x}`));
  cmsOn.filter(x=>!cmsOff.includes(x)).forEach(x=>cmsGains.push(`${id}:${x}`));
  rows.push({id, off:nOff.size, on:nOn.size, retained:inter.length, lost:lostNames.length, gained:gainNames.length,
             dOff:off.meta.scanDuration, dOn:on.meta.scanDuration, pOff:off.scannedPages, pOn:on.scannedPages,
             lostNames: lostNames.slice(0,6).join(',')});
}
const med = a => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.floor(s.length/2)]:0; };
const sum = a => a.reduce((x,y)=>x+y,0);

console.log('=== PER-INSTITUTION ===');
rows.forEach(r => r.note ? console.log(`  id=${r.id}  ${r.note}`)
  : console.log(`  id=${r.id.padStart(2)}  off=${r.off} on=${r.on} retained=${r.retained} lost=${r.lost} gained=${r.gained}  |  ${r.dOff}ms->${r.dOn}ms  pages ${r.pOff}->${r.pOn}${r.lost?'  LOST['+r.lostNames+']':''}`));
console.log('\n=== AGGREGATE (' + durOff.length + ' institutions with both runs) ===');
console.log(`  Total techs:  OFF=${totOff}  ON=${totOn}`);
console.log(`  Name recall:  retained ${retained}/${totOff} = ${(100*retained/(totOff||1)).toFixed(1)}%  | lost ${lost} | gained-by-ON ${gained}`);
console.log(`  Speed:        OFF median ${med(durOff)}ms / mean ${Math.round(sum(durOff)/durOff.length)}ms  ->  ON median ${med(durOn)}ms / mean ${Math.round(sum(durOn)/durOn.length)}ms`);
console.log(`  Speedup:      ${(sum(durOff)/(sum(durOn)||1)).toFixed(2)}x faster (total wall), ${(med(durOff)/(med(durOn)||1)).toFixed(2)}x median`);
console.log(`  Missing/timeout: OFF=${missingOff}  ON=${missingOn}`);
console.log('\n=== BIG-SIGNAL CATEGORY RECALL (institutions where OFF detected it -> ON also did) ===');
BIG.forEach(b => { const s=bigStats[b]; if (s.offHas||s.onOnly) console.log(`  ${b.padEnd(20)} OFF-had=${s.offHas}  ON-kept=${s.bothHas}  (recall ${s.offHas?(100*s.bothHas/s.offHas).toFixed(0):'-'}%)  ON-only=${s.onOnly}`); });
console.log('\n=== CMS name-level ===');
console.log('  Lost by ON (OFF found, ON missed):', cmsLosses.length ? cmsLosses.join('  ') : 'NONE');
console.log('  Gained by ON (ON found, OFF missed):', cmsGains.length ? cmsGains.join('  ') : 'NONE');
