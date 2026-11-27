// Сегмент по сайту компании для карточек, где он ещё не определён (classification_status = 'needs').
//  • Есть коды Минцифры с сайта, но они из разных сегментов → выбираем среди этих сегментов тот, о котором говорит описание сайта.
//  • Кодов на сайте нет → сегмент по описанию сайта (заголовок и описание страницы), segment_source = 'description'.
// Сегмент ставится, только если описание явно указывает на один сегмент (есть совпадения и заметный отрыв от второго);
// иначе карточка остаётся в «требуется классификация». Ручные решения (classification_status = 'ready') не трогаем.
// Слова-признаки и итог пишутся в evidence, чтобы было видно, почему выбран сегмент.
import { createClient } from "@supabase/supabase-js";
import { SEG } from "./codes.mjs";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DRY = process.env.DRY === "1";

const S = {
  DEV: "Разработка ПО, информационных систем и сайтов",
  SALES: "Продажа и лицензирование ПО",
  AUTO: "Автоматизация и цифровизация",
  INFRA: "Инфраструктура, облака, ЦОД, хостинг",
  SEC: "Информационная безопасность",
  DATA: "Данные и искусственный интеллект",
  WEB: "Интернет-сервисы и платформы",
  FIN: "Финтех и электронный документооборот",
  HW: "Электроника, оборудование, робототехника",
  GAMES: "Видеоигры",
  SCI: "Научные исследования",
};
// Признаки: начало слова (кириллица/латиница). Вес 2 — сильный признак, 1 — слабый.
const W = (s) => new RegExp(`(?:^|[^а-яёa-z0-9])(?:${s})`, "i");
const RULES = {
  DEV: [[W("разработк|программн(ое|ых|ого) обеспечени|заказн(ая|ой|ую) разработ|веб-разработ|мобильн(ые|ых|ое) прилож|создани[ея] сайт|software development|custom software|аутсорс(инг)? разработ|outsourc|frontend|backend"), 2], [W("приложени|сайт(ов|ы)? под ключ|development|it-компани|ит-компани|digital-агентств|веб-студи|web studio"), 1]],
  SALES: [[W("дистрибут|лицензи(и|й|рован)|реселлер|поставк[аи] (программ|по)|продаж[аи] (программ|по|лицензий)|интернет-магазин (программ|софта)"), 2], [W("партн[её]р (microsoft|1с|kaspersky|касперск)|софт"), 1]],
  AUTO: [[W("автоматизац|внедрени|цифровизац|цифров(ая|ой) трансформац|1с|1c|erp|crm|bpm|mes|асу ?тп|scada|ecm"), 2], [W("учет|учёт|бизнес-процесс|интеграци"), 1]],
  INFRA: [[W("хостинг|дата-центр|центр обработки данных|цод|облачн|облак|cloud|vps|vds|colocation|ит-аутсорсинг|it-аутсорсинг|обслуживани[ея] (компьютер|ит-инфраструктур|it-инфраструктур)|системн(ая|ое|ый) интегра|интернет-провайдер|провайдер|телеком|сет(и|ей) связи|ит-инфраструктур|it-инфраструктур"), 2], [W("сервер|сетев|администрирован|техническ(ая|ое) поддержк|связь|видеонаблюден"), 1]],
  SEC: [[W("информационн(ая|ой|ую) безопасност|кибербезопасност|защит[аыу] информац|сзи|антивирус|dlp|siem|пентест|криптограф|аттестаци[яи] объект|удостоверяющ"), 2], [W("безопасност|security|защищ[её]нн"), 1]],
  DATA: [[W("искусственн(ый|ого) интеллект|нейросет|нейронн|машинн(ое|ого) обучени|machine learning|computer vision|компьютерн(ое|ого) зрени|распознавани|big data|больши[ех] данны|анализ данных|аналитик[аи] данных|data science|llm|генеративн"), 2], [W("ai|ии|аналитик|bi|данны[ех]"), 1]],
  WEB: [[W("маркетплейс|онлайн-сервис|онлайн-платформ|агрегатор|бронировани|онлайн-школ|онлайн-образован|edtech|электронн(ое|ого) обучени|интернет-реклам|контекстн(ая|ой) реклам|таргет|seo|продвижени[ея] сайт|медиа|соцсет|социальн(ая|ой) сет|доставк[аи] еды|такси|каршеринг|стриминг|онлайн-кинотеатр"), 2], [W("сервис для|платформ[аы]|портал|онлайн|маркетинг|реклам|интернет-магазин"), 1]],
  FIN: [[W("финтех|fintech|платеж|платёж|эквайринг|электронн(ый|ого) документооборот|эдо|электронн(ая|ой|ую) подпис|отч[её]тност|онлайн[- ]касс|касс[аы] для|офд|фискальн|банковск|страхов|кредит|бухгалтер"), 2], [W("финанс|банк|касс[аы]"), 1]],
  HW: [[W("оборудовани|электроник|радиоэлектрон|приборостро|микроэлектрон|робот|датчик|сенсор|беспилот|бпла|дрон|контроллер|печатн(ые|ых) плат|производств[оа] (устройств|оборудован|электрон)|телеметри|навигационн|аппаратн"), 2], [W("устройств|производств|железо|hardware|iot|интернет вещей"), 1]],
  GAMES: [[W("игр(ы|а|ов|овой|овых|ы)?(?![а-яё])|game|gamedev|геймдев|видеоигр|игров"), 3], [W("гейм"), 1]],
  SCI: [[W("научн|ниокр|научно-исследоват|лаборатори|r&d"), 2], [W("исследовани"), 1]],
};

function score(text) {
  const t = ` ${text.toLowerCase().replace(/ё/g, "е")} `;
  const res = {};
  for (const [k, rules] of Object.entries(RULES)) {
    let sc = 0, strong = 0;
    const hits = [];
    for (const [re, w] of rules) {
      const g = new RegExp(re.source, "gi");
      const m = t.match(g);
      if (m) { sc += w * Math.min(m.length, 3); if (w >= 2) strong++; hits.push(...m.map((x) => x.trim()).slice(0, 3)); }
    }
    if (sc) res[S[k]] = { sc, strong, hits: [...new Set(hits)] };
  }
  return res;
}
function pick(scores, allowed) {
  const arr = Object.entries(scores).filter(([seg]) => !allowed || allowed.includes(seg)).sort((a, b) => b[1].sc - a[1].sc);
  if (!arr.length) return null;
  const [top, second] = arr;
  const margin = top[1].sc - (second?.[1].sc ?? 0);
  // явный лидер: сильный признак и отрыв
  if (top[1].strong > 0 && top[1].sc >= 2 && margin >= 2) return { segment: top[0], hits: top[1].hits, runner: second?.[0] ?? null };
  return null;
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("registry_companies")
    .select("inn,brand,name,site_description,it_codes,segment,segment_source,classification_status,evidence")
    .eq("classification_status", "needs").not("site_description", "is", null).order("inn").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`Карточек без сегмента с описанием сайта: ${rows.length}`);
const stat = { byCodes: 0, byText: 0, left: 0, errors: 0 };
const bySeg = {};
const samples = [];
for (const r of rows) {
  const text = `${r.site_description ?? ""}`;
  const sc = score(text);
  const codeSegs = [...new Set((r.it_codes ?? []).filter((c) => c !== "1.01" && c !== "2.01").map((c) => SEG[c]).filter(Boolean))];
  let res = null, source = null;
  if (codeSegs.length > 1) { res = pick(sc, codeSegs); source = "codes"; }
  else if (!r.it_codes?.length || r.segment_source !== "codes") { res = pick(sc); source = "description"; }
  if (!res) { stat.left++; continue; }
  stat[source === "codes" ? "byCodes" : "byText"]++;
  bySeg[res.segment] = (bySeg[res.segment] ?? 0) + 1;
  if (samples.length < 40) samples.push(`${r.inn} «${r.brand ?? r.name}» → ${res.segment} [${res.hits.join(", ")}] :: ${text.slice(0, 120)}`);
  if (DRY) continue;
  const note = source === "codes"
    ? `Сегмент выбран среди сегментов кодов с сайта по описанию сайта (признаки: ${res.hits.join(", ")}).`
    : `Сегмент определён автоматически по описанию сайта (признаки: ${res.hits.join(", ")}). Кодов Минцифры на сайте нет.`;
  const { error } = await db.from("registry_companies").update({
    segment: res.segment, segment_source: source, classification_status: "ready",
    evidence: note, updated_at: new Date().toISOString(),
  }).eq("inn", r.inn).eq("classification_status", "needs");
  if (error) { stat.errors++; console.log(r.inn, error.message); }
}
console.log(samples.join("\n"));
console.log("По сегментам:", JSON.stringify(bySeg));
console.log(`Итог${DRY ? " (пробный, без записи)" : ""}: выбрано среди кодов — ${stat.byCodes}, по описанию — ${stat.byText}, оставлено для ручной классификации — ${stat.left}, ошибок — ${stat.errors}.`);
