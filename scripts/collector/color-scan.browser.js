// Сгенерировано из src/color-scan.ts (tsc). Браузерная сборка сканера для сборщика: window.PRC_SCAN.
(function(){
// Сканер цвета логотипов — перенос scripts/color-scan/scan_colors.py (методика цвета v2) на TypeScript.
// Логика и пороги совпадают с Python-версией; совпадение проверено на корпусе 492
// (scripts/color-scan/verify_ts_port.mjs). Растеризация в браузере — loadRgba().
const PARAMS = {
    raster_long_side_px: 400,
    alpha_opaque_min: 250,
    alpha_transparent_max: 10,
    border_px: 2,
    border_uniform_de: 0.04,
    border_uniform_share: 0.85,
    background_de: 0.06,
    white_bg_L_min: 0.9,
    white_bg_C_max: 0.05,
    fallback_light_bg_share: 0.25,
    quant_step_L: 0.02,
    quant_step_ab: 0.01,
    merge_de: 0.07,
    min_share: 0.01,
    antialias_seg_de: 0.035,
    antialias_max_share: 0.1,
    max_colors: 6,
    accent_share: 0.08,
    achromatic_C_max: 0.035,
    dark_L_max: 0.25,
    dark_C_max: 0.05,
    black_L_max: 0.4,
    white_L_min: 0.93,
    brown: { h_min: 30, h_max: 100, L_max: 0.55, C_max: 0.14 },
    pastel_pink_L_min: 0.8,
    hue_sectors: [
        ["розовый", 325, 9.5],
        ["красный", 9.5, 35],
        ["оранжевый", 35, 82],
        ["жёлтый", 82, 117.5],
        ["зелёный", 117.5, 169],
        ["бирюзовый", 169, 231],
        ["синий", 231, 279],
        ["фиолетовый", 279, 325],
    ],
    borderline_hue_deg: 5,
    borderline_C: 0.012,
    borderline_accent: [0.05, 0.12],
};
const SCANNER_VERSION = "2.1-ts";
const ACHROMATIC = new Set(["чёрный", "серый", "белый"]);
const COLD = new Set(["синий", "бирюзовый", "зелёный", "фиолетовый"]);
const WARM = new Set(["красный", "оранжевый", "жёлтый", "розовый", "коричневый"]);
// ---------- округления как в numpy / Python ----------
function roundHalfEven(x) {
    const r = Math.round(x);
    if (Math.abs(x % 1) === 0.5)
        return 2 * Math.round(x / 2);
    return r;
}
// Python round(x, n): точное десятичное округление двоичного значения (как toFixed)
const round = (x, n) => Number(x.toFixed(n));
// ---------- цветовые пространства ----------
const M1 = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
];
const M2 = [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
];
function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [
        [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
        [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
        [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
}
const M1i = inv3(M1), M2i = inv3(M2);
const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const LIN = Array.from({ length: 256 }, (_, i) => lin(i));
function srgbToOklab(r, g, b) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const l = Math.cbrt(M1[0][0] * R + M1[0][1] * G + M1[0][2] * B);
    const m = Math.cbrt(M1[1][0] * R + M1[1][1] * G + M1[1][2] * B);
    const s = Math.cbrt(M1[2][0] * R + M1[2][1] * G + M1[2][2] * B);
    return [
        M2[0][0] * l + M2[0][1] * m + M2[0][2] * s,
        M2[1][0] * l + M2[1][1] * m + M2[1][2] * s,
        M2[2][0] * l + M2[2][1] * m + M2[2][2] * s,
    ];
}
function oklabToHex(lab) {
    const lms = [0, 1, 2].map((r) => (M2i[r][0] * lab[0] + M2i[r][1] * lab[1] + M2i[r][2] * lab[2]) ** 3);
    return ("#" +
        [0, 1, 2]
            .map((r) => {
            let v = M1i[r][0] * lms[0] + M1i[r][1] * lms[1] + M1i[r][2] * lms[2];
            v = Math.min(1, Math.max(0, v));
            let c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
            c = Math.min(1, Math.max(0, c));
            return roundHalfEven(c * 255).toString(16).padStart(2, "0");
        })
            .join(""));
}
function lch(lab) {
    const [L, a, b] = lab;
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    h = ((h % 360) + 360) % 360;
    return [L, Math.hypot(a, b), h];
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// ---------- семья цвета ----------
const inSector = (h, s, e) => (s > e ? h >= s || h < e : s <= h && h < e);
function classify(lab, P = PARAMS) {
    const [L, C, h] = lch(lab);
    const flags = [];
    if (Math.abs(C - P.achromatic_C_max) < P.borderline_C)
        flags.push("на границе цветной/ахроматический");
    if (C < P.achromatic_C_max || (L < P.dark_L_max && C < P.dark_C_max)) {
        return [L < P.black_L_max ? "чёрный" : L >= P.white_L_min ? "белый" : "серый", flags];
    }
    const br = P.brown;
    if (br.h_min <= h && h < br.h_max && P.dark_L_max <= L && L < br.L_max && C < br.C_max)
        return ["коричневый", flags];
    let fam = null;
    for (const [name, s, e] of P.hue_sectors) {
        if (inSector(h, s, e)) {
            fam = name;
            for (const edge of [s, e]) {
                const d = Math.min(Math.abs(h - edge), 360 - Math.abs(h - edge));
                if (d < P.borderline_hue_deg)
                    flags.push(`оттенок у границы ${pyNum(edge)}°`);
            }
            break;
        }
    }
    if (fam === "красный" && L >= P.pastel_pink_L_min)
        fam = "розовый";
    return [fam, flags];
}
const pyNum = (x) => (Number.isInteger(x) ? String(x) : String(x));
const median = (vals) => {
    const s = [...vals].sort((a, b) => a - b), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
// ---------- основной анализ (вход — RGBA как после load_rgba в Python) ----------
function analyseRgba(data, W, H, source, P = PARAMS) {
    const N = W * H;
    const lab = new Array(N);
    const alpha = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        lab[i] = srgbToOklab(data[4 * i], data[4 * i + 1], data[4 * i + 2]);
        alpha[i] = data[4 * i + 3];
    }
    const flags = [];
    const info = { source_raster: source };
    if (Math.min(H, W) < 48 && source !== "svg")
        flags.push("низкое разрешение");
    let transparent = new Uint8Array(N);
    let tCount = 0;
    for (let i = 0; i < N; i++)
        if (alpha[i] <= P.alpha_transparent_max) {
            transparent[i] = 1;
            tCount++;
        }
    const b0 = P.border_px;
    const inRing = (i) => {
        const y = Math.floor(i / W), x = i % W;
        return y < b0 || y >= H - b0 || x < b0 || x >= W - b0;
    };
    let ringOpaque = false;
    for (let i = 0; i < N; i++)
        if (inRing(i) && alpha[i] >= P.alpha_opaque_min) {
            ringOpaque = true;
            break;
        }
    let plate = false;
    let bgLab = null;
    let bg = new Uint8Array(N);
    if (tCount / N > 0.02 || !ringOpaque) {
        if (tCount / N <= 0.02) {
            transparent = new Uint8Array(N);
            for (let i = 0; i < N; i++)
                if (alpha[i] < P.alpha_opaque_min)
                    transparent[i] = 1;
        }
        bg = transparent.slice();
        info.background = "прозрачный";
    }
    else {
        const ringLab = [];
        for (let i = 0; i < N; i++)
            if (inRing(i) && alpha[i] >= P.alpha_opaque_min)
                ringLab.push(lab[i]);
        const med = [0, 1, 2].map((k) => median(ringLab.map((v) => v[k])));
        const uniform = ringLab.filter((v) => dist(v, med) < P.border_uniform_de).length / ringLab.length;
        const [L, C] = lch(med);
        if (uniform < P.border_uniform_share) {
            const light = new Uint8Array(N);
            let lc = 0;
            for (let i = 0; i < N; i++) {
                if (lab[i][0] >= P.white_bg_L_min && Math.hypot(lab[i][1], lab[i][2]) < P.white_bg_C_max) {
                    light[i] = 1;
                    lc++;
                }
            }
            if (lc / N >= P.fallback_light_bg_share) {
                bg = light;
                const lp = [];
                for (let i = 0; i < N; i++)
                    if (light[i])
                        lp.push(lab[i]);
                bgLab = [0, 1, 2].map((k) => median(lp.map((v) => v[k])));
                info.background = "светлый (по доле пикселей)";
                flags.push("фон определён по доле светлых пикселей");
            }
            else {
                info.background = "не определён";
                flags.push("фон не определён");
            }
        }
        else if (L >= P.white_bg_L_min && C < P.white_bg_C_max) {
            bgLab = med;
            for (let i = 0; i < N; i++)
                if (dist(lab[i], med) < P.background_de)
                    bg[i] = 1;
            info.background = "светлый";
        }
        else {
            plate = true;
            info.background = "плашка " + oklabToHex(med);
            flags.push("плашка");
        }
    }
    // кольцо 1 px вокруг фона + полупрозрачные пиксели
    const halo = new Uint8Array(N);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if ((y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]) || (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]))
                halo[i] = 1;
        }
    let idx = [];
    for (let i = 0; i < N; i++)
        if (!bg[i] && !halo[i] && alpha[i] >= P.alpha_opaque_min)
            idx.push(i);
    if (idx.length < 50) {
        idx = [];
        for (let i = 0; i < N; i++)
            if (!bg[i] && alpha[i] >= P.alpha_opaque_min)
                idx.push(i);
    }
    const px = idx.map((i) => lab[i]);
    const n = px.length;
    if (n === 0)
        return { error: "знак не найден", flags: ["знак не найден"], ...info };
    const bins = new Map();
    for (const p of px) {
        const key = [
            roundHalfEven(p[0] / P.quant_step_L),
            roundHalfEven(p[1] / P.quant_step_ab),
            roundHalfEven(p[2] / P.quant_step_ab),
        ];
        const k = key.join(",");
        let b = bins.get(k);
        if (!b) {
            b = { key, sum: [0, 0, 0], cnt: 0 };
            bins.set(k, b);
        }
        b.sum[0] += p[0];
        b.sum[1] += p[1];
        b.sum[2] += p[2];
        b.cnt++;
    }
    const order = [...bins.values()].sort((a, b) => b.cnt - a.cnt || a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
    const clC = [], clW = [];
    for (const b of order) {
        const c = [b.sum[0] / b.cnt, b.sum[1] / b.cnt, b.sum[2] / b.cnt];
        const w = b.cnt;
        if (clC.length) {
            let j = 0, dj = Infinity;
            clC.forEach((cc, t) => { const d = dist(cc, c); if (d < dj) {
                dj = d;
                j = t;
            } });
            if (dj < P.merge_de) {
                clC[j] = [0, 1, 2].map((k) => (clC[j][k] * clW[j] + c[k] * w) / (clW[j] + w));
                clW[j] += w;
                continue;
            }
        }
        clC.push(c);
        clW.push(w);
    }
    // промежуточные оттенки на краях
    const alias = clC.map(() => false);
    for (let i = 0; i < clC.length; i++) {
        if (clW[i] / n >= P.antialias_max_share)
            continue;
        const big = clC.map((_, j) => j).filter((j) => clW[j] > clW[i] && !alias[j]);
        outer: for (let x = 0; x < big.length; x++)
            for (let y = x + 1; y < big.length; y++) {
                const A = clC[big[x]], B = clC[big[y]], Ci = clC[i];
                const BA = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
                const CA = [Ci[0] - A[0], Ci[1] - A[1], Ci[2] - A[2]];
                const t = (CA[0] * BA[0] + CA[1] * BA[1] + CA[2] * BA[2]) / Math.max(BA[0] ** 2 + BA[1] ** 2 + BA[2] ** 2, 1e-12);
                if (0.08 < t && t < 0.92 && dist([A[0] + t * BA[0], A[1] + t * BA[1], A[2] + t * BA[2]], Ci) < P.antialias_seg_de) {
                    alias[i] = true;
                    break outer;
                }
            }
    }
    const Wt = clW.map((w, i) => (alias[i] ? 0 : w));
    let keepIdx = Wt.map((_, i) => i).filter((i) => Wt[i] / n >= P.min_share);
    if (!keepIdx.length) {
        let best = 0;
        Wt.forEach((w, i) => { if (w > Wt[best])
            best = i; });
        keepIdx = [best];
    }
    else {
        keepIdx = keepIdx.map((i, pos) => ({ i, pos })).sort((a, b) => Wt[b.i] - Wt[a.i] || a.pos - b.pos).map((x) => x.i);
    }
    const Cc = keepIdx.slice(0, P.max_colors).map((i) => [...clC[i]]);
    const assign = px.map((p) => {
        let best = 0, bd = Infinity;
        Cc.forEach((c, k) => { const d = dist(p, c); if (d < bd) {
            bd = d;
            best = k;
        } });
        return best;
    });
    const sums = Cc.map(() => [0, 0, 0]), cnts = Cc.map(() => 0);
    px.forEach((p, t) => { const k = assign[t]; sums[k][0] += p[0]; sums[k][1] += p[1]; sums[k][2] += p[2]; cnts[k]++; });
    Cc.forEach((_, k) => { if (cnts[k])
        Cc[k] = [sums[k][0] / cnts[k], sums[k][1] / cnts[k], sums[k][2] / cnts[k]]; });
    const shares = cnts.map((c) => c / n);
    let colors = shares
        .map((s, k) => ({ s, k }))
        .sort((a, b) => b.s - a.s || a.k - b.k)
        .map(({ k }) => {
        const [fam, fl] = classify(Cc[k], P);
        const [L_, C_, h_] = lch(Cc[k]);
        return { hex: oklabToHex(Cc[k]), share: round(shares[k], 4), family: fam, L: round(L_, 3), C: round(C_, 3), h: round(h_, 1), flags: fl };
    });
    if (bgLab) {
        colors = colors.filter((c) => c.family !== "белый");
        const tot = colors.reduce((a, c) => a + c.share, 0) || 1;
        colors.forEach((c) => (c.share = round(c.share / tot, 4)));
    }
    const famShare = new Map();
    for (const c of colors)
        famShare.set(c.family, round((famShare.get(c.family) ?? 0) + c.share, 4));
    const famsSorted = [...famShare.entries()].map((e, pos) => ({ e, pos })).sort((a, b) => b.e[1] - a.e[1] || a.pos - b.pos).map((x) => x.e);
    const chrom = [...famShare.entries()].filter(([f]) => !ACHROMATIC.has(f));
    const chromaticShare = round(chrom.reduce((a, [, s]) => a + s, 0), 4);
    const mainFamily = famsSorted[0]?.[0];
    const argmax = (arr) => arr.reduce((best, cur) => (cur[1] > best[1] ? cur : best), arr[0]);
    const leadChromatic = chromaticShare >= P.accent_share && chrom.length ? argmax(chrom)[0] : null;
    const status = chromaticShare < P.accent_share ? "ахроматический" : ACHROMATIC.has(mainFamily) ? "ахроматический с акцентом" : "хроматический";
    let colorV1;
    if (leadChromatic)
        colorV1 = leadChromatic;
    else {
        const ach = [...famShare.entries()].filter(([f]) => ACHROMATIC.has(f));
        colorV1 = ach.length ? argmax(ach)[0] : mainFamily;
    }
    const nFam = famShare.size;
    const temperature = COLD.has(colorV1) ? "холодный" : WARM.has(colorV1) ? "тёплый" : "ахроматический";
    for (const c of colors)
        if (c.share >= P.accent_share && c.flags.length)
            flags.push(`${c.family} ${c.hex}: ` + c.flags.join("; "));
    const [lo, hi] = P.borderline_accent;
    if (lo <= chromaticShare && chromaticShare <= hi)
        flags.push(`хроматичность ${Math.round(chromaticShare * 100)}% рядом с порогом 8%`);
    return {
        ...info,
        plate,
        colors,
        family_share: Object.fromEntries(famsSorted),
        main_family: mainFamily,
        lead_chromatic: leadChromatic,
        chromatic_share: chromaticShare,
        status,
        color_v1: colorV1,
        n_families: nFam,
        palette_type: nFam === 1 ? "одноцветный" : nFam === 2 ? "двухцветный" : "многоцветный",
        temperature,
        flags,
        borderline: flags.some((f) => f !== "плашка"),
    };
}
// ---------- растеризация в браузере (аналог load_rgba) ----------
// SVG: рендер по ширине 400 px (если вытянут по вертикали — по высоте 400).
// Растр: исходный размер, затем уменьшение усреднением (как Image.BOX в PIL), если длинная сторона > 400.
async function loadRgba(url, P = PARAMS) {
    const side = P.raster_long_side_px;
    const blob = await fetch(url).then((r) => {
        if (!r.ok)
            throw new Error(`Файл не загрузился: ${r.status}`);
        return r.blob();
    });
    const isSvg = blob.type.includes("svg") || /\.svg($|\?)/i.test(url) || url.startsWith("data:image/svg");
    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("Изображение не читается"));
            im.src = objectUrl;
        });
        let nw = img.naturalWidth || 300, nh = img.naturalHeight || 150;
        if (isSvg) {
            // как rsvg-convert: собственный размер из width/height, иначе из viewBox
            const dims = svgSize(await blob.text());
            if (dims)
                [nw, nh] = dims;
        }
        let w, h;
        if (isSvg) {
            if (nh > nw) {
                h = side;
                w = Math.max(1, Math.round((nw * side) / nh));
            }
            else {
                w = side;
                h = Math.max(1, Math.round((nh * side) / nw));
            }
            const cv = document.createElement("canvas");
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h, source: "svg" };
        }
        const cv = document.createElement("canvas");
        cv.width = nw;
        cv.height = nh;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const full = ctx.getImageData(0, 0, nw, nh).data;
        const src = `${nw}x${nh}`;
        if (Math.max(nw, nh) <= side)
            return { data: full, width: nw, height: nh, source: src };
        const k = side / Math.max(nw, nh);
        w = Math.max(1, roundHalfEven(nw * k));
        h = Math.max(1, roundHalfEven(nh * k));
        return { data: boxResize(full, nw, nh, w, h), width: w, height: h, source: src };
    }
    finally {
        URL.revokeObjectURL(objectUrl);
    }
}
/**
 * Уменьшение как Image.resize(..., Image.BOX) в Pillow: альфа предварительно умножается (RGBa, 8 бит),
 * два прохода (по горизонтали, затем по вертикали) с фиксированной точкой 22 бита и округлением до 8 бит.
 */
const PRECISION_BITS = 22;
function boxCoeffs(inSize, outSize) {
    const scale = inSize / outSize;
    const filterscale = Math.max(scale, 1);
    const support = 0.5 * filterscale;
    const res = [];
    for (let xx = 0; xx < outSize; xx++) {
        const center = (xx + 0.5) * scale;
        const ss = 1 / filterscale;
        let xmin = Math.trunc(center - support + 0.5);
        if (xmin < 0)
            xmin = 0;
        let xmax = Math.trunc(center + support + 0.5);
        if (xmax > inSize)
            xmax = inSize;
        xmax -= xmin;
        const k = [];
        let ww = 0;
        for (let x = 0; x < xmax; x++) {
            const t = (x + xmin - center + 0.5) * ss;
            const w = t > -0.5 && t <= 0.5 ? 1 : 0;
            k.push(w);
            ww += w;
        }
        res.push({
            xmin,
            k: k.map((w) => {
                const v = ww !== 0 ? w / ww : w;
                return Math.trunc(v * (1 << PRECISION_BITS) + (v < 0 ? -0.5 : 0.5));
            }),
        });
    }
    return res;
}
const clip8 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v);
function boxResize(src, sw, sh, dw, dh) {
    // RGBA -> RGBa (MULDIV255)
    const pre = new Uint8Array(sw * sh * 4);
    for (let i = 0; i < sw * sh; i++) {
        const a = src[4 * i + 3];
        for (let c = 0; c < 3; c++) {
            const t = src[4 * i + c] * a + 128;
            pre[4 * i + c] = ((t >> 8) + t) >> 8;
        }
        pre[4 * i + 3] = a;
    }
    const half = 1 << (PRECISION_BITS - 1);
    // горизонтальный проход
    const hc = boxCoeffs(sw, dw);
    const tmp = new Uint8Array(dw * sh * 4);
    for (let y = 0; y < sh; y++)
        for (let x = 0; x < dw; x++) {
            const { xmin, k } = hc[x];
            for (let c = 0; c < 4; c++) {
                let ss = half;
                for (let t = 0; t < k.length; t++)
                    ss += pre[(y * sw + xmin + t) * 4 + c] * k[t];
                tmp[(y * dw + x) * 4 + c] = clip8(Math.floor(ss / (1 << PRECISION_BITS)));
            }
        }
    // вертикальный проход
    const vc = boxCoeffs(sh, dh);
    const outPre = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
        const { xmin: ymin, k } = vc[y];
        for (let x = 0; x < dw; x++)
            for (let c = 0; c < 4; c++) {
                let ss = half;
                for (let t = 0; t < k.length; t++)
                    ss += tmp[((ymin + t) * dw + x) * 4 + c] * k[t];
                outPre[(y * dw + x) * 4 + c] = clip8(Math.floor(ss / (1 << PRECISION_BITS)));
            }
    }
    // RGBa -> RGBA
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let i = 0; i < dw * dh; i++) {
        const a = outPre[4 * i + 3];
        for (let c = 0; c < 3; c++) {
            const v = outPre[4 * i + c];
            out[4 * i + c] = a === 255 || a === 0 ? v : clip8(Math.trunc((255 * v) / a));
        }
        out[4 * i + 3] = a;
    }
    return out;
}
function svgSize(text) {
    const tag = text.match(/<svg\b[^>]*>/i)?.[0];
    if (!tag)
        return null;
    const attr = (n) => tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    const num = (v) => (v && !v.trim().endsWith("%") ? parseFloat(v) : NaN);
    const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
    let w = num(attr("width")), h = num(attr("height"));
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        if (!(w > 0) && !(h > 0)) {
            w = vb[2];
            h = vb[3];
        }
        else if (!(w > 0))
            w = (h * vb[2]) / vb[3];
        else if (!(h > 0))
            h = (w * vb[3]) / vb[2];
    }
    return w > 0 && h > 0 ? [w, h] : null;
}
async function scanUrl(url) {
    const { data, width, height, source } = await loadRgba(url);
    return analyseRgba(data, width, height, source);
}

window.PRC_SCAN = { scanUrl, analyseRgba, SCANNER_VERSION };
})();
