// Сборщик сайтов кандидатов настоящим браузером (Playwright / Chromium).
// Для каждой компании: открыть сайт как посетитель → ИНН и коды Минцифры (главная + «О компании», «Реквизиты», «Контакты»…) →
// логотип из шапки (исходный файл, если он совпадает с видимым; иначе снимок элемента) → копия в хранилище →
// предварительный прогон сканера цвета v2.1 ради пометок (белый на прозрачном, низкое разрешение, ничья долей).
// Логотипы, уже подтверждённые вручную (logo_status = 'ready'), не трогаем.
//
// Переменные окружения:
//   SUPABASE_URL, SUPABASE_SECRET_KEY — доступ к базе (секрет в GitHub)
//   MODE = top | remaining | recheck | inns;  LIMIT (для top/remaining);  INNS (через запятую, для inns)
//   SHARD, SHARDS — деление списка между параллельными заданиями;  CONCURRENCY — вкладок одновременно в одном задании
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { SEG, findCodes, suggestPrimary } from "./codes.mjs";

const COLLECTOR = "browser-v1";
const env = (k, d) => process.env[k] ?? d;
const MODE = env("MODE", "top");
const LIMIT = Number(env("LIMIT", "") || "0");
const SHARD = Number(env("SHARD", "0")), SHARDS = Number(env("SHARDS", "1"));
const CONCURRENCY = Number(env("CONCURRENCY", "3"));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const PICK = readFileSync(new URL("./pick-logo.js", import.meta.url), "utf8");
const SCANNER = readFileSync(new URL("./color-scan.browser.js", import.meta.url), "utf8");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const RECHECK = ["no_inn", "needs_browser", "unreachable", "cert_error", "other_inn", "domain_lost"];
const COLS = "inn,name,website,logo_status,logo_flags,site_status,site_note,it_codes,collect_log";
// Насколько хорошо разобран сайт: новый прогон не должен ухудшать уже найденное (серверы за границей часть сайтов не открывают)
const RANK = { ok: 5, other_inn: 4, domain_lost: 4, no_inn: 2, needs_browser: 1, cert_error: 1, unreachable: 0 };
const SITE_FIELDS = ["site_status", "site_final_url", "site_description", "it_codes", "codes_found_url", "primary_code", "primary_code_auto",
  "segment", "segment_source", "classification_status", "evidence", "evidence_url"];
function keepBetter(row, patch) {
  const was = RANK[row.site_status] ?? -1, now = RANK[patch.site_status] ?? -1;
  if (was <= now) return patch;
  for (const f of SITE_FIELDS) delete patch[f];
  patch.site_note = `${row.site_note ?? ""} [Браузерный сборщик: ${patch.site_note ?? "без изменений"}; данные о сайте оставлены от прежнего прогона.]`.trim();
  if (patch.collect_log) patch.collect_log.kept_previous_site_status = row.site_status;
  return patch;
}

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function selectCompanies() {
  const base = () => db.from("registry_companies").select(COLS).not("website", "is", null).neq("logo_status", "ready");
  let rows;
  if (MODE === "inns") {
    const inns = env("INNS", "").split(/[,\s]+/).filter(Boolean);
    ({ data: rows } = await db.from("registry_companies").select(COLS).in("inn", inns));
  } else if (MODE === "top") {
    ({ data: rows } = await base().order("headcount", { ascending: false, nullsFirst: false }).order("inn").limit(LIMIT || 50));
  } else if (MODE === "recheck") {
    rows = await pageAll(() => base().or(`site_status.in.(${RECHECK.join(",")}),logo_flags.cs.{rejected}`).order("headcount", { ascending: false, nullsFirst: false }).order("inn"));
  } else {
    rows = await pageAll(() => base().or(`collect_log.is.null,collect_log->>collector.neq.${COLLECTOR}`).order("headcount", { ascending: false, nullsFirst: false }).order("inn"));
    if (LIMIT > 0) rows = rows.slice(0, LIMIT);
  }
  rows = rows ?? [];
  return rows.filter((r) => Number(BigInt(r.inn) % BigInt(SHARDS)) === SHARD);
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const EXT = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
function sniff(buf, type) {
  if (EXT[type]) return type;
  const head = buf.subarray(0, 300).toString("utf8").toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (head.startsWith("riff")) return "image/webp";
  if (head.startsWith("gif8")) return "image/gif";
  return "";
}
async function upload(path, buf, type) {
  const { error } = await db.storage.from("candidate-logos").upload(path, buf, { contentType: type, upsert: true });
  if (error) throw new Error("upload: " + error.message);
  return path;
}

async function scanInBrowser(browser, buf, type) {
  const page = await browser.newPage();
  try {
    await page.setContent("<html><body></body></html>");
    await page.addScriptTag({ content: SCANNER });
    const dataUrl = `data:${type};base64,${buf.toString("base64")}`;
    return await page.evaluate((u) => window.PRC_SCAN.scanUrl(u), dataUrl);
  } finally {
    await page.close();
  }
}
function autoFlags(scan) {
  const f = [];
  if (!scan || scan.error) return ["no_mark"];
  const white = scan.family_share?.["белый"] ?? 0;
  if (scan.background === "прозрачный" && white >= 0.6) f.push("inverted_auto");
  if (scan.flags?.includes("низкое разрешение")) f.push("low_res");
  const c = scan.colors ?? [];
  if (c.length >= 2 && c[0].share >= 0.2 && Math.abs(c[0].share - c[1].share) < 0.005 && c[0].family !== c[1].family) f.push("tie");
  return f;
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- внутренняя проверка уверенности (без внешних сервисов) ----------
const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
const translit = (t) => t.toLowerCase().split("").map((ch) => TR[ch] ?? ch).join("");
const norm = (t) => translit(t || "").replace(/[^a-z0-9]+/g, "");
const STOP = new Set(["ooo", "ao", "pao", "zao", "oao", "obschestvo", "ogranichennoy", "otvetstvennostyu", "aktsionernoe", "akcionernoe", "kompaniya", "gruppa", "tehnologii", "tekhnologii", "it", "ru", "www", "com", "org", "net", "rf", "su", "tech", "group", "soft"]);
function brandTokens(row, host) {
  const t = new Set();
  const stem = host.replace(/^www\./, "").split(".").slice(0, -1).join(" ");
  for (const w of stem.split(/[-.\s]+/)) if (w.length >= 3 && !STOP.has(w)) t.add(norm(w));
  const name = (row.name || "").replace(/["«»]/g, " ");
  for (const w of name.split(/[\s\-–—.,()]+/)) { const n = norm(w); if (n.length >= 4 && !STOP.has(n)) t.add(n); }
  return [...t];
}
function brandMatch(tokens, text) {
  const n = norm(text);
  return tokens.some((tok) => tok.length >= 3 && (n.includes(tok) || (n.length >= 4 && tok.includes(n))));
}
/** Уверены ли мы в логотипе без проверки человеком. Возвращает [уверен, причины сомнения]. */
function logoConfidence({ siteOk, best, flags, logoFrom, tokens }) {
  const doubts = [];
  if (!siteOk) doubts.push("ИНН на сайте не совпал или не найден");
  if (!best?.root) doubts.push("не в ссылке на главную");
  const named = best && (best.hint || brandMatch(tokens, `${best.desc} ${best.label} ${best.src ?? ""}`));
  if (!named) doubts.push("нет признаков логотипа или названия бренда");
  if (best && (best.box.x > 683 || best.box.y > 200)) doubts.push("не в левой верхней части шапки");
  if (best && (best.box.w / best.box.h > 12 || best.box.w < 40)) doubts.push("необычные размеры");
  if (flags.includes("no_mark")) doubts.push("сканер не нашёл знак");
  if (flags.includes("low_res")) doubts.push("низкое разрешение");
  if (!logoFrom) doubts.push("файл не получен");
  return [doubts.length === 0, doubts];
}
/** Однозначный сегмент по кодам: все коды, кроме общих 1.01/2.01, из одного сегмента (или единственный код). */
function unambiguousPrimary(codes) {
  const specific = codes.filter((c) => c !== "1.01" && c !== "2.01");
  if (specific.length) {
    const segs = new Set(specific.map((c) => SEG[c]));
    return segs.size === 1 ? specific[0] : null;
  }
  return codes.length === 1 ? codes[0] : null;
}

async function collectOne(browser, row) {
  const log = { collector: COLLECTOR, at: new Date().toISOString() };
  const patch = { site_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const notes = [];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, locale: "ru-RU", viewport: { width: 1366, height: 900 } });
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  try {
    let resp;
    try {
      resp = await page.goto(row.website, { waitUntil: "domcontentloaded", timeout: 35000 });
    } catch (e) {
      const m = String(e.message);
      log.error = m.slice(0, 300);
      if (row.website.startsWith("https://")) {
        try { resp = await page.goto(row.website.replace("https://", "http://"), { waitUntil: "domcontentloaded", timeout: 25000 }); } catch { /* ниже */ }
      }
      if (!resp) {
        Object.assign(patch, { site_status: "unreachable", site_note: "Сайт не открылся в браузере (" + m.split("\n")[0].slice(0, 120) + ").", collect_log: log });
        await db.from("registry_companies").update(keepBetter(row, patch)).eq("inn", row.inn);
        return { status: "unreachable" };
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const finalUrl = new URL(page.url());
    patch.site_final_url = finalUrl.href;
    log.http = resp?.status();
    const title = (await page.title().catch(() => "")) || "";
    const desc = await page.locator("meta[name='description']").first().getAttribute("content").catch(() => null);
    patch.site_description = [title, desc].filter(Boolean).join(" — ").slice(0, 400);
    const mainText = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).replace(/\s+/g, " ");
    log.text_len = mainText.length;

    // снимок шапки — для проверки логотипа (глазами или моделью)
    const header = await page.screenshot({ clip: { x: 0, y: 0, width: 1366, height: 240 }, type: "jpeg", quality: 70 }).catch(() => null);
    if (header) log.header = await upload(`${row.inn}/header.jpg`, header, "image/jpeg").catch(() => null);

    // логотип
    const picked = await page.evaluate(PICK).catch((e) => ({ error: String(e.message) }));
    log.logo_candidates = picked?.top?.map((c) => ({ s: c.s, tag: c.tag, desc: c.desc, box: c.box })) ?? null;
    let logoBuf = null, logoType = "", logoFrom = "", rendered = null;
    const best = picked?.best;
    if (best) {
      const pad = 3, b = best.box;
      rendered = await page.screenshot({ clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.w + pad * 2, height: b.h + pad * 2 }, type: "png" }).catch(() => null);
      if (rendered) log.render = await upload(`${row.inn}/render.png`, rendered, "image/png").catch(() => null);
      if (picked.svg && picked.svg.length > 300) {
        logoBuf = Buffer.from(picked.svg, "utf8"); logoType = "image/svg+xml"; logoFrom = "встроенный SVG";
      } else if (best.src && !best.src.startsWith("data:image/gif")) {
        try {
          const r = await ctx.request.get(best.src, { timeout: 15000 });
          if (r.ok()) {
            const buf = Buffer.from(await r.body());
            const t = sniff(buf, (r.headers()["content-type"] || "").split(";")[0].trim());
            if (t && buf.length > 150) {
              // файл должен совпадать с видимым: спрайты и обрезанные картинки заменяем снимком
              const dims = t === "image/svg+xml" ? null : await page.evaluate(async (u) => {
                const im = new Image(); im.src = u; await im.decode().catch(() => {}); return [im.naturalWidth, im.naturalHeight];
              }, best.src).catch(() => null);
              const fileRatio = dims && dims[0] && dims[1] ? dims[0] / dims[1] : null;
              const boxRatio = b.w / b.h;
              if (!fileRatio || Math.abs(fileRatio - boxRatio) / boxRatio < 0.25) { logoBuf = buf; logoType = t; logoFrom = "исходный файл"; }
              else log.sprite = { fileRatio, boxRatio };
            }
          }
        } catch (e) { log.logo_fetch_error = String(e.message).slice(0, 200); }
      }
      if (!logoBuf && rendered) { logoBuf = rendered; logoType = "image/png"; logoFrom = "снимок со страницы"; }
    }

    // подстраницы с реквизитами и кодами
    const pages = [{ url: finalUrl.href, text: mainText }];
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => [a.innerText.trim().slice(0, 60), a.href])).catch(() => []);
    const want = /(о компании|о нас|реквизит|контакт|аккредит|раскрыт|ит-деятельн|сведения|документ|about|contacts?|requisit|rekvizit|company)/i;
    const seen = new Set([finalUrl.href]);
    for (const [text, href] of links) {
      if (pages.length >= 5) break;
      if (!want.test(text + " " + href)) continue;
      let u; try { u = new URL(href); } catch { continue; }
      if (u.host !== finalUrl.host || seen.has(u.href) || /\.(pdf|docx?|xlsx?|zip|jpe?g|png)$/i.test(u.pathname)) continue;
      seen.add(u.href);
      try {
        await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        pages.push({ url: u.href, text: (await page.evaluate(() => document.body?.innerText || "")).replace(/\s+/g, " ") });
      } catch { /* пропускаем */ }
    }
    log.pages = pages.map((p) => p.url);

    // ИНН, коды, статус сайта
    const innPage = pages.find((p) => p.text.includes(row.inn));
    const otherInn = !innPage ? pages.map((p) => p.text.match(/ИНН[:\s№]*(\d{10}|\d{12})/)?.[1]).find(Boolean) : undefined;
    let codes = [], codesUrl = null;
    for (const p of pages) { const c = findCodes(p.text); if (c.length > codes.length) { codes = c; codesUrl = p.url; } }
    const lost = !innPage && /(казино|casino|ставк[аи] на спорт|букмекер|слоты|онлайн-займ|продается домен|продаётся домен|domain is for sale)/i.test(mainText);
    patch.site_status = innPage ? "ok" : lost ? "domain_lost" : otherInn ? "other_inn" : "no_inn";
    if (otherInn) notes.push(`На сайте ИНН ${otherInn}.`);
    if (lost) notes.push("Домен занят посторонним сайтом.");
    if (innPage && codes.length) {
      const sure = unambiguousPrimary(codes);
      const primary = sure ?? suggestPrimary(codes);
      Object.assign(patch, {
        it_codes: codes, codes_found_url: codesUrl, primary_code: primary, primary_code_auto: !sure,
        segment: primary ? SEG[primary] : "Не определено", segment_source: "codes", classification_status: sure ? "ready" : "needs",
        evidence: sure
          ? "Коды видов ИТ-деятельности по приказу Минцифры № 449 указаны на сайте компании; сегмент однозначен (подтверждено автоматически)."
          : "Коды видов ИТ-деятельности по приказу Минцифры № 449 указаны на сайте компании. Основной код предложен автоматически — подтвердить.",
        evidence_url: codesUrl,
      });
      notes.push(`Коды: ${codes.join(", ")}; предложен основной ${primary}.`);
    } else if (innPage) notes.push("Коды Минцифры на сайте не найдены.");

    // логотип → хранилище + предварительный сканер
    if (logoBuf && patch.site_status !== "domain_lost" && patch.site_status !== "other_inn") {
      const hash = sha(logoBuf);
      const path = await upload(`${row.inn}/${hash.slice(0, 16)}.${EXT[logoType]}`, logoBuf, logoType);
      let scan = null;
      try { scan = await scanInBrowser(browser, logoBuf, logoType); } catch (e) { log.scan_error = String(e.message).slice(0, 200); }
      let flags = [...new Set([...(row.logo_flags ?? []).filter((f) => ["parent_brand", "inverted"].includes(f)), ...autoFlags(scan), ...(logoFrom === "снимок со страницы" ? ["rendered"] : [])])];
      const [sure, doubts] = logoConfidence({ siteOk: Boolean(innPage), best, flags, logoFrom, tokens: brandTokens(row, finalUrl.host) });
      flags = [...flags, sure ? "auto_confirmed" : "low_confidence"];
      log.confidence = sure ? "уверен" : doubts;
      if (!sure) notes.push(`Логотип требует проверки: ${doubts.join("; ")}.`);
      Object.assign(patch, {
        logo_storage_path: path, logo_sha256: hash, logo_status: sure ? "ready" : "needs_check", logo_flags: flags,
        logo_url: best.src && !best.src.startsWith("data:") ? best.src : `${finalUrl.origin}/ (${logoFrom})`,
        logo_source_url: `${finalUrl.href} — ${logoFrom}`,
      });
      if (scan && !scan.error) Object.assign(patch, {
        palette: (scan.colors ?? []).map((c) => ({ name: c.family, hex: c.hex.toUpperCase(), share: c.share })),
        palette_type: capitalize(scan.palette_type ?? "одноцветный"),
        color_scan: scan, color_scanned_at: new Date().toISOString(), color_scanner: "2.1-ts-prelim",
      });
      notes.push(`Логотип: ${logoFrom}.`);
    } else if (!logoBuf) notes.push("Логотип в шапке не найден.");
    patch.site_note = notes.join(" ");
    patch.collect_log = log;
    const { error } = await db.from("registry_companies").update(keepBetter(row, patch)).eq("inn", row.inn);
    if (error) throw error;
    return { status: patch.site_status, codes: codes.length, logo: Boolean(logoBuf), sure: patch.logo_status === "ready", ready: patch.logo_status === "ready" && patch.classification_status === "ready" };
  } finally {
    await ctx.close().catch(() => {});
  }
}

const list = await selectCompanies();
console.log(`Режим ${MODE}, задание ${SHARD + 1}/${SHARDS}: компаний ${list.length}`);
const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
const stat = {}; let codes = 0, logos = 0, errors = 0, done = 0, sureLogos = 0, readyCards = 0;
const queue = [...list];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const row = queue.shift();
    try {
      const r = await Promise.race([collectOne(browser, row), new Promise((_, rej) => setTimeout(() => rej(new Error("таймаут 150 с")), 150000))]);
      stat[r.status] = (stat[r.status] ?? 0) + 1;
      if (r.codes) codes++;
      if (r.logo) logos++;
      if (r.sure) sureLogos++;
      if (r.ready) readyCards++;
      console.log(`${++done}/${list.length} ${row.inn} ${r.status}${r.logo ? (r.sure ? " логотип(уверен)" : " логотип(проверить)") : ""}${r.codes ? " коды" : ""}${r.ready ? " ГОТОВО" : ""}`);
    } catch (e) {
      errors++; done++;
      console.log(`${done}/${list.length} ${row.inn} ОШИБКА ${String(e.message).slice(0, 160)}`);
      await db.from("registry_companies").update(keepBetter(row, {
        site_status: "needs_browser", site_checked_at: new Date().toISOString(),
        site_note: "Сборщик не справился (" + String(e.message).slice(0, 120) + ") — нужен ручной просмотр.",
        collect_log: { collector: COLLECTOR, error: String(e.message).slice(0, 300) },
      })).eq("inn", row.inn);
    }
  }
}));
await browser.close();
const summary = `Готово: ${done} компаний. ${Object.entries(stat).map(([k, v]) => `${k}: ${v}`).join(", ")}. Логотип у ${logos} (уверенно — ${sureLogos}), коды у ${codes}, сразу в «Готово» — ${readyCards}, ошибок ${errors}.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Задание ${SHARD + 1}/${SHARDS}\n${summary}\n`);
