import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  Upload,
  BarChart3,
  Users,
  Database,
  ShieldCheck,
  X,
  Download,
  Plus,
  BookOpenCheck,
  Building2,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { AuthGate } from "./auth";
import { useCatalogLogos } from "./remote";
import { UploadWorkflow } from "./upload";
import { ReviewQueue } from "./review";
import { Methodology } from "./methodology";
import { ScannerCheck } from "./scanner-check";
import { AnalyticsDashboardV2 } from "./analytics-v2";
import { RegistryPilot } from "./registry-pilot";
import type { Logo } from "./types";
import "./style.css";
import "./theme.css";
type Page =
  | "Каталог"
  | "Кандидаты"
  | "Перепроверка"
  | "Загрузка"
  | "Разметка"
  | "Аналитика"
  | "Методика"
  | "Доступ";
const pages: Page[] = [
    "Каталог",
    "Кандидаты",
    "Перепроверка",
    "Загрузка",
    "Разметка",
    "Аналитика",
    "Методика",
    "Доступ",
  ],
  icons = [
    Database,
    Building2,
    RotateCcw,
    Upload,
    ShieldCheck,
    BarChart3,
    BookOpenCheck,
    Users,
  ];
function App() {
  const { items: logos, updateColor } = useCatalogLogos();
  const [page, setPage] = useState<Page>("Каталог"),
    [q, setQ] = useState(""),
    [color, setColor] = useState("Все цвета"),
    [selected, setSelected] = useState<Logo | null>(null);
  const filtered = useMemo(
    () =>
      logos.filter(
        (x) =>
          (color === "Все цвета" || x.color === color) &&
          (x.name + " " + x.site).toLowerCase().includes(q.toLowerCase()),
      ),
    [logos, q, color],
  );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="mark">ВК</div>
          <div>
            <b>Визуальный код</b>
            <small>Исследование логотипов</small>
          </div>
        </div>
        <nav>
          {pages.map((p, i) => {
            const I = icons[i];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => setPage(p)}
              >
                <I size={17} />
                {p}
              </button>
            );
          })}
        </nav>
        <div className="snapshot">
          <span>Зафиксированный корпус</span>
          <b>Основной · 17.11.2026</b>
          <small>492 записи · методика v2.1</small>
        </div>
        <div className="user">
          <div>ЕГ</div>
          <span>
            <b>Елизавета Галимова</b>
            <small>Владелец</small>
          </span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
            <h1>{page}</h1>
          </div>
          <button className="outline">
            <Download size={16} /> Экспорт исследования
          </button>
        </header>
        {page === "Каталог" && (
          <>
            <section className="stats">
              <Stat n={logos.length} l="логотипов в корпусе" />
              <Stat
                n={`${logos.filter((x) => x.status === "Проверено").length}/${logos.length}`}
                l="разметка проверена"
              />
              <Stat
                n={logos.filter((x) => x.borderline).length}
                l="пограничных случаев"
              />
              <Stat n="v2.1" l="активная методика" />
            </section>
            <section className="toolbar">
              <label>
                <Search size={17} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Компания, домен или ID"
                />
              </label>
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                <option>Все цвета</option>
                {Array.from(new Set(logos.map((x) => x.color))).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select>
                <option>Все типы знака</option>
              </select>
            </section>
            <div className="sectionhead">
              <div>
                <b>Основной корпус</b>
                <span>
                  {filtered.length} из {logos.length} записей
                </span>
              </div>
              <button className="primary">
                <Plus size={16} /> Добавить логотип
              </button>
            </div>
            <section className="grid">
              {filtered.slice(0, 100).map((x) => (
                <article key={x.id} onClick={() => setSelected(x)}>
                  <div className="pic">
                    <img src={x.imageUrl || "/logos/" + x.file} />
                    {x.change && <span className="changed">исправлен</span>}
                  </div>
                  <div className="meta">
                    <b>{x.name}</b>
                    <small>{x.site.replace(/^https?:\/\//, "")}</small>
                    <div>
                      <span className="candidate-palette-dots">
                        {(x.palette ?? [{ name: x.color, hex: x.hex }]).map(
                          (c, i) => (
                            <i key={i} style={{ background: c.hex }} />
                          ),
                        )}
                      </span>
                      {(x.palette ?? [{ name: x.color, hex: x.hex }])
                        .map((c) => c.name)
                        .join(" + ")}
                      <em>{x.paletteType ?? "Одноцветный"}</em>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
        {page === "Аналитика" && <AnalyticsDashboardV2 items={logos} />}
        {page === "Кандидаты" && <RegistryPilot />}
        {page === "Перепроверка" && <RegistryPilot key="recheck" mode="recheck" />}
        {page === "Загрузка" && <UploadWorkflow />}
        {page === "Разметка" && <ReviewQueue />}
        {page === "Методика" && (<><Methodology /><ScannerCheck /></>)}
        {page === "Доступ" && <Access />}
      </main>
      {selected && (
        <Drawer
          logo={selected}
          close={() => setSelected(null)}
          saveColor={updateColor}
          onSaved={setSelected}
        />
      )}
    </div>
  );
}
function Stat({ n, l }: { n: string | number; l: string }) {
  return (
    <div>
      <strong>{n}</strong>
      <span>{l}</span>
    </div>
  );
}
function UploadPage() {
  return (
    <section className="upload">
      <div className="drop">
        <Upload size={30} />
        <h2>Загрузите логотипы</h2>
        <p>PNG, JPEG, SVG или WebP · до 10 МБ</p>
        <button className="primary">Выбрать файлы</button>
        <small>
          SHA-256 проверит точные дубли. Совпадения компаний подтверждаются
          человеком.
        </small>
      </div>
      <div className="panel">
        <h3>После загрузки</h3>
        <ol>
          <li>Оригинал остаётся неизменным</li>
          <li>Создаётся безопасное превью</li>
          <li>Запись попадает в черновики</li>
          <li>Корпус меняется только после утверждения</li>
        </ol>
      </div>
    </section>
  );
}
function Empty() {
  return (
    <section className="empty">
      <ShieldCheck size={32} />
      <h2>Очередь разметки пуста</h2>
      <p>
        Все 492 записи основного корпуса подтверждены. Новые загрузки и
        предложения тестировщиков появятся здесь.
      </p>
    </section>
  );
}
function Access() {
  return (
    <>
      <div className="sectionhead">
        <div>
          <b>Доступ к исследованию</b>
          <span>Открытая регистрация отключена</span>
        </div>
        <button className="primary">
          <Plus size={16} /> Пригласить
        </button>
      </div>
      <section className="panel access">
        <div>
          <span className="avatar">МК</span>
          <span>
            <b>Мария К.</b>
            <small>Тестировщик · подборка «Пилот»</small>
          </span>
          <em>до 24.11.2026</em>
          <button>Отозвать</button>
        </div>
        <p>
          Ограничения обеспечиваются RLS-политиками PostgreSQL и Storage,
          включая срок доступа.
        </p>
      </section>
    </>
  );
}
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
function Drawer({
  logo,
  close,
  saveColor,
  onSaved,
}: {
  logo: Logo;
  close: () => void;
  saveColor: (
    id: number,
    palette: { name: string; hex: string }[],
    paletteType: NonNullable<Logo["paletteType"]>,
  ) => Promise<Logo>;
  onSaved: (logo: Logo) => void;
}) {
  const [palette, setPalette] = useState(
      logo.palette ?? [{ name: logo.color, hex: logo.hex }],
    ),
    [paletteType, setPaletteType] = useState<NonNullable<Logo["paletteType"]>>(
      logo.paletteType ?? "Одноцветный",
    ),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setPalette(logo.palette ?? [{ name: logo.color, hex: logo.hex }]);
    setPaletteType(logo.paletteType ?? "Одноцветный");
    setMessage("");
  }, [logo]);
  const original = JSON.stringify([
      logo.palette ?? [{ name: logo.color, hex: logo.hex }],
      logo.paletteType ?? "Одноцветный",
    ]),
    changed = JSON.stringify([palette, paletteType]) !== original;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!palette.length) {
      setMessage("Добавьте хотя бы один цвет");
      return;
    }
    if (palette.some((x) => !/^#[0-9a-f]{6}$/i.test(x.hex))) {
      setMessage("Проверьте HEX: нужен формат #RRGGBB");
      return;
    }
    setSaving(true);
    try {
      const normalized = palette.map((x) => ({
        ...x,
        hex: x.hex.toUpperCase(),
      }));
      const updated = await saveColor(logo.id, normalized, paletteType);
      onSaved(updated);
      setMessage("Цвета и тип сохранены. Аналитика обновлена.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить разметку",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="backdrop" onClick={close}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>
          <X />
        </button>
        <div className="detailpic">
          <img src={logo.imageUrl || "/logos/" + logo.file} />
        </div>
        <span className="ok">● {logo.status}</span>
        <h2>{logo.name}</h2>
        <a>{logo.site}</a>
        <form className="candidate-palette-editor" onSubmit={submit}>
          <div className="palette-editor-title">
            <span className="candidate-palette-dots large">
              {palette.map((c, i) => (
                <i key={i} style={{ background: c.hex }} />
              ))}
            </span>
            <div>
              <b>Цветовая разметка</b>
              <small>Исправление применяется ко всей аналитике</small>
            </div>
          </div>
          <label>
            Тип палитры
            <select
              value={paletteType}
              onChange={(e) =>
                setPaletteType(
                  e.target.value as NonNullable<Logo["paletteType"]>,
                )
              }
            >
              <option>Одноцветный</option>
              <option>Двухцветный</option>
              <option>Многоцветный</option>
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
                message.startsWith("Цвета и тип") ? "save-ok" : "save-error"
              }
            >
              {message}
            </p>
          )}
          <button
            className="primary"
            type="submit"
            disabled={!changed || saving}
          >
            {saving ? "Сохраняю…" : "Сохранить цвета и тип"}
          </button>
        </form>
        <dl>
          {[
            ["Тип знака", logo.signType],
            ["Образ", logo.motif],
            ["Группа", logo.geo + " · " + logo.segment + " · " + logo.rank],
            ["Файл", logo.file],
          ].map(([a, b]) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
        {logo.change && (
          <div className="history">
            <b>История</b>
            <p>{logo.change}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);
