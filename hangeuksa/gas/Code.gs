/**
 * 史 한국사 스터디 — '한국사' 구글시트 → JSON 변환 웹앱  (v2)
 *
 * [전제] 이 스크립트는 '한국사' 스프레드시트에 "바인딩"된 상태로 실행됩니다.
 *
 * [필수] 시트(탭) 이름이 정확히 아래와 같아야 합니다. (대소문자·공백까지 동일)
 *   - questions   : 문제풀이용
 *   - flashcards  : 암기카드용
 *   - concepts    : 시대별 개념·사건 정리 (지금은 시트 구조만, 앱에는 아직 미표시)
 *
 * [questions 탭 1행 헤더] — 이 순서 그대로 (v2에서 source 열 추가됨)
 *   id | era | category | source | q | choice1 | choice2 | choice3 | choice4 | answer | explanation
 *   - source  : "기출" 또는 "예상" 중 하나 (앱의 출처 필터가 이 값을 그대로 읽음)
 *   - answer  : 정답 보기 번호 1~4 (숫자, 내부에서 0-based로 자동 변환)
 *
 * [flashcards 탭 1행 헤더] — 이 순서 그대로
 *   id | era | term | def
 *
 * [concepts 탭 1행 헤더] — 이 순서 그대로 (현재는 저장만 해두는 용도)
 *   id | era | type | title | content
 *   - type : "개념" 또는 "사건"
 *
 * [배포 방법] 배포 > 새 배포 > 웹 앱 (실행 계정: 나 / 액세스: 전체 허용) → …/exec URL을
 *            앱 ⚙ 설정의 "문제 데이터 URL"에 입력.
 * [내용 수정 후 같은 URL 유지] 배포 > 배포 관리 > ✏ > 버전: 새 버전 > 배포
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = {
    version: new Date().toISOString(),
    questions: readQuestions(ss),
    flashcards: readFlashcards(ss),
    concepts: readConcepts(ss) // 앱에서는 아직 사용하지 않지만 미리 함께 내보냄
  };
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function readQuestions(ss) {
  const sheet = ss.getSheetByName("questions");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue; // id 빈 행은 건너뜀
    const answerNum = Number(r[9]);
    const source = String(r[3] || "기출").trim();
    out.push({
      id: String(r[0]),
      era: String(r[1] || ""),
      category: String(r[2] || ""),
      source: (source === "예상") ? "예상" : "기출",
      q: String(r[4] || ""),
      choices: [String(r[5] || ""), String(r[6] || ""), String(r[7] || ""), String(r[8] || "")],
      answer: isNaN(answerNum) ? 0 : answerNum - 1,
      explanation: String(r[10] || "")
    });
  }
  return out;
}

function readFlashcards(ss) {
  const sheet = ss.getSheetByName("flashcards");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: String(r[0]),
      era: String(r[1] || ""),
      term: String(r[2] || ""),
      def: String(r[3] || "")
    });
  }
  return out;
}

function readConcepts(ss) {
  const sheet = ss.getSheetByName("concepts");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: String(r[0]),
      era: String(r[1] || ""),
      type: String(r[2] || ""),
      title: String(r[3] || ""),
      content: String(r[4] || "")
    });
  }
  return out;
}

/**
 * [선택] 편집기에서 이 함수를 직접 실행 → 보기 > 로그에서 개수를 확인하세요.
 * concepts 탭이 아직 없다면 concepts: 0개로 나오는 게 정상입니다.
 */
function testRead() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const q = readQuestions(ss);
  const f = readFlashcards(ss);
  const c = readConcepts(ss);
  Logger.log("questions: %s개, flashcards: %s개, concepts: %s개", q.length, f.length, c.length);
  if (q[0]) Logger.log("questions 첫 행 예시: %s", JSON.stringify(q[0]));
  if (f[0]) Logger.log("flashcards 첫 행 예시: %s", JSON.stringify(f[0]));
  if (c[0]) Logger.log("concepts 첫 행 예시: %s", JSON.stringify(c[0]));
}
