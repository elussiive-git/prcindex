// Перенос проверенных логотипов из «Каталога» (зафиксированный корпус) в карточки реестра Минцифры.
// Берём только компании каталога, найденные в реестре по ИНН, ОГРН или домену (строго аккредитованные).
// Каталог не меняется: файл логотипа копируется в хранилище candidate-logos.
// В карточке реестра: логотип = из каталога, статус «готов», пометки human_confirmed + from_catalog;
// старый цвет сбрасывается (финальный прогон сканера будет по всем проверенным логотипам).
// Логотип, который владелец уже подтвердил вручную в реестре (human_confirmed), не заменяется.
// Если у карточки реестра нет сайта — ставим домен из каталога, чтобы сборщик мог определить сегмент.
// В конце печатает список ИНН для сборщика (режим inns).
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DRY = process.env.DRY === "1";

const { data: cats, error } = await db.from("companies").select("id,canonical_name,domain,legal_details");
if (error) throw error;
const { data: versions, error: ve } = await db.from("logo_versions").select("id,company_id,storage_path,mime_type,original_filename,replaces_id,created_at");
if (ve) throw ve;
const replaced = new Set(versions.map((v) => v.replaces_id).filter(Boolean));
const latest = new Map();
for (const v of versions) {
  if (replaced.has(v.id)) continue;
  const cur = latest.get(v.company_id);
  if (!cur || cur.created_at < v.created_at) latest.set(v.company_id, v);
}
const reg = [];
for (let f = 0; ; f += 1000) {
  const { data } = await db.from("registry_companies").select("inn,ogrn,name,domain,website,site_final_url,logo_status,logo_flags,classification_status").range(f, f + 999);
  reg.push(...data); if (data.length < 1000) break;
}
const host = (u) => { try { return new URL(u.startsWith("http") ? u : `http://${u}`).host.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const byInn = new Map(reg.map((r) => [r.inn, r]));
const byOgrn = new Map(reg.map((r) => [String(r.ogrn), r]));
const byHost = new Map();
for (const r of reg) for (const u of [r.domain, r.website, r.site_final_url]) { const h = u && host(u); if (h) byHost.set(h, r); }

const EXT = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const stat = { matched: 0, copied: 0, keptManual: 0, siteAdded: 0, noLogo: 0, errors: 0 };
const inns = [];
const seen = new Set();
for (const c of cats) {
  const ld = c.legal_details || "";
  const inn = ld.match(/\b(\d{10})\b/)?.[1];
  const ogrn = ld.match(/\b(\d{13})\b/)?.[1];
  const r = (inn && byInn.get(inn)) || (ogrn && byOgrn.get(ogrn)) || (c.domain && byHost.get(host(c.domain)));
  if (!r || seen.has(r.inn)) continue;
  seen.add(r.inn);
  stat.matched++;
  const v = latest.get(c.id);
  if (!v) { stat.noLogo++; continue; }
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (!r.website && c.domain) { patch.website = `https://${host(c.domain)}`; patch.domain = host(c.domain); stat.siteAdded++; }
    if ((r.logo_flags ?? []).includes("human_confirmed") && r.logo_status === "ready") {
      stat.keptManual++;
    } else {
      const { data: blob, error: de } = await db.storage.from("logos").download(v.storage_path);
      if (de) throw de;
      const buf = Buffer.from(await blob.arrayBuffer());
      const hash = createHash("sha256").update(buf).digest("hex");
      const type = v.mime_type || blob.type;
      const path = `${r.inn}/catalog-${hash.slice(0, 16)}.${EXT[type] ?? v.storage_path.split(".").pop()}`;
      if (!DRY) {
        const { error: ue } = await db.storage.from("candidate-logos").upload(path, buf, { contentType: type, upsert: true });
        if (ue) throw ue;
      }
      const keep = (r.logo_flags ?? []).filter((f) => f.startsWith("bg_") || f === "parent_brand" || f === "inverted");
      Object.assign(patch, {
        logo_storage_path: path, logo_sha256: hash, logo_status: "ready", logo_url: null,
        logo_flags: [...new Set([...keep, "human_confirmed", "from_catalog"])],
        palette: null, palette_type: null, color_scan: null, color_scanned_at: null, color_scanner: null,
      });
      stat.copied++;
    }
    if (!DRY) {
      const { error: pe } = await db.from("registry_companies").update(patch).eq("inn", r.inn);
      if (pe) throw pe;
    }
    if (r.classification_status !== "ready") inns.push(r.inn);
  } catch (e) {
    stat.errors++;
    console.log(`${c.canonical_name} → ${r.inn}: ошибка ${String(e.message ?? e).slice(0, 200)}`);
  }
}
console.log(`Итог${DRY ? " (пробный)" : ""}: совпало с реестром ${stat.matched}; логотип перенесён ${stat.copied}; оставлен подтверждённый вручную ${stat.keptManual}; сайт добавлен ${stat.siteAdded}; без файла в каталоге ${stat.noLogo}; ошибок ${stat.errors}. Нужен сегмент: ${inns.length}.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `inns=${inns.join(",")}\n`);
