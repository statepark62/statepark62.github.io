# 생활 일본어 표현 자동 추출 파이프라인

> GitHub 저장소 이름: **YouTubeJapannes**

유튜브 URL(영상 또는 채널)에서 일본어 자동생성 자막을 가져와,
교과서에 잘 안 나오는 생활 회화 표현을 자동으로 뽑아
Google Sheets에 쌓아주는 파이프라인입니다.

ことば帖(단어장 중심)와는 별개 프로젝트이며, 표현/문형 중심으로 운영합니다.

## 동작 방식

1. **URL을 입력**하면 (`run_single_url.py`) 그 자리에서 처리하고,
   동시에 그 URL을 시트의 `sources` 탭에 **목록으로 저장**합니다.
2. 다음부터는 **저장된 목록 전체**를 `run_saved_sources.py`로
   한 번에 갱신할 수 있습니다 — 매주 GitHub Actions가 자동으로
   이 스크립트를 실행합니다.
3. 즉, 한 번 넣어둔 채널/영상 URL은 계속 목록에 남아 있고,
   새로운 URL을 추가하고 싶을 때만 `run_single_url.py`를 다시 실행하면
   목록에 하나 더 추가됩니다.

## 왜 자동자막만 쓰는가

일부 채널(예: Bite size Japanese)은 정식 트랜스크립트를 Patreon
유료 멤버십으로만 제공합니다. 이 파이프라인은 그런 유료 콘텐츠를
절대 사용하지 않고, YouTube가 영상 시청자 누구에게나 공개하는
자동생성 자막(auto-caption)만 사용합니다.

## 처음 설정하는 방법

### 1. Google Sheets 문서 새로 만들기
1. 새 Google Sheets 문서를 만듭니다 (탭은 스크립트가 자동으로 생성합니다).
2. 문서 URL에서 `/d/`와 `/edit` 사이 문자열이 시트 ID입니다.
   예: `https://docs.google.com/spreadsheets/d/`**`1AbCdEfG...`**`/edit`

### 2. Google 서비스 계정 만들기
1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. "Google Sheets API" 활성화
3. 서비스 계정 생성 → JSON 키 다운로드
4. 다운로드한 JSON 안의 `client_email` 값을, 1번에서 만든 시트의
   "공유" 설정에 **편집자**로 추가

### 3. OpenAI API 키 준비
GPT-5를 호출할 OpenAI API 키를 발급받습니다.

### 4. GitHub Secrets 등록
저장소 Settings → Secrets and variables → Actions 에서 아래 3개를 등록:

| Secret 이름 | 값 |
|---|---|
| `BSJ_SHEET_ID` | 1번에서 확인한 시트 ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 2번에서 받은 JSON 파일 전체 내용 (그대로 붙여넣기) |
| `OPENAI_API_KEY` | 3번에서 발급받은 키 |

## 첫 화면 (GitHub Pages 대시보드)

`site/index.html`이 쌓인 표현을 보여주는 첫 화면입니다. 검색과 카드 목록이 있고,
매주 자동으로 갱신된 시트 내용을 그대로 반영합니다.

**연결 방법**
1. Google Sheets에서 `expressions` 탭을 엽니다.
2. 파일 → 공유 → 웹에 게시 → 이 시트만 게시할 탭을 `expressions`로 선택,
   형식을 **쉼표로 구분된 값(.csv)**으로 선택 → 게시.
3. 발행된 CSV URL을 복사해서, `site/index.html` 안의
   `CONFIG.SHEET_CSV_URL`에 붙여넣습니다.
4. GitHub 저장소 Settings → Pages → Source를 `main` 브랜치의 `/site` 폴더로
   설정하면, `https://<사용자명>.github.io/YouTubeJapannes/`로 접속할 수
   있습니다.

시트를 "웹에 게시"하면 링크를 아는 사람은 누구나 그 탭의 내용을 볼 수
있습니다. 개인 학습 표현이라 공개돼도 문제없는 내용인지 한 번 확인하시고
진행해주세요.



### 로컬에서 URL 하나 처리 + 목록에 등록
```bash
pip install -r requirements.txt

export BSJ_SHEET_ID="시트ID"
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
export OPENAI_API_KEY="sk-..."

# 영상 하나만
python run_single_url.py "https://www.youtube.com/watch?v=XXXXXXXX"

# 채널이나 재생목록의 최근 5개, 목록에 별명도 같이 저장
python run_single_url.py "https://www.youtube.com/channel/UCxxxxxxxx" --limit 5 --label "Bite size Japanese"

# 이미 처리한 영상도 강제로 다시 처리
python run_single_url.py "https://www.youtube.com/watch?v=XXXXXXXX" --force
```

### 저장해둔 목록 전체 한 번에 갱신
```bash
python run_saved_sources.py
```
- `sources` 탭에 등록된 모든 URL을 돌면서 신규 영상만 처리합니다.
- 처음 실행 시 목록이 비어 있으면 기본값으로 Bite size Japanese 채널이
  자동 등록됩니다.
- 특정 소스를 잠깐 빼고 싶으면, 시트에서 그 행의 `active`를
  `FALSE`로 바꾸면 됩니다 (행을 지울 필요 없음).

### GitHub Actions에서 실행
- **매주 월요일 낮 12시(한국시간)**: `run_saved_sources.py`가 자동 실행되어
  등록된 목록 전체를 갱신합니다.
- **수동 URL 추출**: Actions 탭 → "Bite size Japanese - URL 지정 수동 추출" →
  "Run workflow" → URL/개수/별명 입력 → 실행. 처리와 동시에 목록에도 저장됩니다.

## 결과 시트 구조

**sources 탭** — 등록된 URL 목록
| url | label | limit | added_at | active |

**expressions 탭** — 추출된 생활 표현
| date_added | video_id | video_title | video_url | expression | meaning_ko | example_sentence | nuance_note |

**processed_videos 탭** (내부 상태 기록용, 수정하지 마세요)
| video_id | video_title | processed_at |

## 파일 구성
```
config.py               # 기본 채널 정보, 시트 탭 이름 등 설정
pipeline_core.py         # 영상 목록 조회, 자막 다운로드, 추출·적재 공통 로직
clean_vtt.py             # VTT 자막 정제
extract_expressions.py   # GPT-5로 생활 표현 추출
sheets_client.py         # Google Sheets 읽기/쓰기 (sources/expressions/processed_videos)
run_single_url.py        # URL 하나 즉시 처리 + 목록(sources)에 등록
run_saved_sources.py     # 등록된 목록 전체를 한 번에 갱신 (주간 자동 실행 대상)
site/index.html          # GitHub Pages 첫 화면 (표현 목록 대시보드)
.github/workflows/       # GitHub Actions: 주간 자동 실행 + 수동 URL 실행
```

## 다음에 조정할 만한 것들
- 실행 주기: 현재 주 1회 → 매일로 바꾸려면 `weekly-YouTubeJapannes.yml`의 cron 값만 수정
- 추출 개수(대본당 최대 8개): `extract_expressions.py`의 프롬프트에서 조정
- 소스별로 다른 처리 개수(`limit`)를 두고 싶으면, `sources` 탭에서 해당 행의
  `limit` 값을 직접 수정하면 다음 실행부터 반영됩니다.
