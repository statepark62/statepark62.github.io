// Google Sheet에서: 확장 프로그램 > Apps Script
// 아래 코드를 붙여넣고 SHEET_NAME을 필요하면 변경하세요.
const SHEET_NAME = '스크립트';

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['저장일시','영상 URL','제목','채널','언어','스크립트']);
    sh.setFrozenRows(1);
  }
  const p = e.parameter || {};
  sh.appendRow([new Date(), p.video_url || '', p.title || '', p.channel || '',
                p.language || '', p.script || '']);
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}
