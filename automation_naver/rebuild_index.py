# -*- coding: utf-8 -*-
"""
rebuild_index.py — archive.json에 있는 기존 기록만으로 index.html을 강제로 다시 생성.

daily.py의 main()은 "오늘자 파일이 이미 있으면 즉시 종료"하기 때문에,
템플릿(index_template.html)이나 달력 생성 로직만 바꾼 날에는
실제 크롤링·AI 호출 없이는 index.html이 절대 다시 만들어지지 않는다.
이 스크립트는 그 부분만 따로 떼어내어, archive.json에 이미 쌓인 데이터로
update_index()의 마지막 레코드를 다시 "터치"해서 index.html만 재생성한다.

사용법:
  cd automation_naver
  python rebuild_index.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daily  # noqa: E402


def main():
    if not daily.ARCHIVE.exists():
        print(f"archive.json이 없습니다: {daily.ARCHIVE}")
        return

    records = json.loads(daily.ARCHIVE.read_text(encoding="utf-8"))
    if not records:
        print("archive.json에 기록이 없습니다.")
        return

    records.sort(key=lambda r: r["date"], reverse=True)
    latest = records[0]

    # update_index()는 "새 entry 하나"를 받아 기존 archive와 합친 뒤
    # index.html을 다시 쓰는 함수라서, 최신 레코드를 그대로 다시 넣어주면
    # archive.json 내용은 그대로 유지된 채 index.html만 최신 템플릿으로 재생성된다.
    daily.update_index(latest)
    print(f"완료: index.html을 archive.json의 {len(records)}개 기록으로 재생성했습니다.")


if __name__ == "__main__":
    main()
