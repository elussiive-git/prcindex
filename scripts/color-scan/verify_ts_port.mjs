// Сверка TS-сканера (src/color-scan.ts) с Python (scan_colors.py) на одинаковых пикселях.
// Подготовка: python3 ref_python.py (эталон + сырые RGBA в rgba/), tsc src/color-scan.ts --outDir js, затем node verify_ts_port.mjs.
// Результат 24.11.2026: 492 из 492 полностью совпали (цвета, доли, статус, тип палитры, фон, флаги).
import fs from 'node:fs';
import { analyseRgba } from './js/color-scan.js';
const ref = JSON.parse(fs.readFileSync('ref.json','utf8'));
let same=0, diffV1=0, diffAny=[], famDiff=0, shareMax=0;
for (const r of ref) {
  const buf = fs.readFileSync(`rgba/${r.idx}.bin`);
  const res = analyseRgba(new Uint8Array(buf), r.w, r.h, r.src);
  const a=r.res, b=res;
  const keyA = JSON.stringify([a.color_v1,a.status,a.palette_type,a.plate,a.background,(a.colors||[]).map(c=>[c.family,c.hex])]);
  const keyB = JSON.stringify([b.color_v1,b.status,b.palette_type,b.plate,b.background,(b.colors||[]).map(c=>[c.family,c.hex])]);
  if (a.color_v1!==b.color_v1) diffV1++;
  if (JSON.stringify(a.family_share)!==JSON.stringify(b.family_share)) famDiff++;
  for (let i=0;i<Math.min((a.colors||[]).length,(b.colors||[]).length);i++) shareMax=Math.max(shareMax,Math.abs(a.colors[i].share-b.colors[i].share));
  if (keyA===keyB && JSON.stringify(a.flags)===JSON.stringify(b.flags)) same++; else diffAny.push({idx:r.idx,file:r.file,A:keyA,B:keyB,fa:a.flags,fb:b.flags});
}
console.log({n:ref.length, identical:same, color_v1_diff:diffV1, family_share_diff:famDiff, max_share_delta:shareMax});
for (const d of diffAny.slice(0,6)) console.log(JSON.stringify(d).slice(0,700));
