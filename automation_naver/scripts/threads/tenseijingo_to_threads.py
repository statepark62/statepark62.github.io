"""
tenseijingo_to_threads.py
--------------------------
天声人語 파이프라인(tenseijingo_naver)의 결과물을 받아서
Threads에 올릴 짧은 "요약 + 링크" 형태로 가공한 뒤 게시합니다.

天声人語 전문은 Threads 500자 제한을 훌쩍 넘기므로,
전문을 올리는 게 아니라 훅(hook) 한두 문장 + 학습 링크만 올립니다.

입력 방식 (둘 중 하나를 사용):
  1) JSON 파일로 전달 (기존 파이프라인이 이미 만드는 결과 파일 활용)
     예: python tenseijingo_to_threads.py --json today_result.json

     JSON 파일 형식 예시:
     {
       "title": "오늘의 天声人語 제목",
       "summary": "AI가 생성한 한두 문장 요약 (한국어)",
       "url": "https://statepark62.github.io/.../today.html"
     }

  2) 커맨드라인 인자로 직접 전달
     예: python tenseijingo_to_threads.py \\
             --title "오늘의 天声人語" \\
             --summary "오늘 칼럼은 ~에 대한 이야기입니다." \\
             --url "https://statepark62.github.io/.../today.html"

* 실제 파이프라인에 연결할 때는, 기존 天声人語 스크립트가 결과를
  JSON으로 저장하는 부분 뒤에 이 스크립트 호출 한 줄만 추가하면 됩니다.
"""

import argparse
import json
import sys

from threads_publish import publish_to_threads, ThreadsPublishError

# Threads 본문에 붙는 고정 안내 문구 (해시태그 등, 필요에 맞게 수정 가능)
HASHTAGS = "#天声人語 #일본어공부 #日本語勉強"


def build_teaser(title: str, summary: str) -> str:
    """
    제목 + 요약을 자연스러운 한 덩어리 텍스트로 구성합니다.
    """
    parts = []
    if title:
        parts.append(f"📰 {title}")
    if summary:
        parts.append(summary)
    parts.append(HASHTAGS)
    return "\n\n".join(parts)


def load_from_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for key in ("title", "summary", "url"):
        if key not in data:
            raise ValueError(f"JSON 파일에 '{key}' 필드가 없습니다: {path}")
    return data


def main():
    parser = argparse.ArgumentParser(description="天声人語 결과를 Threads에 게시합니다.")
    parser.add_argument("--json", help="파이프라인이 생성한 결과 JSON 파일 경로")
    parser.add_argument("--title", help="게시물 제목")
    parser.add_argument("--summary", help="한두 문장 요약")
    parser.add_argument("--url", help="원문/카드뉴스 링크")
    args = parser.parse_args()

    if args.json:
        data = load_from_json(args.json)
    elif args.title and args.summary and args.url:
        data = {"title": args.title, "summary": args.summary, "url": args.url}
    else:
        parser.error("--json 옵션 또는 --title/--summary/--url 세 가지를 모두 지정해야 합니다.")
        return

    teaser_text = build_teaser(data["title"], data["summary"])

    print("----- Threads에 게시할 내용 -----")
    print(teaser_text)
    print(f"(첨부 링크: {data['url']})")
    print("--------------------------------")

    try:
        result = publish_to_threads(teaser_text, data["url"])
        print("✅ 게시 성공:", result)
    except ThreadsPublishError as e:
        print("❌ 게시 실패:", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
