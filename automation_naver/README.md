# 天声人語 자동 발행 시스템 (automation_naver)

아사히신문 칼럼 '천성인어(天声人語)'의 무료 공개 서두를 매일 아침 수집하여,
AI(ChatGPT)가 한국어 학습 콘텐츠로 정돈하고, GitHub Pages에 학습 페이지와
인포그래픽 카드를 발행한 뒤, 네이버 카페 '천성인어' 게시판에 자동 게시하는
시스템입니다.

- 발행 페이지: https://statepark62.github.io/tenseijingo_naver/
- 자동 실행: 매일 한국 시간 07:37 (누락 대비 09:37, 12:37 예비 실행)
- 실행 설정: `.github/workflows/tenseijingo_naver.yml`

## 매일 아침의 작동 순서

1. 아사히신문 천성인어 최신 칼럼의 무료 서두 수집 (최대 600자)
2. AI가 JSON 형식으로 콘텐츠 생성 — 요약 3문장, 중요 표현 5, 문형,
   한국어 해설 2문단, 시대·문화 배경, 글쓰기 포인트, 오늘의 한 문장,
   출판 메모(비공개)
3. 인포그래픽 학습 카드(PNG) 생성 → `tenseijingo_naver/cards/`
4. 학습 페이지(HTML) 생성 → `tenseijingo_naver/날짜.html`
5. 전체 목록(index.html)과 기록(archive.json) 갱신
6. 네이버 카페에 게시 — 제목 "천성인어 ○년 ○월 ○일자", 카드 이미지 첨부

카드 생성이나 카페 게시가 실패해도 페이지 발행은 계속 진행됩니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| daily.py | 전체 파이프라인 (수집→AI→카드→페이지→목록→카페) |
| prompt.txt | AI 지시문 (JSON 스키마, 한국어 강제, 저작권 규칙) |
| template.html | 일일 학습 페이지 디자인 |
| index_template.html | 전체 목록 페이지 디자인 |
| card_template.html | 학습 카드 디자인 |
| make_card.py | 카드 생성 (HTML → PNG 스크린샷) |
| card.py | QR 코드 생성 |
| naver.py | 네이버 토큰 갱신·카페 글쓰기 |
| sample_data.json | 테스트용 샘플 데이터 |

로컬 테스트: `python automation_naver/daily.py --sample`
(API 키·네트워크 없이 렌더링만 확인, 카페 게시는 건너뜀)

## 필요한 GitHub Secrets (7개)

| Name | 내용 |
|---|---|
| OPENAI_API_KEY | ChatGPT API 키 (현재 사용 중인 엔진) |
| GEMINI_API_KEY | Gemini 키 (예비 — PROVIDER 전환 시) |
| NAVER_CLIENT_ID / NAVER_CLIENT_SECRET | 네이버 개발자 센터 앱 |
| NAVER_REFRESH_TOKEN | 네이버 로그인 인증 토큰 |
| NAVER_CAFE_CLUB_ID / NAVER_CAFE_MENU_ID | 카페·게시판 번호 |

AI 엔진 교체: yml의 `PROVIDER`를 gemini / claude / openai 중 하나로 변경.
모델 지정: env에 `OPENAI_MODEL`(기본 gpt-5-mini), `CLAUDE_MODEL`,
`GEMINI_MODEL` 추가.

## 자동 대응 기능

- **휴간일**: 새 칼럼이 없으면(전날과 같은 기사면) 그날은 조용히 건너뜀
- **중복 방지**: 오늘자 파일이 이미 있으면 아무것도 하지 않고 종료
- **언어 검증**: 한국어 필드에 일본어가 섞이면 자동 재생성, 반복 시 발행 중단
- **예약 누락 대비**: 하루 3회 예약으로 GitHub 지연·누락 자동 복구

## 자주 하는 작업

**오늘자를 다시 만들고 싶을 때** (형식 수정 후 재발행 등):
1. `tenseijingo_naver/오늘날짜.html` 삭제
2. `tenseijingo_naver/archive.json`에서 오늘 날짜 블록 삭제
   (또는 초기라면 archive.json 통째 삭제)
3. Actions → Tenseijingo Naver → Run workflow

**주의**: `tenseijingo_naver` 폴더는 프로그램이 관리하는 출력 폴더입니다.
사람이 파일을 넣으면 "이미 발행됨"으로 오판하니 손대지 마세요.
(위의 재발행용 삭제만 예외)

**출판 메모 보기**: `tenseijingo_naver/archive.json`의 각 날짜 항목에
`memo` 필드로 축적됩니다. 페이지에는 표시되지 않습니다.

## 문제가 생겼을 때

Actions에서 빨간 X → 실행 항목 → publish → 각 단계를 펼쳐 오류 확인.

- **본문/링크를 찾지 못했습니다**: 아사히 사이트 구조 변경.
  daily.py 상단의 SELECTOR 후보 목록을 실제 페이지(F12) 구조에 맞게 수정
- **HTTP 401 (카페)**: 네이버 토큰 만료 → NAVER_SETUP.md 절차로 재발급
- **HTTP 404 (카페)**: 클럽/메뉴 번호 확인
- **exit code 127**: requirements.txt가 구버전 → requests,
  beautifulsoup4, playwright 세 줄인지 확인
- **실행이 안 됨**: 예약 누락(GitHub 특성) → 수동 Run workflow 또는
  다음 예비 시각 대기

## 저작권 원칙

원문은 무료 공개 서두 600자까지만 AI 입력에 사용하고, 발행물에는
원문을 싣지 않습니다. 요약·해설은 재구성문, 예문은 새로 작성한 문장,
원문 인용은 15자 이내 핵심 구절 하나로 제한하며, 매 페이지에 원문
링크와 저작권 고지를 명시합니다.
