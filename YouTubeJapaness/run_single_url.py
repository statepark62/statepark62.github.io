"""
온디맨드 실행 스크립트.
채널 전체를 자동으로 도는 main.py와 달리, 사용자가 지정한
유튜브 URL 하나(영상 또는 채널)를 그 자리에서 처리한다.

처리와 동시에, 입력한 URL을 sources 탭에 저장해서
다음부터는 run_saved_sources.py로 한 번에 목록을 돌릴 수 있게 한다.

사용법:
  python run_single_url.py "https://www.youtube.com/watch?v=XXXXXXXX"
  python run_single_url.py "https://www.youtube.com/channel/UCxxxxxxxx" --limit 5 --label "채널 별명"
"""
import argparse

import pipeline_core
import sheets_client


def run(url: str, limit: int, skip_processed: bool, label: str):
    sh = sheets_client.get_sheet()
    sheets_client.ensure_tabs(sh)

    # 입력한 URL을 목록(sources 탭)에 저장 — 이미 있으면 중복 저장 안 됨
    sheets_client.add_source(sh, url, label=label, limit=limit)

    videos = pipeline_core.resolve_videos(url, limit)
    print(f"대상 영상 {len(videos)}개 확인")

    pipeline_core.process_videos(sh, videos, skip_processed=skip_processed)
    print("\n완료.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="지정한 유튜브 URL에서 생활 표현 추출")
    parser.add_argument("url", help="영상 또는 채널/재생목록 URL")
    parser.add_argument("--limit", type=int, default=5, help="채널/재생목록일 때 처리할 최대 영상 수")
    parser.add_argument("--force", action="store_true", help="이미 처리된 영상도 다시 처리")
    parser.add_argument("--label", default="", help="목록(sources 탭)에 저장할 때 붙일 별명")
    args = parser.parse_args()

    run(args.url, args.limit, skip_processed=not args.force, label=args.label)
