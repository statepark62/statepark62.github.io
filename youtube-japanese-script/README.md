# YouTube 일본어 스크립트 API v1.1

GitHub의 `youtube-japanese-script` 폴더에서 아래 두 파일만 교체하세요.

- server.py
- requirements.txt

Commit하면 Render의 자동 배포가 시작됩니다.

변경점:
- 최신 yt-dlp 사용
- yt-dlp-ejs, curl-cffi 추가
- android_vr → web_embedded → mweb 순으로 YouTube client 재시도
- CORS를 https://statepark62.github.io 로 제한
- Render IP가 bot check에 걸린 경우 명확한 오류 반환

주의: Render 데이터센터 IP 자체가 차단된 경우 이 버전으로도 실패할 수 있습니다.
그 경우 Google/YouTube 로그인 쿠키를 Render에 올리지 말고 로컬 PC 방식으로 전환하는 것이 좋습니다.
