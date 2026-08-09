"""
run_single_url.py와 run_saved_sources.py가 공통으로 쓰는
'영상 목록 확인 → 자막 다운로드 → 정제 → 추출 → 시트 적재' 로직.
"""
import json
import subprocess
from pathlib import Path

import config
import clean_vtt
import extract_expressions
import sheets_client


def _cookie_args() -> list[str]:
    """설정된 쿠키 파일이 있으면 yt-dlp용 --cookies 인자를 반환한다."""
    if config.YTDLP_COOKIES_PATH and Path(config.YTDLP_COOKIES_PATH).exists():
        return ["--cookies", config.YTDLP_COOKIES_PATH]
    return []


def _remote_components_args() -> list[str]:
    """유튜브의 n-challenge를 풀기 위해 yt-dlp가 GitHub에서 받아오는
    JS 솔버 스크립트(ejs) 다운로드를 명시적으로 허용한다."""
    return ["--remote-components", "ejs:github"]


def resolve_videos(url: str, limit: int) -> list[dict]:
    """입력 URL이 단일 영상인지 채널/재생목록인지 판별해 영상 목록을 반환."""
    cmd = [
        "yt-dlp",
        *_cookie_args(),
        *_remote_components_args(),
        "--flat-playlist",
        "--playlist-end", str(limit),
        "-J",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("=== yt-dlp 오류 (resolve_videos) ===")
        print(result.stderr)
        raise RuntimeError(f"yt-dlp가 실패했습니다 (exit {result.returncode}). 위 stderr 내용을 확인하세요.")
    data = json.loads(result.stdout)

    if "entries" not in data:
        return [{
            "video_id": data["id"],
            "title": data.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={data['id']}",
        }]

    videos = []
    for e in data["entries"]:
        if e is None:
            continue
        videos.append({
            "video_id": e["id"],
            "title": e.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={e['id']}",
        })
    return videos


def download_auto_caption(video_id: str, out_dir: Path) -> Path | None:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(out_dir / f"{video_id}.%(ext)s")
    cmd = [
        "yt-dlp",
        *_cookie_args(),
        *_remote_components_args(),
        "--skip-download",
        "--write-auto-sub",
        "--sub-lang", "ja",
        "--sub-format", "vtt",
        "-o", out_tmpl,
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"=== yt-dlp 자막 다운로드 실패 ({video_id}) ===")
        print(result.stderr)
    vtt_path = out_dir / f"{video_id}.ja.vtt"
    return vtt_path if vtt_path.exists() else None


def process_videos(sh, videos: list[dict], skip_processed: bool = True):
    """영상 목록을 순회하며 자막 추출 → 표현 추출 → 시트 적재까지 처리."""
    work_dir = Path(config.WORK_DIR)
    work_dir.mkdir(parents=True, exist_ok=True)

    processed_ids = sheets_client.get_processed_ids(sh) if skip_processed else set()

    for video in videos:
        if video["video_id"] in processed_ids:
            print(f"이미 처리됨, 건너뜀: {video['title']}")
            continue

        print(f"\n--- 처리 중: {video['title']} ({video['video_id']}) ---")

        vtt_path = download_auto_caption(video["video_id"], work_dir)
        if vtt_path is None:
            print("일본어 자동자막이 없어 건너뜀.")
            continue

        text = clean_vtt.vtt_to_clean_text(vtt_path)
        print(f"자막 텍스트 {len(text)}자 확보")

        items = extract_expressions.extract(video["title"], text)
        print(f"표현 {len(items)}개 추출")

        sheets_client.push_expressions(sh, video, items)
        sheets_client.mark_processed(sh, video["video_id"], video["title"])

        vtt_path.unlink(missing_ok=True)
