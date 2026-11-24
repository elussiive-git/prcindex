import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "./auth";
import { IT_CODES, SEGMENTS, codeInfo, primarySegment } from "./it-codes";
import "./registry-pilot.css";

// Кандидаты нового корпуса: все действующие компании реестра Минцифры (таблица registry_companies).
// Данные больше не встраиваются в сборку — грузятся из Supabase постранично и только после входа.

type PaletteColor = { name: string; hex: string };
type LogoStatus = "needs_search" | "needs_check" | "ready";
type Candidate = {
  name: string;
  brand: string;
  inn: string;
  ogrn: string;
  registry: string;
  decision: string;
  decisionNumber: string;
  headcount: number | null;
  website: string;
  segment: string;
  tags: string[];
  confidence: string;
  evidence: string;
  evidenceUrl: string;
  palette: PaletteColor[];
  paletteType: "Одноцветный" | "Двухцветный" | "Многоцветный";
  logoDomain: string;
  logoStatus: LogoStatus;
  classificationStatus: "needs" | "ready";
  customLogo?: string;
  itCodes: string[];
  segmentSource: "codes" | "description" | null;
  codesUrl: string;
  segmentLegacy: string;
  primaryCode: string;
  logoFlags: string[];
  siteStatus: string;
  siteNote: string;
};
type DbRow = {
  inn: string;
  ogrn: string | null;
  registry_number: string | null;
  name: string;
  decision_date: string | null;
  decision_number: string | null;
  headcount: number | null;
  website: string | null;
  domain: string | null;
  brand: string | null;
  segment: string;
  tags: string[] | null;
  confidence: string;
  evidence: string | null;
  evidence_url: string | null;
  palette: PaletteColor[] | null;
  palette_type: Candidate["paletteType"] | null;
  logo_url: string | null;
  logo_status: LogoStatus;
  classification_status: "needs" | "ready";
  it_codes: string[] | null;
  segment_source: "codes" | "description" | null;
  codes_found_url: string | null;
  segment_legacy: string | null;
  primary_code: string | null;
  logo_flags: string[] | null;
  site_status: string | null;
  site_note: string | null;
  created_at: string;
};
const columns =
  "inn,ogrn,registry_number,name,decision_date,decision_number,headcount,website,domain,brand,segment,tags,confidence,evidence,evidence_url,palette,palette_type,logo_url,logo_status,classification_status,it_codes,segment_source,codes_found_url,segment_legacy,primary_code,logo_flags,site_status,site_note,created_at";

const tidyName = (name: string) =>
  name
    .replace(/^ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ\s*/i, "")
    .replace(/^Общество с ограниченной ответственностью\s*/i, "")
    .replace(/^АКЦИОНЕРНОЕ ОБЩЕСТВО\s*/i, "АО ")
    .replace(/^ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО\s*/i, "ПАО ")
    .replace(/[«»"]/g, "")
    .trim();
const placeholder = "/candidate-logos/placeholder.svg";
const toCandidate = (x: DbRow): Candidate => ({
  name: x.name,
  brand: x.brand || tidyName(x.name),
  inn: x.inn,
  ogrn: x.ogrn || "",
  registry: x.registry_number || "",
  decision: x.decision_date
    ? new Date(x.decision_date + "T00:00:00").toLocaleDateString("ru-RU")
    : "",
  decisionNumber: x.decision_number || "",
  headcount: x.headcount,
  website: x.website || "",
  segment: x.segment || "Не определено",
  tags: x.tags || [],
  confidence: x.confidence || "Низкая",
  evidence:
    x.evidence ||
    "Карточка добавлена из реестра Минцифры. Требуется исследование официального сайта.",
  evidenceUrl: x.evidence_url || x.website || "",
  // Цвет определяет только сканер (или ручная правка). Без данных — пусто, без заглушки.
  palette: x.palette?.length ? x.palette : [],
  paletteType: x.palette_type || "Одноцветный",
  logoDomain: x.domain || "",
  logoStatus: x.logo_status,
  classificationStatus: x.classification_status,
  customLogo: x.logo_url || undefined,
  itCodes: x.it_codes || [],
  segmentSource: x.segment_source,
  codesUrl: x.codes_found_url || "",
  segmentLegacy: x.segment_legacy || "",
  primaryCode: x.primary_code || "",
  logoFlags: x.logo_flags || [],
  siteStatus: x.site_status || "",
  siteNote: x.site_note || "",
});
const toDb = (x: Candidate) => ({
  brand: x.brand,
  segment: x.segment,
  tags: x.tags,
  palette: x.palette.length ? x.palette : null,
  palette_type: x.palette.length ? x.paletteType : null,
  logo_url: x.customLogo || null,
  logo_status: x.logoStatus,
  classification_status: x.classificationStatus,
  it_codes: x.itCodes,
  segment_source: x.segmentSource,
  codes_found_url: x.codesUrl || null,
  primary_code: x.primaryCode || null,
  logo_flags: x.logoFlags,
  updated_at: new Date().toISOString(),
});
const logo = (x: Candidate) => x.customLogo || placeholder;
const siteStatusLabel: Record<string, string> = {
  ok: "открылся, ИНН совпадает",
  other_inn: "на сайте другой ИНН",
  no_inn: "ИНН на сайте не найден",
  unreachable: "не открывается",
  cert_error: "российский сертификат — нужен ручной просмотр",
  domain_lost: "домен занят посторонним сайтом",
};
const needsLogo = (x: Candidate) => x.logoStatus !== "ready";
const needsClass = (x: Candidate) => x.classificationStatus !== "ready";

const colorGroups = [
  "чёрный",
  "серый",
  "белый",
  "синий",
  "бирюзовый",
  "зелёный",
  "жёлтый",
  "оранжевый",
  "красный",
  "розовый",
  "фиолетовый",
  "коричневый",
];
const colorHexes: Record<string, string> = {
  чёрный: "#101010", серый: "#969696", белый: "#FFFFFF",
  синий: "#2878D0", бирюзовый: "#20A9A4", зелёный: "#49A45B",
  жёлтый: "#F1C62E", оранжевый: "#ED842F", красный: "#E33E36",
  розовый: "#E879AA", фиолетовый: "#7259BD", коричневый: "#855B40",
};
const paletteTypes: Candidate["paletteType"][] = [
  "Одноцветный",
  "Двухцветный",
  "Многоцветный",
];
// Старые правки, сделанные до переезда в базу, хранились только в этом браузере
const legacyKey = "prcindex-candidate-work-v3";
type Queue = "main" | "logo" | "classification";
type Counts = { total: number; site: number; ready: number; logo: number; classification: number };
const pageSize = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyQueue(query: any, queue: Queue) {
  if (queue === "logo") return query.neq("logo_status", "ready");
  if (queue === "classification") return query.eq("classification_status", "needs");
  return query.eq("logo_status", "ready").eq("classification_status", "ready");
}

export function RegistryPilot() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [shownTotal, setShownTotal] = useState(0);
  const [selectedInn, setSelectedInn] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>("main");
  const [visible, setVisible] = useState(pageSize);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setVisible(pageSize), [queue, term]);

  const loadCounts = useCallback(async () => {
    if (!supabase) return;
    const db = supabase;
    const head = () => db.from("registry_companies").select("inn", { count: "exact", head: true });
    const [total, site, ready, logoQ, classQ] = await Promise.all([
      head(),
      head().not("website", "is", null),
      applyQueue(head(), "main"),
      applyQueue(head(), "logo"),
      applyQueue(head(), "classification"),
    ]);
    const failed = [total, site, ready, logoQ, classQ].find((x) => x.error);
    if (failed) throw failed.error;
    setCounts({
      total: total.count ?? 0,
      site: site.count ?? 0,
      ready: ready.count ?? 0,
      logo: logoQ.count ?? 0,
      classification: classQ.count ?? 0,
    });
  }, []);

  const loadPage = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let query = applyQueue(
      supabase.from("registry_companies").select(columns, { count: "exact" }),
      queue,
    );
    if (term) {
      const safe = term.replace(/[%,()]/g, " ");
      query = /^\d{4,}$/.test(term)
        ? query.like("inn", `${safe}%`)
        : query.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,domain.ilike.%${safe}%`);
    }
    const { data, count, error: e } = await query
      .order("headcount", { ascending: false, nullsFirst: false })
      .order("inn")
      .range(0, visible - 1);
    setLoading(false);
    if (e) throw e;
    setItems(((data ?? []) as DbRow[]).map(toCandidate));
    setShownTotal(count ?? 0);
  }, [queue, term, visible]);

  useEffect(() => {
    loadCounts().catch((e) => setError(String(e.message || e)));
  }, [loadCounts]);
  useEffect(() => {
    loadPage().catch((e) => {
      setLoading(false);
      setError(String(e.message || e));
    });
  }, [loadPage]);

  // Однократный перенос старых правок из браузера в базу
  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    type LegacyEdit = {
      brand?: string;
      segment?: string;
      tags?: string[];
      palette?: PaletteColor[];
      paletteType?: string;
      customLogo?: string;
      logoStatus?: string;
      classificationStatus?: string;
    };
    let saved: Record<string, LegacyEdit> = {};
    try {
      saved = JSON.parse(localStorage.getItem(legacyKey) || "{}");
    } catch {
      return;
    }
    const inns = Object.keys(saved);
    if (!inns.length) return;
    void (async () => {
      let moved = 0;
      for (const inn of inns) {
        const e = saved[inn];
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (e.brand) patch.brand = e.brand;
        if (e.segment) patch.segment = e.segment;
        if (e.tags) patch.tags = e.tags;
        if (e.palette) patch.palette = e.palette;
        if (e.paletteType) patch.palette_type = e.paletteType;
        if (e.customLogo) patch.logo_url = e.customLogo;
        if (e.logoStatus) patch.logo_status = e.logoStatus === "Готово" || e.logoStatus === "ready" ? "ready" : e.customLogo ? "needs_check" : "needs_search";
        if (e.classificationStatus) patch.classification_status = e.classificationStatus === "Готово" || e.classificationStatus === "ready" ? "ready" : "needs";
        const { error: err } = await db.from("registry_companies").update(patch).eq("inn", inn);
        if (err) return;
        moved++;
      }
      localStorage.setItem(legacyKey + "-moved-to-db", localStorage.getItem(legacyKey) || "{}");
      localStorage.removeItem(legacyKey);
      setNotice(`Перенесено в базу правок из этого браузера: ${moved}`);
      await Promise.all([loadCounts(), loadPage()]);
    })();
  }, [loadCounts, loadPage]);

  const selected = items.find((x) => x.inn === selectedInn) ?? null;
  async function save(item: Candidate) {
    if (!supabase) throw new Error("Облачное сохранение недоступно");
    const { error: e } = await supabase.from("registry_companies").update(toDb(item)).eq("inn", item.inn);
    if (e) throw e;
    setItems((current) => current.map((x) => (x.inn === item.inn ? item : x)));
    void loadCounts();
  }

  if (!supabase)
    return (
      <div className="queue-empty">
        <b>Кандидаты доступны только после входа</b>
        <span>Данные реестра хранятся в закрытой базе Supabase.</span>
      </div>
    );

  const fmt = (n?: number) => (n ?? 0).toLocaleString("ru-RU");
  const titles = {
    main: [
      "Готовые карточки",
      "Логотип подтверждён и сегмент определён",
    ],
    logo: [
      "Требуется поиск или проверка логотипа",
      "Найдите официальный логотип или подтвердите найденный автоматически",
    ],
    classification: [
      "Требуется классификация",
      "Уточните сегмент, специализации и цветовую разметку",
    ],
  } as const;
  return (
    <div className="registry-pilot">
      <section className="registry-summary">
        <div>
          <span>Срез реестра от 03.11.2026</span>
          <h2>Компании из реестра Минцифры</h2>
          <p>
            Все действующие аккредитованные ИТ-компании. С сайтом —{" "}
            {fmt(counts?.site)}. Карточка готова после проверки логотипа и
            классификации.
          </p>
        </div>
        <div className="registry-count">
          <b>{counts ? fmt(counts.total) : "…"}</b>
          <small>действующих компаний</small>
        </div>
      </section>
      <div className="registry-stats">
        <button
          className={queue === "main" ? "active" : ""}
          onClick={() => setQueue("main")}
        >
          <CheckCircle2 />
          <b>{fmt(counts?.ready)}</b>
          <span>готово</span>
        </button>
        <button
          className={queue === "logo" ? "active" : ""}
          onClick={() => setQueue("logo")}
        >
          <ImageOff />
          <b>{fmt(counts?.logo)}</b>
          <span>требуется поиск / проверка</span>
        </button>
        <button
          className={queue === "classification" ? "active" : ""}
          onClick={() => setQueue("classification")}
        >
          <Tags />
          <b>{fmt(counts?.classification)}</b>
          <span>требуется классификация</span>
        </button>
      </div>
      <label className="registry-search">
        <Search size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название, домен или ИНН"
        />
      </label>
      {error && <p className="save-error">Не удалось загрузить данные: {error}</p>}
      {notice && <p className="save-ok">{notice}</p>}
      <div className="sectionhead">
        <div>
          <b>{titles[queue][0]}</b>
          <span>
            {titles[queue][1]} · показано {fmt(Math.min(visible, shownTotal))}{" "}
            из {fmt(shownTotal)}
          </span>
        </div>
      </div>
      {loading && !items.length ? (
        <div className="queue-empty">
          <span>Загружаем карточки…</span>
        </div>
      ) : items.length ? (
        <>
          <section className="candidate-grid">
            {items.map((x) => (
              <article key={x.inn} onClick={() => setSelectedInn(x.inn)}>
                <div className={x.logoFlags.includes("inverted") ? "candidate-pic dark" : "candidate-pic"}>
                  <img src={logo(x)} alt={x.brand} loading="lazy" />
                  {needsLogo(x) && (
                    <span>{x.customLogo ? "проверить логотип" : "нет логотипа"}</span>
                  )}
                  {!needsLogo(x) && needsClass(x) && <span>классифицировать</span>}
                </div>
                <div className="candidate-meta">
                  <b>{x.brand}</b>
                  <small>
                    {x.website ? x.website.replace(/^https?:\/\//, "") : "сайт не указан"}
                  </small>
                  {x.segment !== "Не определено" && (
                    <small className="candidate-segment-line" title={x.itCodes.join(", ")}>
                      {x.segment}
                      {x.primaryCode ? ` · ${x.primaryCode}` : x.itCodes.length ? ` · ${x.itCodes.length} код.` : " · по описанию"}
                    </small>
                  )}
                  <div>
                    {x.palette.length ? (
                      <>
                        <span className="candidate-palette-dots">
                          {x.palette.map((c, i) => (
                            <i key={i} style={{ background: c.hex }} />
                          ))}
                        </span>
                        {x.palette.map((c) => c.name).join(" + ")}
                        <em>{x.paletteType}</em>
                      </>
                    ) : (
                      <span className="color-pending">цвет не определён</span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
          {visible < shownTotal && (
            <button
              className="load-more"
              disabled={loading}
              onClick={() => setVisible((x) => x + pageSize)}
            >
              {loading ? "Загружаем…" : "Показать ещё 100"}
            </button>
          )}
        </>
      ) : (
        <div className="queue-empty">
          <CheckCircle2 />
          <b>{term ? "Ничего не найдено" : "Очередь разобрана"}</b>
          <span>
            {term
              ? "Попробуйте другое название, домен или ИНН."
              : "Все карточки из этого блока перенесены в готовые."}
          </span>
        </div>
      )}
      {selected && (
        <CandidateDrawer
          item={selected}
          close={() => setSelectedInn(null)}
          save={save}
        />
      )}
    </div>
  );
}

function CandidateDrawer({
  item,
  close,
  save,
}: {
  item: Candidate;
  close: () => void;
  save: (item: Candidate) => Promise<void>;
}) {
  const [palette, setPalette] = useState(item.palette),
    [paletteType, setPaletteType] = useState(item.paletteType),
    [segment, setSegment] = useState(item.segment),
    [codes, setCodes] = useState<string[]>(item.itCodes),
    [codesUrl, setCodesUrl] = useState(item.codesUrl),
    [primaryCode, setPrimaryCode] = useState(item.primaryCode),
    [logoFlags, setLogoFlags] = useState<string[]>(item.logoFlags),
    [tags, setTags] = useState(item.tags.join(", ")),
    [customLogo, setCustomLogo] = useState(item.customLogo || ""),
    [logoConfirmed, setLogoConfirmed] = useState(
      item.logoStatus === "ready",
    ),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setPalette(item.palette);
    setPaletteType(item.paletteType);
    setSegment(item.segment);
    setCodes(item.itCodes);
    setCodesUrl(item.codesUrl);
    setPrimaryCode(item.primaryCode);
    setLogoFlags(item.logoFlags);
    setTags(item.tags.join(", "));
    setCustomLogo(item.customLogo || "");
    setLogoConfirmed(item.logoStatus === "ready");
    setMessage("");
  }, [item]);
  function readLogo(file?: File) {
    if (!file) return;
    if (file.size > 1500000) {
      setMessage(
        "Файл больше 1,5 МБ — используйте ссылку или уменьшите изображение",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomLogo(String(reader.result));
      setLogoConfirmed(true);
    };
    reader.readAsDataURL(file);
  }
  const activePrimary = codes.includes(primaryCode) ? primaryCode : "";
  const codeSegment = activePrimary
    ? codeInfo(activePrimary)?.segment ?? null
    : primarySegment(codes);
  function toggleCode(code: string) {
    setCodes((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  }
  function toggleFlag(flag: string) {
    setLogoFlags((current) =>
      current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag],
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (palette.some((x) => !/^#[0-9a-f]{6}$/i.test(x.hex))) {
      setMessage("Проверьте HEX: нужен формат #RRGGBB");
      return;
    }
    const next = {
      ...item,
      palette: palette.map((x) => ({ ...x, hex: x.hex.toUpperCase() })),
      // пустая палитра = цвет ещё не определён сканером
      paletteType,
      segment: codeSegment || segment,
      itCodes: codes,
      codesUrl,
      primaryCode: activePrimary,
      logoFlags,
      segmentSource: (codeSegment
        ? "codes"
        : segment && segment !== "Не определено"
          ? "description"
          : null) as Candidate["segmentSource"],
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      customLogo: customLogo || undefined,
      logoStatus: (logoConfirmed && customLogo
        ? "ready"
        : customLogo
          ? "needs_check"
          : "needs_search") as LogoStatus,
      classificationStatus: ((codeSegment || segment) && (codeSegment || segment) !== "Не определено"
        ? "ready"
        : "needs") as Candidate["classificationStatus"],
    };
    setSaving(true);
    try {
      await save(next);
      setMessage(
        next.logoStatus === "ready" && next.classificationStatus === "ready"
          ? "Сохранено — карточка перенесена в готовые"
          : "Сохранено — карточка остаётся в очереди",
      );
    } catch (err) {
      setMessage("Не удалось сохранить: " + String((err as Error).message || err));
    } finally {
      setSaving(false);
    }
  }
  const segments = [...SEGMENTS, "Не определено"];
  return (
    <div className="backdrop" onClick={close}>
      <aside
        className="drawer candidate-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          <X />
        </button>
        <div className={logoFlags.includes("inverted") ? "candidate-detail-logo dark" : "candidate-detail-logo"}>
          <img src={customLogo || logo(item)} alt={item.brand} />
        </div>
        <span
          className={
            needsLogo(item) || needsClass(item)
              ? "candidate-warn"
              : "candidate-ok"
          }
        >
          {needsLogo(item)
            ? item.customLogo ? "Требуется проверка логотипа" : "Требуется логотип"
            : needsClass(item)
              ? "Требуется классификация"
              : "Готово"}
        </span>
        <h2>{item.brand}</h2>
        {item.website ? (
          <a href={item.website} target="_blank" rel="noreferrer">
            {item.website}
          </a>
        ) : (
          <a>Сайт в реестре не указан</a>
        )}
        <form className="candidate-palette-editor" onSubmit={submit}>
          <div className="work-section">
            <b>Официальный логотип</b>
            <label>
              Ссылка на файл
              <input
                value={
                  customLogo.startsWith("data:")
                    ? "Загружен локальный файл"
                    : customLogo
                }
                disabled={customLogo.startsWith("data:")}
                onChange={(e) => {
                  setCustomLogo(e.target.value);
                  setLogoConfirmed(Boolean(e.target.value));
                }}
                placeholder="https://site.ru/logo.svg"
              />
            </label>
            <label className="file-button">
              Загрузить PNG, JPG, SVG
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => readLogo(e.target.files?.[0])}
              />
            </label>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={logoConfirmed}
                onChange={(e) => setLogoConfirmed(e.target.checked)}
              />
              Подтверждаю, что это официальный логотип
            </label>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={logoFlags.includes("inverted")}
                onChange={() => toggleFlag("inverted")}
              />
              Версия для тёмного фона (цветной на сайте нет)
            </label>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={logoFlags.includes("parent_brand")}
                onChange={() => toggleFlag("parent_brand")}
              />
              В связке с материнским брендом
            </label>
          </div>
          <div className="work-section">
            <b>Классификация по перечню Минцифры (приказ № 449)</b>
            <small className="codes-hint">
              Отметьте все коды, указанные на сайте, и выберите основной — тот,
              что лучше всего описывает главный бизнес компании. Сегмент
              берётся по основному коду.
            </small>
            <div className="codes-list">
              {SEGMENTS.map((seg) => (
                <fieldset key={seg}>
                  <legend>{seg}</legend>
                  {IT_CODES.filter((c) => c.segment === seg).map((c) => (
                    <div key={c.code} className="code-row">
                      <label className="code-check">
                        <input
                          type="checkbox"
                          checked={codes.includes(c.code)}
                          onChange={() => toggleCode(c.code)}
                        />
                        <b>{c.code}</b> {c.title}
                      </label>
                      {codes.includes(c.code) && (
                        <label className="code-primary" title="Основной вид деятельности">
                          <input
                            type="radio"
                            name="primary-code"
                            checked={activePrimary === c.code}
                            onChange={() => setPrimaryCode(c.code)}
                          />
                          основной
                        </label>
                      )}
                    </div>
                  ))}
                </fieldset>
              ))}
            </div>
            <label>
              Где указаны коды (ссылка на страницу)
              <input
                value={codesUrl}
                onChange={(e) => setCodesUrl(e.target.value)}
                placeholder="https://site.ru/about"
              />
            </label>
            {codeSegment ? (
              <p className="codes-result">
                {activePrimary ? `Основной код ${activePrimary} → ` : "Основной код не выбран, сегмент по большинству кодов → "}
                <b>{codeSegment}</b> · все коды:{" "}
                {codes.map((c) => codeInfo(c)?.code ?? c).join(", ")}
              </p>
            ) : (
              <small className="codes-hint">
                Кодов нет — выберите сегмент по описанию услуг, он будет помечен
                «по описанию».
              </small>
            )}
            <label>
              Основной сегмент
              <select
                value={codeSegment || segment}
                disabled={Boolean(codeSegment)}
                onChange={(e) => setSegment(e.target.value)}
              >
                {segments.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Специализации
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="через запятую"
              />
            </label>
          </div>
          <div className="palette-editor-title">
            <span className="candidate-palette-dots large">
              {palette.map((c, i) => (
                <i key={i} style={{ background: c.hex }} />
              ))}
            </span>
            <div>
              <b>Цветовая разметка</b>
              <small>Основные цвета без расчёта процентов</small>
            </div>
          </div>
          <label>
            Тип палитры
            <select
              value={paletteType}
              onChange={(e) =>
                setPaletteType(e.target.value as Candidate["paletteType"])
              }
            >
              {paletteTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="palette-rows">
            {palette.map((c, i) => (
              <div className="palette-row" key={i}>
                <span style={{ background: c.hex }} />
                <select
                  value={c.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setPalette((p) => p.map((x, n) => n === i ? { name, hex: colorHexes[name] } : x));
                  }}
                >
                  {colorGroups.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <input
                  value={c.hex}
                  maxLength={7}
                  onChange={(e) =>
                    setPalette((p) =>
                      p.map((x, n) =>
                        n === i ? { ...x, hex: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Удалить цвет"
                  onClick={() => setPalette((p) => p.filter((_, n) => n !== i))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="add-color"
            type="button"
            onClick={() =>
              setPalette((p) => [...p, { name: "синий", hex: "#2878D0" }])
            }
          >
            <Plus size={15} />
            Добавить цвет
          </button>
          {message && (
            <p
              className={
                message.startsWith("Сохранено") ? "save-ok" : "save-error"
              }
            >
              {message}
            </p>
          )}
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить карточку"}
          </button>
        </form>
        <dl>
          {[
            ["Юридическое название", item.name],
            ["ИНН", item.inn],
            ["ОГРН", item.ogrn],
            ["Запись в реестре", "№ " + item.registry],
            ["Решение", item.decisionNumber],
            ["Дата аккредитации", item.decision],
            ["Источник", "Реестр Минцифры, срез 03.11.2026"],
            ["Сотрудников", item.headcount === null ? "нет данных" : item.headcount.toLocaleString("ru-RU")],
            ["Сайт", siteStatusLabel[item.siteStatus] || "не проверялся"],
            ...(item.siteNote ? [["Заметка", item.siteNote]] : []),
            ["Коды Минцифры", item.itCodes.length ? item.itCodes.join(", ") : "не указаны"],
            ["Основной код", item.primaryCode || "—"],
            ["Основание сегмента", item.segmentSource === "codes" ? "коды на сайте" : item.segmentSource === "description" ? "по описанию услуг" : "—"],
            ...(item.segmentLegacy ? [["Сегмент по старому списку", item.segmentLegacy]] : []),
            ["Уверенность", item.confidence],
          ].map(([a, b]) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
        <div className="candidate-evidence">
          <small>Основание классификации</small>
          <p>{item.evidence}</p>
          {item.evidenceUrl && (
            <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
              Открыть источник <ExternalLink size={13} />
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
