// Переносит прежние результаты «Кандидатов» из src/seed и пилотных карточек в registry_companies.
// Запуск: node scripts/registry/build_seed_sql.mjs > work/registry_seed.sql  (затем выполнить в SQL-редакторе Supabase)
import { readFileSync } from "node:fs";

const seed = (f) => JSON.parse(readFileSync(new URL(`../../src/seed/${f}.json`, import.meta.url), "utf8"));
const research = [
  ...seed("registry-research-0000-0259"),
  ...seed("registry-research-0260-0299"),
  ...seed("registry-research-0300-0569"),
  ...seed("registry-research-0570-0599"),
];

// Пилотные карточки из прежнего src/registry-pilot.tsx (разобраны вручную 18.11.2026)
const pilot = seed("registry-pilot");
const logoFiles = {
  "sage-observability.tech": "sage.png", "sovcombank.it": "sovcombank.svg", "tensor.ru": "tensor.png",
  "itmmagnit.ru": "itm.png", "avito.ru": "avito.png", "servionica.ru": "servionica.png",
  "transneft.ru": "gipro.png", "bft.ru": "bft.png", "smlab.digital": "smlab.png", "rshb-intech.ru": "rshb.png",
};

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a?.length ? `array[${a.map(q).join(",")}]::text[]` : `'{}'::text[]`);
const js = (v) => (v ? `${q(JSON.stringify(v))}::jsonb` : "null");

const rows = [];
for (const r of research) {
  const evidence = r.matched?.length
    ? `Автоматическая классификация по официальному сайту. Найдены признаки: ${r.matched.join(", ")}.`
    : null;
  rows.push([
    q(r.inn), "null", q(r.segment || "Не определено"), arr(r.tags), q(r.confidence || "Низкая"), q(evidence), q(r.website),
    js(r.palette), q(r.paletteType ?? null), q(r.logo_file), q(r.logo_url),
    q(r.logo_file ? "needs_check" : "needs_search"),
    q(r.classification_status === "candidate" ? "ready" : "needs"), q(r.checked_at),
  ]);
}
for (const p of pilot) {
  rows.push([
    q(p.inn), q(p.brand), q(p.segment), arr(p.tags), q(p.confidence), q(p.evidence), q(p.evidenceUrl),
    js(p.palette), q(p.paletteType), q(`/candidate-logos/${logoFiles[p.logoDomain] || "placeholder.svg"}`), "null",
    q(p.logoStatus === "Требуется поиск" ? "needs_check" : "ready"),
    q(p.classificationStatus === "Требуется классификация" ? "needs" : "ready"), q("2026-11-18T00:00:00Z"),
  ]);
}

console.log(`with v(inn,brand,segment,tags,confidence,evidence,evidence_url,palette,palette_type,logo_url,logo_source_url,logo_status,classification_status,checked_at) as (values
${rows.map((r) => `(${r.join(",")})`).join(",\n")}
), upd as (
update public.registry_companies t set
  brand=coalesce(v.brand,t.brand), segment=v.segment, tags=v.tags, confidence=v.confidence, evidence=v.evidence,
  evidence_url=v.evidence_url, palette=v.palette, palette_type=v.palette_type, logo_url=v.logo_url,
  logo_source_url=v.logo_source_url, logo_status=v.logo_status, classification_status=v.classification_status,
  checked_at=v.checked_at::timestamptz, updated_at=now()
from v where t.inn=v.inn returning t.inn)
select (select count(*) from upd) updated, ${rows.length} expected;`);
