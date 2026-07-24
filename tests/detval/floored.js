const fs=require('fs'),path=require('path'),DIR=__dirname;
const FLOOR=parseInt(process.argv[2]||'50');
const BIG=['CMS','LMS','SIS','CRM','Chatbot','Site Search','Accessibility','Marketing Automation'];
const load=(id,m)=>{const p=path.join(DIR,`${id}-${m}.json`);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;};
const floored=r=>(r.technologies||[]).filter(t=>(t.confidence||0)>=FLOOR);
const names=r=>new Set(floored(r).map(t=>t.name));
const cats=r=>{const s=new Set();floored(r).forEach(t=>(t.categories||[]).forEach(c=>s.add(c)));return s;};
const hasBig=(cs,b)=>[...cs].some(c=>c.toLowerCase().includes(b.toLowerCase()));
const ids=fs.readdirSync(DIR).filter(f=>f.endsWith('-off.json')).map(f=>f.replace('-off.json','')).filter(id=>load(id,'on'));
let totOff=0,totOn=0,ret=0;const big={};BIG.forEach(b=>big[b]={o:0,both:0,onOnly:0});
for(const id of ids){const off=load(id,'off'),on=load(id,'on');const nOff=names(off),nOn=names(on);
  const inter=[...nOff].filter(x=>nOn.has(x));totOff+=nOff.size;totOn+=nOn.size;ret+=inter.length;
  const cO=cats(off),cN=cats(on);BIG.forEach(b=>{const o=hasBig(cO,b),n=hasBig(cN,b);if(o){big[b].o++;if(n)big[b].both++;}if(n&&!o)big[b].onOnly++;});}
console.log(`=== FLOOR=${FLOOR} (${ids.length} institutions) ===`);
console.log(`Total floored techs: OFF=${totOff}  ON=${totOn}`);
console.log(`Name recall: ${ret}/${totOff} = ${(100*ret/(totOff||1)).toFixed(1)}%`);
console.log('Big-signal recall (OFF-had -> ON-kept):');
BIG.forEach(b=>{const s=big[b];if(s.o||s.onOnly)console.log(`  ${b.padEnd(14)} ${s.both}/${s.o} = ${s.o?(100*s.both/s.o).toFixed(0):'-'}%   ON-only=${s.onOnly}`);});
