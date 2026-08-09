"""
sources 탭에 저장된 URL 목록을 전부 돌면서 신규 영상을 처리한다.
run_single_url.py로 한 번이라도 입력했던 URL들이 여기 쌓여 있으므로,
이 스크립트 하나로 "내가 등록해둔 채널/영상들"을 한 번에 갱신할 수 있다.

sources 탭에서 각 행의 'active' 값을 FALSE로 바꾸면 그 URL은
이 스크립트에서 건너뛴다 (탭에서 삭제하지 않아도 됨).
"""
import config
import pipeline_core
import sheets_client


def run():
    sh = sheets_client.get_sheet()
    sheets_client.ensure_tabs(sh)

    sources = sheets_client.get_sources(sh, active_only=True)

    if not sources:
        # 아직 등록된 URL이 없으면, 기본값인 Bite size Japanese 채널로 시작한다.
        print("등록된 소스가 없어 기본 채널로 시작합니다.")
        sheets_client.add_source(sh, config.CHANNEL_URL, label=config.CHANNEL_NAME, limit=config.CHECK_RECENT_N)
        sources = sheets_client.get_sources(sh, active_only=True)

    print(f"등록된 소스 {len(sources)}개 확인")

    for src in sources:
        url = src["url"]
        limit = int(src.get("limit") or 5)
        label = src.get("label") or url
        print(f"\n=== 소스 처리: {label} ({url}, limit={limit}) ===")

        videos = pipeline_core.resolve_videos(url, limit)
        pipeline_core.process_videos(sh, videos, skip_processed=True)

    print("\n전체 소스 처리 완료.")


if __name__ == "__main__":
    run()
