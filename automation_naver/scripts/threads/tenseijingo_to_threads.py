"""
tenseijingo_to_threads.py
--------------------------
天声人語 파이프라인(tenseijingo_naver)이 매일 발행하는 날짜별 HTML 파일
(예: 2026-08-22.html)을 직접 읽어서, 제목과 짧은 요약을 뽑아낸 뒤
Threads에 "요약 + 원문 링크" 형태로 게시합니다.

별도의 JSON 결과 파일이 없어도, HTML 파일 하나만 있으면 바로 사용 가능합니다.

사용 예:
    python tenseijingo_to_threads.py --html ../../2026-08-22.html \
        --base-url https://statepark62.github.io/tenseijingo_naver

    (--base-url을 생략하면 기본값으로 위 주소를 사용합니다)

제목/요약 추출 우선순위:
    제목: <title> 태그 → 없으면 첫 번째 <h1> 태그
    요약: <meta name="description"> → 없으면 본문 첫 문단(<p>) 텍스트

날짜(URL 파일명)는 --html로 넘긴 파일명에서 자동으로 가져옵니다.
"""

import argparse
import os
import re
import sys

from bs4 import BeautifulSoup

from threads_publish import publish_to_threads, ThreadsPublishError

# Threads 본문에 붙는 고정 안내 문구 (필요에 맞게 수정 가능)
HASHTAGS = "#天声人語 #일본어공부 #日本語勉強"

DEFAULT_BASE_URL = "https://statepark62.github.io/tenseijingo_naver"

# 요약으로 쓸 본문 발췌 최대 길이 (여기서 한 번 짧게 자르고,
# 이후 threads_publish.py의 500자 제한에서 최종적으로 다시 안전하게 잘림)
SUMMARY_MAX_CHARS = 150


def extract_title(soup: BeautifulSoup) -> str:
    """<title> 태그를 우선 사용하고, 없으면 첫 <h1>을 사용합니다."""
    if soup.title and soup.title.string:
        return soup.title.string.strip()

    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)

    return "오늘의 天声人語"


def extract_summary(soup: BeautifulSoup) -> str:
    """meta description을 우선 사용하고, 없으면 본문 첫 문단을 사용합니다."""
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        text = meta["content"].strip()
        if text:
            return _shorten(text)

    # 본문에서 텍스트가 충분히 있는 첫 <p> 태그를 찾습니다.
    for p in soup.find_all("p"):
        text = p.get_text(strip=True)
        if len(text) >= 20:  # 너무 짧은 문단(예: 날짜 표시)은 건너뜀
            return _shorten(text)

    return "오늘의 天声人語 칼럼을 확인해보세요."


def _shorten(text: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "…"


def extract_date_from_filename(html_path: str) -> str:
    """파일명(예: 2026-08-22.html)에서 날짜 부분만 추출합니다."""
    filename = os.path.basename(html_path)
    match = re.match(r"(\d{4}-\d{2}-\d{2})", filename)
    if match:
        return match.group(1)
    return os.path.splitext(filename)[0]


def build_teaser(title: str, summary: str) -> str:
    """제목 + 요약을 자연스러운 한 덩어리 텍스트로 구성합니다."""
    parts = []
    if title:
        parts.append(f"📰 {title}")
    if summary:
        parts.append(summary)
    parts.append(HASHTAGS)
    return "\n\n".join(parts)


def main():
    parser = argparse.ArgumentParser(
        description="天声人語 HTML 파일을 읽어 Threads에 요약 게시합니다."
    )
    parser.add_argument("--html", required=True, help="발행된 天声人語 HTML 파일 경로")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"GitHub Pages 기본 주소 (기본값: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제로 게시하지 않고, 생성될 텍스트만 확인합니다.",
    )
    args = parser.parse_args()

    if not os.path.exists(args.html):
        print(f"❌ 파일을 찾을 수 없습니다: {args.html}")
        sys.exit(1)

    with open(args.html, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    title = extract_title(soup)
    summary = extract_summary(soup)
    date_str = extract_date_from_filename(args.html)
    url = f"{args.base_url.rstrip('/')}/{date_str}.html"

    teaser_text = build_teaser(title, summary)

    print("----- Threads에 게시할 내용 -----")
    print(teaser_text)
    print(f"(첨부 링크: {url})")
    print("--------------------------------")

    if args.dry_run:
        print("(dry-run 모드: 실제 게시는 하지 않았습니다)")
        return

    try:
        result = publish_to_threads(teaser_text, url)
        print("✅ 게시 성공:", result)
    except ThreadsPublishError as e:
        print("❌ 게시 실패:", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
