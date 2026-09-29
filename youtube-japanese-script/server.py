"""YouTube Transcript API v1.2
- YouTube 도메인만 허용 (SSRF/남용 방지)
- 봇 차단 / 자막 없음 / 기타 오류를 구분
- 자막 출처(manual/auto) 표시, 자동자막 중복 제거 강화
- 네트워크 타임아웃 추가
"""
import glob, html, logging, os, re, tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger("transcript")

# 허용 출처: 환경변수 ALLOWED_ORIGINS(쉼표 구분)로 바꿀 수 있음
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "https://statepark62.github.io").split(",")
    if o.strip()
]
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
CLIENTS = ["android_vr", "web_embedded", "mweb"]

app = FastAPI(title="YouTube Transcript API v1.2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network(request: Request, call_next):
    # 공개 페이지(GitHub Pages)에서 localhost 서버를 호출할 때 Chrome이 요구하는 헤더
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


class NoSubtitle(Exception):
    """영상에 해당 언어 자막이 없음 (클라이언트를 바꿔도 소용없는 경우)."""


def validate_url(url: str):
    p = urlparse(url.strip())
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="YouTube 주소(youtube.com, youtu.be)만 사용할 수 있습니다.")


def clean_vtt(path, auto=False):
    raw = Path(path).read_text(encoding="utf-8", errors="ignore")
    lines = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or s == "WEBVTT" or "-->" in s:
            continue
        if s.startswith(("Kind:", "Language:", "NOTE", "STYLE", "REGION")) or re.fullmatch(r"\d+", s):
            continue
        s = html.unescape(re.sub(r"<[^>]+>", "", s))
        s = re.sub(r"\s+", " ", s).strip()
        if not s:
            continue
        if lines and s == lines[-1]:
            continue
        # 자동자막은 같은 줄이 스크롤되며 여러 큐에 반복되므로 최근 몇 줄과도 비교
        if auto and s in lines[-4:]:
            continue
        lines.append(s)
    return "\n".join(lines).strip()


def short_err(e: Exception) -> str:
    msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
    msg = msg.split(" See https://")[0].split(" Use --cookies")[0]
    return msg.strip()[:220]


def is_bot_block(msg: str) -> bool:
    m = msg.lower()
    return "sign in to confirm" in m or "not a bot" in m


def extract_once(url, lang, client):
    with tempfile.TemporaryDirectory() as td:
        opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [lang],
            "subtitlesformat": "vtt",
            "outtmpl": os.path.join(td, "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 20,
            "retries": 2,
            "extractor_args": {"youtube": {"player_client": [client]}},
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)

        manual = lang in (info.get("subtitles") or {})
        auto_avail = lang in (info.get("automatic_captions") or {})
        files = sorted(glob.glob(os.path.join(td, "*.vtt")))
        if not files:
            if not manual and not auto_avail:
                # 영상 정보를 정상적으로 받았는데 자막 목록에 해당 언어가 없음 → 확정
                raise NoSubtitle(f"이 영상에는 '{lang}' 자막이 없습니다.")
            raise RuntimeError(f"자막 파일이 내려오지 않았습니다 (client={client})")

        text = clean_vtt(files[0], auto=not manual)
        if not text:
            raise RuntimeError(f"자막 내용이 비어 있습니다 (client={client})")
        return {
            "title": info.get("title") or "",
            "channel": info.get("channel") or info.get("uploader") or "",
            "video_id": info.get("id") or "",
            "language": lang,
            "source": "manual" if manual else "auto",
            "count": len(text.splitlines()),
            "text": text,
            "client": client,
        }


@app.get("/")
def root():
    return {"ok": True, "service": "YouTube Transcript API", "version": "1.2"}


@app.get("/transcript")
def transcript(url: str = Query(..., min_length=8, max_length=300),
               lang: str = Query("ja", pattern=r"^[A-Za-z0-9._-]{1,20}$")):
    validate_url(url)
    errors, blocked = [], 0
    for client in CLIENTS:
        try:
            return extract_once(url, lang, client)
        except NoSubtitle as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            msg = short_err(e)
            log.warning("client=%s failed: %s", client, msg)
            if is_bot_block(msg):
                blocked += 1
            errors.append(f"{client}: {msg}")

    joined = " | ".join(errors)
    if blocked == len(CLIENTS):
        raise HTTPException(
            status_code=503,
            detail="YouTube가 이 서버의 IP를 봇으로 차단했습니다(모든 클라이언트). "
                   "공개 서버에 로그인 쿠키를 올리지 마세요. 로컬 PC에서 실행해 보세요. " + joined,
        )
    raise HTTPException(status_code=500, detail=joined)
