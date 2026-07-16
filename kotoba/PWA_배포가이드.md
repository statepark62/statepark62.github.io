# ことば帖 PWA 배포 가이드

GAS 버전과 별개로 운영되는 **불특정 다수 배포용** 버전입니다.
로그인 불필요 · 진도는 각 기기에 저장(백업/복원 지원) · 단어는 저장소의 `words.json`에서 자동 공급.

## 1. 패키지 구성 (kotoba-pwa.zip)

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 본체 (자동학습/퀴즈/복습/단어장 + 백업·복원) |
| `manifest.json` | 앱 이름·아이콘·전체화면 설정 |
| `sw.js` | 오프라인 캐시 (Service Worker) |
| `words.json` | 단어 데이터 100개 (N5~N1 각 20) — 매일 자동으로 늘어남 |
| `icon-B-48/180/192/512.png` | 아이콘 (이번엔 iPhone에도 제대로 적용됩니다) |

## 2. 업로드 (5분)

1. 저장소(statepark62.github.io)에 **`kotoba` 폴더**를 만들고 zip 안의 8개 파일을 전부 넣어 커밋
2. 1~2분 후 접속 확인: `https://statepark62.github.io/kotoba/`
3. 이 주소가 회원들에게 공유할 링크입니다

※ 반드시 이 8개가 **같은 폴더**에 있어야 합니다 (manifest·sw.js·아이콘을 상대 경로로 참조).

## 3. 천성인어 단어 자동 공급 — daily.py 추가분

GAS 전송(send_words_to_gas)과 **별개로 병행**됩니다. `automation_naver/daily.py`에 아래 함수를 `send_words_to_gas` 근처에 추가:

```python
# ══════════════════════════════════════════════════════════
# 추가: 오늘의 단어를 PWA용 words.json에도 반영 (저장소 커밋으로 배포됨)
# ══════════════════════════════════════════════════════════
def update_words_json(data):
    import json, time
    path = "kotoba/words.json"
    try:
        with open(path, encoding="utf-8") as f:
            words = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        words = []
    existing = {(w.get("word",""), w.get("reading",""), w.get("example","")) for w in words}
    ts = int(time.time() * 1000)
    added = 0
    for i, v in enumerate(data.get("vocab", [])[:5]):
        entry = {
            "id": f"tj{ts}_{i}",
            "word": v.get("word", ""),
            "reading": v.get("reading", ""),
            "meaning": v.get("meaning_ko", ""),
            "level": v.get("level", "N3"),
            "example": v.get("example_ja", ""),
            "exampleReading": v.get("example_reading", ""),
            "exampleMeaning": v.get("example_ko", ""),
        }
        key = (entry["word"], entry["reading"], entry["example"])
        if not entry["word"] or not entry["reading"] or key in existing:
            continue
        words.append(entry)
        existing.add(key)
        added += 1
    with open(path, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    print(f"      words.json 갱신: 추가 {added}개 (총 {len(words)}개)")
```

호출부 — `main()`의 단어장 전송 블록에 한 줄 추가:

```python
    print("[추가] ことば帖 단어장 전송 중...")
    if sample_mode:
        print("      샘플 모드 — 전송 생략")
    else:
        try:
            send_words_to_gas(data)
        except Exception as e:
            print(f"      단어장 전송 실패 (발행은 정상 완료됨): {e}")
        try:
            update_words_json(data)          # ← 이 줄 추가 (PWA용)
        except Exception as e:
            print(f"      words.json 갱신 실패: {e}")
```

**확인할 것 하나**: 워크플로의 커밋 스텝이 `kotoba/words.json`을 포함해서 커밋하는지. `git add -A` 또는 `git add .` 방식이면 자동으로 포함되고, 특정 경로만 add하는 방식이면 `git add kotoba/words.json`을 추가하세요.

중복 판정은 GAS와 동일하게 **단어+읽기+예문**입니다. 이렇게 하면 GAS 버전(멤버용)과 PWA 버전(공개용)이 매일 아침 같은 단어를 각자 공급받습니다.

## 4. 앱 수정 시 반영 규칙 (중요)

Service Worker가 앱을 캐시하므로, **index.html을 수정해 올릴 때는 `sw.js`의 첫 줄 버전을 반드시 올려야** 합니다:

```javascript
const CACHE = 'kotoba-v1';   →   'kotoba-v2'
```

이걸 잊으면 GAS 때 겪은 "수정했는데 옛 화면" 문제가 재현됩니다. `words.json`은 예외 — 네트워크 우선이라 버전 변경 없이 매일 자동 갱신됩니다.

## 5. 사용자 경험 (GAS 버전과의 차이)

- **설치**: 로그인·권한 승인 전혀 없음. Android는 Chrome이 "홈 화면에 추가/앱 설치"를 자동 제안, iPhone은 Safari 공유 → 홈 화면에 추가
- **아이콘**: 이번엔 iPhone에도 B 시안 아이콘이 정식으로 적용됩니다 (apple-touch-icon을 우리가 직접 제어)
- **오프라인**: 한 번 접속한 뒤에는 지하철 등 오프라인에서도 작동
- **진도**: 이 기기 안에만 저장. 단어장 탭 하단의 **내보내기/가져오기**로 백업·이사. 기록이 쌓였는데 2주 이상 백업이 없으면 상단에 알림 배너 표시
- **단어장 탭**: 직접 추가한 단어(내 단어)는 수정·삭제 가능, 공용 단어는 "숨기기"(본인 화면에서만)
- 기존 설치가이드·사용설명서 HTML은 GAS 버전 기준(구글 로그인 절차)이므로, PWA 배포 시에는 해당 절 수정이 필요합니다 — 요청 주시면 PWA판으로 고쳐 드립니다

## 6. 테스트 체크리스트

1. PC Chrome에서 `https://statepark62.github.io/kotoba/` 접속 → 100개 단어 로드, 4개 탭 작동
2. F12 → Application 탭 → Manifest·Service Workers 항목에 오류 없음
3. 주소창 오른쪽에 설치 아이콘(⊕) 표시 → 설치하면 독립 창으로 열림
4. 퀴즈 몇 개 푼 뒤 **진도 내보내기** → 파일 다운로드 확인
5. **진도 초기화** 후 **가져오기**로 방금 파일 복원 → 상자 상태 복구 확인
6. 폰에서 홈 화면 추가 → B 시안 아이콘·전체화면 실행 확인
7. 비행기 모드에서 앱 실행 → 오프라인 작동 확인
8. 다음 날 아침 천성인어 발행 후 → words.json에 단어 5개 추가 + 앱 새로고침 시 반영 확인
