# 天声人語로 배우는 일본어 — 자동 발행 시스템

아사히신문 칼럼 '천성인어(天声人語)'의 무료 공개 서두를 매일 아침 수집하여,
AI가 한국어 요약·단어장·문형 해설을 만들고, GitHub Pages에 학습 페이지로
자동 발행하는 시스템입니다.

## 폴더 구조

```
(저장소 루트)
├── automation/
│   ├── daily.py             # 전체 파이프라인 (크롤링→AI→렌더링→목록)
│   ├── prompt.txt           # AI 프롬프트 (JSON 전용 출력 강제)
│   ├── template.html        # 일일 페이지 디자인 템플릿
│   ├── index_template.html  # 전체 목록 페이지 템플릿
│   └── sample_data.json     # 테스트용 샘플 데이터
├── tenseijingo/             # 발행 결과 (공개 폴더)
│   ├── index.html           # 전체 목록 (자동 생성)
│   ├── archive.json         # 목록 데이터 (자동 누적)
│   └── YYYY-MM-DD.html      # 일일 페이지 (자동 생성)
├── .github/workflows/tenseijingo.yml   # 매일 07:30 KST 자동 실행
└── requirements.txt
```

## 설치 절차 (최초 1회)

### 1. 로컬 테스트 (네트워크·API 키 불필요)

```bash
pip install -r requirements.txt
python automation/daily.py --sample
```

`tenseijingo/2026-07-08.html`과 `index.html`이 생기면 브라우저로 열어
디자인을 확인하세요.

### 2. API 키 발급 (둘 중 하나)

- **Gemini (무료, 기본값)**: https://aistudio.google.com 에서 API 키 발급
- **Claude**: https://console.anthropic.com 에서 API 키 발급
  (모델·요금은 https://docs.claude.com 참고)

### 3. 크롤링 선택자 확인 ← 가장 중요

`daily.py` 상단의 `LINK_SELECTOR_CANDIDATES`, `BODY_SELECTOR_CANDIDATES`는
후보값입니다. 아사히신문 페이지 구조에 맞는지 최초 1회 확인이 필요합니다.

1. 브라우저에서 https://www.asahi.com/rensai/list.html?id=61 접속
2. F12(개발자 도구) → 최신 기사 링크와 본문 문단의 태그/클래스 확인
3. 실제 구조에 맞게 후보 목록의 첫 항목을 수정

로컬에서 실제 실행으로 검증:

```bash
# 환경 변수 설정 후 (Windows는 set, mac/Linux는 export)
export GEMINI_API_KEY=발급받은키
python automation/daily.py
```

### 4. GitHub 배포

1. 이 폴더 전체를 GitHub Pages 저장소에 커밋·푸시
2. 저장소 Settings → Secrets and variables → Actions →
   `GEMINI_API_KEY` (또는 `ANTHROPIC_API_KEY`) 등록
3. Actions 탭 → "Tenseijingo Daily" → **Run workflow** 버튼으로 수동 1회 실행
4. 성공하면 `https://<계정>.github.io/<저장소>/tenseijingo/` 에서 확인

이후에는 매일 아침 07:30(KST)에 자동 실행됩니다.

## 운영 참고

- **회차 계산**: `daily.py`의 `START_DATE`가 第1回 기준일입니다.
  실제 연재 시작일로 바꿔 주세요.
- **중복 방지**: 오늘자 파일이 이미 있으면 스크립트가 그냥 종료합니다.
  수동 재실행 시 해당 날짜 html을 지우고 실행하세요.
- **실패 알림**: Actions 실패 시 GitHub이 저장소 소유자에게 이메일을 보냅니다.
  실패 원인은 대부분 (a) 사이트 구조 변경 → 선택자 수정,
  (b) API 키 만료/한도 → 키 확인, 둘 중 하나입니다.
- **AI 교체**: 워크플로의 `PROVIDER`를 `claude`로 바꾸면 Claude API를 사용합니다.
  모델명은 환경 변수 `GEMINI_MODEL` / `CLAUDE_MODEL`로 변경 가능합니다.

## 저작권 원칙

- 원문은 무료 공개 서두만, 최대 600자까지만 AI 입력에 사용합니다.
- 발행 페이지에는 원문을 싣지 않습니다. 요약은 재구성문, 예문은 AI가
  새로 작성한 문장만 게재하며, 매 페이지에 원문 링크와 저작권 고지를 명시합니다.
