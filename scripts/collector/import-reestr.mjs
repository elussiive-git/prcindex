// Сайты из Единого реестра российского ПО (reestr.digital.gov.ru) для компаний, у которых сайт не указан.
// Файл data/reestr-po-inn-sites.json собран в браузере: по одной карточке программы на правообладателя → ИНН и «адрес страницы сайта правообладателя».
// Берём только карточки с одним правообладателем; адрес сокращаем до главной страницы; файлообменники и общие хостинги пропускаем.
// Записываем только туда, где website пустой. Дальше сайт проверит обычный сборщик (collect.mjs, режим remaining): ИНН на сайте, логотип.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rows = JSON.parse(readFileSync(new URL("./data/reestr-po-inn-sites.json", import.meta.url), "utf8"));
const perCard = new Map();
for (const r of rows) perCard.set(r.card, (perCard.get(r.card) ?? 0) + 1);
const BAD = /(^|\.)(yandex\.ru|disk\.yandex|ya\.ru|google\.com|github\.com|gitflic\.ru|gitlab\.com|cloud\.mail\.ru|mail\.ru|dropbox\.com|sourceforge|youtube\.com|rutube\.ru|vk\.com|t\.me|drive\.|docs\.)/i;
const best = new Map();
for (const r of rows) {
  if (!r.url || perCard.get(r.card) !== 1) continue;
  let u;
  try { u = new URL(r.url); } catch { continue; }
  if (BAD.test(u.host)) continue;
  if (!best.has(r.inn)) best.set(r.inn, { site: u.origin, host: u.host.replace(/^www\./, ""), card: r.card, doc: r.url });
}
console.log(`В файле: ${rows.length} записей, подходящих ИНН с сайтом: ${best.size}`);

const empty = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies").select("inn,collect_log").is("website", null).order("inn").range(from, from + 999);
  if (error) throw error;
  empty.push(...data);
  if (data.length < 1000) break;
}
let n = 0, err = 0;
for (const row of empty) {
  const b = best.get(row.inn);
  if (!b) continue;
  const { error } = await db.from("registry_companies").update({
    website: b.site,
    domain: b.host,
    site_note: `Сайт взят из реестра российского ПО (карточка https://reestr.digital.gov.ru/reestr/${b.card}/, адрес документации: ${b.doc}).`,
    collect_log: { ...(row.collect_log ?? {}), site_source: "reestr-po", reestr_card: b.card, imported_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }).eq("inn", row.inn).is("website", null);
  if (error) { err++; console.log(row.inn, error.message); } else n++;
}
console.log(`Компаний без сайта: ${empty.length}. Сайт добавлен: ${n}. Ошибок: ${err}.`);
