import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "src/seed/registry-batch-001.json"), "utf8"));
const limit = Number(process.argv[2] || 100);
const rows = source.slice(0, limit);
const outDir = path.join(root, "public/registry-logos");
await fs.mkdir(outDir, { recursive: true });

const decode = (s) => s.replaceAll("&amp;", "&").replaceAll("\\/", "/");
function candidates(html, base) {
  const found = [];
  for (const match of html.matchAll(/(?:src|href|content)=["']([^"']+)["']/gi)) {
    const raw = decode(match[1]);
    if (!/(logo|brand|logotype)/i.test(raw) || /(favicon|apple-touch|sprite|loader)/i.test(raw)) continue;
    try {
      const url = new URL(raw, base);
      if (!/^https?:$/.test(url.protocol)) continue;
      const score = (/(logo)/i.test(raw) ? 5 : 0) + (/\.svg(?:\?|$)/i.test(raw) ? 4 : 0) + (/(header|brand)/i.test(raw) ? 2 : 0);
      found.push({ url: url.href, score });
    } catch {}
  }
  return [...new Map(found.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()].slice(0, 8);
}
async function fetchTimed(url, ms=12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { redirect:"follow", signal:controller.signal, headers:{"user-agent":"Mozilla/5.0 PRCIndexResearch/1.0"} }); }
  finally { clearTimeout(timer); }
}
async function processRow(row) {
  const result = { inn:row.inn, name:row.name, website:row.website, status:"not_found", logo_url:null, file:null, checked_at:new Date().toISOString() };
  try {
    const page = await fetchTimed(row.website);
    if (!page.ok) return {...result,status:`page_${page.status}`};
    const finalUrl = page.url;
    const html = await page.text();
    for (const option of candidates(html, finalUrl)) {
      try {
        const image = await fetchTimed(option.url, 9000);
        if (!image.ok) continue;
        const type = (image.headers.get("content-type") || "").split(";")[0];
        if (!type.startsWith("image/") || /icon/.test(type)) continue;
        const bytes = Buffer.from(await image.arrayBuffer());
        if (bytes.length < 500 || bytes.length > 2_000_000) continue;
        const ext = type.includes("svg") ? "svg" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("jpeg") ? "jpg" : null;
        if (!ext) continue;
        const file = `${row.inn}.${ext}`;
        await fs.writeFile(path.join(outDir, file), bytes);
        return {...result,status:"candidate",logo_url:image.url,file:`/registry-logos/${file}`,content_type:type,bytes:bytes.length};
      } catch {}
    }
    return result;
  } catch (error) { return {...result,status:error?.name==="AbortError"?"timeout":"page_error"}; }
}

const results = [];
for (let i=0;i<rows.length;i+=8) {
  const part = await Promise.all(rows.slice(i,i+8).map(processRow));
  results.push(...part);
  console.log(`${results.length}/${rows.length} · найдено ${results.filter(x=>x.status==="candidate").length}`);
}
await fs.writeFile(path.join(root,"work/logo-search-batch-001.json"),JSON.stringify(results,null,2)+"\n");
console.log(JSON.stringify({checked:results.length,candidates:results.filter(x=>x.status==="candidate").length,notFound:results.filter(x=>x.status==="not_found").length,errors:results.filter(x=>!["candidate","not_found"].includes(x.status)).length},null,2));
