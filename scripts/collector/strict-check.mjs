// Строгая проверка автоподтверждённых логотипов (без ручной проверки в анализ идут только надёжные).
// Касается только карточек с пометкой auto_confirmed; подтверждённые вручную и перенесённые из каталога не трогаем.
// Снимаем автоподтверждение (→ «проверка логотипов», пометка strict_doubt и причины в collect_log.strict), если:
//   1) ИНН компании на сайте не найден (site_status ≠ ok) — нельзя быть уверенным, что сайт и логотип её;
//   2) тот же файл логотипа у компаний на разных доменах — шаблон или стоковая картинка;
//   3) логотип взят снимком со страницы и в нём 4+ цвета — похоже на фото или баннер;
//   4) в логотипе 6+ цветов — похоже на фото;
//   5) необычные пропорции элемента на странице: шире 8:1 или выше 1:2.5 — полоса, баннер, вертикальная картинка.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DRY = process.env.DRY === "1";

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies")
    .select("inn,name,logo_sha256,logo_flags,site_status,site_final_url,website,palette,collect_log")
    .contains("logo_flags", ["auto_confirmed"]).order("inn").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies").select("inn,logo_sha256,site_final_url,website").not("logo_sha256", "is", null).order("inn").range(from, from + 999);
  if (error) throw error;
  all.push(...data);
  if (data.length < 1000) break;
}
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").split(".").slice(-2).join("."); } catch { return ""; } };
const domainsBySha = new Map();
for (const r of all) {
  const s = domainsBySha.get(r.logo_sha256) ?? new Set();
  s.add(host(r.site_final_url || r.website || ""));
  domainsBySha.set(r.logo_sha256, s);
}
const reasons = { "ИНН на сайте не найден": 0, "одинаковый файл у разных компаний": 0, "снимок со страницы с 4+ цветами": 0, "6+ цветов": 0, "необычные пропорции": 0 };
let demoted = 0, kept = 0;
for (const r of rows) {
  const flags = r.logo_flags ?? [];
  if (flags.includes("human_confirmed") || flags.includes("from_catalog")) { kept++; continue; }
  const why = [];
  if (r.site_status !== "ok") why.push("ИНН на сайте не найден");
  if (r.logo_sha256 && (domainsBySha.get(r.logo_sha256)?.size ?? 0) > 1) why.push("одинаковый файл у разных компаний");
  const nColors = (r.palette ?? []).length;
  if (flags.includes("rendered") && nColors >= 4) why.push("снимок со страницы с 4+ цветами");
  if (nColors >= 6) why.push("6+ цветов");
  const box = r.collect_log?.logo_candidates?.[0]?.box;
  if (box && box.w && box.h && (box.w / box.h > 8 || box.h / box.w > 2.5)) why.push("необычные пропорции");
  if (!why.length) { kept++; continue; }
  for (const w of why) reasons[w]++;
  demoted++;
  if (DRY) continue;
  const nf = [...new Set([...flags.filter((f) => f !== "auto_confirmed"), "low_confidence", "strict_doubt"])];
  const { error } = await db.from("registry_companies").update({
    logo_status: "needs_check", logo_flags: nf,
    collect_log: { ...(r.collect_log ?? {}), strict: { at: new Date().toISOString(), why } },
  }).eq("inn", r.inn);
  if (error) console.log(r.inn, error.message);
}
console.log(`Автоподтверждённых: ${rows.length}. Остаются подтверждёнными: ${kept}. Сняты${DRY ? " (пробно, без записи)" : ""}: ${demoted}.`);
console.log("Причины (у одной карточки может быть несколько):", JSON.stringify(reasons));
