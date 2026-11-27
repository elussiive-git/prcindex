// Только чтение: насколько компании из «Каталога» (таблица companies, зафиксированный корпус) совпадают с реестром Минцифры.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: cats, error } = await db.from("companies").select("id,canonical_name,domain,legal_details,name_variants");
if (error) throw error;
const { data: lv } = await db.from("logo_versions").select("company_id");
const withLogo = new Set((lv ?? []).map((x) => x.company_id));
const reg = [];
for (let f = 0; ; f += 1000) {
  const { data } = await db.from("registry_companies").select("inn,ogrn,name,brand,domain,website,site_final_url,logo_status").range(f, f + 999);
  reg.push(...data); if (data.length < 1000) break;
}
const host = (u) => { try { return new URL(u.startsWith("http") ? u : `http://${u}`).host.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const byHost = new Map();
for (const r of reg) for (const u of [r.domain, r.website, r.site_final_url]) { const h = u && host(u); if (h) byHost.set(h, r); }
const norm = (s) => (s || "").toLowerCase().replace(/ё/g, "е").replace(/["«»“”'.,]/g, " ").replace(/\b(ооо|ао|пао|зао|оао|нао|общество с ограниченной ответственностью|акционерное общество|публичное)\b/g, " ").replace(/\s+/g, " ").trim();
const byName = new Map();
for (const r of reg) { byName.set(norm(r.name), r); if (r.brand) byName.set(norm(r.brand), r); }
const innRe = /\b(\d{10})\b/;
let m = { inn: 0, ogrn: 0, domain: 0, name: 0, none: 0 };
const regOgrn = new Map(reg.map((r) => [String(r.ogrn), r]));
let withLegal = 0;
const none = [], sample = [];
const regInn = new Map(reg.map((r) => [r.inn, r]));
for (const c of cats) {
  const inn = (c.legal_details || "").match(innRe)?.[1];
  if (c.legal_details) withLegal++;
  let hit = inn && regInn.get(inn) ? ["inn", regInn.get(inn)] : null;
  const ogrn = (c.legal_details || "").match(/\b(\d{13})\b/)?.[1];
  if (!hit && ogrn && regOgrn.get(ogrn)) hit = ["ogrn", regOgrn.get(ogrn)];
  if (!hit && c.domain && byHost.get(host(c.domain))) hit = ["domain", byHost.get(host(c.domain))];
  if (!hit) for (const n of [c.canonical_name, ...(c.name_variants ?? [])]) { const r = byName.get(norm(n)); if (r) { hit = ["name", r]; break; } }
  if (hit) { m[hit[0]]++; if (sample.length < 15) sample.push(`${c.canonical_name} (${c.domain}) → ${hit[0]}: ${hit[1].inn} ${hit[1].name} [логотип в реестре: ${hit[1].logo_status}]`); }
  else { m.none++; none.push(`${c.canonical_name} (${c.domain ?? "—"})`); }
}
console.log(`Компаний в каталоге: ${cats.length}, с логотипом: ${withLogo.size}. Пример legal_details: ${JSON.stringify(cats.find((c) => c.legal_details)?.legal_details ?? null)?.slice(0, 200)}`);
console.log(`С реквизитами: ${withLegal}. Совпало с реестром: по ИНН ${m.inn}, по ОГРН ${m.ogrn}, по домену ${m.domain}, по названию ${m.name}; не найдено ${m.none}`);
console.log("Примеры совпадений:\n" + sample.join("\n"));
console.log("Не найдены в реестре (первые 60):\n" + none.slice(0, 60).join("; "));
