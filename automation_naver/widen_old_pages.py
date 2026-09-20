# -*- coding: utf-8 -*-
"""
widen_old_pages.py — 이미 발행된 날짜별 상세 페이지(YYYY-MM-DD.html)들의
본문 폭 CSS만 옛 값(980px)에서 새 값(1180px)으로 바꿔치기한다.

배경: archive.json에는 목록(달력) 표시용 요약 필드(topic_ja, topic_ko 등)만
저장돼 있고, 단어장·문형·해설 같은 상세 페이지 전체 내용은 들어있지 않다.
따라서 데이터로 페이지를 "다시 생성"하는 건 위험하다 — 대신 이미 만들어진
HTML 파일 안에 박혀 있는 CSS 한 블록만 문자열 치환으로 고쳐서, 내용은
전혀 건드리지 않고 폭만 넓힌다.

daily.py가 매일 새로 만드는 페이지는 이미 새 template.html(1180px)을
쓰므로 이 스크립트를 다시 돌려도 그런 파일은 그냥 건너뛴다(멱등적).

사용법:
  cd automation_naver
  python widen_old_pages.py            # tenseijingo_naver/ 안의 모든 날짜 페이지 처리
  python widen_old_pages.py --dry-run  # 실제로 고치지 않고 대상만 출력
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_DIR = ROOT / "tenseijingo_naver"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.html$")

OLD_BLOCK = (
    "  .frame{\n"
    "    max-width:980px;margin:0 auto;padding:48px 24px 64px;\n"
    "    display:grid;grid-template-columns:96px 1fr;gap:36px;\n"
    "  }"
)
NEW_BLOCK = (
    "  .frame{\n"
    "    max-width:1180px;margin:0 auto;padding:48px 24px 64px;\n"
    "    display:grid;grid-template-columns:96px 1fr;gap:36px;\n"
    "  }"
)


def main():
    dry_run = "--dry-run" in sys.argv

    if not OUT_DIR.exists():
        print(f"출력 폴더가 없습니다: {OUT_DIR}")
        return

    targets = sorted(p for p in OUT_DIR.glob("*.html") if DATE_RE.match(p.name))
    if not targets:
        print("대상이 될 날짜별 페이지(YYYY-MM-DD.html)를 찾지 못했습니다.")
        return

    widened, already_wide, unmatched = [], [], []

    for path in targets:
        text = path.read_text(encoding="utf-8")
        if OLD_BLOCK in text:
            if not dry_run:
                path.write_text(text.replace(OLD_BLOCK, NEW_BLOCK), encoding="utf-8")
            widened.append(path.name)
        elif NEW_BLOCK in text:
            already_wide.append(path.name)
        else:
            unmatched.append(path.name)

    verb = "대상 확인됨(dry-run, 실제 수정 없음)" if dry_run else "폭 넓힘 완료"
    print(f"[{verb}] {len(widened)}개: {', '.join(widened) if widened else '(없음)'}")
    print(f"[이미 넓음, 건너뜀] {len(already_wide)}개")
    if unmatched:
        print(f"[형식이 달라 건너뜀 — 수동 확인 필요] {len(unmatched)}개: {', '.join(unmatched)}")


if __name__ == "__main__":
    main()
