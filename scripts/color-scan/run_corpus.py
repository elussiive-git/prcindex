#!/usr/bin/env python3
"""Прогон корпуса 492 через сканер v2 и сверка с исторической разметкой."""
import json, csv, collections, hashlib, sys, os
import scan_colors as S

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."  # корень проекта
_seed = os.path.join(ROOT, "src", "seed", "coded494.json")
seed = json.load(open(_seed if os.path.exists(_seed) else os.path.join(ROOT, "coded494.json")))
EXCLUDED = {393, 424}  # подтверждённые дубли по ОГРН
ACTIVE_VERSION = {117: "versions/121_pixelplus_ru_official.png", 271: "versions/277_ligaa_agency_header.png"}

rows = []
for r in seed:
    idx = int(r["index"])
    if idx in EXCLUDED:
        continue
    f = ACTIVE_VERSION.get(idx, r["E"])
    path = os.path.join(ROOT, "public", "logos", f)
    try:
        res = S.analyse(path)
    except Exception as e:
        res = {"error": str(e), "flags": ["ошибка чтения"]}
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    rows.append({"index": idx, "id": r["A"], "company": r["B"], "file": f, "sha256": sha,
                 "old_color": r["N"], "old_achromatic": r["P"], "old_palette": r["S"],
                 "group_geo": r["K"], "group_spec": r["L"], "group_pos": r["M"], **res})

out = {"method_version": S.METHOD_VERSION, "params": S.PARAMS, "params_hash": S.params_hash(),
       "n": len(rows), "rows": rows}
json.dump(out, open("scan_v2_results.json", "w"), ensure_ascii=False, indent=1)

with open("scan_v2_results.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["id", "компания", "файл", "цвет_было", "цвет_стало", "изменился", "статус",
                "ведущий_хроматический", "основная_семья", "хроматичность_%", "число_семей",
                "тип_палитры", "температура", "фон", "плашка", "пограничный", "флаги", "палитра"])
    for x in rows:
        if "error" in x:
            w.writerow([x["id"], x["company"], x["file"], x["old_color"], "ОШИБКА", "", "", "", "", "", "", "", "", "", "", "да", x["error"], ""])
            continue
        w.writerow([x["id"], x["company"], x["file"], x["old_color"], x["color_v1"],
                    "да" if x["color_v1"] != x["old_color"] else "", x["status"],
                    x["lead_chromatic"] or "", x["main_family"], round(x["chromatic_share"] * 100, 1),
                    x["n_families"], x["palette_type"], x["temperature"], x["background"],
                    "да" if x["plate"] else "", "да" if x["borderline"] else "", " | ".join(x["flags"]),
                    "; ".join(f'{c["hex"]} {round(c["share"]*100)}% {c["family"]}' for c in x["colors"])])

ok = [x for x in rows if "error" not in x]
chg = [x for x in ok if x["color_v1"] != x["old_color"]]
trans = collections.Counter((x["old_color"], x["color_v1"]) for x in chg)
summary = {
    "n": len(rows), "errors": [x["file"] for x in rows if "error" in x],
    "changed": len(chg), "changed_share": round(len(chg) / len(ok), 3),
    "transitions_top": trans.most_common(20),
    "old_dist": collections.Counter(x["old_color"] for x in ok).most_common(),
    "new_dist": collections.Counter(x["color_v1"] for x in ok).most_common(),
    "status": collections.Counter(x["status"] for x in ok).most_common(),
    "borderline": sum(x["borderline"] for x in ok),
    "plate": sum(x["plate"] for x in ok),
    "background": collections.Counter(x["background"].split(" ")[0] for x in ok).most_common(),
    "old_achromatic": sum(x["old_achromatic"] == "да" for x in ok),
}
json.dump(summary, open("scan_v2_summary.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
