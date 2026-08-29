# -*- coding: utf-8 -*-
"""
daily.py — 天声人語 일일 학습 페이지 자동 생성 파이프라인

흐름: 크롤링(무료 서두) → AI 요약/단어장(JSON) → HTML 생성 → index 갱신

사용법:
  python automation/daily.py            # 전체 파이프라인 실행
  python automation/daily.py --sample   # 네트워크/AI 없이 샘플 데이터로 렌더링만 테스트

환경 변수 (yml의 env에서 지정):
  PROVIDER          "gemini" / "claude" / "openai" 중 선택 (미지정 시 gemini)
  OPENAI_API_KEY    ChatGPT 사용 시 필수 / OPENAI_MODEL 기본값 "gpt-5-mini"
  GEMINI_API_KEY    Gemini 사용 시 필수 / GEMINI_MODEL 기본값 "gemini-2.5-flash"
  ANTHROPIC_API_KEY Claude 사용 시 필수 / CLAUDE_MODEL 기본값 "claude-haiku-4-5-20251001"
  NAVER_*           네이버 카페 게시용 5종 (naver.py 참고)
  GAS_WORDS_URL     ことば帖 단어장 전송용 GAS 배포 주소 (선택)
  GAS_WORDS_TOKEN   ことば帖 전송 토큰 (선택)
  ARTICLE_URL       (선택) 특정 기사 URL을 직접 지정해 테스트
"""
import json
import os
import re
import sys
import html
import calendar
from datetime import date, datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))  # 한국 표준시
from pathlib import Path

# ──────────────────────────────────────────────────────────
# 경로 설정 (저장소 루트 기준)
# ──────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent          # automation/
ROOT = HERE.parent                              # 저장소 루트
WEEKDAY_HEADER_KO = ["일", "월", "화", "수", "목", "금", "토"]  # 달력 요일 헤더

OUT_DIR = ROOT / "tenseijingo_naver"   # 테스트용 출력 폴더                  # 공개 페이지 폴더
ARCHIVE = OUT_DIR / "archive.json"              # 목록 생성용 누적 데이터
START_DATE = date(2026, 7, 8)                   # 第1回 날짜 (회차 계산 기준)

# ──────────────────────────────────────────────────────────
# 크롤링 설정 — ※ 최초 1회, 실제 페이지에서 선택자 확인 필요
# 사이트 구조가 바뀌면 이 블록만 수정하면 됩니다.
# ──────────────────────────────────────────────────────────
LIST_URL = "https://www.asahi.com/rensai/list.html?id=61"   # 天声人語 연재 목록
LINK_SELECTOR_CANDIDATES = [
    'a[href*="/articles/"]',        # 목록에서 기사 링크
]
BODY_SELECTOR_CANDIDATES = [
    "div.nlkStyleArticleBody p",    # 후보 1
    "main article p",               # 후보 2
    "main p",                       # 후보 3 (가장 느슨한 fallback)
]
MAX_CHARS = 600      # 무료 공개분만 사용 (저작권 안전을 위해 상한)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}

WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

VOCAB_ITEM = """        <div class="vocab-item">
          <div class="vocab-word"><ruby>{word}<rt>{reading}</rt></ruby></div>
          <div class="vocab-body">
            <span class="mean">{meaning}</span><span class="level">{level}</span>
            <p class="ex"><span class="ja">{ex_ja}</span><br>{ex_ko}</p>
          </div>
        </div>"""


def esc(s):
    return html.escape(str(s), quote=True)


def esc_ruby(s):
    """일반 HTML은 이스케이프하되, AI가 삽입한 <ruby><rt> 후리가나 태그만
    복원한다. AI 응답에 다른 태그나 스크립트가 섞여도 안전하게 무력화된다.
    태그 짝이 맞지 않으면(AI 실수 등) 페이지 전체가 깨지지 않도록
    ruby 태그를 걷어내고 일반 텍스트로 안전하게 되돌린다."""
    out = html.escape(str(s), quote=True)
    for tag in ("ruby", "/ruby", "rt", "/rt"):
        out = out.replace(f"&lt;{tag}&gt;", f"<{tag}>")
    if (out.count("<ruby>") != out.count("</ruby>")
            or out.count("<rt>") != out.count("</rt>")
            or out.count("<ruby>") != out.count("<rt>")):
        # 짝이 안 맞으면 ruby/rt 태그를 전부 걷어내 순수 텍스트로 되돌린다
        # (내용은 남기고 태그만 제거 — 페이지가 깨지지 않도록 안전 우선).
        for tag in ("<ruby>", "</ruby>", "<rt>", "</rt>"):
            out = out.replace(tag, "")
    return out


def strip_ruby(s):
    """HTML이 아닌 순수 텍스트 컨텍스트(네이버 카페 본문, 콘솔 로그 등)용.
    <ruby>漢字<rt>よみ</rt></ruby> → 漢字 만 남기고 읽기·태그를 모두 제거한다."""
    out = re.sub(r"<rt>.*?</rt>", "", str(s))
    out = re.sub(r"</?ruby>", "", out)
    return out


# ══════════════════════════════════════════════════════════
# 1단계: 크롤링
# ══════════════════════════════════════════════════════════
def fetch_article():
    import requests
    from bs4 import BeautifulSoup

    article_url = os.environ.get("ARTICLE_URL")
    if not article_url:
        r = requests.get(LIST_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        link = None
        for sel in LINK_SELECTOR_CANDIDATES:
            found = soup.select_one(sel)
            if found and found.get("href"):
                link = found["href"]
                break
        if not link:
            raise RuntimeError(
                "목록 페이지에서 기사 링크를 찾지 못했습니다. "
                "브라우저 F12로 구조를 확인해 LINK_SELECTOR_CANDIDATES를 수정하세요."
            )
        article_url = link if link.startswith("http") else "https://www.asahi.com" + link

    r = requests.get(article_url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    text = ""
    for sel in BODY_SELECTOR_CANDIDATES:
        paras = [p.get_text(strip=True) for p in soup.select(sel)]
        paras = [p for p in paras if len(p) > 20]      # 잡음 제거
        if paras:
            text = "\n".join(paras)
            break
    if not text:
        raise RuntimeError(
            "본문을 추출하지 못했습니다. "
            "브라우저 F12로 구조를 확인해 BODY_SELECTOR_CANDIDATES를 수정하세요."
        )

    # 칼럼 제목도 추출해 앞에 붙임 (prompt가 제목을 topic_ja로 활용)
    title_tag = soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else ""
    if title:
        text = f"제목: {title}\n{text}"

    return text[:MAX_CHARS], article_url


# ══════════════════════════════════════════════════════════
# 2단계: AI 호출 (Gemini 또는 Claude)
# ══════════════════════════════════════════════════════════
def call_ai(prompt_text):
    import requests

    provider = os.environ.get("PROVIDER", "gemini").lower()

    if provider == "openai":
        key = os.environ["OPENAI_API_KEY"]
        model = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt_text}],
            },
            timeout=120,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    if provider == "claude":
        key = os.environ["ANTHROPIC_API_KEY"]
        model = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt_text}],
            },
            timeout=90,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    # 기본: Gemini (무료 티어)
    # 신형(AQ.)·구형(AIza) 키 모두 호환되는 x-goog-api-key 헤더 인증 사용
    key = os.environ["GEMINI_API_KEY"].strip()
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": key, "content-type": "application/json"},
        json={"contents": [{"parts": [{"text": prompt_text}]}]},
        timeout=90,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def korean_fields_ok(data):
    """한국어여야 하는 필드에 일본어(가나)가 과도하게 섞였는지 검사"""
    import re as _re
    kana = _re.compile(r"[\u3040-\u30FF]")
    fields = (list(data.get("summary_ko", [])) + list(data.get("commentary_ko", []))
              + list(data.get("background_ko", [])) + list(data.get("writing_points_ko", []))
              + [data.get("one_line_ko", "")])
    text = " ".join(str(f) for f in fields)
    if not text.strip():
        return False
    return len(kana.findall(text)) < max(1, int(len(text) * 0.05))


RETRY_NOTE = (
    "\n\n## 경고\n직전 응답에서 한국어 필드(summary_ko, commentary_ko, "
    "background_ko, writing_points_ko, one_line_ko)가 일본어로 작성되는 오류가 "
    "있었습니다. 이번에는 해당 필드를 반드시 전부 한국어 문장으로 작성하세요.")


def parse_ai_json(raw):
    """AI 응답에서 JSON만 안전하게 추출 (코드펜스·잡말 대응)"""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("AI 응답에 JSON이 없습니다:\n" + raw[:300])
    data = json.loads(raw[start:end + 1])

    # 스키마 검증
    assert len(data["summary_ko"]) == 3, "summary_ko는 3문장이어야 합니다"
    assert len(data.get("summary_ja", [])) == 3, "summary_ja는 3문장이어야 합니다"
    assert len(data["vocab"]) >= 5, "vocab는 5개 이상이어야 합니다"
    assert len(data.get("commentary_ko", [])) >= 2, "commentary_ko는 2문단이어야 합니다"
    for k in ("key_quote", "one_line_ko", "background_ko",
              "writing_points_ko", "publish_memo_ko"):
        assert k in data, f"필수 키 누락: {k}"
    for k in ("topic_ja", "topic_ko", "grammar", "today_line"):
        assert k in data, f"필수 키 누락: {k}"
    return data


# ══════════════════════════════════════════════════════════
# 3단계: HTML 렌더링
# ══════════════════════════════════════════════════════════
def render_page(data, today, source_url, has_card=False):
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    issue_no = (today - START_DATE).days + 1
    date_ko = f"{today.year}년 {today.month}월 {today.day}일 ({WEEKDAY_KO[today.weekday()]})"

    card_nav = (f'<a href="cards/{today.isoformat()}.png" download>학습 카드(PNG)</a>'
                if has_card else "")
    tpl = tpl.replace("{{CARD_NAV}}", card_nav)

    tokens = {
        "{{DATE_ISO}}": today.isoformat(),
        "{{DATE_KO}}": date_ko,
        "{{ISSUE_NO}}": str(issue_no),
        "{{TOPIC_JA}}": esc_ruby(data["topic_ja"]),
        "{{TOPIC_KO}}": esc(data["topic_ko"]),

        "{{GRAMMAR_PATTERN}}": esc_ruby(data["grammar"]["pattern"]),
        "{{GRAMMAR_PATTERN_KO}}": esc(data["grammar"]["pattern_ko"]),
        "{{GRAMMAR_EXPLAIN}}": esc(data["grammar"]["explanation_ko"]),
        "{{GRAMMAR_EX_JA}}": esc_ruby(data["grammar"]["example_ja"]),
        "{{GRAMMAR_EX_KO}}": esc(data["grammar"]["example_ko"]),
        "{{TODAY_JA}}": esc_ruby(data["today_line"]["ja"]),
        "{{TODAY_KO}}": esc(data["today_line"]["ko"]),
        "{{KEY_QUOTE_JA}}": esc_ruby(data["key_quote"]["ja"]),
        "{{KEY_QUOTE_KO}}": esc(data["key_quote"]["ko"]),
        "{{COMMENT_1}}": esc(data["commentary_ko"][0]),
        "{{COMMENT_2}}": esc(data["commentary_ko"][1]),
        "{{ONE_LINE_KO}}": esc(data["one_line_ko"]),
        "{{SOURCE_URL}}": esc(source_url),
    }
    for k, v in tokens.items():
        tpl = tpl.replace(k, v)

    s_ja = data.get("summary_ja", [""] * 3)
    s_ko = data["summary_ko"]
    tpl = tpl.replace("<!--SUMMARY_ITEMS-->", "\n".join(
        f'      <div class="s-item"><p class="ja">{esc_ruby(j)}</p><p class="ko">{esc(k)}</p></div>'
        for j, k in zip(s_ja, s_ko)))

    tpl = tpl.replace("<!--BG_PARAS-->", "\n".join(
        f"        <p>{esc(p)}</p>" for p in data["background_ko"]))

    marks = ["一", "二", "三", "四", "五"]
    tpl = tpl.replace("<!--WP_ITEMS-->", "\n".join(
        f'        <p><span class="n">{marks[i]}</span>{esc(p)}</p>'
        for i, p in enumerate(data["writing_points_ko"][:5])))

    items = "\n".join(
        VOCAB_ITEM.format(
            word=esc(v["word"]), reading=esc(v["reading"]),
            meaning=esc(v["meaning_ko"]), level=esc(v.get("level", "-")),
            ex_ja=esc_ruby(v["example_ja"]), ex_ko=esc(v["example_ko"]),
        )
        for v in data["vocab"][:5]
    )
    return tpl.replace("<!--VOCAB_ITEMS-->", items), issue_no


# ══════════════════════════════════════════════════════════
# 4단계: 목록(index.html) 갱신
# ══════════════════════════════════════════════════════════
def build_calendar_html(records):
    """월별 달력 HTML 생성. 날짜 아래에 있으면 그 날의 한국어 제목을 표시."""
    by_date = {r["date"]: r for r in records}
    months = sorted({r["date"][:7] for r in records}, reverse=True)  # "YYYY-MM", 최신순
    blocks = []
    for ym in months:
        year, month = int(ym[:4]), int(ym[5:7])
        first_dow = (date(year, month, 1).weekday() + 1) % 7  # 일요일=0 기준
        days_in_month = calendar.monthrange(year, month)[1]

        cells = ['<div class="day pad"></div>' for _ in range(first_dow)]
        for d in range(1, days_in_month + 1):
            iso = f"{year:04d}-{month:02d}-{d:02d}"
            r = by_date.get(iso)
            if r:
                cells.append(
                    f'<a class="day has" href="{iso}.html">'
                    f'<span class="num">{d}</span>'
                    f'<span class="ttl-ja">{esc_ruby(r["topic_ja"])}</span>'
                    f'<span class="ttl-ko">{esc(r["topic_ko"])}</span>'
                    f'</a>'
                )
            else:
                cells.append(f'<div class="day"><span class="num">{d}</span></div>')
        rem = (first_dow + days_in_month) % 7
        if rem:
            cells.extend('<div class="day pad"></div>' for _ in range(7 - rem))

        weekdays = "".join(f'<span class="wd">{w}</span>' for w in WEEKDAY_HEADER_KO)
        blocks.append(
            f'    <section class="cal-month">\n'
            f'      <h2>{year}년 {month}월</h2>\n'
            f'      <div class="cal-weekdays">{weekdays}</div>\n'
            f'      <div class="cal-grid">{"".join(cells)}</div>\n'
            f'    </section>'
        )
    return "\n".join(blocks)


def update_index(entry):
    records = []
    if ARCHIVE.exists():
        records = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    records = [r for r in records if r["date"] != entry["date"]]  # 중복 방지
    records.append(entry)
    records.sort(key=lambda r: r["date"], reverse=True)
    ARCHIVE.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    idx_tpl = (HERE / "index_template.html").read_text(encoding="utf-8")
    idx = idx_tpl.replace("<!--CALENDAR-->", build_calendar_html(records))
    idx = idx.replace("{{COUNT}}", str(len(records)))
    (OUT_DIR / "index.html").write_text(idx, encoding="utf-8")
    print("  [1/1] index.html 생성 (달력형)")


# ══════════════════════════════════════════════════════════
# 추가: 오늘의 단어를 ことば帖 단어장(Google Sheets)으로 전송
# ══════════════════════════════════════════════════════════
def send_words_to_gas(data):
    """기존 범용 수집기 GAS의 'id 자동채번 모드'로 오늘의 단어 전송"""
    import requests
    url = os.environ.get("GAS_WORDS_URL")
    token = os.environ.get("GAS_WORDS_TOKEN")
    if not url or not token:
        print("      GAS 설정(Secrets) 없음 — 단어장 전송 생략")
        return
    rows = [[
        v.get("word", ""),
        v.get("reading", ""),
        v.get("meaning_ko", ""),
        v.get("level", "N3"),
        strip_ruby(v.get("example_ja", "")),
        v.get("example_reading", ""),
        v.get("example_ko", ""),
    ] for v in data.get("vocab", [])[:5]]
    r = requests.post(url, json={
        "secret": token,
        "sheet": "단어장",
        "dedupIndex": 0,      # 단어(첫 칸) 기준 중복 제거
        "idPrefix": "tj",     # 천성인어 출신 단어는 tj1, tj2... 로 채번
        "rows": rows,
    }, timeout=60)
    res = r.json()
    if res.get("ok"):
        added = res.get("added", 0)
        print(f"      단어장 전송 완료: 추가 {added}개, 건너뜀 {len(rows) - added}개")
    else:
        print(f"      단어장 전송 실패: {res.get('error')}")


# ══════════════════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════════════════
def main():
    OUT_DIR.mkdir(exist_ok=True)
    sample_mode = "--sample" in sys.argv

    if sample_mode:
        data = json.loads((HERE / "sample_data.json").read_text(encoding="utf-8"))
        today = date.fromisoformat(data.get("date", date.today().isoformat()))
        source_url = data.get("source_url", LIST_URL)
        print("[샘플 모드] 네트워크/AI 없이 렌더링만 테스트합니다.")
    else:
        today = datetime.now(KST).date()  # 한국 시간 기준 오늘 날짜
        out_file = OUT_DIR / f"{today.isoformat()}.html"
        if out_file.exists():
            print(f"오늘자 파일이 이미 있습니다: {out_file} — 종료")
            return

        print("[1/4] 천성인어 무료 서두 수집 중...")
        article_text, source_url = fetch_article()

        # 휴간일 감지: 이 기사 주소로 이미 발행한 적이 있으면 새 칼럼이 없는 날
        if ARCHIVE.exists():
            records = json.loads(ARCHIVE.read_text(encoding="utf-8"))
            if any(r.get("url") == source_url for r in records):
                print("이미 발행한 칼럼입니다 (휴간일로 추정) — 오늘은 건너뜁니다.")
                return
        print(f"      수집 완료 ({len(article_text)}자) ← {source_url}")

        print("[2/4] AI 요약·단어장 생성 중...")
        prompt = (HERE / "prompt.txt").read_text(encoding="utf-8")
        prompt = prompt.replace("{{ARTICLE_TEXT}}", article_text)

        # 최근 7회의 문형을 프롬프트에 주입해 중복 회피
        recent = "(없음)"
        if ARCHIVE.exists():
            recs = json.loads(ARCHIVE.read_text(encoding="utf-8"))
            pats = [r["pattern"] for r in recs[:7] if r.get("pattern")]
            if pats:
                recent = ", ".join(pats)
        prompt = prompt.replace("{{RECENT_PATTERNS}}", recent)
        data = parse_ai_json(call_ai(prompt))
        for attempt in (1, 2):
            if korean_fields_ok(data):
                break
            print(f"      한국어 필드에 일본어 감지 — 재생성 {attempt}회차")
            data = parse_ai_json(call_ai(prompt + RETRY_NOTE))
        if not korean_fields_ok(data):
            raise RuntimeError(
                "AI가 한국어 필드를 반복해서 일본어로 작성했습니다. "
                "모델 변경(PROVIDER/모델명) 또는 프롬프트 점검이 필요합니다.")
        print(f"      완료: {strip_ruby(data['topic_ja'])} / {data['topic_ko']}")

    print("[3/6] 학습 카드 이미지 생성 중...")
    issue_no_pre = (today - START_DATE).days + 1
    card_path = OUT_DIR / "cards" / f"{today.isoformat()}.png"
    card_ok = False
    try:
        import make_card
        make_card.make(data, today, issue_no_pre, card_path)
        card_ok = True
        print(f"      생성: {card_path}")
    except Exception as e:
        print(f"      카드 생성 실패 (발행은 계속 진행): {e}")

    print("[4/6] HTML 페이지 생성 중...")
    page, issue_no = render_page(data, today, source_url, has_card=card_ok)
    out_file = OUT_DIR / f"{today.isoformat()}.html"
    out_file.write_text(page, encoding="utf-8")
    print(f"      생성: {out_file}")

    print("[5/6] 목록 페이지 갱신 중...")
    update_index({
        "date": today.isoformat(), "no": issue_no,
        "topic_ja": data["topic_ja"], "topic_ko": data["topic_ko"],
        "url": source_url,
        "memo": data.get("publish_memo_ko", ""),   # 출판 메모 (페이지에는 비공개, 기록만 축적)
        "pattern": data["grammar"]["pattern"],      # 문형 기록 (다음 날 중복 회피용)
    })

    print("[6/6] 네이버 카페 게시 중...")
    if sample_mode:
        print("      샘플 모드 — 카페 게시 생략")
    else:
        try:
            import naver
            if not naver.env_ready():
                print("      네이버 설정(Secrets) 없음 — 카페 게시 생략")
            else:
                page_url = f"https://statepark62.github.io/tenseijingo_naver/{today.isoformat()}.html"
                subject = f"천성인어 {today.year}년 {today.month}월 {today.day}일자"
                content = (
                    f"{strip_ruby(data['topic_ja'])}\n{data['topic_ko']}\n\n"
                    f"{data['one_line_ko']}\n\n"
                    f"오늘의 학습 페이지 (요약·단어·문형·해설):\n{page_url}\n\n"
                    f"전체 목록: https://statepark62.github.io/tenseijingo_naver/"
                )
                naver.post_article(subject, content,
                                   image_path=card_path if card_ok else None)
                print("      카페 게시 완료")
        except Exception as e:
            print(f"      카페 게시 실패 (발행은 정상 완료됨): {e}")

    print("[추가] ことば帖 단어장 전송 중...")
    if sample_mode:
        print("      샘플 모드 — 전송 생략")
    else:
        try:
            send_words_to_gas(data)
        except Exception as e:
            print(f"      단어장 전송 실패 (발행은 정상 완료됨): {e}")

    print("모든 작업 완료.")


if __name__ == "__main__":
    main()
