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
 * [questions 탭 1행 헤더] — 이 순서 그대로 (v3에서 level 열 추가됨)
 *   id | era | category | source | level | q | choice1 | choice2 | choice3 | choice4 | answer | explanation
 *   - source  : "기출" 또는 "예상" 중 하나
 *   - level   : "기본" 또는 "심화" 중 하나 (앱의 급수 필터가 이 값을 읽음)
 *   - answer  : 정답 보기 번호 1~4 (숫자, 내부에서 0-based로 자동 변환)
 *
 * [기존에 이미 questions 탭을 쓰고 계셨다면] migrateAddLevelColumn() 을 한 번 실행하면
 *   source 열 뒤에 level 열을 자동으로 끼워 넣어줍니다. 기존 행의 빈 값은 기본값 "심화"로
 *   채워지니, 실제로 "기본" 문제였던 행은 나중에 직접 고쳐주세요.
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
 *
 * [처음 한 번만] 시트 탭이 아직 없다면, 아래 setupSheets() 함수를 선택해 ▶ 실행하세요.
 *               questions/flashcards/concepts 탭과 헤더·드롭다운·예시행을 자동으로 만들어줍니다.
 *               이미 데이터가 있는 탭은 건드리지 않으니 여러 번 실행해도 안전합니다.
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
    const answerNum = Number(r[10]);
    const source = String(r[3] || "기출").trim();
    const level = String(r[4] || "심화").trim();
    out.push({
      id: String(r[0]),
      era: String(r[1] || ""),
      category: String(r[2] || ""),
      source: (source === "예상") ? "예상" : "기출",
      level: (level === "기본") ? "기본" : "심화",
      q: String(r[5] || ""),
      choices: [String(r[6] || ""), String(r[7] || ""), String(r[8] || ""), String(r[9] || "")],
      answer: isNaN(answerNum) ? 0 : answerNum - 1,
      explanation: String(r[11] || "")
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

/* =====================================================================
 * 시트 자동 구성 — 아래 setupSheets()를 "한 번만" 실행하면
 * questions / flashcards / concepts 탭과 헤더·드롭다운·예시행이
 * 자동으로 만들어집니다. 이미 데이터가 있는 시트는 건드리지 않습니다.
 * (상단 함수 선택 드롭다운에서 setupSheets 선택 → ▶ 실행)
 * ===================================================================== */

const ERA_LIST = ["선사시대","고조선~여러 나라","삼국시대","남북국시대","고려시대",
                   "조선전기","조선후기","근대","일제강점기","현대"];

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupQuestionsSheet(ss);
  setupFlashcardsSheet(ss);
  setupConceptsSheet(ss);
  removeBlankDefaultSheet(ss);
  SpreadsheetApp.flush();
  Logger.log("시트 구성 완료: questions / flashcards / concepts 탭을 확인하세요.");
}

function styleHeaderRow_(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1B2A4A")
       .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 26);
  for (let i = 1; i <= headers.length; i++) sheet.autoResizeColumn(i);
}

function applyListValidation_(sheet, col, list) {
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sheet.getRange(2, col, 499, 1).setDataValidation(rule);
}

function writeExampleRow_(sheet, values) {
  if (sheet.getLastRow() >= 2) return; // 이미 데이터가 있으면 예시행을 넣지 않음(기존 데이터 보호)
  const range = sheet.getRange(2, 1, 1, values.length);
  range.setValues([values]);
  range.setBackground("#FFF3C4");
  sheet.setRowHeight(2, 60);
}

function setupQuestionsSheet(ss) {
  const sheet = ss.getSheetByName("questions") || ss.insertSheet("questions");
  const headers = ["id","era","category","source","level","q","choice1","choice2","choice3","choice4","answer","explanation"];
  styleHeaderRow_(sheet, headers);
  applyListValidation_(sheet, 2, ERA_LIST);          // era
  applyListValidation_(sheet, 4, ["기출","예상"]);      // source
  applyListValidation_(sheet, 5, ["기본","심화"]);      // level
  applyListValidation_(sheet, 11, ["1","2","3","4"]); // answer
  writeExampleRow_(sheet, [
    "q045","조선후기","경제","예상","심화",
    "조선 후기 상품 화폐 경제 발달과 관련하여 전국적으로 유통된 화폐는?",
    "건원중보","해동통보","상평통보","조선통보",
    3,
    "상평통보는 1678년(숙종) 이후 전국적으로 유통되어 조선 후기 상품 화폐 경제 발달을 뒷받침하였다."
  ]);
}

// 기존에 source까지만 있던 questions 탭에 level 열을 끼워 넣는 마이그레이션.
// 여러 번 실행해도 안전(이미 level 열이 있으면 그냥 종료).
function migrateAddLevelColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) { Logger.log("questions 시트가 없습니다."); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf("level") !== -1) {
    Logger.log("이미 level 열이 있습니다. 마이그레이션이 필요 없습니다.");
    return;
  }
  const sourceIdx1based = headers.indexOf("source") + 1; // 1-based
  if (sourceIdx1based === 0) {
    Logger.log("source 열을 찾을 수 없습니다. 헤더를 확인해주세요: %s", headers.join(", "));
    return;
  }
  const insertAt = sourceIdx1based + 1; // source 바로 뒤

  sheet.insertColumnAfter(sourceIdx1based);
  const headerCell = sheet.getRange(1, insertAt);
  headerCell.setValue("level").setFontWeight("bold").setFontColor("#FFFFFF")
    .setBackground("#1B2A4A").setHorizontalAlignment("center").setVerticalAlignment("middle");

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const range = sheet.getRange(2, insertAt, lastRow - 1, 1);
    const existing = range.getValues();
    const filled = existing.map((r) => [r[0] || "심화"]); // 빈 값은 우선 "심화"로 채움
    range.setValues(filled);
  }
  applyListValidation_(sheet, insertAt, ["기본","심화"]);
  Logger.log("level 열 추가 완료(열 위치 %s). 기존 빈 값은 '심화'로 채워졌습니다 — 실제 '기본' 문제였던 행은 직접 수정해주세요.", insertAt);
}

function setupFlashcardsSheet(ss) {
  const sheet = ss.getSheetByName("flashcards") || ss.insertSheet("flashcards");
  const headers = ["id","era","term","def"];
  styleHeaderRow_(sheet, headers);
  applyListValidation_(sheet, 2, ERA_LIST); // era
  writeExampleRow_(sheet, [
    "f021","고려시대","과거제",
    "광종이 958년 쌍기의 건의로 실시한 관리 등용 제도. 호족 세력을 견제하고 왕권을 강화하는 데 기여."
  ]);
}

function setupConceptsSheet(ss) {
  const sheet = ss.getSheetByName("concepts") || ss.insertSheet("concepts");
  const headers = ["id","era","type","title","content"];
  styleHeaderRow_(sheet, headers);
  applyListValidation_(sheet, 2, ERA_LIST);        // era
  applyListValidation_(sheet, 3, ["개념","사건"]);   // type
  writeExampleRow_(sheet, [
    "c001","조선후기","개념","대동법",
    "공납을 특산물 대신 토지 결수를 기준으로 쌀·베·동전 등으로 납부하게 한 제도이다. 광해군 때 경기도에서 처음 시행되어 숙종 때 전국으로 확대되었다. 방납의 폐단을 줄이고 농민의 부담을 완화했으며, 공인이라는 어용 상인이 등장해 상품 화폐 경제 발달을 촉진하는 계기가 되었다."
  ]);
}

// 새 스프레드시트에 기본으로 딸려오는 빈 "시트1"이 남아있고,
// 다른 탭이 이미 만들어졌다면 정리 차원에서 삭제합니다(내용이 있으면 건드리지 않음).
function removeBlankDefaultSheet(ss) {
  const sheet = ss.getSheetByName("시트1") || ss.getSheetByName("Sheet1");
  if (!sheet) return;
  const isEmpty = sheet.getLastRow() === 0 && sheet.getLastColumn() === 0;
  if (isEmpty && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet);
  }
}
