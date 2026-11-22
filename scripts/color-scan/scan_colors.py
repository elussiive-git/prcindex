#!/usr/bin/env python3
"""
Сканер цвета логотипов — методика v2.0.

Детерминированный: один и тот же файл всегда даёт один и тот же результат
(нет случайной инициализации, нет нейросетей). Все пороги — в PARAMS и
сохраняются вместе с результатом, чтобы пересчёт можно было повторить.

Шаги для каждого файла:
  1. Растеризация: SVG -> PNG (rsvg-convert), длинная сторона = 400 px.
  2. Фон: прозрачные пиксели; либо однородная рамка изображения.
     Почти белая рамка = фон (убирается везде, где встречается этот цвет).
     Цветная/тёмная рамка = плашка: считается частью знака, ставится флаг.
  3. Очистка: полупрозрачные пиксели и кольцо в 1 px вокруг фона
     (сглаживание краёв) не учитываются.
  4. Кластеры: пиксели в пространстве OKLab сводятся в цвета жадным
     детерминированным объединением (ΔE_OK < merge_de), затем каждый пиксель
     приписывается ближайшему цвету. Цвета < min_share площади знака
     отбрасываются как шум, доли пересчитываются.
  5. Семья цвета — по порогам в OKLCH (светлота L, насыщенность C, оттенок h).
  6. Производные переменные: основная семья, ведущий хроматический цвет,
     хроматичность, статус, число семей, температура, флаги.
"""
import json, os, subprocess, sys, tempfile, hashlib
import numpy as np
from PIL import Image

METHOD_VERSION = "2.0"
PARAMS = {
    "raster_long_side_px": 400,
    "alpha_opaque_min": 250,          # пиксель знака: альфа >= 250
    "alpha_transparent_max": 10,      # фон: альфа <= 10
    "border_px": 2,                   # ширина рамки для поиска фона
    "border_uniform_de": 0.04,        # пиксель рамки «как фон», если ΔE_OK < 0.04
    "border_uniform_share": 0.85,     # рамка однородна, если таких >= 85%
    "background_de": 0.06,            # пиксели ближе 0.06 к цвету фона = фон
    "white_bg_L_min": 0.90,           # светлый фон: L >= 0.90 и C < 0.05 (белый и бледные подложки площадок)
    "white_bg_C_max": 0.05,
    "fallback_light_bg_share": 0.25,  # фон не определён по рамке, но светлых пикселей >= 25% -> они фон
    "quant_step_L": 0.02, "quant_step_ab": 0.01,
    "merge_de": 0.07,                 # оттенки ближе 0.07 = один цвет
    "min_share": 0.01,                # цвета < 1% площади знака = шум
    "antialias_seg_de": 0.035,        # цвет на отрезке между двумя крупными цветами = сглаживание
    "antialias_max_share": 0.10,      #   (проверяется для цветов < 10% площади)
    "max_colors": 6,
    "accent_share": 0.08,             # логотип хроматический, если цветного >= 8%
    # семьи (OKLCH)
    "achromatic_C_max": 0.035,
    "dark_L_max": 0.25, "dark_C_max": 0.05,   # очень тёмные оттенки воспринимаются как чёрный
    "black_L_max": 0.40, "white_L_min": 0.93,
    "brown": {"h_min": 30, "h_max": 100, "L_max": 0.55, "C_max": 0.14},
    "pastel_pink_L_min": 0.80,        # светлый красный -> розовый
    "hue_sectors": [                  # [начало, конец) в градусах; розовый оборачивается через 0
        # границы откалиброваны по исторической ручной разметке (точки наименьшего расхождения)
        ["розовый", 325, 9.5], ["красный", 9.5, 35], ["оранжевый", 35, 82],
        ["жёлтый", 82, 117.5], ["зелёный", 117.5, 169], ["бирюзовый", 169, 231],
        ["синий", 231, 279], ["фиолетовый", 279, 325]],
    "borderline_hue_deg": 5,          # близко к границе сектора
    "borderline_C": 0.012,            # близко к порогу ахроматичности
    "borderline_accent": [0.05, 0.12],# хроматичность рядом с порогом 8%
}
ACHROMATIC = {"чёрный", "серый", "белый"}
COLD = {"синий", "бирюзовый", "зелёный", "фиолетовый"}
WARM = {"красный", "оранжевый", "жёлтый", "розовый", "коричневый"}

# ---------- цветовые пространства ----------
def srgb_to_oklab(rgb):  # rgb: (...,3) 0..255
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    lms = np.cbrt(c @ M1.T)
    M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return lms @ M2.T

def oklab_to_srgb_hex(lab):
    M2i = np.linalg.inv(np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                                  [1.9779984951, -2.4285922050, 0.4505937099],
                                  [0.0259040371, 0.7827717662, -0.8086757660]]))
    M1i = np.linalg.inv(np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                                  [0.2119034982, 0.6806995451, 0.1073969566],
                                  [0.0883024619, 0.2817188376, 0.6299787005]]))
    lin = (M2i @ lab) ** 3 @ M1i.T
    lin = np.clip(lin, 0, 1)
    c = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    return "#" + "".join(f"{int(round(v * 255)):02x}" for v in np.clip(c, 0, 1))

def lch(lab):
    L, a, b = lab
    return float(L), float(np.hypot(a, b)), float(np.degrees(np.arctan2(b, a)) % 360)

# ---------- семья цвета ----------
def in_sector(h, s, e):
    return (h >= s or h < e) if s > e else (s <= h < e)

def classify(lab, P=PARAMS):
    L, C, h = lch(lab)
    flags = []
    if abs(C - P["achromatic_C_max"]) < P["borderline_C"]:
        flags.append("на границе цветной/ахроматический")
    if C < P["achromatic_C_max"] or (L < P["dark_L_max"] and C < P["dark_C_max"]):
        fam = "чёрный" if L < P["black_L_max"] else ("белый" if L >= P["white_L_min"] else "серый")
        return fam, flags
    br = P["brown"]
    if br["h_min"] <= h < br["h_max"] and P["dark_L_max"] <= L < br["L_max"] and C < br["C_max"]:
        return "коричневый", flags
    fam = None
    for name, s, e in P["hue_sectors"]:
        if in_sector(h, s, e):
            fam = name
            for edge in (s, e):
                d = min(abs(h - edge), 360 - abs(h - edge))
                if d < P["borderline_hue_deg"]:
                    flags.append(f"оттенок у границы {edge}°")
            break
    if fam == "красный" and L >= P["pastel_pink_L_min"]:
        fam = "розовый"
    return fam, flags

# ---------- загрузка ----------
def load_rgba(path, P=PARAMS):
    side = P["raster_long_side_px"]
    if path.lower().endswith(".svg"):
        with tempfile.NamedTemporaryFile(suffix=".png") as t:
            # рендер по ширине; если вытянут по вертикали — по высоте
            subprocess.run(["rsvg-convert", "-w", str(side), "-a", "-o", t.name, path],
                           check=True, capture_output=True)
            im = Image.open(t.name).convert("RGBA")
            if im.height > im.width:
                subprocess.run(["rsvg-convert", "-h", str(side), "-a", "-o", t.name, path],
                               check=True, capture_output=True)
                im = Image.open(t.name).convert("RGBA")
            im.load()
            return im, "svg"
    im = Image.open(path)
    try:
        im.seek(0)
    except Exception:
        pass
    src_size = im.size
    im = im.convert("RGBA")
    if max(im.size) > side:
        k = side / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
    return im, f"{src_size[0]}x{src_size[1]}"

# ---------- основной анализ ----------
def analyse(path, P=PARAMS):
    im, src = load_rgba(path, P)
    a = np.asarray(im)
    rgb, alpha = a[..., :3], a[..., 3]
    lab = srgb_to_oklab(rgb)
    H, W = alpha.shape
    flags, info = [], {"source_raster": src}
    if min(H, W) < 48 and src != "svg":
        flags.append("низкое разрешение")

    transparent = alpha <= P["alpha_transparent_max"]
    plate = False
    bg_lab = None
    b0 = P["border_px"]
    ring0 = np.zeros_like(alpha, bool)
    ring0[:b0, :] = ring0[-b0:, :] = ring0[:, :b0] = ring0[:, -b0:] = True
    if transparent.mean() > 0.02 or not (ring0 & (alpha >= P["alpha_opaque_min"])).any():
        transparent = alpha < P["alpha_opaque_min"] if transparent.mean() <= 0.02 else transparent
        bg = transparent.copy()
        info["background"] = "прозрачный"
    else:
        b = P["border_px"]
        ring = np.zeros_like(alpha, bool)
        ring[:b, :] = ring[-b:, :] = ring[:, :b] = ring[:, -b:] = True
        ring_lab = lab[ring & (alpha >= P["alpha_opaque_min"])]
        med = np.median(ring_lab, axis=0)
        uniform = (np.linalg.norm(ring_lab - med, axis=1) < P["border_uniform_de"]).mean()
        L, C, _ = lch(med)
        if uniform < P["border_uniform_share"]:
            Lp = lab[..., 0]; Cp = np.hypot(lab[..., 1], lab[..., 2])
            light = (Lp >= P["white_bg_L_min"]) & (Cp < P["white_bg_C_max"])
            if light.mean() >= P["fallback_light_bg_share"]:
                bg = light
                bg_lab = np.median(lab[light], axis=0)
                info["background"] = "светлый (по доле пикселей)"
                flags.append("фон определён по доле светлых пикселей")
            else:
                bg = np.zeros_like(alpha, bool)
                info["background"] = "не определён"
                flags.append("фон не определён")
        elif L >= P["white_bg_L_min"] and C < P["white_bg_C_max"]:
            bg_lab = med
            bg = np.linalg.norm(lab - med, axis=-1) < P["background_de"]
            info["background"] = "светлый"
        else:
            # однородная небелая рамка = плашка, входит в знак
            bg = np.zeros_like(alpha, bool)
            plate = True
            info["background"] = "плашка " + oklab_to_srgb_hex(med)
            flags.append("плашка")

    # кольцо 1 px вокруг фона (сглаживание краёв) + полупрозрачные пиксели
    halo = np.zeros_like(bg)
    halo[1:, :] |= bg[:-1, :]; halo[:-1, :] |= bg[1:, :]
    halo[:, 1:] |= bg[:, :-1]; halo[:, :-1] |= bg[:, 1:]
    fig = (~bg) & (~halo) & (alpha >= P["alpha_opaque_min"])
    if fig.sum() < 50:  # очень тонкий знак: не режем кольцо
        fig = (~bg) & (alpha >= P["alpha_opaque_min"])
    px = lab[fig]
    n = len(px)
    if n == 0:
        return {"error": "знак не найден", "flags": ["знак не найден"], **info}

    # квантование и жадное объединение (детерминированно)
    q = np.stack([np.round(px[:, 0] / P["quant_step_L"]),
                  np.round(px[:, 1] / P["quant_step_ab"]),
                  np.round(px[:, 2] / P["quant_step_ab"])], 1).astype(np.int64)
    keys, inv, cnt = np.unique(q, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    centers_bin = np.zeros((len(keys), 3))
    np.add.at(centers_bin, inv, px)
    centers_bin /= cnt[:, None]
    order = np.lexsort((keys[:, 2], keys[:, 1], keys[:, 0], -cnt))  # по убыванию, ничьи — по ключу
    cl_c, cl_w = [], []
    for i in order:
        c, w = centers_bin[i], cnt[i]
        if cl_c:
            d = np.linalg.norm(np.array(cl_c) - c, axis=1)
            j = int(np.argmin(d))
            if d[j] < P["merge_de"]:
                cl_c[j] = (cl_c[j] * cl_w[j] + c * w) / (cl_w[j] + w)
                cl_w[j] += w
                continue
        cl_c.append(c.copy()); cl_w.append(w)
    C = np.array(cl_c)
    W_ = np.array(cl_w, float)
    # промежуточные оттенки на краях: цвет лежит на отрезке между двумя более крупными цветами
    alias = np.zeros(len(C), bool)
    for i in range(len(C)):
        if W_[i] / n >= P["antialias_max_share"]:
            continue
        big = [j for j in range(len(C)) if W_[j] > W_[i] and not alias[j]]
        for x in range(len(big)):
            for y in range(x + 1, len(big)):
                A, B = C[big[x]], C[big[y]]
                t = np.dot(C[i] - A, B - A) / max(np.dot(B - A, B - A), 1e-12)
                if 0.08 < t < 0.92 and np.linalg.norm(A + t * (B - A) - C[i]) < P["antialias_seg_de"]:
                    alias[i] = True
                    break
            if alias[i]:
                break
    W_[alias] = 0
    cl_w = list(W_)
    # отбрасываем шум, затем переприсваиваем все пиксели ближайшему цвету
    keep = np.array(cl_w) / n >= P["min_share"]
    C = C[keep] if keep.any() else C[[int(np.argmax(cl_w))]]
    C = C[np.argsort(-np.array(cl_w)[keep] if keep.any() else [0])][: P["max_colors"]]
    lab_assign = np.argmin(np.linalg.norm(px[:, None, :] - C[None], axis=2), axis=1)
    for k in range(len(C)):
        if (lab_assign == k).any():
            C[k] = px[lab_assign == k].mean(axis=0)
    shares = np.bincount(lab_assign, minlength=len(C)) / n

    colors = []
    for k in np.argsort(-shares):
        fam, fl = classify(C[k], P)
        L_, C_, h_ = lch(C[k])
        colors.append({"hex": oklab_to_srgb_hex(C[k]), "share": round(float(shares[k]), 4),
                       "family": fam, "L": round(L_, 3), "C": round(C_, 3), "h": round(h_, 1),
                       "flags": fl})
    # белый внутри знака на белом фоне — это фон, не цвет знака
    if bg_lab is not None:
        colors = [c for c in colors if not (c["family"] == "белый")]
        tot = sum(c["share"] for c in colors) or 1
        for c in colors:
            c["share"] = round(c["share"] / tot, 4)

    fam_share = {}
    for c in colors:
        fam_share[c["family"]] = round(fam_share.get(c["family"], 0) + c["share"], 4)
    fams_sorted = sorted(fam_share.items(), key=lambda x: -x[1])
    chrom = {f: s for f, s in fam_share.items() if f not in ACHROMATIC}
    chromatic_share = round(sum(chrom.values()), 4)
    main_family = fams_sorted[0][0]
    lead_chromatic = max(chrom, key=chrom.get) if chromatic_share >= P["accent_share"] else None
    if chromatic_share < P["accent_share"]:
        status = "ахроматический"
    elif main_family in ACHROMATIC:
        status = "ахроматический с акцентом"
    else:
        status = "хроматический"
    # совместимая с v1 переменная «основной цвет»: ведущий хроматический при >= 8%, иначе главная ахроматическая семья
    if lead_chromatic:
        color_v1 = lead_chromatic
    else:
        ach = {f: s for f, s in fam_share.items() if f in ACHROMATIC}
        color_v1 = max(ach, key=ach.get) if ach else main_family
    n_fam = len(fam_share)
    temp = ("холодный" if color_v1 in COLD else "тёплый" if color_v1 in WARM else "ахроматический")

    # флаги пограничных случаев (только для значимых цветов)
    for c in colors:
        if c["share"] >= P["accent_share"] and c["flags"]:
            flags.append(f"{c['family']} {c['hex']}: " + "; ".join(c["flags"]))
    lo, hi = P["borderline_accent"]
    if lo <= chromatic_share <= hi:
        flags.append(f"хроматичность {chromatic_share:.0%} рядом с порогом 8%")

    return {**info, "plate": plate, "colors": colors, "family_share": dict(fams_sorted),
            "main_family": main_family, "lead_chromatic": lead_chromatic,
            "chromatic_share": chromatic_share, "status": status, "color_v1": color_v1,
            "n_families": n_fam,
            "palette_type": {1: "одноцветный", 2: "двухцветный"}.get(n_fam, "многоцветный"),
            "temperature": temp, "flags": flags, "borderline": bool(flags and any(
                f for f in flags if f not in ("плашка",)))}

def params_hash():
    return hashlib.sha256(json.dumps(PARAMS, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]

if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p, json.dumps(analyse(p), ensure_ascii=False, indent=1))
