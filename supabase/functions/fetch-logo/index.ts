// Edge Function: скачивает логотип кандидата с сайта компании и кладёт копию в хранилище candidate-logos.
// Вызывает только владелец (проверка is_owner() по его токену). Браузер сам скачать не может — сайты не дают CORS.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const EXT: Record<string, string> = {
  "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
      secret = keys.default ?? Object.values(keys)[0] ?? secret;
    } catch { /* старый формат ключей */ }
    const admin = createClient(url, secret, { auth: { persistSession: false } });
    // только владелец исследования: проверяем токен пользователя и его роль
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Нужно войти в приложение" }, 401);
    const { data: prof } = await admin.from("profiles").select("role,revoked_at,access_expires_at").eq("user_id", u.user.id).maybeSingle();
    const active = prof && !prof.revoked_at && (!prof.access_expires_at || new Date(prof.access_expires_at) > new Date());
    if (!active || prof.role !== "owner") return json({ error: "Только для владельца исследования" }, 403);

    const { inn, source } = await req.json() as { inn: string; source: string };
    if (!/^\d{10,12}$/.test(inn ?? "")) return json({ error: "Неверный ИНН" }, 400);
    let bytes: Uint8Array, type: string;
    if (source.startsWith("data:")) {
      const m = source.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
      if (!m) return json({ error: "Неверный data URL" }, 400);
      type = m[1];
      bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
    } else {
      if (!/^https?:\/\//.test(source)) return json({ error: "Нужна ссылка http(s)" }, 400);
      const r = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0 (prcindex logo research)" }, redirect: "follow" });
      if (!r.ok) return json({ error: `Сайт вернул ${r.status}` }, 502);
      type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
      bytes = new Uint8Array(await r.arrayBuffer());
      if (!EXT[type]) {
        const head = new TextDecoder().decode(bytes.slice(0, 200)).toLowerCase();
        if (head.includes("<svg")) type = "image/svg+xml";
        else if (bytes[0] === 0x89 && bytes[1] === 0x50) type = "image/png";
        else if (bytes[0] === 0xff && bytes[1] === 0xd8) type = "image/jpeg";
      }
    }
    if (!EXT[type]) return json({ error: `Не изображение: ${type || "тип не указан"}` }, 415);
    if (bytes.length > 3_000_000) return json({ error: "Файл больше 3 МБ" }, 413);

    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const path = `${inn}/${hash.slice(0, 16)}.${EXT[type]}`;
    const up = await admin.storage.from("candidate-logos").upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) return json({ error: up.error.message }, 500);
    const upd = await admin.from("registry_companies")
      .update({ logo_storage_path: path, logo_sha256: hash, updated_at: new Date().toISOString() }).eq("inn", inn);
    if (upd.error) return json({ error: upd.error.message }, 500);
    return json({ path, sha256: hash, bytes: bytes.length, type });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
