// Выполняется ВНУТРИ страницы (page.evaluate). Ищет логотип среди того, что реально видно в шапке.
// Возвращает лучшего кандидата: его прямоугольник на экране, тип и, если есть, адрес исходного файла.
(() => {
  const vw = window.innerWidth;
  const JUNK = /(lang|language|globe|earth|world|flag|burger|hamburger|menu|search|close|arrow|chevron|phone|tel:|mail|cart|basket|user|profile|login|account|social|vk\.com|vkontakte|telegram|t\.me|whatsapp|youtube|rutube|dzen|habr|instagram|facebook|twitter|ok\.ru|spinner|loader|captcha|banner|slide|hero|award|partner|client|certificate|badge)/i;
  const rootHref = (a) => {
    if (!a) return false;
    try {
      const u = new URL(a.getAttribute("href") || "", location.href);
      return u.host === location.host && /^\/(index\.\w+|main|home|ru\/?|en\/?)?$/i.test(u.pathname);
    } catch { return false; }
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12 || r.bottom < 0 || r.top > 260 || r.right < 0 || r.left > vw) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.1) return null;
    return r;
  };
  const cands = [];
  const els = document.querySelectorAll("img, svg, picture, object[type='image/svg+xml'], [style*='background-image'], a[href] > span, a[href] > div");
  for (const el of els) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (el.tagName.toLowerCase() === "svg" && el.parentElement?.closest("svg")) continue;
    const r = visible(el);
    if (!r) continue;
    const a = el.closest("a");
    const desc = [el.getAttribute("class"), el.id, el.getAttribute("alt"), el.getAttribute("src"), el.getAttribute("aria-label"),
      a?.getAttribute("class"), a?.getAttribute("aria-label"), a?.getAttribute("href"), el.parentElement?.getAttribute("class")].filter(Boolean).join(" ");
    const tag = el.tagName.toLowerCase();
    const textOnly = (tag === "span" || tag === "div");
    if (textOnly && !(rootHref(a) && (el.innerText || "").trim().length >= 2 && el.children.length <= 2)) continue;
    let s = 0;
    if (rootHref(a)) s += 6;
    if (/logo|лого|brand/i.test(desc)) s += 5;
    if (el.closest("header, [class*='header' i], nav, [class*='navbar' i]")) s += 2;
    if (r.left < vw * 0.4) s += 2;
    if (r.top < 140) s += 1;
    if (JUNK.test(desc) && !/logo|лого/i.test(desc)) s -= 8;
    const ratio = r.width / r.height;
    if (r.width < 48 && r.height < 48) s -= 2;
    if (ratio > 1.3) s += 1;
    if (r.width > vw * 0.6) s -= 6;
    if (textOnly) s -= 2;
    let src = null;
    if (tag === "img") src = el.currentSrc || el.src || null;
    if (tag === "object") src = el.data || null;
    if (tag === "picture") src = el.querySelector("img")?.currentSrc || null;
    cands.push({ s, tag, src, box: { x: r.left, y: r.top, w: r.width, h: r.height }, desc: desc.slice(0, 160) });
  }
  cands.sort((p, q) => q.s - p.s || p.box.y - q.box.y || p.box.x - q.box.x);
  const best = cands[0] && cands[0].s >= 3 ? cands[0] : null;
  let svg = null;
  if (best && best.tag === "svg") {
    const el = [...document.querySelectorAll("svg")].find((e) => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.left - best.box.x) < 1 && Math.abs(r.top - best.box.y) < 1;
    });
    if (el && !/<use\b/i.test(el.outerHTML)) {
      const c = el.cloneNode(true);
      c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const cs = getComputedStyle(el);
      if (!c.getAttribute("fill") && cs.fill && cs.fill !== "rgb(0, 0, 0)") c.setAttribute("fill", cs.fill);
      if (!c.getAttribute("color") && cs.color) c.setAttribute("color", cs.color);
      svg = c.outerHTML;
    }
  }
  return { best, svg, top: cands.slice(0, 5) };
})();
