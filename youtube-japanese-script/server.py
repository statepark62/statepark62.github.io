from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from yt_dlp import YoutubeDL
from pathlib import Path
import tempfile, re, html

app = FastAPI(title="YouTube Transcript API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

def clean_vtt(raw: str) -> str:
    lines=[]
    seen=set()
    for line in raw.splitlines():
        s=line.strip()
        if not s or s.startswith(("WEBVTT","Kind:","Language:","NOTE")): continue
        if "-->" in s or re.fullmatch(r"\d+",s): continue
        s=re.sub(r"<[^>]+>","",s)
        s=html.unescape(s).strip()
        if not s or s in seen: continue
        seen.add(s); lines.append(s)
    # 자동자막의 누적형 문장을 완전히 해결하진 않지만, 동일행 중복은 제거
    return "\n".join(lines)

@app.get("/")
def root(): return {"ok": True, "service": "YouTube Transcript API"}

@app.get("/transcript")
def transcript(url: str, lang: str="ja"):
    try:
        with tempfile.TemporaryDirectory() as td:
            opts={
                "skip_download":True, "writesubtitles":True, "writeautomaticsub":True,
                "subtitleslangs":[lang], "subtitlesformat":"vtt",
                "outtmpl":str(Path(td)/"%(id)s.%(ext)s"),
                "quiet":True, "no_warnings":True,
            }
            with YoutubeDL(opts) as ydl:
                info=ydl.extract_info(url, download=True)
            files=list(Path(td).glob("*.vtt"))
            if not files:
                raise HTTPException(404, f"'{lang}' 자막을 찾지 못했습니다.")
            text=clean_vtt(files[0].read_text(encoding="utf-8",errors="ignore"))
            return {"title":info.get("title",""),"channel":info.get("channel") or info.get("uploader",""),
                    "video_id":info.get("id",""),"language":lang,"count":len(text.splitlines()),"text":text}
    except HTTPException: raise
    except Exception as e: raise HTTPException(500, str(e))
