# 天声人語で学ぶ日本語 — 자동 발행 시스템 (tenseijingo_naver)

아사히신문 「天声人語」의 **무료 공개분**을 매일 아침 가져와서, AI가 한국어 학습 콘텐츠로 정리하고, 웹페이지·학습 카드·네이버 카페·Threads·단어장 시트까지 자동으로 발행하는 파이프라인입니다.

- 공개 주소: https://statepark62.github.io/tenseijingo_naver/
- 저장소: `statepark62/statepark62.github.io`
- 운영: GitHub Actions (워크플로 이름 `Tenseijingo Naver`)

---

## 1. 하루 동안 일어나는 일

```
GitHub Actions 실행 (매일 아침, KST)
 │
 ├─ [1] 천성인어 무료 서두 수집            daily.py  (fetch_article)
 ├─ [2] AI 요약·단어장·문형 생성            daily.py  (call_ai, OpenAI gpt-5, 실패 시 3회 재시도)
 ├─ [3] 학습 카드 이미지(PNG) 생성          make_card.py + card_template.html
 ├─ [4] 날짜별 HTML 페이지 생성             template.html → tenseijingo_naver/YYYY-MM-DD.html
 ├─ [5] 목록(달력) 페이지 갱신              index_template.html → tenseijingo_naver/index.html
 ├─ [6] 네이버 카페 게시                    naver.py
 ├─ [+] 단어장 시트 전송 / 문형 탭 전송      Apps Script
 ├─ Threads 요약 게시                       scripts/threads/tenseijingo_to_threads.py
 ├─ PWA 단어 동기화 (시트 → kotoba/words.json)   sync_words.py
 ├─ 커밋·푸시
 └─ GitHub Pages 배포 트리거                deploy-pages.yml
```

- 이미 오늘자 페이지가 있으면 생성 단계는 건너뜁니다(중복 발행 방지).
- 이미 발행한 칼럼 주소와 같으면 휴간일로 보고 건너뜁니다.
- 원문은 저작권 보호를 위해 **무료 공개분만, 최대 600자**만 사용합니다. 요약·예문·해설은 학습용으로 새로 작성한 것입니다.

---

## 2. 폴더 구조

```
automation_naver/
├─ daily.py               메인 스크립트 (수집 → AI → 페이지 → 카페 → 시트)
├─ prompt.txt             AI 지시문 + 출력 JSON 스키마 (후리가나 규칙 포함)
├─ template.html          날짜별 학습 페이지 템플릿
├─ index_template.html    목록(달력형, 월별 넘김) 템플릿
├─ card_template.html     학습 카드 이미지 템플릿
├─ make_card.py           카드 PNG 렌더링 (Playwright)
├─ naver.py               네이버 카페 게시
├─ sync_words.py          시트 → kotoba/words.json 동기화
├─ rebuild_index.py       archive.json으로 index.html만 다시 생성
├─ widen_old_pages.py     예전 페이지의 본문 폭을 한 번에 넓히는 일회성 도구
└─ scripts/threads/       Threads 게시 스크립트, last_posted_date.txt (중복 방지)

tenseijingo_naver/        ← 공개 출력 폴더 (자동 생성, 커밋됨)
├─ index.html
├─ YYYY-MM-DD.html        날짜별 학습 페이지
├─ cards/YYYY-MM-DD.png   학습 카드
└─ archive.json           누적 기록 (달력 생성의 원천 데이터)

.github/workflows/
├─ tenseijingo_naver.yml  발행 워크플로
└─ deploy-pages.yml       Pages 배포 (API 키 치환 포함 — 수정 금지)
```

---

## 3. 스케줄과 수동 실행

정기 실행(UTC 기준 cron, KST = UTC+9):

| 한국 시간 | 용도 |
|---|---|
| 06:07 | 1차 |
| 07:07 | 예비 1 |
| 08:07 | 예비 2 |
| 10:07 | 예비 3 |

예비 시각은 앞선 실행이 실패했을 때를 대비한 것이며, 성공한 날은 자동으로 건너뜁니다.

### 수동 실행
Actions → `Tenseijingo Naver` → `Run workflow`

### 빠진 날짜 보충 발행
입력칸을 채워서 실행하면 과거 날짜분을 만듭니다.

| 입력칸 | 설명 |
|---|---|
| `target_date` | 보충할 날짜 (예: `2026-10-29`) |
| `article_url` | 그 날짜 칼럼의 아사히 기사 주소 (**필수**) |
| `post_cafe` | 네이버 카페에도 게시할지 (`true`/`false`, 기본 `false`) |

- 세 칸을 모두 비우면 오늘자 정상 발행입니다.
- 보충 발행은 Threads에 게시하지 않고, 카페는 `post_cafe=true`일 때만 게시합니다.
- 날짜별 페이지, 카드, 달력(`archive.json`), 단어장·문형 탭은 정상적으로 반영됩니다.

---

## 4. 필요한 Secrets (저장소 Settings → Secrets and variables → Actions)

| 이름 | 용도 |
|---|---|
| `OPENAI_API_KEY` | AI 생성 (기본 provider) |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | 대체 provider용 (`PROVIDER` 환경변수로 전환) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REFRESH_TOKEN` | 네이버 카페 API |
| `NAVER_CAFE_CLUB_ID`, `NAVER_CAFE_MENU_ID` | 게시할 카페·게시판 |
| `GAS_WORDS_URL`, `GAS_WORDS_TOKEN` | Apps Script 웹앱 주소·비밀값 (단어장·문형 전송, PWA 동기화) |
| `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` | Threads 게시 |
| `GOOGLE_API_KEY` | `deploy-pages.yml`이 여행 앱 파일의 `__GOOGLE_API_KEY__`를 치환할 때 사용 |

> 비밀값은 코드나 이 문서에 직접 적지 말고 Secrets에만 보관하세요.

---

## 5. 구글 시트 (일본어 단어장)와 Apps Script

시트 하나(`일본어 단어장`)를 Apps Script 웹앱(`Code.gs` v2.5)이 관리합니다.

| 탭 | 내용 | 기록 주체 |
|---|---|---|
| `단어장` | 천성인어 단어 5개씩 (id `tj1`, `tj2`…), N1·N2 월간 비율 상한 15% | `daily.py` → `doPost` (id 자동채번 모드) |
| `천성인어 문형` | 하루 1줄: 문형·설명·예문·글쓰기 포인트 3개·오늘의 한마디 (날짜 기준 중복 제거, 탭 자동 생성) | `daily.py` → `doPost` (일반 모드) |
| `접속기록` | 시각·방문자ID(익명 8자)·신규/재방문·페이지·기기·유입경로 | 웹페이지 → `doGet?action=log` |
| `피드백` | 시각·방문자ID·페이지·기기·의견 (새 의견은 메일 알림) | 목록 페이지 `의견 보내기` → `doGet?action=feedback` |

웹앱이 받는 요청:
- `doPost` — `secret` 필요. 단어·문형 저장.
- `doGet?action=log` / `action=feedback` — 비밀값 불필요(방문자 브라우저가 호출). 길이 제한과 30초 연속 전송 차단 적용.
- `doGet?action=export&secret=…` — 단어장 전체를 PWA용 JSON으로 내보내기.

### Apps Script 수정 후 반드시
**배포 → 배포 관리 → 연필 → 버전 "새 버전" → 배포**
(그냥 저장만 하면 웹앱에는 반영되지 않습니다. 웹앱 주소가 바뀌면 `index_template.html`, `template.html`의 `GAS_URL`도 함께 바꿔야 합니다.)

메일 알림을 처음 쓸 때는 편집기에서 `tjAuthorizeMail` 함수를 한 번 실행해 권한을 승인해야 합니다.

---

## 6. 화면 구성

### 목록 페이지 (`index.html`)
- 달력형, **한 번에 한 달만 표시** (이전 달 / 다음 달 / 월 선택, 주소 `#YYYY-MM`로 월 기억).
- 날짜 칸에 일본어 제목(후리가나 포함)과 한국어 제목 병기.
- 모바일(560px 이하)은 최신 날짜가 위로 오는 목록형, 글자 확대.
- 맨 아래 `의견 보내기 ✎`, 방문자 수 문구 영역.

### 날짜별 페이지 (`YYYY-MM-DD.html`)
요약 · 단어 5개 · 오늘의 문형 · 해설 · 배경 · 글쓰기 포인트 · 오늘의 한마디. 본문 폭 1180px. 모든 일본어 한자에 `<ruby>` 후리가나.

---

## 7. 자주 하는 작업

| 상황 | 방법 |
|---|---|
| 목록 디자인만 바꿨다 | `index_template.html` 수정·커밋 → 워크플로 실행(또는 `python automation_naver/rebuild_index.py`) |
| 날짜별 페이지 디자인을 바꿨다 | `template.html`은 새로 만드는 페이지부터 적용. 예전 페이지는 별도 일괄 변환 필요 (`widen_old_pages.py` 참고) |
| AI 지시문을 바꿨다 | `prompt.txt` 수정 (후리가나 규칙, JSON 스키마 포함) |
| 특정 날짜가 빠졌다 | §3의 보충 발행 |
| 로컬에서 렌더링만 시험 | `python automation_naver/daily.py --sample` (`sample_data.json` 필요, 네트워크·AI·카페 게시 생략) |

> 워크플로의 `(임시) index.html 강제 재생성` 단계는 템플릿만 바뀐 날을 위한 것입니다. 남겨 두어도 무방합니다(1초 미만).

---

## 8. 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| `ReadTimeout … api.openai.com` | OpenAI 응답 지연(일시적). 현재 300초 대기·최대 3회 재시도. 그래도 실패하면 예비 실행이 다시 시도하며, 모두 실패하면 §3 보충 발행 |
| 페이지가 안 바뀐다 | Actions 성공 여부와 `Deploy to GitHub Pages` 성공 여부 확인. GITHUB_TOKEN으로 한 push는 다른 워크플로를 깨우지 못해, 워크플로 끝에서 `gh workflow run deploy-pages.yml`을 직접 실행합니다 |
| 시트에 접속기록이 안 생긴다 | 웹앱 주소 + `?action=log` 로 열어 `{"ok":false,"error":"no_uid"}`가 나오는지 확인. 새 버전 배포 여부와 `GAS_URL` 일치 여부 확인 |
| `요청한 파일이 없습니다` | 배포가 삭제되었거나 주소가 틀림. 배포 관리에서 현재 웹앱 URL 확인 |
| 메일 알림이 안 온다 | `tjAuthorizeMail` 권한 승인 여부, 스팸함 확인 (시트 기록은 메일과 무관하게 저장됨) |
| 카드 이미지가 비어 보인다 | 워크플로의 `fonts-noto-cjk` 설치 단계 확인 (카드 생성 실패해도 발행은 계속됨) |
| 일본어 한자에 후리가나가 없다 | AI 응답 문제. `esc_ruby()`는 태그 짝이 맞지 않으면 후리가나를 제거해 페이지가 깨지는 것을 막습니다. 반복되면 `prompt.txt` 점검 |

---

## 9. 설계 메모

- **후리가나**: `<ruby>漢字<rt>よみ</rt></ruby>`. HTML 출력은 `esc_ruby()`(ruby/rt 태그만 복원), 카페 본문 등 순수 텍스트는 `strip_ruby()`로 후리가나 제거.
- **개인정보**: 접속기록은 기기별 익명 ID(앞 8자)만 저장하며 구글 계정·이름·이메일은 저장하지 않습니다.
- **Pages 배포**: 저장소 Pages 소스는 "GitHub Actions"입니다. 지도 API 키 노출을 막기 위해 `deploy-pages.yml`이 배포 시점에 키를 치환하므로 이 설정과 워크플로를 바꾸지 마세요.
- **시간**: 모든 날짜는 한국 시간(KST) 기준입니다. 회차 번호(第N回)는 화면에 표시하지 않습니다.
