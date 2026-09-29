import glob, html, os, re, tempfile
from pathlib import Path
import yt_dlp
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="YouTube Transcript API v1.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://statepark62.github.io"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

def clean_vtt(path):
    raw = Path(path).read_text(encoding="utf-8", errors="ignore")
    lines, last = [], None
    for line in raw.splitlines():
        s = line.strip()
        if not s or s == "WEBVTT" or "-->" in s:
            continue
        if s.startswith(("Kind:", "Language:", "NOTE", "STYLE", "REGION")) or re.fullmatch(r"\d+", s):
            continue
        s = html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
        if s and s != last:
            lines.append(s)
            last = s
    return "\n".join(lines).strip()

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
            "extractor_args": {"youtube": {"player_client": [client]}},
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        files = glob.glob(os.path.join(td, "*.vtt"))
        if not files:
            raise RuntimeError(f"No {lang} subtitle file returned with client={client}")
        text = clean_vtt(files[0])
        if not text:
            raise RuntimeError(f"Empty subtitle with client={client}")
        return {
            "title": info.get("title") or "",
            "channel": info.get("channel") or info.get("uploader") or "",
            "video_id": info.get("id") or "",
            "language": lang,
            "count": len(text.splitlines()),
            "text": text,
            "client": client,
        }

@app.get("/")
def root():
    return {"ok": True, "service": "YouTube Transcript API", "version": "1.1"}

@app.get("/transcript")
def transcript(url: str = Query(..., min_length=8),
               lang: str = Query("ja", pattern=r"^[A-Za-z0-9._-]+$")):
    errors = []
    for client in ["android_vr", "web_embedded", "mweb"]:
        try:
            return extract_once(url, lang, client)
        except Exception as e:
            errors.append(f"{client}: {e}")
    joined = " | ".join(errors)
    if "Sign in to confirm" in joined or "not a bot" in joined.lower():
        raise HTTPException(status_code=503, detail=
            "YouTube rejected the Render server IP with its bot check. "
            "Do not upload Google/YouTube login cookies to this public server. " + joined)
    raise HTTPException(status_code=500, detail=joined)
