/**
 * 史 한국사 스터디 — 구글시트 → JSON 변환 웹앱
 *
 * [사용법]
 * 1) 새 Google Sheet를 만들고 시트(탭) 이름을 "questions", "flashcards"로 각각 만든다.
 * 2) questions 탭 1행에 헤더를 아래 순서로 입력한다.
 *    id | era | category | q | choice1 | choice2 | choice3 | choice4 | answer | explanation
 *    - answer는 정답 보기의 번호(1~4)를 입력한다. (내부에서 0-based로 자동 변환)
 * 3) flashcards 탭 1행에 헤더를 아래 순서로 입력한다.
 *    id | era | term | def
 * 4) 확장 프로그램 > Apps Script 에서 이 코드를 붙여넣는다.
 * 5) 배포 > 새 배포 > 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 전체 허용(Anyone)
 *    로 배포하고, 발급된 /exec URL을 앱 설정의 "문제 데이터 URL"에 입력한다.
 * 6) 이후에는 시트에 문제만 추가하면 앱에 자동 반영된다(앱에서 "지금 동기화" 클릭 또는 재접속 시).
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = {
    version: new Date().toISOString(),
    questions: readQuestions(ss),
    flashcards: readFlashcards(ss)
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
    if (!r[0]) continue; // id가 비어있으면 스킵
    out.push({
      id: String(r[0]),
      era: String(r[1] || ""),
      category: String(r[2] || ""),
      q: String(r[3] || ""),
      choices: [String(r[4] || ""), String(r[5] || ""), String(r[6] || ""), String(r[7] || "")],
      answer: Number(r[8]) - 1,
      explanation: String(r[9] || "")
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
