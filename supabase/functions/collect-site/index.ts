// Edge Function collect-site: обходит официальный сайт кандидата и записывает в registry_companies
//  - статус сайта (открылся / другой ИНН / нет ИНН / не открывается / сертификат / домен потерян);
//  - коды видов ИТ-деятельности по приказу Минцифры № 449 (главная + «О компании», «Реквизиты», «Контакты» и т. п.);
//  - логотип из шапки (копия в хранилище candidate-logos), статус «проверить логотип»;
//  - предложенный основной код (primary_code_auto = true) — подтверждается вручную.
// Вызывает только владелец исследования. Цвет здесь не определяется (отдельный прогон сканера).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DOMParser, type Element } from "jsr:@b-fuze/deno-dom";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const SEG: Record<string, string> = {};
const add = (seg: string, codes: string[]) => codes.forEach((c) => (SEG[c] = seg));
add("Разработка ПО, информационных систем и сайтов", ["1.01", "1.04", "1.05", "1.07"]);
add("Продажа и лицензирование ПО", ["2.01"]);
add("Автоматизация и цифровизация", ["8.01"]);
add("Инфраструктура, облака, ЦОД, хостинг", ["1.06", "4.01", "5.01", "6.01", "7.01"]);
add("Информационная безопасность", ["1.08", "11.01", "11.02", "11.03", "11.04", "11.05", "21.01"]);
add("Данные и искусственный интеллект", ["3.01", "10.01", "26.01"]);
add("Интернет-сервисы и платформы", ["9.01", "12.01", "13.01", "14.01", "15.01", "15.02", "16.01", "17.01", "23.01", "24.01", "25.01"]);
add("Финтех и электронный документооборот", ["18.01", "19.01", "20.01"]);
add("Электроника, оборудование, робототехника", ["1.02", "1.03", "1.09", "27.01", "28.01", "28.02"]);
add("Видеоигры", ["22.01"]);
add("Научные исследования", ["29.01"]);

async function get(url: string, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9" }, redirect: "follow", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
function classifyError(e: unknown): "cert_error" | "unreachable" {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return /certificate|unknownissuer|invalid peer|tls|ssl|handshake/.test(m) ? "cert_error" : "unreachable";
}
const textOf = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&quot;/g, '"').replace(/&laquo;|&raquo;/g, '"')
    .replace(/\s+/g, " ");

/** Коды из перечня № 449 рядом с упоминанием перечня / видов ИТ-деятельности. */
function findCodes(text: string): string[] {
  const out: string[] = [];
  const anchor = /(449|деятельност[а-я]* в (?:сфере|области) информационных технологий|ит-деятельност|код[а-я]* вид[а-я]* деятельност|перечн[а-я]* видов деятельности)/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(text))) {
    const win = text.slice(m.index, m.index + 3000);
    for (const c of win.match(/(?<![\d.])\d{1,2}\.\d{2}(?!\d|[.,]\d)/g) ?? []) {
      const code = c.replace(/^0/, "");
      if (SEG[code] && !out.includes(code)) out.push(code);
    }
  }
  return out;
}
function suggestPrimary(codes: string[]): string | null {
  if (!codes.length) return null;
  const specific = codes.filter((c) => c !== "1.01" && c !== "2.01");
  const pool = specific.length ? specific : codes;
  const cnt = new Map<string, number>();
  for (const c of pool) cnt.set(SEG[c], (cnt.get(SEG[c]) ?? 0) + 1);
  const max = Math.max(...cnt.values());
  return pool.find((c) => cnt.get(SEG[c]) === max) ?? null;
}

type LogoPick = { kind: "url" | "svg"; value: string; why: string; flags: string[] };
function pickLogo(doc: ReturnType<DOMParser["parseFromString"]>, base: URL): LogoPick | null {
  if (!doc) return null;
  const abs = (u: string) => { try { return new URL(u, base).href; } catch { return ""; } };
  const srcOf = (img: Element) => {
    const s = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "";
    const set = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if ((!s || s.startsWith("data:image/gif") || s.startsWith("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB")) && set) return set.split(",")[0].trim().split(" ")[0];
    return s;
  };
  const flagsFor = (s: string) => (/(white|_w\.|-w\.|_wh|light|inverse|negativ|_neg|-neg|belyj|beliy)/i.test(s) ? ["inverted"] : []);
  const selectors = [
    "header a[href='/'] img", "header a[href='/'] svg", "a[href='/'] img", "a[href='/'] svg",
    "header [class*='logo' i] img", "header img[class*='logo' i]", "header img[src*='logo' i]", "header [class*='logo' i] svg", "header svg[class*='logo' i]",
    "[class*='logo' i] img", "img[class*='logo' i]", "img[src*='logo' i]", "img[alt*='logo' i]", "img[alt*='лого' i]",
    "[class*='logo' i] svg", "svg[class*='logo' i]", "[id*='logo' i] img", "[id*='logo' i] svg", "header img", "header svg",
  ];
  for (const sel of selectors) {
    let nodes: Element[] = [];
    try { nodes = [...doc.querySelectorAll(sel)] as Element[]; } catch { continue; }
    for (const el of nodes) {
      if (el.tagName.toLowerCase() === "img") {
        const s = srcOf(el);
        if (!s || /sprite|icon-|ico_|burger|menu|search|close|arrow|flag|lang|phone|mail/i.test(s)) continue;
        const u = s.startsWith("data:") ? s : abs(s);
        if (u) return { kind: "url", value: u, why: sel, flags: flagsFor(s) };
      } else {
        const svg = el.outerHTML;
        if (svg.length < 300 || /<use\b/i.test(svg) && svg.length < 600) continue; // иконки и ссылки на спрайт
        return { kind: "svg", value: svg, why: sel, flags: [] };
      }
    }
  }
  const icon = doc.querySelector("link[rel~='icon'][type='image/svg+xml']") || doc.querySelector("link[rel='apple-touch-icon']");
  const href = icon?.getAttribute("href");
  if (href) return { kind: "url", value: abs(href), why: "иконка сайта (запасной вариант)", flags: ["site_icon"] };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
      secret = keys.default ?? Object.values(keys)[0] ?? secret;
    } catch { /* старый формат */ }
    const admin = createClient(url, secret, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Нужно войти в приложение" }, 401);
    const { data: prof } = await admin.from("profiles").select("role,revoked_at,access_expires_at").eq("user_id", u.user.id).maybeSingle();
    const active = prof && !prof.revoked_at && (!prof.access_expires_at || new Date(prof.access_expires_at) > new Date());
    if (!active || prof.role !== "owner") return json({ error: "Только для владельца исследования" }, 403);

    const { inn } = await req.json() as { inn: string };
    const { data: row, error: re } = await admin.from("registry_companies").select("inn,name,website").eq("inn", inn).maybeSingle();
    if (re || !row) return json({ error: "Компания не найдена" }, 404);
    if (!row.website) return json({ error: "В реестре нет сайта" }, 400);
    const log: Record<string, unknown> = { started: new Date().toISOString() };
    const patch: Record<string, unknown> = { site_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };

    // 1. главная
    let res: Response | null = null;
    let website = row.website as string;
    try { res = await get(website); } catch (e) {
      log.first_error = String((e as Error).message);
      if (website.startsWith("https://")) {
        try { website = website.replace("https://", "http://"); res = await get(website); } catch (e2) { log.http_error = String((e2 as Error).message); }
      }
      if (!res) {
        patch.site_status = classifyError(e);
        patch.site_note = patch.site_status === "cert_error" ? "Сертификат сайта не принимается сервером — нужен просмотр в браузере." : "Сайт не открылся с сервера.";
        patch.collect_log = log;
        await admin.from("registry_companies").update(patch).eq("inn", inn);
        return json({ inn, site_status: patch.site_status });
      }
    }
    const finalUrl = new URL(res!.url || website);
    const html = await res!.text();
    const mainText = textOf(html);
    patch.site_final_url = finalUrl.href;
    log.http = res!.status;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const desc = doc?.querySelector("meta[name='description']")?.getAttribute("content") || doc?.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    const title = doc?.querySelector("title")?.textContent?.trim() || "";
    patch.site_description = [title, desc].filter(Boolean).join(" — ").slice(0, 400);

    // 2. подстраницы с реквизитами / кодами
    const pages: { url: string; text: string }[] = [{ url: finalUrl.href, text: mainText }];
    const links = [...(doc?.querySelectorAll("a[href]") ?? [])] as Element[];
    const want = /(о компании|о нас|реквизит|контакт|аккредит|раскрыт|ит-деятельн|документ|сведения|about|contacts?|requisit|rekvizit|company)/i;
    const seen = new Set([finalUrl.href]);
    for (const a of links) {
      if (pages.length >= 6) break;
      const href = a.getAttribute("href") || "";
      if (!want.test((a.textContent || "") + " " + href)) continue;
      let next: URL;
      try { next = new URL(href, finalUrl); } catch { continue; }
      if (next.host !== finalUrl.host || seen.has(next.href) || /\.(pdf|docx?|xlsx?|zip|jpg|png)$/i.test(next.pathname)) continue;
      seen.add(next.href);
      try { const r2 = await get(next.href, 10000); if (r2.ok) pages.push({ url: next.href, text: textOf(await r2.text()) }); } catch { /* пропускаем */ }
    }
    log.pages = pages.map((p) => p.url);

    // 3. ИНН и коды
    const innPage = pages.find((p) => p.text.includes(inn));
    const otherInn = !innPage ? pages.map((p) => p.text.match(/ИНН[:\s№]*(\d{10}|\d{12})/)?.[1]).find(Boolean) : undefined;
    let codes: string[] = [], codesUrl: string | null = null;
    for (const p of pages) { const c = findCodes(p.text); if (c.length > codes.length) { codes = c; codesUrl = p.url; } }
    const lost = !innPage && /(казино|casino|ставк[аи] на спорт|букмекер|слоты|онлайн-займ|продается домен|domain is for sale|продаётся домен)/i.test(mainText);
    patch.site_status = innPage ? "ok" : lost ? "domain_lost" : otherInn ? "other_inn" : "no_inn";
    const notes: string[] = [];
    if (otherInn) notes.push(`На сайте ИНН ${otherInn}.`);
    if (lost) notes.push("Домен занят посторонним сайтом.");
    if (mainText.length < 400) notes.push("На главной почти нет текста — возможно, сайт собирается в браузере; проверить вручную.");

    // коды присваиваем только если сайт принадлежит компании (ИНН совпал)
    if (innPage && codes.length) {
      const primary = suggestPrimary(codes);
      Object.assign(patch, {
        it_codes: codes, codes_found_url: codesUrl, primary_code: primary, primary_code_auto: true,
        segment: primary ? SEG[primary] : "Не определено", segment_source: "codes", classification_status: "needs",
        evidence: "Коды видов ИТ-деятельности по приказу Минцифры № 449 указаны на сайте компании. Основной код предложен автоматически — подтвердить.",
        evidence_url: codesUrl,
      });
      notes.push(`Коды: ${codes.join(", ")}; предложен основной ${primary}.`);
    } else if (innPage) notes.push("Коды Минцифры на сайте не найдены.");

    // 4. логотип (только для своего сайта или если ИНН не нашли — на проверку)
    if (patch.site_status !== "domain_lost" && patch.site_status !== "other_inn") {
      const pick = pickLogo(doc, finalUrl);
      log.logo = pick ? { kind: pick.kind, why: pick.why, src: pick.kind === "url" ? pick.value.slice(0, 300) : "inline svg" } : null;
      if (pick) {
        let bytes: Uint8Array | null = null, type = "";
        if (pick.kind === "svg") {
          let svg = pick.value;
          if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
          bytes = new TextEncoder().encode(svg); type = "image/svg+xml";
        } else if (pick.value.startsWith("data:")) {
          const m = pick.value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
          if (m) { type = m[1]; bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3])); }
        } else {
          try {
            const r3 = await get(pick.value, 10000);
            if (r3.ok) {
              type = (r3.headers.get("content-type") ?? "").split(";")[0].trim();
              bytes = new Uint8Array(await r3.arrayBuffer());
              if (!EXT[type]) {
                const head = new TextDecoder().decode(bytes.slice(0, 300)).toLowerCase();
                if (head.includes("<svg")) type = "image/svg+xml";
                else if (bytes[0] === 0x89 && bytes[1] === 0x50) type = "image/png";
                else if (bytes[0] === 0xff && bytes[1] === 0xd8) type = "image/jpeg";
                else if (head.startsWith("riff")) type = "image/webp";
              }
            }
          } catch (e) { log.logo_error = String((e as Error).message); }
        }
        if (bytes && EXT[type] && bytes.length > 0 && bytes.length < 3_000_000) {
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
          const path = `${inn}/${hash.slice(0, 16)}.${EXT[type]}`;
          const up = await admin.storage.from("candidate-logos").upload(path, bytes, { contentType: type, upsert: true });
          if (!up.error) {
            Object.assign(patch, {
              logo_storage_path: path, logo_sha256: hash, logo_status: "needs_check", logo_flags: pick.flags,
              logo_url: pick.kind === "url" && !pick.value.startsWith("data:") ? pick.value : `${finalUrl.origin}/ (встроенный логотип)`,
              logo_source_url: pick.kind === "url" ? pick.value.slice(0, 500) : `${finalUrl.href} (${pick.why})`,
            });
            notes.push(`Логотип: ${pick.why}${pick.flags.length ? ` [${pick.flags.join(", ")}]` : ""}.`);
          } else log.upload_error = up.error.message;
        } else notes.push("Логотип найден, но файл не скачался.");
      } else notes.push("Логотип автоматически не найден.");
    }
    patch.site_note = notes.join(" ");
    patch.collect_log = log;
    const { error: ue } = await admin.from("registry_companies").update(patch).eq("inn", inn);
    if (ue) return json({ error: ue.message }, 500);
    return json({ inn, site_status: patch.site_status, codes, logo: Boolean(patch.logo_storage_path), note: patch.site_note });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
