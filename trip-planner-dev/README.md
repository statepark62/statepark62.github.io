# 여행 전광판 (지금 여기) — 개발자용 (제작자 전용)

일반용과 같은 핵심 코드에 **AI 일정 가져오기(PDF·사진)**와 **개발자 전용 잠금**이 더해진 버전입니다.
일반 사용자에게 안내하는 앱이 아닙니다. 일반용 설명은 `README.md`를 보세요.

- 개발자용 앱: https://statepark62.github.io/trip-planner-dev/
- 소스 파일: `trip-live-planner.html` → `trip-planner-dev/index.html`로 배포
- 중계 서버 코드: `Code.gs` (Google Apps Script)

---

## 일반용과 다른 점

| 항목 | 일반용 | 개발자용 |
|---|---|---|
| 접근 | 누구나 | **개발자 시트의 소유자만**(로그인 후 확인) |
| 일정 가져오기 | 없음 | **📂 불러오기** 한 버튼 → JSON 파일 / 사진 / PDF 중 선택 |
| AI 인식 | 없음 | Gemini(Apps Script 중계)로 PDF·사진에서 일정 추출 |
| 사용설명서 링크 | 있음 | 없음 |
| 언어 | 20개 언어 | 한국어 중심(소유자용) |

---

## 구조

```
브라우저(개발자용 앱)
  ├─ 구글 로그인(drive.file) ─▶ Google Sheets/Drive (내 시트: kv 탭, photos 탭, 여행별 표 탭)
  └─ AI 가져오기 ─▶ Apps Script 웹앱(Code.gs) ─▶ Gemini API
                     │  ① 호출자의 구글 토큰으로 “이 시트의 소유자인가” 확인
                     └─ ② 소유자일 때만 키(스크립트 속성)를 붙여 Gemini 호출
```

핵심 원칙: **비밀키는 브라우저·저장소에 없습니다.** AI 키는 Apps Script의 스크립트 속성에만 있습니다.

## 파일 구성

| 파일 | 용도 |
|---|---|
| `trip-live-planner.html` | 개발자용 전체 소스 |
| `trip-planner-public.html` | 일반용 소스(핵심 코드 공유) |
| `Code.gs` | Apps Script AI 중계(소유자 검증 포함) |
| `privacy.html` | 방침(일반용과 같은 문서) |

핵심 기능을 고치면 **양쪽 HTML에 같이 반영**하고(저장 속도, 사진, 내보내기/불러오기, 공유 화면 등), AI 코드와 잠금은 개발자용에만 둡니다.

---

## 개발자 전용 잠금

- 앱을 열면 구글 로그인 후 `DEV_OWNER_SHEET_ID`(개발자 데이터 시트)에 Drive API로 묻습니다.
  `GET /drive/v3/files/{ID}?fields=ownedByMe`
  - `ownedByMe: true` → 앱 사용 가능
  - 403/404 → “접근 권한이 없어요”(다른 계정)
  - 401 → 토큰 만료, 다시 로그인
  - 네트워크 오류 → 열어 주지 않고 “다시 시도”
- **한계:** 정적 호스팅이라 이 확인은 브라우저 안에서 일어납니다. 코드를 고치면 **화면은 우회할 수 있습니다.** 그래도 AI 호출은 서버(Apps Script)가 다시 검사하므로 막힙니다. 화면 접속까지 막으려면 이 앱을 GitHub에 올리지 않고 로컬에서만 쓰세요.
- 공유 보기 주소(`?share=…`)는 잠금과 상관없이 열립니다(읽기 전용 공개 화면).
- 이 확인은 `drive.file` 토큰으로 개발자 시트가 보여야 통과합니다. 개발자 본인 계정에서 한 번 열어 확인하세요.

## AI 일정 가져오기 설정 (Apps Script + Gemini)

### Gemini API 키
1. https://aistudio.google.com/apikey 에서 키 발급(Google AI Studio)
2. 주의: Cloud Console 일반 API 키를 넣으면 “Gemini API has not been used in project …” 오류가 납니다. AI Studio 키를 쓰거나 해당 프로젝트에서 Generative Language API를 사용 설정하세요.

### Apps Script 배포
1. 데이터 시트에서 **확장 프로그램 → Apps Script** 열기 → `Code.gs` 붙여넣기
2. `SHEET_ID`를 개발자 데이터 시트 ID로 설정, `GEMINI_MODEL`(예: `gemini-2.5-flash`) 확인
3. **프로젝트 설정 → 스크립트 속성**에 `GEMINI_API_KEY` 추가(코드에 키를 쓰지 않음)
4. **배포 → 새 배포 → 웹 앱**: 실행 사용자 “나”, 액세스 “모든 사용자”
5. 웹 앱 URL을 HTML의 `AI_GAS_URL`에 입력
6. **코드를 고칠 때마다 “새 버전으로 재배포”** — 저장만 하면 옛 코드가 계속 실행됩니다.

### 동작 메모
- 요청은 `Content-Type: text/plain`으로 보내 CORS 사전요청(OPTIONS)을 피합니다.
- Apps Script는 HTTP 상태코드를 지정할 수 없어 오류를 본문 JSON(`{error:{code,message}}`)으로 돌려줍니다.
- 429/5xx 등은 2초→5초→10초 간격으로 재시도하며 화면에 “재시도 중”을 표시합니다.
- 긴 일정이 잘리면 `maxOutputTokens`를 늘립니다(현재 8192).
- 이미 있는 일정과 날짜+시간+제목이 같으면 건너뛰고 알려 줍니다.

## 불러오기 버튼 (개발자용)

📂 **불러오기** 하나로 합쳐져 있습니다.

| 선택 | 동작 |
|---|---|
| JSON 파일 | 내보낸 일정표를 **새 여행**으로 추가 |
| 사진 | 일정표 사진에서 AI로 일정 인식 → 현재 여행에 추가(시작 화면에서는 새 여행) |
| PDF | PDF에서 AI로 일정 인식 → 현재 여행에 추가(시작 화면에서는 새 여행) |

---

## 데이터 구조

### 시트 탭
| 탭 | 내용 |
|---|---|
| `kv` | A열 키 / B열 JSON. `trips-list`, `trip:{id}`, `active-trip` |
| `photos` | A열 사진 번호 / B열 base64 JPEG(한 칸 45,000자 이하). 일정에는 사진 번호(`photo`)만 연결 |
| `<여행이름>_<id>` | 사람이 읽는 표(날짜·시간·할 일·장소·메모). 사진은 없음 |

- 시트 한 칸 한도는 5만 자라서 사진을 `kv`에 넣지 않고 `photos` 탭에 따로 저장합니다. 사진은 화면에 필요할 때만 읽습니다.
- 사진 삭제 시 `photos`의 해당 행은 비워집니다(행을 밀지 않음). 일정·여행을 삭제하면 사진도 함께 지웁니다.

### 내보내기 JSON (`format: "trip-board"`, `version: 1`)
```json
{ "format":"trip-board", "version":1, "exportedAt":"…",
  "trip":{ "title":"…","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD",
           "days":{ "YYYY-MM-DD":[ {"time":"HH:MM","endTime":null,"title":"…","location":"…","note":"…","photo":"data:image/jpeg;base64,…"} ] } } }
```
- 불러오기는 파일을 실행하지 않고 글자로 읽어 `JSON.parse`만 합니다. 날짜·시간 형식, 글자 길이(제목 200, 메모 5000), 사진 크기(≤50,000자, `data:image/jpeg;base64,` 형식)를 검사합니다.
- 예전 `.js`(`window.TRIP_DATA = …`) 파일도 읽을 수 있으나 새로 저장은 `.json`만 합니다.

---

## 성능·저장 방식

- **빠른 저장:** 일정 추가·수정·삭제 시 화면을 먼저 바꾸고, 시트 저장은 **순서 있는 대기열**(`persist`)에서 뒤에서 처리합니다. 처리 중에는 “☁ 저장 중…” 표시, 저장 중 탭을 닫으면 경고가 뜹니다.
- 방금 저장 중인 값은 대기 중에도 바로 다시 읽을 수 있습니다(`_pendingVal`).
- 사람이 읽는 표 탭의 갱신은 **1.2초 뒤 모아서**(마지막 값만) 처리합니다.
- 시트 읽기는 로드 시 1회 + 4초 캐시(`kvCache`).
- 공유 보기는 **자동 갱신이 없고** “↻ 새로고침” 버튼으로만 다시 읽습니다(시계·전광판은 1초마다 갱신).

## 로그인(OAuth) 메모

- 팝업이 아닌 **전체 페이지 리디렉션**(암묵적 흐름). 토큰은 `sessionStorage`(탭 단위), “연결함” 표시와 시트 ID는 `localStorage`.
- 토큰은 만료 2분 전까지만 사용. 새로고침 시 저장된 토큰이 유효하면 구글에 다녀오지 않고 바로 이어서 사용.
- 조용한 재연결(`prompt=none`)은 60초 안에 다시 시도하지 않는 보호장치가 있고, 토큰을 받으면 해제합니다.
- 로그아웃 후 다음 연결에서는 계정 선택창(`select_account`)이 뜹니다.
- 범위는 `drive.file` 하나입니다.

---

## 테스트

- Playwright(Chromium)로 구글 응답을 가짜로 돌려(`page.route`) 확인합니다. 시계는 `page.clock`으로 고정합니다.
- 확인한 항목: 새로고침 후 연결 유지, 무한 재연결 없음, 소유자 잠금(5가지 상황), 일정 저장 속도, 사진 추가·삭제·공유 화면 표시, JSON 저장·불러오기·잘못된 파일 거절, 공유 화면 새로고침, 휴대폰 폭 가로 넘침 없음.
- **한계:** 가짜 응답 기반이라 실제 구글과의 연동(동의 화면, 계정별 차이, 실제 할당량), 실제 AI 인식, 한글 파일명 다운로드는 실기기·실계정으로 따로 확인해야 합니다.

## 배포 체크리스트

- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `AI_GAS_URL`, `DEV_OWNER_SHEET_ID` 값이 맞다
- [ ] OAuth 리디렉션 URI에 `…/trip-planner-dev/`가 등록돼 있다
- [ ] Apps Script를 **새 버전으로 재배포**했다
- [ ] 본인 계정으로 열어 잠금이 풀리는지, 다른 계정은 막히는지 확인했다
- [ ] 강력 새로고침(Ctrl+Shift+R)으로 새 파일이 반영됐는지 확인했다
- [ ] 저장소에 비밀키(Gemini 키 등)가 없다 — 있으면 즉시 폐기·재발급

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 본인인데 “접근 권한이 없어요” | `DEV_OWNER_SHEET_ID`가 틀렸거나 `drive.file` 토큰으로 그 시트가 보이지 않음 → 시트 ID·소유 계정 확인 |
| AI 가져오기 403 “소유자만” | 로그인 만료 또는 다른 계정 → 새로고침 후 다시 연결 |
| `Gemini API has not been used in project …` | Cloud Console 키 사용 → AI Studio 키로 교체 |
| `User location is not supported` | 중계 서버가 미지원 지역에서 실행됨(과거 Cloudflare Worker) → Apps Script 사용 |
| 429/503 반복 | 사용 한도·과부하 → 잠시 후 재시도(자동 재시도 있음) |
| 스크립트를 고쳤는데 그대로 | 새 버전으로 재배포 안 함 |
| `API_KEY_HTTP_REFERRER_BLOCKED`(공유 보기) | API 키 웹사이트 제한에 경로를 넣음 → `도메인/*`로 수정 |
| `403 access_denied` 로그인 | OAuth가 테스트 상태 → 프로덕션 게시 또는 테스트 사용자 추가 |
| `redirect_uri_mismatch` | 코드의 리디렉션 URI와 콘솔 값이 글자 단위로 같지 않음 |
| 한글 이름 파일이 `download`로 저장됨 | 일부 환경에서 한글 파일명 문제 → 실제 브라우저에서 확인 필요 |

## 보안 메모

- 공개 코드에 둬도 되는 것: OAuth 클라이언트 ID, 제한을 건 Sheets API 키, 소유자 검증이 있는 Apps Script URL.
- 두면 안 되는 것: **Gemini 등 AI 키**, OAuth 클라이언트 시크릿, Play 서명 키 파일.
- 사진은 다시 인코딩되어 위치 정보가 제거됩니다. 사용자 입력은 `escapeHtml`을 거쳐 출력합니다.

## 문의

박상태 · statepark62@gmail.com
