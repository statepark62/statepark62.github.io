# -*- coding: utf-8 -*-
"""
naver.py — 네이버 카페 자동 게시 모듈
필요 환경 변수:
  NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REFRESH_TOKEN,
  NAVER_CAFE_CLUB_ID, NAVER_CAFE_MENU_ID
"""
import os
import requests
from urllib.parse import quote

TOKEN_URL = "https://nid.naver.com/oauth2.0/token"


def env_ready():
    keys = ("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "NAVER_REFRESH_TOKEN",
            "NAVER_CAFE_CLUB_ID", "NAVER_CAFE_MENU_ID")
    return all(os.environ.get(k) for k in keys)


def get_access_token():
    """refresh token으로 1시간짜리 access token 발급"""
    r = requests.get(TOKEN_URL, params={
        "grant_type": "refresh_token",
        "client_id": os.environ["NAVER_CLIENT_ID"],
        "client_secret": os.environ["NAVER_CLIENT_SECRET"],
        "refresh_token": os.environ["NAVER_REFRESH_TOKEN"],
    }, timeout=20)
    r.raise_for_status()
    j = r.json()
    if "access_token" not in j:
        raise RuntimeError(f"토큰 갱신 실패: {j}")
    return j["access_token"]


def post_article(subject, content, image_path=None):
    """카페 글쓰기. 성공 시 게시글 응답(dict) 반환."""
    token = get_access_token()
    club = os.environ["NAVER_CAFE_CLUB_ID"]
    menu = os.environ["NAVER_CAFE_MENU_ID"]
    url = f"https://openapi.naver.com/v1/cafe/{club}/menu/{menu}/articles"

    # 네이버 명세: subject/content는 UTF-8 퍼센트 인코딩 문자열로 전송
    data = {
        "subject": quote(subject, safe=""),
        "content": quote(content, safe=""),
    }
    files = {}
    fh = None
    try:
        if image_path:
            fh = open(image_path, "rb")
            files["image"] = (os.path.basename(str(image_path)), fh, "image/png")
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {token}"},
            data=data,
            files=files if files else None,
            timeout=60,
        )
    finally:
        if fh:
            fh.close()

    if r.status_code != 200:
        raise RuntimeError(f"카페 게시 실패 (HTTP {r.status_code}): {r.text[:300]}")
    return r.json()


if __name__ == "__main__":
    # 로컬 단독 테스트용
    if not env_ready():
        print("환경 변수가 설정되지 않았습니다.")
    else:
        res = post_article("[테스트] 자동 게시 확인", "자동화 테스트 글입니다.")
        print("게시 성공:", res)
