// Поисковик сайтов для компаний реестра, у которых сайт не указан.
// Для каждой компании пробуем по очереди:
//   1) hh.ru — ищем работодателя по названию, берём сайт с его страницы;
//   2) угадывание адреса по названию (несколько вариантов: romashka.ru, romashka-soft.ru …).
// Сайт принимается, только если на нём (главная + «Контакты», «О компании», «Реквизиты») есть ИНН этой компании.
// Найденный сайт записывается в website/domain — дальше его подхватывает обычный сборщик логотипов (collect.mjs, режим remaining).
// Если ИНН на сайте не нашёлся, адрес сохраняется только как кандидат в collect_log.site_candidates (в website не пишем).
//
// Переменные окружения: SUPABASE_URL, SUPABASE_SECRET_KEY, LIMIT (0 = все), SHARD, SHARDS, ORDER = inn | headcount
import { createClient } from "@supabase/supabase-js";

const FINDER = "site-finder-v2";
const env = (k, d) => process.env[k] ?? d;
const LIMIT = Number(env("LIMIT", "") || "0");
const SHARD = Number(env("SHARD", "0")), SHARDS = Number(env("SHARDS", "1"));
const ORDER = env("ORDER", "inn");
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const HH_UA = "prcindex-research/1.0 (elussiive-git@users.noreply.github.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- название → бренд и варианты адреса ----------
const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
const TR2 = { х:"kh", ц:"ts", й:"i", ю:"iu", я:"ia", ж:"j" };
const translit = (t, alt = false) => t.toLowerCase().split("").map((ch) => (alt ? TR2[ch] : undefined) ?? TR[ch] ?? ch).join("");
const norm = (t) => translit(t || "").replace(/[^a-z0-9]+/g, "");
const FORMS = /\b(общество с ограниченной ответственностью|акционерное общество|публичное акционерное общество|закрытое акционерное общество|непубличное акционерное общество|открытое акционерное общество|ооо|ао|пао|зао|оао|нао|ип|индивидуальный предприниматель)\b/gi;

function brandOf(name) {
  const q = name.match(/["«“]([^"»”]+)["»”]/);
  let b = (q ? q[1] : name).replace(FORMS, " ").replace(/["«»“”]/g, " ").replace(/\s+/g, " ").trim();
  return b;
}
function domainGuesses(brand) {
  const words = brand.toLowerCase().replace(/[^a-zа-яё0-9\s-]/gi, " ").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return [];
  const stems = new Set();
  for (const alt of [false, true]) {
    const w = words.map((x) => translit(x, alt).replace(/[^a-z0-9]/g, "")).filter(Boolean);
    if (!w.length) continue;
    stems.add(w.join(""));
    if (w.length > 1) stems.add(w.join("-"));
    if (!alt && w.join("").includes("k")) stems.add(w.join("").replace(/k/g, "c"));
    if (w.length > 1 && w[0].length >= 4) stems.add(w[0]);
  }
  const out = [];
  for (const tld of ["ru", "com", "tech", "io", "pro"])
    for (const s of stems) if (s.length >= 3 && s.length <= 40) out.push(`${s}.${tld}`);
  return out.slice(0, 20);
}

// ---------- загрузка страниц и поиск ИНН ----------
async function get(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, status: r.status, url: r.url, text: buf.toString("latin1").slice(0, 3_000_000), utf: buf.toString("utf8").slice(0, 400_000) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.cause?.code ?? e.name ?? e).slice(0, 60) };
  } finally {
    clearTimeout(t);
  }
}
const LINK_HINT = /(contact|kontakt|about|o-kompanii|o_kompanii|company|rekviz|requisit|details|info|kompaniya|контакт|реквизит|о-компании)/i;
const PARKED = /(домен продается|домен продаётся|domain is for sale|this domain|reg\.ru\/domain|parking|припаркован|сайт находится в разработке|казино|casino)/i;

/** Открыть сайт и проверить, есть ли на нём ИНН. Возвращает {status: ok|other_inn|no_inn|unreachable|parked, finalUrl, otherInn} */
async function checkSite(start, inn) {
  const home = await get(start);
  if (!home.ok || !home.text) return { status: "unreachable", detail: home.error ?? home.status };
  const finalUrl = new URL(home.url);
  if (home.text.includes(inn)) return { status: "ok", finalUrl: finalUrl.origin, page: home.url };
  if (PARKED.test(home.utf) && home.text.length < 60000) return { status: "parked", finalUrl: finalUrl.origin };
  const links = new Set();
  for (const m of home.text.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    let raw = m[1];
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch {}
    if (!LINK_HINT.test(decoded)) continue;
    try {
      const u = new URL(raw, finalUrl);
      if (u.host.replace(/^www\./, "") === finalUrl.host.replace(/^www\./, "")) links.add(u.href);
    } catch {}
    if (links.size >= 5) break;
  }
  for (const p of ["/contacts", "/kontakty", "/about", "/rekvizity"]) if (links.size < 6) links.add(new URL(p, finalUrl).href);
  let otherInn;
  for (const l of links) {
    const pg = await get(l, 10000);
    if (!pg.ok || !pg.text) continue;
    if (pg.text.includes(inn)) return { status: "ok", finalUrl: finalUrl.origin, page: pg.url };
    otherInn ??= pg.utf.match(/ИНН[:\s№]*(\d{10}|\d{12})/)?.[1];
  }
  otherInn ??= home.utf.match(/ИНН[:\s№]*(\d{10}|\d{12})/)?.[1];
  return { status: otherInn && otherInn !== inn ? "other_inn" : "no_inn", finalUrl: finalUrl.origin, otherInn };
}

// ---------- hh.ru ----------
let hhState = { ok: 0, fail: 0, lastError: null };
async function hhJson(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://api.hh.ru${path}`, { headers: { "HH-User-Agent": HH_UA, "User-Agent": HH_UA } });
      if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (!r.ok) { hhState.fail++; hhState.lastError = `${r.status} ${(await r.text()).slice(0, 160)}`; return null; }
      hhState.ok++;
      return await r.json();
    } catch (e) {
      hhState.fail++; hhState.lastError = String(e).slice(0, 160);
      await sleep(1000);
    }
  }
  return null;
}
async function hhSites(brand) {
  if (hhState.ok === 0 && hhState.fail >= 5) return []; // hh не пускает (403) — не тратим время
  const res = await hhJson(`/employers?text=${encodeURIComponent(brand)}&per_page=20`);
  await sleep(250);
  if (!res?.items?.length) return [];
  const nb = norm(brand);
  // сначала точные совпадения названия, затем «содержит»
  const scored = res.items
    .map((e) => { const ne = norm(e.name); return { e, score: ne === nb ? 2 : ne.includes(nb) || nb.includes(ne) ? 1 : 0 }; })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.e.open_vacancies ?? 0) - (a.e.open_vacancies ?? 0))
    .slice(0, 4);
  const out = [];
  for (const { e } of scored) {
    const d = await hhJson(`/employers/${e.id}`);
    await sleep(250);
    if (d?.site_url) out.push({ url: d.site_url.startsWith("http") ? d.site_url : `http://${d.site_url}`, hh: e.alternate_url, hhName: e.name });
  }
  return out;
}

// ---------- поиск Bing (с серверов GitHub отвечает; Яндекс и DuckDuckGo — нет) ----------
const SKIP_HOST = /(rusprofile|list-org|checko|zachestnyibiznes|sbis\.ru|kontur|focus|audit-it|e-ecolog|vbankcenter|spark-interfax|ofdata|egrul|nalog|gosuslugi|tadviser|hh\.ru|superjob|habr|vk\.com|t\.me|youtube|wikipedia|2gis|yandex|google|bing|microsoft|msn|avito|zoon|yell|orgpage|spravker|cataloxy|companies\.rbc|rbc\.ru|github|linkedin|facebook|instagram|ok\.ru|dzen|pikabu|reestr|digital\.gov|torgi|zakupki|b2b-center|tenderguru|rostender|bankrot|fedresurs|kad\.arbitr|sudact|ru\.wiki|wiki)/i;
let bingState = { ok: 0, fail: 0, blocked: 0 };
async function bingHosts(q) {
  const r = await get(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=ru&cc=RU&count=20`, 15000);
  await sleep(2500 + Math.random() * 2000);
  if (!r.ok || !r.utf) { bingState.fail++; return []; }
  if (/captcha|unusual traffic|подозрительн/i.test(r.utf) && !/b_algo/.test(r.utf)) { bingState.blocked++; return []; }
  bingState.ok++;
  const hosts = [];
  for (const m of r.utf.matchAll(/<li class="b_algo"[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"/g)) {
    let u = m[1].replace(/&amp;/g, "&");
    // ссылки вида bing.com/ck/a?...&u=a1<base64>
    if (/bing\.com\/ck\//.test(u)) {
      const enc = new URL(u).searchParams.get("u");
      if (enc?.startsWith("a1")) { try { u = Buffer.from(enc.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch {} }
    }
    try {
      const h = new URL(u);
      if (!SKIP_HOST.test(h.host) && !hosts.some((x) => new URL(x).host === h.host)) hosts.push(h.origin);
    } catch {}
    if (hosts.length >= 5) break;
  }
  return hosts;
}

// ---------- одна компания ----------
async function findOne(row) {
  const brand = brandOf(row.name || "");
  const tried = [];
  const candidates = [];
  const tryUrl = async (url, via, extra = {}) => {
    let host;
    try { host = new URL(url).host.replace(/^www\./, ""); } catch { return null; }
    if (tried.some((t) => t.host === host)) return null;
    if (/(hh\.ru|vk\.com|t\.me|facebook|instagram|linkedin|ok\.ru|youtube|tilda\.ws|wixsite|github\.com)/i.test(host)) return null;
    const r = await checkSite(url, row.inn);
    tried.push({ host, via, status: r.status });
    if (r.status === "ok") return { url: r.finalUrl, host: new URL(r.finalUrl).host.replace(/^www\./, ""), via, page: r.page, ...extra };
    if (r.status === "no_inn" && via === "hh") candidates.push({ url: r.finalUrl, via, ...extra });
    return null;
  };

  // 1) hh.ru
  let found = null;
  if (brand.length >= 2) {
    for (const s of await hhSites(brand)) {
      found = await tryUrl(s.url, "hh", { hh: s.hh, hhName: s.hhName });
      if (found) break;
    }
  }
  // 2) угадывание адреса (если прежняя версия поисковика уже угадывала — не повторяем)
  const guessedBefore = row.collect_log?.finder === "site-finder-v1";
  if (!found && !guessedBefore) {
    for (const d of domainGuesses(brand)) {
      found = await tryUrl(`https://${d}`, "guess");
      if (found) break;
    }
  }
  // 3) Bing: «название + ИНН + официальный сайт», проверяем первые сайты на ИНН
  // Bing с серверов GitHub (США) выдаёт нерелевантные результаты по русским запросам — по умолчанию выключен
  if (!found && brand.length >= 2 && process.env.BING === "1") {
    for (const q of [`"${brand}" официальный сайт`, `${brand} ИНН ${row.inn}`]) {
      for (const u of await bingHosts(q)) {
        found = await tryUrl(u, "bing");
        if (found) break;
      }
      if (found) break;
    }
  }
  return { brand, found, tried, candidates };
}

// ---------- выбор компаний и запуск ----------
async function selectCompanies() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("registry_companies").select("inn,name,headcount,collect_log")
      .is("website", null)
      .or(`collect_log.is.null,collect_log->>finder.is.null,collect_log->>finder.neq.${FINDER}`)
      .order(ORDER === "headcount" ? "headcount" : "inn", { ascending: ORDER !== "headcount", nullsFirst: false })
      .order("inn").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000 || (LIMIT && out.length >= LIMIT)) break;
  }
  const rows = LIMIT ? out.slice(0, LIMIT) : out;
  return rows.filter((r) => Number(BigInt(r.inn) % BigInt(SHARDS)) === SHARD);
}

const list = await selectCompanies();
console.log(`Поиск сайтов, задание ${SHARD + 1}/${SHARDS}: компаний ${list.length}`);
const stat = { hh: 0, guess: 0, bing: 0, none: 0, candidates: 0, errors: 0 };
let done = 0;
const queue = [...list];
async function worker() {
  for (let row; (row = queue.shift()); ) {
    try {
      const r = await findOne(row);
      const log = { ...(row.collect_log ?? {}), finder: FINDER, finder_at: new Date().toISOString(), brand: r.brand, tried: r.tried.slice(0, 30) };
      const patch = { collect_log: log, updated_at: new Date().toISOString() };
      if (r.found) {
        stat[r.found.via]++;
        patch.website = r.found.url;
        patch.domain = r.found.host;
        patch.site_note = `Сайт найден автоматически (${{ hh: "через hh.ru", guess: "по названию", bing: "через поиск Bing" }[r.found.via]}), ИНН на сайте совпал: ${r.found.page}`;
        log.found = { via: r.found.via, url: r.found.url, page: r.found.page, hh: r.found.hh ?? null };
      } else {
        stat.none++;
        if (r.candidates.length) { stat.candidates++; log.site_candidates = r.candidates; }
      }
      const { error } = await db.from("registry_companies").update(patch).eq("inn", row.inn);
      if (error) throw error;
      console.log(`${++done}/${list.length} ${row.inn} «${r.brand}» → ${r.found ? `${r.found.via}: ${r.found.host}` : r.candidates.length ? `кандидат без ИНН: ${r.candidates.map((c) => c.url).join(", ")}` : "не найден"}`);
    } catch (e) {
      stat.errors++;
      console.log(`${++done}/${list.length} ${row.inn} ошибка: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: Number(env("CONCURRENCY", "4")) }, worker));
console.log(`hh.ru: успешных запросов ${hhState.ok}, неудачных ${hhState.fail}${hhState.lastError ? `, последняя ошибка: ${hhState.lastError}` : ""}`);
console.log(`Bing: ответов ${bingState.ok}, ошибок ${bingState.fail}, блокировок ${bingState.blocked}`);
console.log(`Итог: ${list.length} компаний. Найдено через hh.ru — ${stat.hh}, по названию — ${stat.guess}, через Bing — ${stat.bing}, не найдено — ${stat.none} (из них есть кандидат без ИНН — ${stat.candidates}), ошибок ${stat.errors}.`);
