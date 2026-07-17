#!/usr/bin/env python3
"""
sync_words.py — 구글 시트(원본) → kotoba/words.json (PWA용) 동기화

시트를 유일한 원본(마스터)으로 삼아 매일 통째로 복사합니다.
자동 수집분(tj/news)은 물론, 시트에서 수동으로 추가·교정·삭제한 내용까지
다음 실행 때 PWA에 그대로 반영됩니다.

위치: automation_naver/sync_words.py
실행: 워크플로에서 daily.py 다음, 커밋 스텝 이전에 별도 스텝으로.
환경 변수: GAS_WORDS_URL (수집기 배포 URL), GAS_WORDS_TOKEN (SHARED_SECRET)
"""
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
WORDS_PATH = ROOT / "kotoba" / "words.json"

# words.json 맨 앞에 항상 포함되는 저작권 고지 (앱은 word 필드가 없는 항목을 무시함)
LICENSE_META = {
    "_license": "© 2026 Sangtae Park (박상태), Kongju National University. "
                "All rights reserved. 무단 복제·재배포 금지. "
                "Contact: cafe.naver.com/statepark62",
}


def main():
    url = os.environ.get("GAS_WORDS_URL")
    secret = os.environ.get("GAS_WORDS_TOKEN")
    if not url or not secret:
        print("GAS 설정(Secrets) 없음 — words.json 동기화 생략")
        return 0
    if not WORDS_PATH.parent.exists():
        print("kotoba 폴더 없음 — 동기화 생략 (PWA 미배포 상태)")
        return 0

    r = requests.get(url, params={"action": "export", "secret": secret},
                     timeout=60, allow_redirects=True)
    try:
        data = r.json()
    except ValueError:
        # JSON이 아닌 응답(대개 GAS의 HTML 오류 페이지) → 원인 진단용 출력
        head = r.text[:300].replace("\n", " ")
        print(f"JSON 아님 (HTTP {r.status_code}). 응답 앞부분: {head}", file=sys.stderr)
        print("→ 흔한 원인: 수집기에 v2(doGet) 미배포, 또는 URL이 다른 배포를 가리킴",
              file=sys.stderr)
        return 1

    if isinstance(data, dict) and not data.get("ok", True):
        print(f"내보내기 실패: {data.get('error')}", file=sys.stderr)
        return 1
    if not isinstance(data, list):
        print("예상치 못한 응답 형식", file=sys.stderr)
        return 1
    if len(data) < 10:
        # 시트가 비었거나 사고가 난 경우 기존 파일을 지우지 않도록 안전장치
        print(f"단어가 {len(data)}개뿐 — 이상 상황으로 판단, 기존 파일 유지", file=sys.stderr)
        return 1

    content = [LICENSE_META] + data   # 저작권 고지를 항상 선두에

    old = None
    if WORDS_PATH.exists():
        try:
            old = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            old = None

    if old == content:
        print(f"변경 없음 (총 {len(data)}개)")
        return 0

    WORDS_PATH.write_text(json.dumps(content, ensure_ascii=False, indent=1),
                          encoding="utf-8")
    n_old = len([w for w in old if isinstance(w, dict) and w.get("word")]) if isinstance(old, list) else None
    print(f"words.json 동기화 완료: 총 {len(data)}개"
          + (f" (이전 {n_old}개)" if n_old is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
