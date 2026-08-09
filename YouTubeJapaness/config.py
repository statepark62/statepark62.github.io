"""
파이프라인 전역 설정.
민감 정보(시트 ID, API 키)는 환경변수/GitHub Secrets로 주입하고,
여기에는 채널 정보처럼 바뀌지 않는 값만 둡니다.
"""
import os

# --- YouTube 채널 ---
CHANNEL_URL = "https://www.youtube.com/channel/UCc8QJqwkWe9RcKYZTY2Ezuw"
CHANNEL_NAME = "Bite size Japanese"

# 한 번 실행에서 확인할 최신 영상 개수 (채널이 자주 올리므로 여유 있게)
CHECK_RECENT_N = 15

# --- Google Sheets ---
# 새로 만든 스프레드시트의 ID (URL의 /d/ 와 /edit 사이 문자열)
SHEET_ID = os.environ["BSJ_SHEET_ID"]

TAB_EXPRESSIONS = "expressions"   # 추출된 생활 표현이 쌓이는 탭
TAB_PROCESSED = "processed_videos"  # 이미 처리한 video_id를 기록하는 상태 탭
TAB_SOURCES = "sources"           # 사용자가 입력했던 유튜브 URL 목록

EXPRESSIONS_HEADER = [
    "date_added", "video_id", "video_title", "video_url",
    "expression", "meaning_ko", "example_sentence", "nuance_note",
]

# --- Google 서비스 계정 인증 ---
# GitHub Secrets에 JSON 전체를 문자열로 저장해두고 여기서 읽음
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]

# --- OpenAI (GPT-5) ---
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
EXTRACTION_MODEL = "gpt-5"

# --- 로컬 작업 디렉토리 ---
WORK_DIR = os.environ.get("BSJ_WORK_DIR", "./_work")

# --- yt-dlp 쿠키 (YouTube 봇 확인 우회용) ---
# 값이 있으면 yt-dlp 호출 시 --cookies <경로>를 붙인다.
YTDLP_COOKIES_PATH = os.environ.get("YTDLP_COOKIES_PATH", "")
