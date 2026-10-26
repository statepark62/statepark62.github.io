#!/usr/bin/env python3
"""KanjiVG에서 획 경로를 받아 strokes.js 생성. 사용: python build_strokes.py --kanji-app kanji_app.json --out strokes.js
출처: KanjiVG (https://kanjivg.tagaini.net) © Ulrich Apel, CC BY-SA 3.0. strokes.js도 같은 조건(CC BY-SA 3.0)으로 배포해야 한다."""
import argparse, json, re, urllib.request, urllib.error, concurrent.futures as cf
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('--kanji-app', required=True); ap.add_argument('--out', required=True)
a = ap.parse_args()
ks = [e['k'] for e in json.load(open(a.kanji_app, encoding='utf-8'))['kanji']]
BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/'

def rnd(d):  # 소수 둘째 자리 → 첫째 자리 (용량 절감)
    return re.sub(r'-?\d+\.\d+', lambda m: ('%.1f' % float(m.group())).rstrip('0').rstrip('.'), d)

def fetch(k):
    fn = '%05x.svg' % ord(k)
    try:
        raw = urllib.request.urlopen(BASE + fn, timeout=30).read()
    except urllib.error.URLError as e:
        return k, None, str(e)
    root = ET.fromstring(raw)
    ps = []
    for el in root.iter('{http://www.w3.org/2000/svg}path'):
        m = re.search(r'-s(\d+)$', el.get('id', ''))
        if m: ps.append((int(m.group(1)), rnd(el.get('d'))))
    ps.sort()
    return k, [d for _, d in ps], None

out, bad = {}, []
with cf.ThreadPoolExecutor(8) as ex:
    for k, ds, err in ex.map(fetch, ks):
        if ds: out[k] = ds
        else: bad.append((k, err))
hdr = '/* 획순 데이터: KanjiVG (https://kanjivg.tagaini.net) (c) Ulrich Apel, CC BY-SA 3.0. 이 파일도 같은 조건으로 배포한다. */\n'
open(a.out, 'w', encoding='utf-8').write(hdr + 'window.KANJI_STROKES=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('받은 한자', len(out), '/', len(ks), '실패', bad)
print('획 수 평균', sum(len(v) for v in out.values()) / max(1, len(out)))
