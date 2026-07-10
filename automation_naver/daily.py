# -*- coding: utf-8 -*-
"""
daily.py — 天声人語 일일 학습 페이지 자동 생성 파이프라인

흐름: 크롤링(무료 서두) → AI 요약/단어장(JSON) → HTML 생성 → index 갱신

사용법:
  python automation/daily.py            # 전체 파이프라인 실행
  python automation/daily.py --sample   # 네트워크/AI 없이 샘플 데이터로 렌더링만 테스트

환경 변수:
  PROVIDER          "gemini"(기본) 또는 "claude"
  GEMINI_API_KEY    Gemini 사용 시 필수
  GEMINI_MODEL      기본값 "gemini-2.5-flash" (무료 티어)
  ANTHROPIC_API_KEY Claude 사용 시 필수
  CLAUDE_MODEL      기본값 "claude-haiku-4-5-20251001"
  ARTICLE_URL       (선택) 특정 기사 URL을 직접 지정해 테스트
"""
import json
import os
import re
import sys
import html
from datetime import date, datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))  # 한국 표준시
from pathlib import Path

# ──────────────────────────────────────────────────────────
# 경로 설정 (저장소 루트 기준)
# ──────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent          # automation/
ROOT = HERE.parent                              # 저장소 루트
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

INDEX_ITEM = """      <li>
        <a href="{fname}">
          <span class="d">第{no}回 · {date}</span>
          <span class="t-ja">{topic_ja}</span>
          <span class="t-ko">{topic_ko}</span>
        </a>
      </li>"""


def esc(s):
    return html.escape(str(s), quote=True)


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

    s = data["summary_ko"]
    tokens = {
        "{{DATE_ISO}}": today.isoformat(),
        "{{DATE_KO}}": date_ko,
        "{{ISSUE_NO}}": str(issue_no),
        "{{TOPIC_JA}}": esc(data["topic_ja"]),
        "{{TOPIC_KO}}": esc(data["topic_ko"]),
        "{{SUMMARY_1}}": esc(s[0]),
        "{{SUMMARY_2}}": esc(s[1]),
        "{{SUMMARY_3}}": esc(s[2]),
        "{{GRAMMAR_PATTERN}}": esc(data["grammar"]["pattern"]),
        "{{GRAMMAR_PATTERN_KO}}": esc(data["grammar"]["pattern_ko"]),
        "{{GRAMMAR_EXPLAIN}}": esc(data["grammar"]["explanation_ko"]),
        "{{GRAMMAR_EX_JA}}": esc(data["grammar"]["example_ja"]),
        "{{GRAMMAR_EX_KO}}": esc(data["grammar"]["example_ko"]),
        "{{TODAY_JA}}": esc(data["today_line"]["ja"]),
        "{{TODAY_KO}}": esc(data["today_line"]["ko"]),
        "{{KEY_QUOTE_JA}}": esc(data["key_quote"]["ja"]),
        "{{KEY_QUOTE_KO}}": esc(data["key_quote"]["ko"]),
        "{{COMMENT_1}}": esc(data["commentary_ko"][0]),
        "{{COMMENT_2}}": esc(data["commentary_ko"][1]),
        "{{ONE_LINE_KO}}": esc(data["one_line_ko"]),
        "{{SOURCE_URL}}": esc(source_url),
    }
    for k, v in tokens.items():
        tpl = tpl.replace(k, v)

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
            ex_ja=esc(v["example_ja"]), ex_ko=esc(v["example_ko"]),
        )
        for v in data["vocab"][:5]
    )
    return tpl.replace("<!--VOCAB_ITEMS-->", items), issue_no


# ══════════════════════════════════════════════════════════
# 4단계: 목록(index.html) 갱신
# ══════════════════════════════════════════════════════════
def update_index(entry):
    records = []
    if ARCHIVE.exists():
        records = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    records = [r for r in records if r["date"] != entry["date"]]  # 중복 방지
    records.append(entry)
    records.sort(key=lambda r: r["date"], reverse=True)
    ARCHIVE.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    items = "\n".join(
        INDEX_ITEM.format(
            fname=f"{r['date']}.html", no=r["no"], date=r["date"],
            topic_ja=esc(r["topic_ja"]), topic_ko=esc(r["topic_ko"]),
        )
        for r in records
    )
    idx_tpl = (HERE / "index_template.html").read_text(encoding="utf-8")
    idx = idx_tpl.replace("<!--INDEX_ITEMS-->", items)
    idx = idx.replace("{{COUNT}}", str(len(records)))
    (OUT_DIR / "index.html").write_text(idx, encoding="utf-8")


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
        data = parse_ai_json(call_ai(prompt))
        if not korean_fields_ok(data):
            print("      한국어 필드에 일본어 감지 — 한 번 더 생성합니다")
            data = parse_ai_json(call_ai(prompt + RETRY_NOTE))
            if not korean_fields_ok(data):
                raise RuntimeError(
                    "AI가 한국어 필드를 반복해서 일본어로 작성했습니다. "
                    "모델 변경(PROVIDER/모델명) 또는 프롬프트 점검이 필요합니다.")
        print(f"      완료: {data['topic_ja']} / {data['topic_ko']}")

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
                    f"{data['topic_ja']}\n{data['topic_ko']}\n\n"
                    f"{data['one_line_ko']}\n\n"
                    f"오늘의 학습 페이지 (요약·단어·문형·해설):\n{page_url}\n\n"
                    f"전체 목록: https://statepark62.github.io/tenseijingo_naver/"
                )
                naver.post_article(subject, content,
                                   image_path=card_path if card_ok else None)
                print("      카페 게시 완료")
        except Exception as e:
            print(f"      카페 게시 실패 (발행은 정상 완료됨): {e}")

    print("모든 작업 완료.")


if __name__ == "__main__":
    main()
