#!/usr/bin/env python3
"""구글 시트에서 읽은 rows.json -> prayers.js, 아이콘, sw.js 를 생성한다."""
import json, time, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(os.path.join(ROOT, 'build', 'rows.json'), encoding='utf-8'))

cats_order = ["주요 기도", "묵주기도", "성무일도", "상황별 기도", "성인 기도",
              "성월 기도", "호칭 기도", "여러 가지 기도", "기타 기도"]
prayers = []
for r in rows:
    r = r + [''] * (8 - len(r))
    pid, cat, title, body, alias, src, note, show = r[:8]
    if show.strip() == '숨김' or not title.strip():
        continue
    prayers.append(dict(id=pid, cat=cat, title=title, body=body,
                        alias=alias, src=src, note=note))

used = [c for c in cats_order if any(p['cat'] == c for p in prayers)]
for p in prayers:
    if p['cat'] not in used:
        used.append(p['cat'])

rosary = {"일": "영광의 신비", "월": "환희의 신비", "화": "고통의 신비",
          "수": "영광의 신비", "목": "빛의 신비", "금": "고통의 신비", "토": "환희의 신비"}

ver = time.strftime('%Y%m%d-%H%M%S')
js = "// 자동 생성 파일 (build/build.py). 직접 수정하지 마세요.\n"
js += "window.DATA_VERSION=%s;\n" % json.dumps(ver)
js += "window.CATEGORIES=%s;\n" % json.dumps(used, ensure_ascii=False)
js += "window.ROSARY=%s;\n" % json.dumps(rosary, ensure_ascii=False)
js += "window.PRAYERS=%s;\n" % json.dumps(prayers, ensure_ascii=False, indent=0)
open(os.path.join(ROOT, 'prayers.js'), 'w', encoding='utf-8').write(js)

# service worker
sw = open(os.path.join(ROOT, 'build', 'sw.template.js'), encoding='utf-8').read().replace('__VERSION__', ver)
open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write(sw)

# icons
def icon(size, maskable=False):
    im = Image.new('RGB', (size, size), '#3b2a5a')
    d = ImageDraw.Draw(im)
    pad = size * (0.22 if maskable else 0.16)
    if not maskable:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.2, fill='#3b2a5a')
    cx = size / 2
    w = size * 0.09
    top, bot = pad + size * 0.02, size - pad
    arm_y = top + (bot - top) * 0.34
    arm = (bot - top) * 0.3
    d.rectangle([cx - w / 2, top, cx + w / 2, bot], fill='#f3e3b0')
    d.rectangle([cx - arm, arm_y - w / 2, cx + arm, arm_y + w / 2], fill='#f3e3b0')
    return im

for s in (192, 512):
    icon(s).save(os.path.join(ROOT, 'icon-%d.png' % s))
icon(512, True).save(os.path.join(ROOT, 'icon-maskable-512.png'))
icon(180).save(os.path.join(ROOT, 'apple-touch-icon.png'))
print('기도문', len(prayers), '건, 분류', used, ', 버전', ver)
