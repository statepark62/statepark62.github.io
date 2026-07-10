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
        "{{TOPIC_JA}}": esc(data["topic_ja"]),
        "{{TOPIC_KO}}": esc(data["topic_ko"]),
        "{{KEY_QUOTE_JA}}": esc(data["key_quote"]["ja"]),
        "{{KEY_QUOTE_KO}}": esc(data["key_quote"]["ko"]),
        "{{GRAMMAR_PATTERN}}": esc(data["grammar"]["pattern"]),
        "{{GRAMMAR_PATTERN_KO}}": esc(data["grammar"]["pattern_ko"]),
        "{{GRAMMAR_EXPLAIN}}": esc(data["grammar"]["explanation_ko"]),
        "{{GRAMMAR_EX_JA}}": esc(data["grammar"]["example_ja"]),
        "{{GRAMMAR_EX_KO}}": esc(data["grammar"]["example_ko"]),
        "{{TODAY_JA}}": esc(data["today_line"]["ja"]),
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


if __name__ == "__main__":
    import json
    from datetime import date
    data = json.loads((HERE / "sample_data.json").read_text(encoding="utf-8"))
    dt = date.fromisoformat(data["date"])
    out = HERE.parent / "tenseijingo" / "cards" / f"{data['date']}.png"
    make(data, dt, 2, out)
    print("카드 생성:", out)
