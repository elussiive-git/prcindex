import { useState } from "react";
import { supabase } from "./auth";
import { scanUrl, SCANNER_VERSION } from "./color-scan";

// Сверка браузерного сканера цвета с эталоном Python-сканера на корпусе 492.
// Логика и уменьшение картинок уже сверены вне браузера (scripts/color-scan/verify_ts_port.mjs);
// здесь проверяется то, что зависит от браузера: отрисовка SVG и декодирование JPEG/PNG/WebP/GIF.
type Ref = [string, string, string, [string, number][]];
type Row = { file: string; ref: Ref; got?: { color_v1?: string; status?: string; palette_type?: string; colors?: { family: string; share: number }[]; error?: string } };

export function ScannerCheck() {
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (!supabase) return;
    setRunning(true); setError(""); setRows([]); setDone(0);
    try {
      const ref = (await fetch("/scan-reference.json").then((r) => r.json())).files as Record<string, Ref>;
      const { data, error: e } = await supabase.from("logo_versions").select("storage_path,original_filename");
      if (e) throw e;
      const items = (data ?? []).filter((x) => ref[x.original_filename]);
      setTotal(items.length);
      const { data: signed, error: se } = await supabase.storage.from("logos").createSignedUrls(items.map((x) => x.storage_path), 3600);
      if (se) throw se;
      const out: Row[] = [];
      for (let i = 0; i < items.length; i++) {
        const row: Row = { file: items[i].original_filename, ref: ref[items[i].original_filename] };
        try { row.got = await scanUrl(signed![i].signedUrl!); } catch (err) { row.got = { error: String((err as Error).message) }; }
        out.push(row);
        if (i % 10 === 9 || i === items.length - 1) { setDone(i + 1); setRows([...out]); }
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setRunning(false);
    }
  }
  const v1 = rows.filter((r) => r.got?.color_v1 === r.ref[0]).length;
  const full = rows.filter((r) => r.got?.color_v1 === r.ref[0] && r.got?.status === r.ref[1] && r.got?.palette_type === r.ref[2]).length;
  const bad = rows.filter((r) => !(r.got?.color_v1 === r.ref[0] && r.got?.status === r.ref[1] && r.got?.palette_type === r.ref[2]));
  const fmt = (c?: { family: string; share: number }[] | [string, number][]) =>
    (c ?? []).map((x) => (Array.isArray(x) ? `${x[0]} ${Math.round(x[1] * 100)}%` : `${x.family} ${Math.round(x.share * 100)}%`)).join(", ");
  return (
    <section className="scanner-check">
      <div>
        <b>Сверка браузерного сканера цвета (v{SCANNER_VERSION}) с эталоном</b>
        <p>Прогоняет 492 логотипа основного корпуса в браузере и сравнивает с результатом Python-сканера. Ничего не меняет в базе.</p>
      </div>
      <button className="primary" disabled={running} onClick={run}>{running ? `Сверяем… ${done} из ${total}` : "Запустить сверку"}</button>
      {error && <p className="save-error">{error}</p>}
      {rows.length > 0 && (
        <p className="scanner-check-sum">
          Проверено {rows.length}: основной цвет совпал у <b>{v1}</b>, цвет + статус + тип палитры — у <b>{full}</b>. Расхождений: <b>{bad.length}</b>.
        </p>
      )}
      {bad.length > 0 && (
        <table>
          <thead><tr><th>Файл</th><th>Эталон</th><th>Браузер</th></tr></thead>
          <tbody>
            {bad.map((r) => (
              <tr key={r.file}>
                <td>{r.file}</td>
                <td>{r.ref[0]} · {r.ref[1]} · {r.ref[2]}<small>{fmt(r.ref[3])}</small></td>
                <td>{r.got?.error ?? `${r.got?.color_v1} · ${r.got?.status} · ${r.got?.palette_type}`}<small>{fmt(r.got?.colors)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
