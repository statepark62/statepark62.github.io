# ============================================================
# 일본어 인포그래픽 42개 파일명 일괄 변경 스크립트
# 사용법:
#   1) 이 파일을 이미지 42개가 있는 폴더에 복사
#   2) 폴더에서 Shift+우클릭 → "여기에 PowerShell 창 열기"
#   3) 아래 한 줄 실행:
#      powershell -ExecutionPolicy Bypass -File .\rename-files.ps1
#   * 못 찾은 파일은 노란색으로 표시되고 건너뜁니다(오류 없음)
# ============================================================

$map = @(
    # ── 기초·구조 (basics) ──────────────────────────────
    @{ old = '일본어의 구성 및 구조.png';        new = 'basics-japanese-structure.png' },
    @{ old = '한국어 일본어 구조.png';           new = 'basics-korean-japanese-structure.png' },
    @{ old = '한국어 일본어 차이.png';           new = 'basics-korean-japanese-differences.png' },
    @{ old = '일본어 히라가나 활용 단어 01.png'; new = 'basics-hiragana-words-01.png' },
    @{ old = '일본어 히라가나 활용 단어 02.png'; new = 'basics-hiragana-words-02.png' },
    @{ old = '일본어 가타카나 활용 단어 01.png'; new = 'basics-katakana-words-01.png' },
    @{ old = '일본어 가타카나 활용 단어 02.png'; new = 'basics-katakana-words-02.png' },

    # ── 문법 (grammar) ──────────────────────────────────
    @{ old = '일본어 동사활용.png';              new = 'grammar-verb-conjugation.png' },
    @{ old = 'て형 만들기 원리편.png';           new = 'grammar-te-form-basics.png' },
    @{ old = 'て형 만들기 활용편.png';           new = 'grammar-te-form-usage.png' },
    @{ old = 'ます형 만들기 원리편.png';         new = 'grammar-masu-form-basics.png' },
    @{ old = 'ます형 만들기 활용편.png';         new = 'grammar-masu-form-usage.png' },
    @{ old = '가능형 만들기 원리편.png';         new = 'grammar-potential-basics.png' },
    @{ old = '가능형 만들기 활용편.png';         new = 'grammar-potential-usage.png' },
    @{ old = '사역형 만들기 원리편.png';         new = 'grammar-causative-basics.png' },
    @{ old = '사역형 만들기 활용편.png';         new = 'grammar-causative-usage.png' },
    @{ old = '수동형 만들기 원리편.png';         new = 'grammar-passive-basics.png' },
    @{ old = '수동형 만들기 활용편.png';         new = 'grammar-passive-usage.png' },
    @{ old = '한국어 일본어 차이 사역형 수동형.png'; new = 'grammar-kr-jp-causative-passive.png' },
    @{ old = '일본어 조사.png';                  new = 'grammar-particles.png' },
    @{ old = '일본어 조건 가정 표현.png';        new = 'grammar-conditionals.png' },
    @{ old = '일본어 ~만~뿐~오직.png';           new = 'grammar-only-expressions.png' },
    @{ old = '대표적인 い형용사.png';            new = 'grammar-i-adjectives.png' },
    @{ old = '대표적인 な형용사.png';            new = 'grammar-na-adjectives.png' },

    # ── 어휘·표현 (vocab) ───────────────────────────────
    @{ old = '일본어 숫자 읽기.png';             new = 'vocab-numbers.png' },
    @{ old = '일본어 날짜 요일 읽기.png';        new = 'vocab-dates-weekdays.png' },
    @{ old = '일본어 시간 말하기.png';           new = 'vocab-telling-time.png' },
    @{ old = '일본어 시간대 표현.png';           new = 'vocab-time-expressions.png' },
    @{ old = '일본어 날씨 용어.png';             new = 'vocab-weather.png' },
    @{ old = '일본어 조리 용어.png';             new = 'vocab-cooking.png' },
    @{ old = '일본어 방향 말하기.png';           new = 'vocab-directions.png' },
    @{ old = '일본어 방향-지시대명사.jpg';       new = 'vocab-directions-demonstratives.jpg' },
    @{ old = '일본어 주요 오노마토페 01.png';    new = 'vocab-onomatopoeia-01.png' },
    @{ old = '일본어 주요 오노마토페 02.png';    new = 'vocab-onomatopoeia-02.png' },
    @{ old = 'のんびりゆったり.png';             new = 'vocab-nonbiri-yuttari.png' },
    @{ old = '面倒を見る vs 世話をする.png';     new = 'vocab-mendou-vs-sewa.png' },

    # ── 회화 (dialogue) ─────────────────────────────────
    @{ old = '일본 입국과정 대화 예시.png';      new = 'dialogue-immigration.png' },
    @{ old = '일본 교통수단 이용시 대화 01.png'; new = 'dialogue-transport-01.png' },
    @{ old = '일본 교통수단 이용시 대화 02.png'; new = 'dialogue-transport-02.png' },
    @{ old = '일본 식당에서의 대화 01.png';      new = 'dialogue-restaurant-01.png' },
    @{ old = '일본 식당에서의 대화 02.png';      new = 'dialogue-restaurant-02.png' },

    # ── 문화 (culture) ──────────────────────────────────
    @{ old = '일본 스모.png';                    new = 'culture-sumo.png' }
)

$ok = 0; $miss = 0
foreach ($m in $map) {
    if (Test-Path -LiteralPath $m.old) {
        Rename-Item -LiteralPath $m.old -NewName $m.new
        Write-Host ("변경: {0}  →  {1}" -f $m.old, $m.new) -ForegroundColor Green
        $ok++
    }
    else {
        Write-Host ("못 찾음: {0}" -f $m.old) -ForegroundColor Yellow
        $miss++
    }
}

Write-Host ""
Write-Host ("완료: {0}개 변경, {1}개 못 찾음" -f $ok, $miss) -ForegroundColor Cyan
if ($miss -gt 0) {
    Write-Host "못 찾은 파일은 실제 파일명이 목록과 조금 다른 경우입니다."
    Write-Host "노란색으로 표시된 이름을 알려주시면 스크립트를 수정해 드립니다."
}
