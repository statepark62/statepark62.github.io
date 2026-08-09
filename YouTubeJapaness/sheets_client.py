"""
4단계: 처리 상태(processed_videos)와 추출 결과(expressions)를
      새로 만든 Google Sheets 문서에 읽고 쓴다.
"""
import json
from datetime import datetime, timezone

import gspread
from google.oauth2.service_account import Credentials

import config

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def get_client() -> gspread.Client:
    info = json.loads(config.GOOGLE_SERVICE_ACCOUNT_JSON)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return gspread.authorize(creds)


def get_sheet():
    gc = get_client()
    sh = gc.open_by_key(config.SHEET_ID)
    return sh


def ensure_tabs(sh):
    """필요한 탭이 없으면 만들고 헤더를 세팅한다."""
    titles = [ws.title for ws in sh.worksheets()]

    if config.TAB_EXPRESSIONS not in titles:
        ws = sh.add_worksheet(title=config.TAB_EXPRESSIONS, rows=1000, cols=10)
        ws.append_row(config.EXPRESSIONS_HEADER)

    if config.TAB_PROCESSED not in titles:
        ws = sh.add_worksheet(title=config.TAB_PROCESSED, rows=1000, cols=3)
        ws.append_row(["video_id", "video_title", "processed_at"])

    if config.TAB_SOURCES not in titles:
        ws = sh.add_worksheet(title=config.TAB_SOURCES, rows=200, cols=5)
        ws.append_row(["url", "label", "limit", "added_at", "active"])


def get_processed_ids(sh) -> set[str]:
    ws = sh.worksheet(config.TAB_PROCESSED)
    records = ws.get_all_records()
    return {str(r["video_id"]) for r in records}


def mark_processed(sh, video_id: str, video_title: str):
    ws = sh.worksheet(config.TAB_PROCESSED)
    ws.append_row([video_id, video_title, datetime.now(timezone.utc).isoformat()])


def push_expressions(sh, video: dict, items: list[dict]):
    if not items:
        return
    ws = sh.worksheet(config.TAB_EXPRESSIONS)
    today = datetime.now(timezone.utc).date().isoformat()
    rows = []
    for it in items:
        rows.append([
            today,
            video["video_id"],
            video["title"],
            video["url"],
            it.get("expression", ""),
            it.get("meaning_ko", ""),
            it.get("example_sentence", ""),
            it.get("nuance_note", ""),
        ])
    ws.append_rows(rows, value_input_option="RAW")


def get_sources(sh, active_only: bool = True) -> list[dict]:
    """sources 탭에 저장된 URL 목록을 반환한다."""
    ws = sh.worksheet(config.TAB_SOURCES)
    records = ws.get_all_records()
    if active_only:
        records = [r for r in records if str(r.get("active", "TRUE")).upper() != "FALSE"]
    return records


def add_source(sh, url: str, label: str = "", limit: int = 5):
    """새 URL을 sources 탭에 저장한다. 이미 있으면 중복 저장하지 않는다."""
    ws = sh.worksheet(config.TAB_SOURCES)
    existing = {str(r["url"]) for r in ws.get_all_records()}
    if url in existing:
        return
    ws.append_row([url, label, limit, datetime.now(timezone.utc).isoformat(), "TRUE"])
