# 여행 전광판 (지금 여기)

날짜·시간별 여행 일정을 입력해두면, **지금 이 순간 무엇을 하기로 했는지**를 실시간으로 크게 보여주는 여행 일정 웹앱(PWA)입니다.
서버 없이 **GitHub Pages + 사용자 본인의 Google Sheets**만으로 동작하며, 개발자는 사용자의 일정 데이터를 볼 수 없습니다.

---

## 주요 기능

### 공통
- **실시간 전광판**: 현재 시각 기준 "지금 할 일 / 다음 할 일" 자동 표시
- **날짜별 일정 관리**: 날짜 탭(줄바꿈 방식이라 며칠짜리 여행이든 잘리지 않음)과 시간대별 일정 추가·수정·삭제 (삭제 시 확인창)
- **아침 일정 확인**: 앱을 열면 오늘 일정을 모아 보여주는 팝업
- **브라우저 알림**: 일정 시작 10분 전 (탭이 열려 있는 동안)
- **Google Sheets 연동**: 구글 로그인 시 본인 소유 스프레드시트에 자동 저장·동기화 (사람이 읽기 좋은 여행별 탭도 함께 생성)
- **로컬 저장 폴백**: 로그인하지 않아도 브라우저(localStorage)에 저장
- **지난 여행 목록**, **일행에게 실시간 공유**(로그인 없이 링크로 읽기 전용, 약 30초 간격 갱신), **PDF로 내보내기**(인쇄)
- **넓은 화면·큰 글자**: 본문 최대 폭 1180px, 모바일 우선 큰 글자
- **PWA**: 홈 화면에 추가 (Android는 Google Play 배포 진행)

### 일반 사용자용 (`trip-planner-public.html`)
- **다국어 20개**: 한국어·English·日本語·中文·Deutsch·Français·Italiano·Español·Português(BR)·Русский·العربية(RTL)·Nederlands·Polski·Svenska·Українська·Türkçe·Tiếng Việt·Bahasa Indonesia·ไทย·हिन्दी
  - 🌐 지구본 아이콘으로 선택, 브라우저 언어 자동 감지, 일행 공유 화면에서도 선택 가능
  - 언어 추가: `I18N`에 번역 세트 추가 → `DAY_LABELS`에 요일 추가 → `LANG_META`에 이름 추가

### 제작자용 (`trip-live-planner.html`)
- **PDF·사진 자동 인식**: 여행사 PDF나 일정표 사진을 올리면 Gemini가 날짜·시간·장소를 읽어 일정 생성/추가
- **중복 건너뛰기**: 기존 여행에 추가할 때 같은 날짜·시작시간·제목의 일정은 자동 제외
- **자동 재시도**: 일시 오류(429/5xx 등)는 2→5→10초 간격으로 최대 3번 자동 재시도

---

## 아키텍처

```
사용자 브라우저
   │
   ▼
GitHub Pages (정적 호스팅, 서버 없음)
   ├── /trip-planner/      → 일반 사용자용 (trip-planner-public.html, 다국어)
   └── /trip-planner-dev/  → 제작자용 (trip-live-planner.html, ?dev=1 로 AI 버튼 표시)
        │                 │                              │
        │ 구글 로그인 시    │ 링크만 열면(로그인 불필요)       │ PDF·사진 인식 (제작자 전용, 구글 연결 필수)
        ▼                 ▼                              ▼
  Google Sheets/Drive   Google Sheets API              Apps Script 웹 앱 (데이터 시트에 부착)
  (사용자 본인 소유)      (공개 API 키, 읽기 전용)           ① 호출자가 시트 소유자인지 확인(Drive API)
                                                         ② Gemini API(gemini-2.5-flash) 호출
                                                         (Gemini 키는 스크립트 속성에만 보관)
```

핵심 원칙: **개발자가 운영하는 서버/DB가 없습니다.** 사용자 데이터는 각자의 Google 계정(Sheets) 또는 브라우저(localStorage)에만 존재합니다. AI 인식은 제작자 본인의 시트에 붙인 Apps Script만 거칩니다.

> 이전에는 Cloudflare Worker로 AI API를 중계했으나, Worker가 홍콩 데이터센터에서 실행되면 Gemini가 `User location is not supported`를 반환하고 `workers.dev` 공유 도메인에서 간헐적 403이 발생해 Apps Script 방식으로 교체했습니다. Worker는 더 이상 쓰지 않습니다.

---

## 파일 구성

| 파일 | 용도 |
|---|---|
| `trip-planner-public.html` | 일반 사용자용 소스 (다국어·PWA) → `trip-planner/index.html`로 배포 |
| `trip-live-planner.html` | 제작자용 소스 (PDF·사진 인식) → `trip-planner-dev/index.html`로 배포 |
| `Code.gs` | Gemini 중계 Apps Script (데이터 시트에 붙여넣기) |
| `manifest.json`, `service-worker.js` | PWA 매니페스트·오프라인 캐싱 (일반용 폴더에만) |
| `icon-192.png`, `icon-512.png` | PWA 아이콘 |
| `apple-touch-icon.png` | iOS 홈 화면 아이콘 (양쪽 폴더 모두) |
| `privacy.html` | 개인정보처리방침 (OAuth 심사·Play 등록에 필요) |
| `feature-graphic.png`, `play-store-listing.txt` | Play 스토어 그래픽·등록 문구 초안 |

### 두 HTML 파일의 차이 (수정 시 주의)
| 항목 | 일반용 | 제작자용 |
|---|---|---|
| 다국어(20개)·🌐 선택 | ✅ | ❌ (한국어만) |
| PDF·사진 인식 (Apps Script+Gemini) | ❌ | ✅ |
| 중복 건너뛰기·자동 재시도 | ❌ | ✅ |
| 날짜 탭 줄바꿈·큰 글자·넓은 폭 | ✅ | ✅ |
| `?dev=1` 플래그 저장 | 세션 동안만(sessionStorage) | 브라우저에 영구 저장(localStorage) |

- 공통 기능(일정 CRUD, 전광판, 공유 등)을 고칠 때는 **양쪽 파일을 함께** 수정하세요.
- 일반용 파일에 남아 있는 `?dev=1` 가져오기 코드는 예전(Cloudflare/Claude) 방식이라 **동작하지 않습니다**. AI 가져오기는 제작자용 파일만 사용하세요.
- 일반용 페이지를 열면 예전 영구 플래그(`trip_dev_mode`)가 지워집니다. 같은 도메인을 쓰므로, 제작자용은 **`?dev=1`이 붙은 주소를 북마크**해 두세요.

---

## 초기 설정 (한 번만)

### 1. Google OAuth (Sheets 저장·로그인용)

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. "API 및 서비스 → 라이브러리"에서 **Google Sheets API**, **Google Drive API** 사용 설정
3. "OAuth 동의 화면" 설정 (외부, 테스트 사용자에 본인 이메일 추가)
4. "사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션" 생성
5. **승인된 자바스크립트 원본**: `https://<GitHub 사용자명>.github.io`
6. **승인된 리디렉션 URI**: `https://<사용자명>.github.io/trip-planner/`, `https://<사용자명>.github.io/trip-planner-dev/`
7. 발급된 클라이언트 ID를 두 HTML 파일의 `GOOGLE_CLIENT_ID`에 반영

로그인은 팝업이 아닌 **전체 페이지 리디렉션 방식**입니다 (팝업 차단 회피).
요청 스코프는 **`drive.file` 하나뿐**입니다(이 앱이 만든 시트에만 접근, Sheets API도 이 범위로 동작). 민감 범위인 `spreadsheets`를 쓰지 않아야 게시 후에도 "확인되지 않은 앱" 경고와 100명 제한이 없습니다.

#### 1-1. OAuth 동의 화면 게시 (Testing → In production)

처음 만든 동의 화면은 **테스트 중** 상태라서 *테스트 사용자로 등록된 계정만* 로그인됩니다(최대 100명, 그 외 계정은 `403 access_denied`). 일반 사용자·Play 테스터가 쓰게 하려면 게시해야 합니다.

1. Cloud Console에서 OAuth 클라이언트 ID가 속한 프로젝트 선택 (클라이언트 ID 앞 숫자 = 프로젝트 번호)
2. **Google 인증 플랫폼 → 데이터 액세스**: 범위를 `…/auth/drive.file`만 남기고 `…/auth/spreadsheets`는 **삭제**
3. **브랜딩**: 앱 이름, 사용자 지원 이메일, 개발자 연락처 이메일, **앱 홈페이지**(`https://<사용자명>.github.io/trip-planner/`), **개인정보처리방침**(`https://<사용자명>.github.io/trip-planner/privacy.html`), 승인된 도메인 입력 후 저장
4. **대상 → 앱 게시** → 확인 (게시 상태가 "프로덕션"으로 바뀜)
5. 게시 후, 테스트 사용자로 등록하지 않은 다른 구글 계정으로 로그인해 **경고 없이** 동의 화면이 뜨는지 확인

> 민감 범위(`spreadsheets` 등)를 그대로 두고 게시하면 모든 사용자에게 "확인되지 않은 앱" 경고가 뜨고 신규 사용자 100명 제한이 걸립니다. 해소하려면 구글의 정식 검수(개인정보처리방침·시연 영상 등)가 필요합니다.

### 2. Google API 키 (일행 공유 보기용, 로그인 불필요)

1. Cloud Console → 사용자 인증 정보 → API 키 만들기
2. **API 제한사항**: Google Sheets API만 체크
3. **애플리케이션 제한사항: 웹사이트** → 아래 항목을 등록

   ```
   <사용자명>.github.io/*
   ```

   > ⚠️ 브라우저가 다른 도메인(googleapis.com)으로 요청을 보낼 때 referrer에는 **경로 없이 도메인만** 실립니다.
   > `.../trip-planner/*`처럼 경로를 붙인 항목만 등록하면 `API_KEY_HTTP_REFERRER_BLOCKED`(403)가 납니다.
4. 발급된 키를 두 HTML 파일의 `GOOGLE_API_KEY`에 반영

이 키는 공개 페이지에 들어가는 키입니다. Sheets 읽기 전용 + 웹사이트 제한으로 보호하며, 실제 접근 권한은 각 시트의 공유 설정이 결정합니다.

### 3. Gemini 키 + Apps Script 중계 (제작자용 AI 인식)

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키 발급
   (⚠️ Cloud Console "사용자 인증 정보"의 키가 아니라 **AI Studio 목록의 키**를 사용)
2. 앱에 구글 로그인하면 `지금여기_여행일정_데이터` 시트가 만들어집니다. 이 시트를 열고 **확장 프로그램 → Apps Script**
3. `Code.gs` 내용을 붙여넣고 맨 위 `SHEET_ID`를 이 시트의 ID(주소의 `/d/` 뒤 문자열)로 바꿔 저장
4. **프로젝트 설정(톱니) → 스크립트 속성**: `GEMINI_API_KEY` = (1번에서 발급한 키)
5. **배포 → 새 배포 → 웹 앱**: 실행 사용자 **나**, 액세스 권한 **모든 사용자** → 권한 승인 후 웹 앱 URL(`…/exec`) 복사
   - 소유자 확인은 스크립트가 직접 하므로 "모든 사용자"가 필요합니다.
6. `trip-live-planner.html`의 `AI_GAS_URL`에 URL을 넣고 배포

동작 방식: 제작자용 페이지가 **구글 로그인 토큰**과 요청 본문을 Apps Script로 보냄 → 스크립트가 Drive API로 "이 토큰의 주인이 시트 소유자인가(`ownedByMe`)"를 확인 → 맞을 때만 Gemini 호출. 중계 주소가 공개 페이지에 노출되어도 소유자 외에는 사용할 수 없습니다.

- 키만 바꿀 때는 스크립트 속성만 수정하면 됩니다(재배포 불필요). `Code.gs`를 고쳤다면 **새 버전으로 다시 배포**해야 반영됩니다.
- 모델은 `Code.gs`의 `GEMINI_MODEL`(현재 `gemini-2.5-flash`)에서 바꿉니다.

### 4. GitHub Pages 배포

- 저장소를 **Public**으로 설정
- `trip-planner/index.html`, `trip-planner-dev/index.html` 각각 배포
- PWA 관련 파일은 `trip-planner/`에만, `apple-touch-icon.png`는 두 폴더 모두에 필요
- 캐시가 끈질기므로 배포 후 **강력 새로고침(`Ctrl+Shift+R`)**. 아이폰은 설정 > Safari > 기록 및 웹사이트 데이터 지우기

---

## 제작자 모드 (`?dev=1`)

`https://<사용자명>.github.io/trip-planner-dev/?dev=1`로 접속하면 "PDF로 가져오기/추가", "사진으로 가져오기/추가" 버튼이 나타납니다.

- **구글에 연결된 상태에서만** AI 인식이 동작합니다 (소유자 확인에 로그인 토큰을 사용).
- 기존 여행에 "추가"할 때 이미 있는 일정(같은 날짜·시작시간·제목)은 자동 제외되고, 미리보기에 제외 개수가 표시됩니다. 제목이 조금이라도 다르면 별개 일정으로 봅니다.
- 추가를 확정한 뒤에는 되돌리기가 없으니(일정 옆 ✕로 개별 삭제), 미리보기에서 확인하세요.

## 일행에게 실시간 공유하기

1. 구글 로그인 상태에서 여행을 연 뒤 **"일행에게 공유"** 클릭
2. 앱이 그 시트를 "링크가 있는 모든 사용자 - 뷰어"로 전환하고 `?share=<스프레드시트ID>` 링크를 생성
3. 링크를 받은 사람은 **로그인 없이** 약 30초 간격으로 갱신되는 읽기 전용 화면을 봄 (🌐로 언어 선택 가능)
4. 위 "2. Google API 키" 설정이 되어 있어야 작동

---

## Android 앱 (Google Play)

일반용 PWA를 [PWABuilder](https://www.pwabuilder.com)로 Android TWA(`.aab`)로 패키징해 등록합니다.

- 패키지 ID: `io.github.statepark62.twa`
- **서명 키(zip)는 최초 생성본을 계속 재사용**해야 합니다 (업데이트 시 필수, 분실 금지)
- **Android 16(API 36) 타겟팅 요건**: 2026-08-31 시행. PWABuilder 기본 패키지가 API 35라 "기한 연장 요청"으로 **2026-11-01까지 유예** 신청함. 그 전에 PWABuilder가 API 36을 지원하면 재패키징 후 새 버전 업로드

### 출시 절차 요약
1. **비공개 테스트(Alpha) 트랙**에 `.aab` 업로드 → 테스터 이메일 목록 등록 → 게시
2. 신규 개인 개발자 계정은 **테스터 12명 이상이 14일 이상 연속 참여**해야 프로덕션 신청 가능 (사업자 계정은 면제)
3. 대시보드에서 프로덕션 액세스 신청 → Google 심사(평균 7일 이내) → 정식 출시

### 테스터 안내 (테스터가 해야 할 일)
1. **개발자가 먼저 테스터의 구글 계정 이메일을 목록에 등록** (Play Console → 비공개 테스트 → 트랙 관리 → 테스터)
2. 테스터가 안드로이드 폰에서 참여 링크를 열고 **같은 구글 계정으로 로그인**: `https://play.google.com/apps/testing/io.github.statepark62.twa`
3. "Become a tester" → Play 스토어에서 설치 → **14일간 삭제하지 않고 유지** (매일 사용할 필요 없음)

> 참여 링크는 `?...&ah=...` 같은 토큰이 붙은 스토어 상세 주소가 아니라, **위의 순수한 `testing/` 링크**를 배포하세요.

---

## 문제 해결

| 증상 / 메시지 | 원인 | 해결 |
|---|---|---|
| 공유 링크에서 "공유 일정을 불러올 수 없어요" (콘솔 403 `API_KEY_HTTP_REFERRER_BLOCKED`) | API 키 웹사이트 제한에 도메인 단독 패턴이 없음 | 제한 목록에 `<사용자명>.github.io/*` 추가 후 최대 5분 대기 |
| 로그인 시 `403 access_denied` / "앱이 테스트 중" | 동의 화면이 테스트 상태이고 그 계정이 테스트 사용자가 아님 | 1-1절 방법으로 게시하거나, 대상 → 테스트 사용자에 이메일 추가 |
| 로그인 시 "Google에서 확인하지 않은 앱" 경고 | 민감 범위(`spreadsheets`)를 요청 중 | 범위를 `drive.file`만 남기고 코드·데이터 액세스 모두 수정 |
| "이 시트의 소유자만 사용할 수 있어요" | 구글 로그인 토큰 만료 또는 다른 계정 | 새로고침 후 같은 계정으로 다시 연결 |
| "PDF·사진 인식은 Google에 연결된 상태에서만…" | 로그인하지 않음 | 상단 "Google 연결" 후 재시도 |
| "Apps Script 응답을 읽지 못했어요" | 배포 URL 오류, 권한 미승인, 액세스 권한이 "모든 사용자"가 아님 | 배포 설정(실행: 나 / 액세스: 모든 사용자) 및 `AI_GAS_URL` 확인 |
| "GEMINI_API_KEY 스크립트 속성이 설정되지 않았어요" | 스크립트 속성 누락 | 이름을 정확히 `GEMINI_API_KEY`로 추가 |
| "Gemini API has not been used in project … or it is disabled" | 스크립트 속성에 **Cloud Console의 다른 키**가 들어감 | AI Studio 키로 교체 (재배포 불필요) |
| "응답이 길이 제한에 걸려 중간에 잘렸을 수 있어요" | 일정이 많아 출력 토큰 초과 | 제작자용 HTML의 `maxOutputTokens`(현재 8192) 상향 |
| `User location is not supported` | (Cloudflare Worker 사용 시) Worker가 홍콩에서 실행 | Apps Script 중계 사용 (현재 구조에서는 발생하지 않음) |
| 새 파일을 올렸는데 화면이 그대로 | 캐시/배포 지연 | 1~2분 후 `Ctrl+Shift+R` (iOS는 Safari 데이터 삭제) |
| Play 링크에서 "App not available" | ① 테스터 목록에 계정 미등록 ② 로그인 계정 불일치 ③ 최초 제출 심사 대기 ④ 국가/지역 미설정 | 게시 개요의 "검토 중인 변경사항" 확인, 시크릿/InPrivate 창에서 테스터 계정으로만 로그인 |
| 같은 PDF를 다시 올렸더니 일정이 두 배 | (구버전) 중복 확인 없음 | 최신 제작자용 파일 사용 (자동 제외) |

---

## 보안 메모

- **공개해도 되는 것**: OAuth 클라이언트 ID, Sheets 읽기 전용 API 키(웹사이트 제한 적용)
- **코드·저장소에 절대 넣지 않는 것**: Gemini 키 (Apps Script 스크립트 속성에만 보관)
- Apps Script 중계는 시트 소유자만 사용 가능(구글 로그인 토큰으로 검증)
- "일행에게 공유"는 시트를 링크 공개로 전환합니다 → **메모에 비밀번호·현금 액수 등 민감정보를 적지 마세요.**

## 알려진 제한 사항

- 브라우저 알림은 탭이 열려 있는 동안만 동작 (진짜 푸시 아님). 캘린더 연동으로 보완 가능
- iOS는 위치 기반 도착 알림 미지원 (아이폰 "미리 알림"의 위치 알림 병행 권장)
- 로그인하지 않은 사용자의 데이터는 기기·브라우저 단위로만 저장되며 기기 간 동기화 불가
- PDF·사진 인식은 제작자 본인(시트 소유자) 전용이며 구글 연결이 필요
- 제작자용 화면은 현재 한국어만 지원
