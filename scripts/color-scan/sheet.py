import json, sys, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont
import scan_colors as S
rows = json.load(open("scan_v2_results.json"))["rows"]
sel = sys.argv[1]; out = sys.argv[2]
if sel == "changed": R = [x for x in rows if "error" not in x and x["color_v1"] != x["old_color"]]
elif sel == "undetermined": R = [x for x in rows if x.get("background") == "не определён"]
else: R = [x for x in rows if "error" not in x and x["borderline"]]
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
cw, ch, cols = 230, 175, 6
sheet = Image.new("RGB", (cw * cols, ch * ((len(R) + cols - 1) // cols)), "white")
d = ImageDraw.Draw(sheet)
for i, x in enumerate(R):
    im, _ = S.load_rgba("data/public/logos/" + x["file"])
    im.thumbnail((210, 105))
    bg = Image.new("RGB", (210, 105), (200, 200, 200)); bg.paste(im, ((210 - im.width) // 2, (105 - im.height) // 2), im)
    X, Y = (i % cols) * cw, (i // cols) * ch
    sheet.paste(bg, (X + 10, Y + 5))
    sw = X + 10
    for c in x["colors"]:
        w = max(1, int(210 * c["share"])); d.rectangle([sw, Y + 112, sw + w, Y + 120], fill=c["hex"]); sw += w
    d.text((X + 10, Y + 124), f'{x["id"]} {x["company"][:22]}', fill="black", font=font)
    d.text((X + 10, Y + 140), f'{x["old_color"]} → {x["color_v1"]}', fill="black", font=font)
    d.text((X + 10, Y + 156), f'цвет {x["chromatic_share"]*100:.0f}% · {x["background"][:12]}', fill=(90, 90, 90), font=font)
sheet.save(out); print(len(R))
