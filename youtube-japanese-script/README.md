# YouTube 일본어 스크립트 v1

## 구성
- `index.html` : GitHub Pages 화면
- `server.py` / `requirements.txt` / `render.yaml` : 자막 추출 API (Render 등 Python 호스팅)
- `google-apps-script.gs` : Google Sheets 저장

## 1) GitHub Pages
새 저장소에 이 파일들을 업로드합니다.
Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.
배포 후 `https://사용자명.github.io/저장소명/`에서 앱을 엽니다.

## 2) 자막 API
Render에서 새 Web Service를 만들고 이 GitHub 저장소를 연결합니다.
`render.yaml`을 사용하거나:
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`

배포 후 받은 주소(예: `https://...onrender.com`)를 앱의 ⚙ 설정 → '자막 추출 API 주소'에 넣습니다.

> 주의: YouTube는 서버/데이터센터 IP에서 자막 접근을 제한할 수 있습니다. 이 경우 백엔드 호스팅에 따라 추출이 실패할 수 있습니다. v1은 개인 학습용 프로토타입입니다.

## 3) Google Sheets
1. 새 Google Sheet를 만듭니다.
2. 확장 프로그램 → Apps Script.
3. `google-apps-script.gs` 내용을 붙여넣고 저장.
4. 배포 → 새 배포 → 유형: 웹 앱.
5. 실행 사용자: 나 / 액세스 권한: 앱을 사용할 계정 범위에 맞게 설정.
6. 배포 URL(`/exec`)을 복사.
7. GitHub Pages 앱의 ⚙ 설정 → 'Google Apps Script 웹앱 URL'에 붙여넣기.

## 사용
1. YouTube URL 붙여넣기
2. 일본어 선택
3. `스크립트 가져오기`
4. 필요하면 `전체 복사`, `TXT 저장`, `Google Sheets 저장`

## 보안
공개 GitHub 저장소에 Google 비밀번호, OAuth 토큰, API 키를 넣지 마세요.
