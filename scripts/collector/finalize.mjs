// После сбора: один и тот же файл логотипа у компаний с разными брендами — шаблон или стоковая картинка,
// а не логотип. Снимаем автоматическое подтверждение и отправляем такие карточки на «Перепроверку».
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies").select("inn,name,logo_sha256,logo_status,logo_flags,site_final_url")
    .not("logo_sha256", "is", null).neq("logo_status", "needs_search").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const bySha = new Map();
for (const r of rows) bySha.set(r.logo_sha256, [...(bySha.get(r.logo_sha256) ?? []), r]);
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").split(".").slice(-2).join("."); } catch { return ""; } };
let demoted = 0;
for (const group of bySha.values()) {
  if (group.length < 2) continue;
  if (new Set(group.map((r) => host(r.site_final_url))).size === 1) continue; // одна группа компаний на одном домене — допустимо
  for (const r of group) {
    if (!(r.logo_flags ?? []).includes("auto_confirmed")) continue;
    const flags = [...new Set([...(r.logo_flags ?? []).filter((f) => f !== "auto_confirmed"), "low_confidence", "duplicate_logo"])];
    await db.from("registry_companies").update({ logo_status: "needs_check", logo_flags: flags }).eq("inn", r.inn);
    demoted++;
  }
}
const msg = `Проверка повторов: логотипов с файлом ${rows.length}, одинаковые у разных компаний сняты с автоподтверждения — ${demoted}.`;
console.log(msg);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Итог\n${msg}\n`);
