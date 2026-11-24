import json, os, sys, numpy as np
sys.path.insert(0, '/home/claude/prcindex/scripts/color-scan')
import scan_colors as S
ROOT='/home/claude/prcindex'
seed=json.load(open(f'{ROOT}/src/seed/coded494.json'))
EXCLUDED={393,424}
ACTIVE={117:"versions/121_pixelplus_ru_official.png",271:"versions/277_ligaa_agency_header.png"}
os.makedirs('/home/claude/scan/rgba',exist_ok=True)
out=[]
for r in seed:
    idx=int(r['index'])
    if idx in EXCLUDED: continue
    f=ACTIVE.get(idx,r['E']); path=f'{ROOT}/public/logos/{f}'
    try:
        im,src=S.load_rgba(path)
        a=np.asarray(im).astype(np.uint8)
        a.tofile(f'/home/claude/scan/rgba/{idx}.bin')
        res=S.analyse(path)
        out.append({'idx':idx,'file':f,'w':im.width,'h':im.height,'src':src,'res':res})
    except Exception as e:
        out.append({'idx':idx,'file':f,'error':str(e)})
json.dump(out,open('/home/claude/scan/ref.json','w'),ensure_ascii=False)
print(len(out), sum('error' in x for x in out))
