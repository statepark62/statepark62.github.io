# 경조사비 입력 앱 (gyeongjosa)

결혼(축의금)·상(부의금) 등 경조사비 내역을 스마트폰이나 PC에서 입력하고, 사용자 본인의 Google Sheets에 자동 저장하는 웹앱입니다.

**앱 주소**: https://statepark62.github.io/gyeongjosa/

---

## 특징

- **서버 없음** — GitHub Pages 정적 호스팅만으로 동작합니다. 백엔드 서버, Apps Script, 데이터베이스가 필요 없습니다.
- **사용자 소유 데이터** — 로그인한 사용자 본인의 구글 드라이브에 `경조사비` 시트가 생성되고, 브라우저가 그 사용자의 권한으로 Sheets API를 직접 호출합니다. 앱 제작자를 포함해 다른 누구도 데이터에 접근할 수 없습니다.
- **설치 절차 없음** — 링크 접속 후 구글 로그인 한 번이면 끝입니다. 시트 사본 만들기, 스크립트 배포 같은 과정이 없습니다.
- **기기 간 동기화** — 같은 구글 계정으로 로그인하면 PC·휴대폰 어디서든 같은 시트에 연결됩니다.
- **비로그인 사용 가능** — 로그인 없이도 바로 써볼 수 있습니다 (해당 기기의 localStorage에만 저장).
- **PWA** — 홈 화면에 추가하면 일반 앱처럼 아이콘으로 실행됩니다.

---

## 파일 구성

```
gyeongjosa/
├── index.html       앱 전체 (HTML + CSS + JS 단일 파일)
├── manifest.json    PWA 설정 (앱 이름, 아이콘, 테마색)
├── README.md        이 문서
└── icons/
    ├── favicon-16.png
    ├── favicon-32.png
    ├── apple-touch-icon-180.png
    ├── icon-192.png
    └── icon-512.png
```

---

## 동작 구조

```
[브라우저 (index.html)]
        │
        ├── Google Identity Services (GIS) 로 OAuth 액세스 토큰 획득
        │
        ├── Drive API   : 기존 '경조사비' 시트 검색
        │                 (없으면 Sheets API 로 새로 생성)
        │
        └── Sheets API  : 행 추가 / 조회 / 삭제
                          모두 사용자 본인 권한으로 직접 호출
```

중계 서버가 없으므로 데이터가 제3자를 거치지 않습니다.

### 시트 구조

`경조사비` 스프레드시트에 두 개의 탭이 생성됩니다.

| 탭 이름 | A | B | C | D | E |
|---|---|---|---|---|---|
| 축의금 | 이름 | 상황 | 금액 | 날짜 | 비고 |
| 부의금 | 이름 | 상황 | 금액 | 날짜 | 비고 |

- 1행은 헤더이며, 데이터는 2행부터 읽습니다.
- A열(이름)이 비어 있는 행은 건너뜁니다.
- 금액은 `₩100,000`처럼 통화 서식이 적용된 값도 숫자로 인식합니다.

---

## 설정 (배포자용)

이 앱을 다른 곳에 배포하려면 Google Cloud 설정이 필요합니다.

### 1. Google Cloud 프로젝트

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트를 만듭니다.
2. **API 및 서비스 > 라이브러리**에서 다음 두 API를 활성화합니다.
   - Google Sheets API
   - Google Drive API

### 2. OAuth 클라이언트 ID

1. **사용자 인증 정보 > OAuth 클라이언트 ID 만들기 > 웹 애플리케이션**
2. **승인된 JavaScript 원본**에 배포할 도메인을 추가합니다.
   ```
   https://<사용자명>.github.io
   ```
   경로(`/gyeongjosa/`)는 붙이지 않고 도메인까지만 입력합니다.
3. 발급된 클라이언트 ID를 `index.html`의 `GOOGLE_CLIENT_ID` 값에 넣습니다.

### 3. OAuth 동의 화면

- **게시 상태를 '프로덕션'으로 설정**합니다. '테스트' 상태에서는 미리 등록한 테스트 사용자만 로그인할 수 있습니다.
- 사용 범위(scope)에 아래 세 가지가 포함되어야 합니다.

| 범위 | 용도 |
|---|---|
| `.../auth/spreadsheets` | 시트 생성 및 읽기·쓰기 |
| `.../auth/drive.file` | 앱이 만든 시트 검색 (기기 간 동일 시트 연결) |
| `.../auth/userinfo.email` | 로그인한 계정 이메일 확인 |

> `spreadsheets`와 `drive.file`은 민감한 범위로 분류되어, 외부 사용자에게 배포할 경우 Google 인증 절차가 필요할 수 있습니다.

### 4. GitHub Pages 배포

저장소의 원하는 폴더에 파일을 그대로 올리면 됩니다. 빌드 과정이 없습니다.

---

## 주요 설정값

`index.html` 상단 `<script>` 안에 있습니다.

```js
var GOOGLE_CLIENT_ID = '...apps.googleusercontent.com';
var SCOPES = 'https://www.googleapis.com/auth/spreadsheets '
           + 'https://www.googleapis.com/auth/drive.file '
           + 'https://www.googleapis.com/auth/userinfo.email';
```

### localStorage 사용 키

| 키 | 내용 |
|---|---|
| `gyeongjosabi_session` | 액세스 토큰, 만료 시각, 이메일, 승인된 범위 |
| `gyeongjosabi_mode` | `cloud`(로그인) / `local`(비로그인) — 새로고침 시 화면 복원용 |
| `gyeongjosabi_sheetmeta_<이메일>` | 스프레드시트 ID와 탭 ID 캐시 |
| `gyeongjosabi_local_entries` | 비로그인 상태에서 입력한 데이터 |

---

## 세션 처리

- 로그인 성공 시 토큰과 만료 시각을 저장하여, 새로고침하거나 앱을 다시 열어도 로그인 상태가 유지됩니다.
- 토큰 만료 후 재접속하면 `prompt: 'none'`으로 조용히 갱신을 시도하고, 8초 내 응답이 없거나 실패하면 로그인 화면으로 돌아갑니다.
- 저장된 토큰의 승인 범위가 부족하면(예: 배포 후 범위를 추가한 경우) 해당 세션을 폐기하고 동의 화면을 다시 표시합니다.
- 로그아웃 시 토큰을 철회(revoke)하고 세션을 삭제합니다.

---

## 문제 해결

**`Request had insufficient authentication scopes`**
필요한 권한이 승인되지 않은 토큰입니다. 로그아웃 후 다시 로그인하여 동의 화면에서 모든 항목을 허용하세요. 배포 후 범위를 추가했다면 기존 사용자도 재동의가 필요합니다.

**로그인 화면에서 넘어가지 않음 / `idpiframe_initialization_failed`**
Cloud Console의 승인된 JavaScript 원본에 현재 도메인이 등록되어 있는지 확인하세요. 설정 반영에 수 분이 걸릴 수 있습니다.

**기기마다 다른 시트가 생성됨**
드라이브에 `경조사비`라는 이름의 시트가 여러 개 있는 경우입니다. 데이터가 있는 것 하나만 남기고 정리하세요. 앱은 이름으로 검색해 가장 먼저 생성된 시트를 사용합니다.

**수정 사항이 반영되지 않음**
브라우저 캐시 문제입니다. PC는 `Ctrl+Shift+R`, 홈 화면에 추가한 앱은 아이콘을 삭제하고 다시 추가하세요.

**합계 금액이 0으로 표시됨**
금액 열에 숫자가 아닌 값이 들어 있는지 확인하세요. 통화 기호와 쉼표는 자동으로 처리되지만, 그 외 문자가 섞이면 0으로 계산됩니다.

---

## 제약 사항

- 비로그인 상태의 데이터는 해당 브라우저에만 저장되며, 로그인 시 시트로 자동 이전되지 않습니다.
- 시트를 직접 편집할 경우 헤더(1행)와 열 순서를 유지해야 합니다.
- 같은 시트를 여러 기기에서 동시에 편집하면 마지막 작업이 우선합니다.
