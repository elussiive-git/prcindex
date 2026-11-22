import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Plus,
  Tags,
  Trash2,
  Users,
  X,
} from "lucide-react";
import registryBatch from "./seed/registry-batch-001.json";
import researchA from "./seed/registry-research-0000-0259.json";
import researchB from "./seed/registry-research-0260-0299.json";
import researchC from "./seed/registry-research-0300-0569.json";
import researchD from "./seed/registry-research-0570-0599.json";
import "./registry-pilot.css";

type PaletteColor = { name: string; hex: string };
type Candidate = {
  name: string;
  brand: string;
  inn: string;
  ogrn: string;
  registry: string;
  decision: string;
  decisionNumber: string;
  headcount: number;
  website: string;
  segment: string;
  tags: string[];
  confidence: "Высокая" | "Средняя" | "Низкая";
  evidence: string;
  evidenceUrl: string;
  status: "Классифицировано" | "Проверить источник";
  palette: PaletteColor[];
  paletteType: "Одноцветный" | "Двухцветный" | "Многоцветный";
  logoDomain: string;
  logoStatus?: "Готово" | "Требуется поиск";
  classificationStatus?: "Готово" | "Требуется классификация";
  customLogo?: string;
};
const added = "18.11.2026";
const pilotCandidates: Candidate[] = [
  {
    name: "ООО «ТЦР»",
    brand: "Sage Observability",
    inn: "7743180892",
    ogrn: "5167746308549",
    registry: "6663",
    decision: "29.12.2016",
    decisionNumber: "№ 732",
    headcount: 8108,
    website: "https://sageobservability.ru",
    segment: "Собственные программные продукты / SaaS",
    tags: ["наблюдаемость", "мониторинг", "ИТ-инфраструктура"],
    confidence: "Высокая",
    evidence:
      "Платформа наблюдаемости для мониторинга программного обеспечения и ИТ-инфраструктуры.",
    evidenceUrl: "https://sage-observability.tech/",
    status: "Классифицировано",
    palette: [{ name: "фиолетовый", hex: "#6755E7" }],
    paletteType: "Одноцветный",
    logoDomain: "sage-observability.tech",
    logoStatus: "Требуется поиск",
  },
  {
    name: "ООО «Совкомбанк Технологии»",
    brand: "Совкомбанк Технологии",
    inn: "4400001172",
    ogrn: "1214400000760",
    registry: "14253",
    decision: "15.06.2021",
    decisionNumber: "№ 566",
    headcount: 6296,
    website: "https://sovcombank.it",
    segment: "Корпоративное ИТ-подразделение",
    tags: ["финтех", "мобильная разработка", "веб-разработка"],
    confidence: "Высокая",
    evidence:
      "ИТ-компания группы Совкомбанк создаёт и развивает банковские сервисы и приложения.",
    evidenceUrl: "https://sovcombank.it/",
    status: "Классифицировано",
    palette: [{ name: "красный", hex: "#E53935" }],
    paletteType: "Одноцветный",
    logoDomain: "sovcombank.it",
  },
  {
    name: "ООО «Компания «Тензор»",
    brand: "Тензор / Saby",
    inn: "7605016030",
    ogrn: "1027600787994",
    registry: "484",
    decision: "30.11.2010",
    decisionNumber: "№ 325",
    headcount: 6112,
    website: "https://tensor.ru",
    segment: "Собственные программные продукты / SaaS",
    tags: ["корпоративное ПО", "ЭДО", "автоматизация бизнеса"],
    confidence: "Высокая",
    evidence:
      "Saby — собственная экосистема цифровых сервисов для автоматизации бизнеса.",
    evidenceUrl: "https://tensor.ru/about",
    status: "Классифицировано",
    palette: [
      { name: "синий", hex: "#2864DC" },
      { name: "оранжевый", hex: "#F28A2E" },
    ],
    paletteType: "Двухцветный",
    logoDomain: "tensor.ru",
  },
  {
    name: "ООО «ИТМ»",
    brand: "ИТМ",
    inn: "2311168514",
    ogrn: "1142311001744",
    registry: "3486",
    decision: "31.03.2014",
    decisionNumber: "№ 70",
    headcount: 4735,
    website: "https://itmtec.ru",
    segment: "Корпоративное ИТ-подразделение",
    tags: ["ритейл", "мобильная разработка", "корпоративное ПО"],
    confidence: "Высокая",
    evidence:
      "Компания создаёт программные решения для цифровой инфраструктуры ритейла, включая мобильные приложения.",
    evidenceUrl: "https://itmmagnit.ru/",
    status: "Классифицировано",
    palette: [{ name: "красный", hex: "#E30613" }],
    paletteType: "Одноцветный",
    logoDomain: "itmmagnit.ru",
    logoStatus: "Требуется поиск",
  },
  {
    name: "ООО «Авито Тех»",
    brand: "Авито Тех",
    inn: "9710089440",
    ogrn: "1217700216403",
    registry: "14330",
    decision: "01.07.2021",
    decisionNumber: "№ 673",
    headcount: 4123,
    website: "https://hrmka.ru",
    segment: "Корпоративное ИТ-подразделение",
    tags: ["маркетплейс", "собственные продукты", "данные и ИИ"],
    confidence: "Средняя",
    evidence:
      "Домен связан с товарным знаком ООО «Авито Тех», но не представляет всю деятельность компании.",
    evidenceUrl: "https://hrmka.ru",
    status: "Проверить источник",
    palette: [
      { name: "синий", hex: "#00AAFF" },
      { name: "зелёный", hex: "#97CF26" },
      { name: "красный", hex: "#FF6163" },
      { name: "фиолетовый", hex: "#A169F7" },
    ],
    paletteType: "Многоцветный",
    logoDomain: "avito.ru",
    classificationStatus: "Требуется классификация",
  },
  {
    name: "ООО «Сервионика»",
    brand: "Сервионика",
    inn: "7727790940",
    ogrn: "1127747102988",
    registry: "5059",
    decision: "20.04.2015",
    decisionNumber: "№ 117",
    headcount: 3847,
    website: "http://servionica.ru",
    segment: "ИТ-консалтинг и аутсорсинг",
    tags: ["техническая поддержка", "ИТ-инфраструктура", "сервис"],
    confidence: "Высокая",
    evidence:
      "Компания называет себя провайдером полного спектра услуг ИТ-аутсорсинга.",
    evidenceUrl: "https://www.servionica.ru/",
    status: "Классифицировано",
    palette: [
      { name: "синий", hex: "#2364A8" },
      { name: "бирюзовый", hex: "#31B7E9" },
    ],
    paletteType: "Двухцветный",
    logoDomain: "servionica.ru",
  },
  {
    name: "АО «Гипротрубопровод»",
    brand: "Гипротрубопровод",
    inn: "7710022410",
    ogrn: "1027700002660",
    registry: "31542",
    decision: "11.11.2022",
    decisionNumber: "АО-20221102-9708573368-3",
    headcount: 3194,
    website: "https://giprotruboprovod.transneft.ru",
    segment: "Другое",
    tags: ["инженерное проектирование", "корпоративные системы"],
    confidence: "Средняя",
    evidence:
      "Основная деятельность — проектирование трубопроводов; ИТ является обеспечивающим направлением.",
    evidenceUrl: "https://giprotruboprovod.transneft.ru/",
    status: "Классифицировано",
    palette: [{ name: "синий", hex: "#006BB6" }],
    paletteType: "Одноцветный",
    logoDomain: "transneft.ru",
    logoStatus: "Требуется поиск",
  },
  {
    name: "ООО «Бюджетные и Финансовые Технологии»",
    brand: "БФТ-Холдинг",
    inn: "7706673610",
    ogrn: "1077762072497",
    registry: "431",
    decision: "11.11.2010",
    decisionNumber: "№ 266",
    headcount: 2268,
    website: "https://bft.ru",
    segment: "Разработка корпоративного ПО",
    tags: ["госсектор", "собственные продукты", "заказная разработка"],
    confidence: "Высокая",
    evidence:
      "Вендор собственных программных продуктов и заказных решений для государства и бизнеса.",
    evidenceUrl: "https://bft.ru/company/about/",
    status: "Классифицировано",
    palette: [
      { name: "красный", hex: "#D9343A" },
      { name: "белый", hex: "#FFFFFF" },
    ],
    paletteType: "Двухцветный",
    logoDomain: "bft.ru",
  },
  {
    name: "ООО «Спортмастер Лаб»",
    brand: "Спортмастер Лаб",
    inn: "7713488827",
    ogrn: "1227700243077",
    registry: "27615",
    decision: "16.05.2022",
    decisionNumber: "АО-20220516-4545119877-3",
    headcount: 2242,
    website: "https://см-лаб.рф",
    segment: "Корпоративное ИТ-подразделение",
    tags: ["ритейл", "мобильная разработка", "веб-разработка"],
    confidence: "Высокая",
    evidence:
      "ИТ-компания группы Спортмастер развивает сайты, приложения и внутренние продукты.",
    evidenceUrl: "https://smlab.digital/",
    status: "Классифицировано",
    palette: [
      { name: "синий", hex: "#2256A4" },
      { name: "красный", hex: "#E41E2B" },
    ],
    paletteType: "Двухцветный",
    logoDomain: "smlab.digital",
  },
  {
    name: "ООО «РСХБ-Интех»",
    brand: "РСХБ-Интех",
    inn: "7704370385",
    ogrn: "1167746822946",
    registry: "6562",
    decision: "09.12.2016",
    decisionNumber: "№ 642",
    headcount: 2203,
    website: "https://rshb-intech.ru",
    segment: "Корпоративное ИТ-подразделение",
    tags: ["финтех", "информационная безопасность", "инфраструктура"],
    confidence: "Высокая",
    evidence:
      "Компания обеспечивает технологическую инфраструктуру и разрабатывает решения для Россельхозбанка.",
    evidenceUrl: "https://rshb-intech.ru/rshb-intech",
    status: "Классифицировано",
    palette: [
      { name: "чёрный", hex: "#101010" },
      { name: "белый", hex: "#FFFFFF" },
    ],
    paletteType: "Двухцветный",
    logoDomain: "rshb-intech.ru",
  },
];
type RegistryRow = {
  inn: string;
  ogrn: string;
  name: string;
  registry_number: string;
  decision_date: string;
  decision_number: string;
  headcount: number;
  website: string;
};
const tidyName = (name: string) =>
  name
    .replace(/^ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ\s*/i, "")
    .replace(/^Общество с ограниченной ответственностью\s*/i, "")
    .replace(/[«»"]/g, "")
    .trim();
type ResearchRow={inn:string;logo_file:string|null;segment:string;classification_status:string;confidence:"Высокая"|"Средняя"|"Низкая";tags:string[];matched:string[];palette?:PaletteColor[];paletteType?:Candidate["paletteType"]};
const research = new Map(
  ([...(researchA as ResearchRow[]),...(researchB as ResearchRow[]),...(researchC as ResearchRow[]),...(researchD as ResearchRow[])]).map((x) => [x.inn, x]),
);
const importedCandidates: Candidate[] = (registryBatch as RegistryRow[]).map(
  (x) => {
    const found=research.get(x.inn);
    return ({
    name: x.name,
    brand: tidyName(x.name),
    inn: x.inn,
    ogrn: x.ogrn,
    registry: x.registry_number,
    decision: new Date(x.decision_date + "T00:00:00").toLocaleDateString(
      "ru-RU",
    ),
    decisionNumber: x.decision_number,
    headcount: x.headcount,
    website: x.website,
    segment: found?.segment||"Не определено",
    tags: found?.tags||[],
    confidence: found?.confidence||"Низкая",
    evidence: found?.matched?.length
      ? `Автоматическая классификация по официальному сайту. Найдены признаки: ${found.matched.join(", ")}.`
      : "Карточка автоматически добавлена из реестра. Требуется исследование официального сайта.",
    evidenceUrl: x.website,
    status: "Проверить источник",
    palette: found?.palette||[{ name: "серый", hex: "#9AA0AE" }],
    paletteType: found?.paletteType||"Одноцветный",
    logoDomain: new URL(x.website).hostname.replace(/^www\./, ""),
    customLogo: found?.logo_file||undefined,
    logoStatus: found?.logo_file?"Готово":"Требуется поиск",
    classificationStatus: found?.classification_status==="candidate"?"Готово":"Требуется классификация",
  })},
);
const candidates = [...pilotCandidates, ...importedCandidates];
const logoFiles: Record<string, string> = {
  "sage-observability.tech": "sage.png",
  "sovcombank.it": "sovcombank.svg",
  "tensor.ru": "tensor.png",
  "itmmagnit.ru": "itm.png",
  "avito.ru": "avito.png",
  "servionica.ru": "servionica.png",
  "transneft.ru": "gipro.png",
  "bft.ru": "bft.png",
  "smlab.digital": "smlab.png",
  "rshb-intech.ru": "rshb.png",
};
const logo = (x: Candidate) =>
  x.customLogo ||
  `/candidate-logos/${logoFiles[x.logoDomain] || "placeholder.svg"}`;

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
const storageKey = "prcindex-candidate-work-v3";
type Queue = "main" | "logo" | "classification";

export function RegistryPilot() {
  const [items, setItems] = useState(candidates);
  const [selectedInn, setSelectedInn] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>("main");
  const [visible, setVisible] = useState(100);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const edits = JSON.parse(saved) as Record<string, Partial<Candidate>>;
        setItems((current) =>
          current.map((x) => (edits[x.inn] ? { ...x, ...edits[x.inn] } : x)),
        );
      }
    } catch {}
  }, []);
  useEffect(() => setVisible(100), [queue]);
  const selected = items.find((x) => x.inn === selectedInn) ?? null;
  function save(item: Candidate) {
    setItems((current) => current.map((x) => (x.inn === item.inn ? item : x)));
    try {
      const edits = JSON.parse(
        localStorage.getItem(storageKey) || "{}",
      ) as Record<string, Partial<Candidate>>;
      edits[item.inn] = item;
      localStorage.setItem(storageKey, JSON.stringify(edits));
    } catch {}
  }
  const logoQueue = items.filter((x) => x.logoStatus === "Требуется поиск"),
    classQueue = items.filter(
      (x) => x.classificationStatus === "Требуется классификация",
    ),
    ready = items.filter(
      (x) =>
        x.logoStatus !== "Требуется поиск" &&
        x.classificationStatus !== "Требуется классификация",
    ),
    shown =
      queue === "logo"
        ? logoQueue
        : queue === "classification"
          ? classQueue
          : ready;
  const titles = {
    main: [
      "Готовые карточки",
      "После исправления карточка автоматически возвращается сюда",
    ],
    logo: [
      "Требуется поиск логотипа",
      "Загрузите или укажите официальный логотип и подтвердите его",
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
          <span>Реестр загружен полностью</span>
          <h2>Компании из реестра Минцифры</h2>
          <p>
            Карточка считается готовой только после проверки логотипа и
            классификации.
          </p>
        </div>
        <div className="registry-count">
          <b>{items.length.toLocaleString("ru-RU")}</b>
          <small>компании с сайтом</small>
        </div>
      </section>
      <div className="registry-stats">
        <button
          className={queue === "main" ? "active" : ""}
          onClick={() => setQueue("main")}
        >
          <CheckCircle2 />
          <b>{ready.length.toLocaleString("ru-RU")}</b>
          <span>готово</span>
        </button>
        <button
          className={queue === "logo" ? "active" : ""}
          onClick={() => setQueue("logo")}
        >
          <ImageOff />
          <b>{logoQueue.length.toLocaleString("ru-RU")}</b>
          <span>требуется поиск / проверка</span>
        </button>
        <button
          className={queue === "classification" ? "active" : ""}
          onClick={() => setQueue("classification")}
        >
          <Tags />
          <b>{classQueue.length.toLocaleString("ru-RU")}</b>
          <span>требуется классификация</span>
        </button>
      </div>
      <div className="sectionhead">
        <div>
          <b>{titles[queue][0]}</b>
          <span>
            {titles[queue][1]} · показано{" "}
            {Math.min(visible, shown.length).toLocaleString("ru-RU")} из{" "}
            {shown.length.toLocaleString("ru-RU")}
          </span>
        </div>
      </div>
      {shown.length ? (
        <>
          <section className="candidate-grid">
            {shown.slice(0, visible).map((x) => (
              <article key={x.inn} onClick={() => setSelectedInn(x.inn)}>
                <div className="candidate-pic">
                  <img src={logo(x)} alt={x.brand} />
                  {x.logoStatus === "Требуется поиск" && (
                    <span>{x.customLogo ? "проверить логотип" : "нет логотипа"}</span>
                  )}
                  {x.classificationStatus === "Требуется классификация" && (
                    <span>классифицировать</span>
                  )}
                </div>
                <div className="candidate-meta">
                  <b>{x.brand}</b>
                  <small>{x.website.replace(/^https?:\/\//, "")}</small>
                  <div>
                    <span className="candidate-palette-dots">
                      {x.palette.map((c, i) => (
                        <i key={i} style={{ background: c.hex }} />
                      ))}
                    </span>
                    {x.palette.map((c) => c.name).join(" + ")}
                    <em>{x.paletteType}</em>
                  </div>
                </div>
              </article>
            ))}
          </section>
          {visible < shown.length && (
            <button
              className="load-more"
              onClick={() => setVisible((x) => x + 100)}
            >
              Показать ещё 100
            </button>
          )}
        </>
      ) : (
        <div className="queue-empty">
          <CheckCircle2 />
          <b>Очередь разобрана</b>
          <span>Все карточки из этого блока перенесены в готовые.</span>
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
  save: (item: Candidate) => void;
}) {
  const [palette, setPalette] = useState(item.palette),
    [paletteType, setPaletteType] = useState(item.paletteType),
    [segment, setSegment] = useState(item.segment),
    [tags, setTags] = useState(item.tags.join(", ")),
    [customLogo, setCustomLogo] = useState(item.customLogo || ""),
    [logoConfirmed, setLogoConfirmed] = useState(
      item.logoStatus !== "Требуется поиск",
    ),
    [message, setMessage] = useState("");
  useEffect(() => {
    setPalette(item.palette);
    setPaletteType(item.paletteType);
    setSegment(item.segment);
    setTags(item.tags.join(", "));
    setCustomLogo(item.customLogo || "");
    setLogoConfirmed(item.logoStatus !== "Требуется поиск");
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
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!palette.length) {
      setMessage("Добавьте хотя бы один цвет");
      return;
    }
    if (palette.some((x) => !/^#[0-9a-f]{6}$/i.test(x.hex))) {
      setMessage("Проверьте HEX: нужен формат #RRGGBB");
      return;
    }
    const next = {
      ...item,
      palette: palette.map((x) => ({ ...x, hex: x.hex.toUpperCase() })),
      paletteType,
      segment,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      customLogo: customLogo || undefined,
      logoStatus: logoConfirmed
        ? ("Готово" as const)
        : ("Требуется поиск" as const),
      classificationStatus:
        segment && segment !== "Не определено"
          ? ("Готово" as const)
          : ("Требуется классификация" as const),
      status: "Классифицировано" as const,
    };
    save(next);
    setMessage(
      next.logoStatus === "Готово" && next.classificationStatus === "Готово"
        ? "Сохранено — карточка перенесена в готовые"
        : "Сохранено — карточка остаётся в очереди",
    );
  }
  const segments = [
    "Заказная веб-разработка",
    "Заказная мобильная разработка",
    "Комплексная заказная разработка",
    "Разработка корпоративного ПО",
    "Системная интеграция",
    "Информационная безопасность",
    "Искусственный интеллект и данные",
    "Облачные сервисы и инфраструктура",
    "Собственные программные продукты / SaaS",
    "Телекоммуникации",
    "Оборудование и embedded-разработка",
    "ИТ-консалтинг и аутсорсинг",
    "Digital-маркетинг и дизайн",
    "Корпоративное ИТ-подразделение",
    "Другое",
    "Не определено",
  ];
  return (
    <div className="backdrop" onClick={close}>
      <aside
        className="drawer candidate-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          <X />
        </button>
        <div className="candidate-detail-logo">
          <img src={customLogo || logo(item)} alt={item.brand} />
        </div>
        <span
          className={
            item.logoStatus === "Требуется поиск" ||
            item.classificationStatus === "Требуется классификация"
              ? "candidate-warn"
              : "candidate-ok"
          }
        >
          {item.logoStatus === "Требуется поиск"
            ? item.customLogo ? "Требуется проверка логотипа" : "Требуется логотип"
            : item.classificationStatus === "Требуется классификация"
              ? "Требуется классификация"
              : "Готово"}
        </span>
        <h2>{item.brand}</h2>
        <a href={item.website} target="_blank" rel="noreferrer">
          {item.website}
        </a>
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
          </div>
          <div className="work-section">
            <b>Классификация</b>
            <label>
              Основной сегмент
              <select
                value={segment}
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
          <button className="primary" type="submit">
            Сохранить карточку
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
            ["Добавлено в PRC Index", added],
            ["Сотрудников", item.headcount.toLocaleString("ru-RU")],
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
          <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
            Открыть источник <ExternalLink size={13} />
          </a>
        </div>
      </aside>
    </div>
  );
}
