# 여행 전광판 (지금 여기)

날짜·시간별 여행 일정을 입력해두면, 지금 이 순간 무엇을 하기로 했는지 실시간으로 보여주는 여행 일정 관리 웹앱입니다. 서버 없이 GitHub Pages + 사용자 개인 Google Sheets만으로 동작합니다.

## 주요 기능

- **실시간 전광판**: 현재 시각 기준 "지금 할 일 / 다음 할 일"을 자동 표시
- **날짜별 일정 관리**: 여행 기간을 날짜 탭으로 나눠 시간대별 일정 CRUD (추가/수정/삭제, 삭제 시 확인창)
- **아침 일정 확인**: 앱을 열면 오늘 등록된 일정을 모아서 보여주는 팝업
- **브라우저 알림**: 일정 시작 10분 전 알림 (탭이 열려있는 동안)
- **Google Sheets 연동**: 구글 로그인 시 사용자 본인 소유의 스프레드시트에 자동 저장·동기화. 날짜/시간순으로 정리된 사람이 읽기 좋은 탭도 함께 생성
- **로컬 저장 폴백**: 로그인하지 않아도 브라우저(localStorage)에 저장되어 새로고침에도 유지
- **지난 여행 목록**: 여행 종료 시 자동으로 초기 화면으로 돌아가되, 과거 여행을 다시 열람 가능
- **일행에게 실시간 공유**: 로그인 없이도 일행이 링크 하나로 지금 여행을 읽기 전용·실시간(약 30초 간격 자동 갱신)으로 볼 수 있음
- **PDF로 내보내기**: 브라우저 인쇄 기능으로 일정표를 PDF/인쇄물로 저장
- **PDF·사진 자동 인식** *(제작자 전용)*: 여행사 PDF나 일정표 사진을 올리면 Claude AI가 날짜·시간·장소를 자동으로 읽어 일정을 생성/추가
- **PWA 지원**: 홈 화면에 추가해 앱처럼 실행 (오프라인 캐싱 포함), Android는 Google Play 배포 진행 중

## 아키텍처

```
사용자 브라우저
   │
   ▼
GitHub Pages (정적 호스팅, 서버 없음)
   ├── /trip-planner/      → 일반 사용자용 (trip-planner-public.html)
   └── /trip-planner-dev/  → 제작자 전용 (trip-live-planner.html, ?dev=1 또는 로컬 저장된 플래그로 활성화)
        │                │                                │
        │ 구글 로그인 시   │ 링크만 열면(로그인 불필요)         │ PDF·사진 인식 시 (제작자 전용)
        ▼                ▼                                ▼
   Google Sheets/Drive   Google Sheets API             Cloudflare Worker
   (사용자 본인 소유,      (공개 API 키로 읽기 전용 조회)    → Anthropic Claude API (claude-sonnet-5)
    쓰기 권한)                                             (API 키는 Worker Secret에만 보관)
```

핵심 설계 원칙: **개발자가 운영하는 서버/DB가 없습니다.** 모든 사용자 데이터는 각자의 Google 계정(Sheets) 또는 각자의 브라우저(localStorage) 안에만 존재합니다. AI 인식 기능만 예외적으로 Cloudflare Worker를 거치며, 이는 제작자(`?dev=1`)만 사용합니다.

## 파일 구성

| 파일 | 용도 |
|---|---|
| `trip-live-planner.html` | 제작자용 전체 소스 (PDF·사진 인식 포함) → `trip-planner-dev/index.html`로 배포 |
| `trip-planner-public.html` | 일반 사용자용 소스 (AI 인식 코드 제거, PWA 적용) → `trip-planner/index.html`로 배포 |
| `manifest.json` | PWA 매니페스트 (일반용에만 필요) |
| `service-worker.js` | 오프라인 캐싱용 서비스워커 (일반용에만 필요) |
| `icon-192.png` / `icon-512.png` | PWA 아이콘 |
| `apple-touch-icon.png` | iOS 홈 화면 추가용 아이콘 (양쪽 폴더 모두 필요) |
| `privacy.html` | 개인정보처리방침 (Google OAuth 심사·Play 스토어 등록에 필요) |
| `feature-graphic.png` | Play 스토어 피처 그래픽 (1024×500) |
| `play-store-listing.txt` | Play 스토어 등록 문구 초안 |

두 HTML 파일은 기능 추가 시 **양쪽 다 동일하게 수정**해야 합니다 (AI 인식 관련 코드 제외).

## 초기 설정 (한 번만)

### 1. Google OAuth (Google Sheets 저장·로그인용)

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. "API 및 서비스 → 라이브러리"에서 **Google Sheets API**, **Google Drive API** 사용 설정
3. "OAuth 동의 화면" 설정 (외부, 테스트 사용자에 본인 이메일 추가)
4. "사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 웹 애플리케이션" 생성
5. **승인된 자바스크립트 원본**: `https://<GitHub 사용자명>.github.io`
6. **승인된 리디렉션 URI**: 실제 배포 경로 각각 등록
   - `https://<사용자명>.github.io/trip-planner/`
   - `https://<사용자명>.github.io/trip-planner-dev/`
7. 발급된 클라이언트 ID를 두 HTML 파일의 `GOOGLE_CLIENT_ID` 상수에 반영

로그인은 팝업이 아닌 **전체 페이지 리디렉션 방식**입니다 (브라우저 팝업 차단을 피하기 위함). `?dev=1` 등 쿼리스트링은 OAuth의 `state` 파라미터에 실어 왕복 후 복원됩니다. 홈 화면 독립실행 앱(iOS)에서는 자동 재연결 리디렉션을 시도하지 않습니다(왕복 도중 멈추는 iOS 특성 때문).

### 2. Google API 키 (일행 공유 보기용, 로그인 불필요)

1. Google Cloud Console → "사용자 인증 정보 → + 사용자 인증 정보 만들기 → API 키"
2. **API 제한사항**: Google Sheets API만 체크
3. **애플리케이션 제한사항**: "웹사이트" 선택 → `https://<사용자명>.github.io/*` 추가
4. 발급된 키를 두 HTML 파일의 `GOOGLE_API_KEY` 상수에 반영

이 키는 "일행에게 공유" 기능에서, 로그인하지 않은 사람이 공개로 전환된 시트를 읽기 전용으로 조회할 때 사용됩니다. OAuth 클라이언트 ID와는 완전히 별개입니다.

### 3. Cloudflare Worker (AI 인식용, 제작자 전용)

1. [Cloudflare 대시보드](https://dash.cloudflare.com) → Workers & Pages → 새 Worker 생성 (Hello World 템플릿, **무료 요금제로 충분**)
2. Worker 코드를 Anthropic API 프록시로 교체 (아래 `worker.js` 참고)
3. Settings → Variables and Secrets → `ANTHROPIC_API_KEY`를 **Secret** 유형으로 등록 (이 프로젝트 전용 키를 새로 발급해 사용 — 다른 프로젝트 키와 공유하면 사용량 제한이 얽혀 원인불명 오류가 날 수 있음)
4. Worker 주소를 `trip-live-planner.html`의 `CLAUDE_PROXY_URL` 상수에 반영

```js
export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = 'https://<사용자명>.github.io';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const body = await request.text();
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });
    const respBody = await upstream.text();
    return new Response(respBody, { status: upstream.status, headers: { ...cors, 'content-type': 'application/json' } });
  },
};
```

일반 사용자에게 AI 기능을 공개할 계획이라면, 남용 방지를 위해 IP당 요청 수 제한을 추가하는 것을 권장합니다.

### 4. GitHub Pages 배포

- 저장소를 **Public**으로 설정
- `trip-planner/index.html`, `trip-planner-dev/index.html` 각각 배포
- PWA 관련 파일(`manifest.json`, `service-worker.js`, 아이콘)은 `trip-planner/` 폴더에만 필요
- `apple-touch-icon.png`는 두 폴더 모두에 필요
- 캐시가 종종 끈질기므로 배포 후 강력 새로고침(Ctrl+Shift+R) 또는 아이폰은 설정 > Safari > 기록 및 웹사이트 데이터 지우기로 확인

## 제작자 모드 (`?dev=1`)

PDF·사진 인식 기능은 API 비용이 발생하므로 제작자만 사용하도록 게이팅되어 있습니다.

- `https://<사용자명>.github.io/trip-planner-dev/?dev=1`로 한 번 접속하면 이 브라우저에 플래그가 저장되어, 이후 `?dev=1` 없이도 계속 유지됩니다
- 홈 화면 독립실행 앱(아이콘)은 **만들 당시 주소에 `?dev=1`이 포함되어 있어야** 합니다

## 일행에게 실시간 공유하기

1. 구글 로그인 상태에서 여행을 연 뒤, 상단 **"일행에게 공유"** 버튼 클릭 (로그인 안 되어 있으면 버튼 자체가 안 보임)
2. 앱이 자동으로 그 여행의 구글 시트를 "링크가 있는 모든 사용자 - 뷰어"로 전환하고, `?share=<스프레드시트ID>` 형태의 링크를 생성
3. 이 링크를 받은 사람은 **로그인 없이** 실시간(약 30초 간격 자동 새로고침) 읽기 전용으로 일정을 볼 수 있음 (수정 불가)
4. 이 기능은 위 "2. Google API 키" 설정이 되어 있어야 작동함

## Android 앱 (Google Play)

일반 사용자용 PWA를 [PWABuilder](https://www.pwabuilder.com)로 감싸 Android TWA(`.aab`)로 패키징해 Google Play Console에 등록 진행 중입니다.

- 패키지 ID: `io.github.statepark62.twa`
- 신규 개인 개발자 계정은 프로덕션 공개 전 **비공개 테스트를 12명 이상 테스터로 14일 이상** 진행해야 합니다 (Google 정책, 사업자 계정은 면제) — 현재 테스터 모집 진행 중
- **Android 16(API 36) 타겟팅 요건**: 2026년 8월 31일부터 시행되는 정책으로, 이 시점 기준 PWABuilder 기본 생성 패키지는 API 35라 미달. Play Console의 "기한 연장 요청"으로 2026년 11월 1일까지 유예 신청함. 그 전에 PWABuilder가 API 36 지원을 패치하면 재패키징 후 새 버전 업로드 필요
- 서명 키(zip)는 최초 생성 시 받은 것을 계속 재사용해야 합니다 (업데이트 시 필수)

## 알려진 제한 사항

- 브라우저 알림은 탭이 열려있는 동안만 동작 (진짜 푸시 알림 아님)
- iOS는 위치 기반 도착 알림 미지원 (필요 시 아이폰 "미리 알림" 앱의 위치 알림 기능과 병행 권장)
- 로그인하지 않은 사용자의 데이터는 기기·브라우저 단위로만 저장되며 기기 간 동기화 불가
- "일행에게 공유" 링크는 읽기 전용이며, 시트가 공개로 전환되므로 URL(스프레드시트 ID)을 아는 사람은 누구나 열람 가능 — 민감한 개인정보를 메모에 적지 않도록 주의
