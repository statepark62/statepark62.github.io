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
 * [questions 탭 1행 헤더] — 이 순서 그대로 (v4에서 imageUrl 열 추가됨)
 *   id | era | category | source | level | q | choice1 | choice2 | choice3 | choice4 | answer | explanation | imageUrl
 *   - source   : "기출" 또는 "예상" 중 하나
 *   - level    : "기본" 또는 "심화" 중 하나 (앱의 급수 필터가 이 값을 읽음)
 *   - answer   : 정답 보기 번호 1~4 (숫자, 내부에서 0-based로 자동 변환)
 *   - imageUrl : 문항에 딸린 사진·지도 등 이미지 링크(선택, 비어있어도 됨)
 *
 * [기존에 이미 questions 탭을 쓰고 계셨다면] migrateAddLevelColumn() 과 migrateAddImageUrlColumn()
 *   을 순서대로 한 번씩 실행하면 필요한 열이 자동으로 추가됩니다.
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
      explanation: String(r[11] || ""),
      imageUrl: String(r[12] || "")
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
  const headers = ["id","era","category","source","level","q","choice1","choice2","choice3","choice4","answer","explanation","imageUrl"];
  styleHeaderRow_(sheet, headers);
  applyListValidation_(sheet, 2, ERA_LIST);          // era
  applyListValidation_(sheet, 4, ["기출","예상"]);      // source
  applyListValidation_(sheet, 5, ["기본","심화"]);      // level
  applyListValidation_(sheet, 11, ["1","2","3","4"]); // answer
  writeExampleRow_(sheet, [
    "q046","고려시대","정치","예상","심화",
    "고려 광종이 왕권 강화를 위해 실시한 정책으로 옳은 것은?",
    "과거제 실시","호패법 실시","탕평책 실시","균역법 실시",
    1,
    "광종은 958년 쌍기의 건의로 과거제를 실시해 신진 인재를 등용하고 호족 세력을 견제하며 왕권을 강화하였다.",
    ""
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

// questions 탭 맨 뒤에 imageUrl 열을 추가하는 마이그레이션. 여러 번 실행해도 안전.
function migrateAddImageUrlColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) { Logger.log("questions 시트가 없습니다."); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf("imageUrl") !== -1) {
    Logger.log("이미 imageUrl 열이 있습니다. 마이그레이션이 필요 없습니다.");
    return;
  }
  const insertAt = lastCol + 1;
  const headerCell = sheet.getRange(1, insertAt);
  headerCell.setValue("imageUrl").setFontWeight("bold").setFontColor("#FFFFFF")
    .setBackground("#1B2A4A").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.autoResizeColumn(insertAt);
  Logger.log("imageUrl 열 추가 완료(열 위치 %s). 기존 행은 빈 값으로 남습니다(이미지 없는 문항으로 처리됨).", insertAt);
}

// [문제 복구용] 열을 중간에 끼워 넣는 마이그레이션(migrateAddLevelColumn 등) 이후 데이터 확인 규칙이
// 예전 열 위치에 그대로 남아 엉뚱한 열(예: choice4)에 "1~4만 허용" 규칙이 걸리는 경우가 있습니다.
// 이 함수를 실행하면 현재 헤더 위치를 기준으로 모든 검사 규칙을 깨끗이 지우고 다시 겁니다.
// 몇 번을 실행해도 안전합니다.
function fixQuestionsValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) { Logger.log("questions 시트가 없습니다."); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  sheet.getRange(2, 1, maxRows, lastCol).clearDataValidations();

  const colOf = (name) => headers.indexOf(name) + 1; // 0이면 없음
  if (colOf("era")) applyListValidation_(sheet, colOf("era"), ERA_LIST);
  if (colOf("source")) applyListValidation_(sheet, colOf("source"), ["기출","예상"]);
  if (colOf("level")) applyListValidation_(sheet, colOf("level"), ["기본","심화"]);
  if (colOf("answer")) applyListValidation_(sheet, colOf("answer"), ["1","2","3","4"]);

  Logger.log("데이터 확인 규칙을 현재 열 위치(%s) 기준으로 재설정했습니다.", headers.join(", "));
}

// [문제 복구용] PdfImport.gs가 이미 "id,era,category,source,level,q,choice1-4,answer,explanation,imageUrl"
// 13열 구조로 데이터를 쓰고 있는데, 정작 헤더 행(1행)에는 level이 빠져 있는 경우를 바로잡습니다.
// 데이터 행은 이미 13열 구조이므로 건드리지 않고 "헤더 행만" 올바르게 다시 씁니다.
// 스키마가 맞지 않는(level 없이 저장된) 예전 예시행(2행)이 있으면 함께 지웁니다.
// 이 함수는 몇 번을 실행해도 안전합니다.
function fixQuestionsHeaderAndExampleRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) { Logger.log("questions 시트가 없습니다."); return; }

  const correctHeaders = ["id","era","category","source","level","q","choice1","choice2","choice3","choice4","answer","explanation","imageUrl"];
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), correctHeaders.length)).getValues()[0].map(String);

  if (currentHeaders.indexOf("level") === -1) {
    styleHeaderRow_(sheet, correctHeaders); // row1만 교체 — 데이터 행(2행 이후)은 건드리지 않음
    Logger.log("헤더 행을 level 포함 13열 구조로 바로잡았습니다.");
  } else {
    Logger.log("헤더는 이미 올바릅니다. (건드리지 않음)");
  }

  // 2행이 예전(레벨 없는) 예시행인지 확인: E열(level 자리)이 "기본"/"심화"가 아니면 옛 스키마로 간주하고 삭제
  if (sheet.getLastRow() >= 2) {
    const row2 = sheet.getRange(2, 1, 1, 13).getValues()[0];
    const level2 = String(row2[4]);
    if (row2[0] && level2 !== "기본" && level2 !== "심화") {
      sheet.deleteRow(2);
      Logger.log("스키마가 맞지 않는 예전 예시행(2행: id=%s)을 삭제했습니다.", row2[0]);
    }
  }

  fixQuestionsValidation();
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
