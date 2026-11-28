// Финальный прогон сканера цвета v2.1 (та же логика, что на странице «Методика») по всем подтверждённым логотипам
// (logo_status = ready: подтверждённые вручную, из каталога и автоматически). Статус и пометки логотипа не меняем,
// кроме пометок, которые выводит сам сканер (inverted_auto — белый знак, low_res — низкое разрешение).
// color_scanner = "2.1-ts" — окончательный цвет (предварительный был "2.1-ts-prelim").
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const SCANNER = readFileSync(new URL("./color-scan.browser.js", import.meta.url), "utf8");
const SHARD = Number(process.env.SHARD ?? 0), SHARDS = Number(process.env.SHARDS ?? 1);
const VERSION = "2.1-ts";
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TYPE = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies").select("inn,logo_storage_path,logo_flags,color_scanner")
    .eq("logo_status", "ready").not("logo_storage_path", "is", null).order("inn").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const mine = rows.filter((r) => Number(BigInt(r.inn) % BigInt(SHARDS)) === SHARD && r.color_scanner !== VERSION);
console.log(`Подтверждённых логотипов: ${rows.length}, в этой части к сканированию: ${mine.length}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: SCANNER });
const stat = { ok: 0, err: 0 };
for (const r of mine) {
  try {
    const { data: blob, error } = await db.storage.from("candidate-logos").download(r.logo_storage_path);
    if (error) throw error;
    const buf = Buffer.from(await blob.arrayBuffer());
    const type = TYPE[r.logo_storage_path.split(".").pop().toLowerCase()] ?? blob.type;
    const scan = await page.evaluate((u) => window.PRC_SCAN.scanUrl(u), `data:${type};base64,${buf.toString("base64")}`);
    if (!scan || scan.error) throw new Error(scan?.error ?? "пустой результат");
    const white = scan.family_share?.["белый"] ?? 0;
    let flags = (r.logo_flags ?? []).filter((f) => f !== "inverted_auto" && f !== "low_res");
    if (scan.background === "прозрачный" && white >= 0.6) flags.push("inverted_auto");
    if (scan.flags?.includes("низкое разрешение")) flags.push("low_res");
    const { error: ue } = await db.from("registry_companies").update({
      palette: (scan.colors ?? []).map((c) => ({ name: c.family, hex: c.hex.toUpperCase(), share: c.share })),
      palette_type: capitalize(scan.palette_type ?? "одноцветный"),
      color_scan: scan, color_scanned_at: new Date().toISOString(), color_scanner: VERSION, logo_flags: [...new Set(flags)],
    }).eq("inn", r.inn);
    if (ue) throw ue;
    stat.ok++;
  } catch (e) {
    stat.err++;
    console.log(`${r.inn}: ${String(e.message ?? e).slice(0, 160)}`);
  }
  if ((stat.ok + stat.err) % 200 === 0) console.log(`… ${stat.ok + stat.err}/${mine.length}`);
}
await browser.close();
console.log(`Итог: отсканировано ${stat.ok}, ошибок ${stat.err}.`);
