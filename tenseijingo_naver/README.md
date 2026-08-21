# 天声人語で学ぶ日本語 (천성인어로 배우는 일본어)

아사히신문의 칼럼 「天声人語」를 매일 아침 자동으로 수집하여 ChatGPT가 한국어 학습 콘텐츠로 정돈하고, GitHub Pages에 발행한 뒤 네이버 카페에 자동 게시하는 시스템입니다.

- **발행 주소**: https://statepark62.github.io/tenseijingo_naver/
- **자동 실행**: 매일 한국 시간 07:07, 08:07, 09:07, 11:07 (4중 예약)
- **운영 설정**: `.github/workflows/tenseijingo_naver.yml`

## 시스템 구성

### 매일 아침 작동 순서 (6단계)

1. **저장소 체크아웃** — GitHub Actions 시작
2. **아사히 칼럼 수집** — 최신 천성인어 무료 서두 (최대 600자)
3. **AI 생성** — ChatGPT(gpt-5)가 한국어 학습 콘텐츠 JSON 생성
4. **카드 생성** — 학습 카드 인포그래픽(PNG) + QR 코드
5. **페이지 발행** — 목록 및 상세 페이지 생성, 페이지네이션 적용
6. **카페 게시** — 네이버 「천성인어」 게시판에 자동 게시

### 폴더 구조

```
automation_naver/         # 메인 파이프라인
├── daily.py            # 전체 오케스트레이션
├── prompt.txt          # AI 지시문 (JSON 스키마, 저작권 규칙)
├── template.html       # 일일 학습 페이지 템플릿
├── index_template.html # 목록 페이지 템플릿
├── card_template.html  # 학습 카드 디자인
├── make_card.py        # 카드 생성 (HTML → PNG)
├── card.py             # QR 코드 생성
├── naver.py            # 네이버 카페 게시
├── sample_data.json    # 테스트 샘플
└── README.md           # 이 파일

tenseijingo_naver/      # 출력 폴더 (자동 관리)
├── index.html          # 목록 (최신 10개)
├── page-2.html, ...    # 페이지네이션
├── 2026-08-07.html     # 일일 페이지
├── cards/              # 카드 이미지들
├── archive.json        # 발행 기록
└── README.md           # 출력 폴더 설명
```

## 주요 기능

### 1. 페이지네이션
- **한 페이지 10개 아이템** 표시
- 최신 날짜부터 오래된 순서
- 각 페이지 하단에 "◀ 이전 | 1/3 | 다음 ▶" 네비게이션
- `index.html` (1페이지), `page-2.html`, `page-3.html`...

### 2. 생성 콘텐츠 (AI)
- **요약** 3문장 (일본어 + 한국어 병기)
- **중요 표현** 5개 (단어/구 + 의미 + 예문)
- **문형** 원문에 실제 등장한 것 (최근 7회 중복 회피)
- **해설** 2문단 (시대·문화 배경, 글쓰기 포인트)
- **한 문장** (오늘의 포인트)

### 3. 학습 카드
- 인포그래픽 PNG (1080×~2320px)
- 섹션: 핵심 요약 / 시대·문화적 배경 / 중요 표현 / 문형 / 글쓰기 포인트 / QR 코드
- 매일 자동 생성, 네이버 카페에 이미지 첨부

### 4. 네이버 카페 연동
- 게시판: 「천성인어」 (CLUB_ID=29379858, MENU_ID=6)
- 제목 형식: "천성인어 ○년 ○월 ○일자"
- 본문: 요약 + 한 문장 + 페이지 링크 + 전체 목록 링크
- 카드 이미지 자동 첨부

### 5. ことば帖 단어장 연동
- 매일 단어 5개를 기존 단어장으로 자동 전송
- ID 자동 채번 (tj1, tj2, ... — 뉴스 단어와 구분)
- 시트에 단어 + 읽기 + 뜻 + 레벨 + 예문 + 예문읽기 + 예문뜻 + 등록일 기록

### 6. 방문자 수 표시
- 순 방문자만 집계 (중복 제외, localStorage 기반)
- 목록 페이지 하단에 "지금까지 N명이 방문했습니다"

### 7. 앱 아이콘
- 전통 낙관 배치 (天声 / 人語)
- 주색 도장 디자인 (화지 바탕)
- PWA로 홈 화면에 앱처럼 설치 가능

### 8. 안전장치
- **휴간일 감지**: 새 칼럼이 없으면 조용히 건너뜀
- **중복 방지**: 같은 날 파일이 있으면 재실행 안 함
- **언어 검증**: 한국어 필드에 일본어 섞이면 자동 재생성 (최대 2회)
- **동시 실행 차단**: GitHub concurrency로 중복 게시 방지

## 필요한 GitHub Secrets (10개)

| Name | 내용 |
|---|---|
| OPENAI_API_KEY | ChatGPT API 키 |
| GEMINI_API_KEY | Gemini 예비용 |
| ANTHROPIC_API_KEY | Claude 예비용 |
| NAVER_CLIENT_ID | 네이버 개발자 앱 |
| NAVER_CLIENT_SECRET | 네이버 앱 비밀 |
| NAVER_REFRESH_TOKEN | 네이버 로그인 토큰 |
| NAVER_CAFE_CLUB_ID | 카페 번호 (29379858) |
| NAVER_CAFE_MENU_ID | 게시판 번호 (6) |
| GAS_WORDS_URL | ことば帖 GAS 배포 URL |
| GAS_WORDS_TOKEN | 단어장 전송 토큰 |
| KOTOBA_GAS_URL | ことば帖 앱 방문자 카운터 GAS |

## AI 엔진 선택

yml의 `PROVIDER` 한 단어로 전환:

```yaml
PROVIDER: openai              # ChatGPT (권장, 안정적)
OPENAI_MODEL: gpt-5          # 다국어 지시 준수 우수
```

다른 옵션:
- `PROVIDER: gemini` + `GEMINI_API_KEY` (무료, 언어 이탈 이력)
- `PROVIDER: claude` + `ANTHROPIC_API_KEY` (유료, 예비용)

## 저작권 원칙

- 원문은 무료 공개 서두 600자까지만 입력 사용
- 발행물에는 원문 미재록
- 요약·해설은 AI 재구성
- 원문 인용은 15자 이내 핵심 구절 1개
- 매 페이지에 원문 링크 + 저작권 고지 명시

## 일정 변경 방법

**예약 조정**: `.github/workflows/tenseijingo_naver.yml` → `schedule` 섹션

```yaml
schedule:
  - cron: '7 22 * * *'    # UTC 22:07 = KST 07:07
  - cron: '7 23 * * *'    # KST 08:07 (예비 1)
  - cron: '7 0 * * *'     # KST 09:07 (예비 2)
  - cron: '7 2 * * *'     # KST 11:07 (예비 3)
```

GitHub Actions는 예약 실행에 지연이 있으므로, 다중 예약으로 대비합니다.

## 문제 해결

### 카페에 글이 안 올라왔다
- Actions 로그 → `[6/6] 네이버 카페 게시` 오류 확인
- 토큰 만료: NAVER_REFRESH_TOKEN 재발급 필요

### 페이지가 안 보인다
- 주소 뒤에 `?v=1` 붙여 캐시 우회 (예: `?v=807`)
- Actions → "pages build and deployment" 배포 상태 확인

### 같은 칼럼이 반복된다
- 휴간일이 2일 이상 연속되면 재발행 가능
- 오늘자 재발행: html 삭제 + archive.json 오늘 블록 삭제 + 카페 글 삭제

## 향후 계획

- [ ] 요미가나(후리가나) 전체 적용
- [ ] 분석 대시보드 (방문자 추이, 단어 학습률)
- [ ] 음성 낭독 기능
- [ ] 모바일 앱 등재

---

**최종 업데이트**: 2026-08-07  
**운영자**: 박상태 교수 (GitHub: statepark62)
