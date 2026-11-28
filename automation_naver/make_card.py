# -*- coding: utf-8 -*-
"""
make_card.py — 인포그래픽형 학습 카드 생성 (HTML → PNG)
daily.py에서 make(data, today, issue_no, out_path) 함수로 호출한다.
단독 실행: python automation/make_card.py  (샘플 데이터로 테스트)
"""
import html
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]
URL = "https://statepark62.github.io/tenseijingo_naver/"


def esc(s):
    return html.escape(str(s), quote=True)


def esc_ruby(s):
    """daily.py의 esc_ruby와 동일한 규칙: <ruby><rt> 후리가나 태그만 복원하고
    나머지는 이스케이프. 태그 짝이 안 맞으면 안전하게 일반 텍스트로 되돌린다."""
    out = html.escape(str(s), quote=True)
    for tag in ("ruby", "/ruby", "rt", "/rt"):
        out = out.replace(f"&lt;{tag}&gt;", f"<{tag}>")
    if (out.count("<ruby>") != out.count("</ruby>")
            or out.count("<rt>") != out.count("</rt>")
            or out.count("<ruby>") != out.count("<rt>")):
        for tag in ("<ruby>", "</ruby>", "<rt>", "</rt>"):
            out = out.replace(tag, "")
    return out


def qr_svg(url, module=6):
    sys.path.insert(0, str(HERE))
    from card import qr_matrix
    g = qr_matrix(url)
    n = len(g)
    quiet = 2
    size = (n + quiet * 2) * module
    rects = "".join(
        f'<rect x="{(c+quiet)*module}" y="{(r+quiet)*module}" '
        f'width="{module}" height="{module}" fill="#2B2B33"/>'
        for r in range(n) for c in range(n) if g[r][c])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" '
            f'fill="#fff"/>{rects}</svg>')


def build_html(data, today, issue_no):
    tpl = (HERE / "card_template.html").read_text(encoding="utf-8")
    date_ko = f"{today.year}년 {today.month}월 {today.day}일 ({WEEKDAY_KO[today.weekday()]})"

    tokens = {
        "{{ISSUE_NO}}": str(issue_no),
        "{{DATE_KO}}": date_ko,
        "{{TOPIC_JA}}": esc_ruby(data["topic_ja"]),
        "{{TOPIC_KO}}": esc(data["topic_ko"]),
        "{{KEY_QUOTE_JA}}": esc_ruby(data["key_quote"]["ja"]),
        "{{KEY_QUOTE_KO}}": esc(data["key_quote"]["ko"]),
        "{{GRAMMAR_PATTERN}}": esc_ruby(data["grammar"]["pattern"]),
        "{{GRAMMAR_PATTERN_KO}}": esc(data["grammar"]["pattern_ko"]),
        "{{GRAMMAR_EXPLAIN}}": esc(data["grammar"]["explanation_ko"]),
        "{{GRAMMAR_EX_JA}}": esc_ruby(data["grammar"]["example_ja"]),
        "{{GRAMMAR_EX_KO}}": esc(data["grammar"]["example_ko"]),
        "{{TODAY_JA}}": esc_ruby(data["today_line"]["ja"]),
        "{{TODAY_KO}}": esc(data["today_line"]["ko"]),
    }
    for k, v in tokens.items():
        tpl = tpl.replace(k, v)

    tpl = tpl.replace("<!--SUMMARY_ITEMS-->", "\n".join(
        f"        <li>{esc(s)}</li>" for s in data["summary_ko"]))
    tpl = tpl.replace("<!--BG_ITEMS-->", "\n".join(
        f"        <li>{esc(s)}</li>" for s in data["background_ko"]))
    tpl = tpl.replace("<!--WP_ITEMS-->", "\n".join(
        f"        <li>{esc(s)}</li>" for s in data["writing_points_ko"]))

    vocab_html = []
    for i, v in enumerate(data["vocab"][:5], 1):
        lv = f'<span class="lv">{esc(v["level"])}</span>' if v.get("level") else ""
        vocab_html.append(
            f'        <li><span class="n">{i}</span><div>'
            f'<span class="w">{esc(v["word"])}</span>'
            f'<span class="r">{esc(v["reading"])}</span>{lv}'
            f'<div class="m">{esc(v["meaning_ko"])}</div></div></li>')
    tpl = tpl.replace("<!--VOCAB_ITEMS-->", "\n".join(vocab_html))

    return tpl.replace("<!--QR_SVG-->", qr_svg(URL))


def make(data, today, issue_no, out_path):
    """카드 PNG 생성. 성공 시 경로, 실패 시 예외."""
    from playwright.sync_api import sync_playwright
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = HERE / "_card_tmp.html"
    tmp.write_text(build_html(data, today, issue_no), encoding="utf-8")
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1080, "height": 1400})
            pg.goto(tmp.as_uri())
            pg.wait_for_timeout(500)  # 폰트 렌더링 대기
            pg.screenshot(path=str(out_path), full_page=True)
            b.close()
    finally:
        tmp.unlink(missing_ok=True)
    return out_path


# ══════════════════════════════════════════════════════════
# Threads용 슬라이드: 세로로 긴 카드를 4:5(1080×1350) 여러 장으로 나눔
#  - 폭을 좁게(논리 폭 780px) 그린 뒤 1080px로 확대 → 글자가 훨씬 크게 보인다
#  - 섹션 경계에서만 나누므로 박스가 중간에 잘리지 않는다
# ══════════════════════════════════════════════════════════
SLIDE_W, SLIDE_H = 1080, 1350
SLIDE_LOGICAL_W = 820


def make_slides(data, today, issue_no, out_dir, stem):
    """슬라이드 JPEG 여러 장 생성. 반환: [경로, ...] (stem_1.jpg, stem_2.jpg ...)"""
    from playwright.sync_api import sync_playwright
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scale = SLIDE_W / SLIDE_LOGICAL_W
    H = SLIDE_H / scale                       # CSS 픽셀 기준 한 장의 높이
    PAD_T, PAD_B, CONT_H, GAP = 28, 34, 48, 22

    tmp = HERE / "_slide_tmp.html"
    tmp.write_text(build_html(data, today, issue_no), encoding="utf-8")
    outs = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": SLIDE_LOGICAL_W, "height": int(H)},
                            device_scale_factor=scale)
            pg.goto(tmp.as_uri())
            pg.add_style_tag(content=(
                f"html{{background:var(--paper)}}"
                f"body{{width:{SLIDE_LOGICAL_W}px}}"
                f".wrap{{padding:{PAD_T}px 34px {PAD_B}px;position:relative;min-height:{H}px}}"
                ".cont{font-size:21px;font-weight:800;color:var(--navy);"
                "border-bottom:3px solid var(--navy);padding-bottom:8px;margin-bottom:18px}"
                ".pgn{position:absolute;right:34px;bottom:10px;font-size:17px;color:var(--soft)}"
                ".qrbox svg{width:104px;height:104px}"
                "footer{margin-top:14px;padding-top:12px}"
                "header{margin-bottom:20px}"
            ))
            pg.wait_for_timeout(500)          # 폰트 렌더링 대기

            # 나눌 수 있는 덩어리(atom) 구성: 헤더 / 그리드의 각 줄 / 푸터
            atoms = pg.evaluate("""() => {
              const q = s => document.querySelector(s);
              const kids = Array.from(q('.grid').children);
              const groups = [[0,1],[2],[3,4],[5]].map(g => g.filter(i => kids[i]));
              const top = e => e.getBoundingClientRect().top + window.scrollY;
              const bot = e => e.getBoundingClientRect().bottom + window.scrollY;
              const res = [];
              const hd = q('header');
              res.push({kind:'header', h: bot(hd) - top(hd) + 20});
              groups.forEach((g, gi) => {
                if (!g.length) return;
                const a = kids[g[0]], z = kids[g[g.length-1]];
                res.push({kind:'group', idx:g, h: Math.max(...g.map(i => bot(kids[i]))) - top(a)});
              });
              const ft = q('footer');
              res.push({kind:'footer', h: bot(ft) - top(ft) + 14});
              return res;
            }""")

            # 위에서부터 차곡차곡 쌓다가 넘치면 새 장으로
            full = H - PAD_T - PAD_B
            pages, cur, used = [], [], 0.0
            for ai, a in enumerate(atoms):
                avail = full if not pages else full - CONT_H
                add = a["h"] + (GAP if cur else 0)
                if cur and used + add > avail:
                    pages.append(cur); cur, used = [], 0.0
                    add = a["h"]
                cur.append(ai); used += add
            if cur:
                pages.append(cur)

            n = len(pages)
            date_ko = f"{today.year}년 {today.month}월 {today.day}일 ({WEEKDAY_KO[today.weekday()]})"
            for k, page_atoms in enumerate(pages, 1):
                pg.evaluate("""([atoms, show, k, n, dateKo]) => {
                  const q = s => document.querySelector(s);
                  const kids = Array.from(q('.grid').children);
                  document.querySelectorAll('.cont,.pgn').forEach(e => e.remove());
                  q('header').style.display = 'none';
                  q('footer').style.display = 'none';
                  kids.forEach(e => e.style.display = 'none');
                  let gridUsed = false;
                  show.forEach(i => {
                    const a = atoms[i];
                    if (a.kind === 'header') q('header').style.display = '';
                    if (a.kind === 'footer') q('footer').style.display = '';
                    if (a.kind === 'group') { gridUsed = true; a.idx.forEach(j => kids[j].style.display = ''); }
                  });
                  q('.grid').style.display = gridUsed ? '' : 'none';
                  const wrap = q('.wrap');
                  if (k > 1) {
                    const c = document.createElement('div');
                    c.className = 'cont';
                    c.textContent = '오늘의 천성인어 · ' + dateKo;
                    wrap.insertBefore(c, wrap.firstChild);
                  }
                  if (n > 1) {
                    const g = document.createElement('div');
                    g.className = 'pgn';
                    g.textContent = k + ' / ' + n;
                    wrap.appendChild(g);
                  }
                }""", [atoms, page_atoms, k, n, date_ko])
                out = out_dir / f"{stem}_{k}.jpg"
                pg.screenshot(path=str(out), type="jpeg", quality=88, full_page=False)  # JPEG: PNG보다 용량이 훨씬 작음
                outs.append(out)
            b.close()
    finally:
        tmp.unlink(missing_ok=True)
    return outs


if __name__ == "__main__":
    import json
    from datetime import date
    data = json.loads((HERE / "sample_data.json").read_text(encoding="utf-8"))
    dt = date.fromisoformat(data["date"])
    out = HERE.parent / "tenseijingo" / "cards" / f"{data['date']}.png"
    make(data, dt, 2, out)
    print("카드 생성:", out)
