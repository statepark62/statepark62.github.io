/**
 * 史 한국사 스터디 — PDF 자동 채점·추출 파이프라인
 *
 * [구조] 기존 혈액검사/영수증 자동화와 동일합니다.
 *   구글드라이브 "한국사PDF" 폴더
 *     ├─ 받은PDF   : 여기에 문제지·정답지 PDF를 넣으면 자동 처리됨
 *     ├─ 처리완료  : 성공적으로 시트에 반영된 원본 PDF가 이동됨
 *     └─ 처리실패  : 추출 실패한 PDF가 이동됨 (가져오기로그 시트에서 사유 확인)
 *   ↓ 시간 트리거(예: 15분마다)로 processIncomingPDFs() 실행
 *   ↓ Claude API(Anthropic)로 PDF에서 문항 추출
 *   ↓ questions 시트에 자동 append
 *
 * [처음 설정 순서]
 *   1) 프로젝트 설정(⚙) > 스크립트 속성에 ANTHROPIC_API_KEY 를 추가 (본인의 Anthropic API 키)
 *   2) 함수 선택 드롭다운에서 setupPdfFolders 실행 → "한국사PDF" 폴더가 내 드라이브에 생성됨
 *      (실행 로그에 폴더 링크가 출력되니, 그 링크로 이동해 즐겨찾기 해두면 편합니다)
 *   3) 트리거(시계 아이콘) > 트리거 추가 > 함수: processIncomingPDFs
 *      이벤트 소스: 시간 기반 > 분 단위 타이머 > 15분마다 로 등록
 *   4) (선택) 함수 선택에서 setupExamReminder 실행 → 시험 일정 기준 알림 이메일 트리거 등록
 *
 * [파일명 규칙] 국사편찬위원회 원본 파일명을 그대로 올리셔도 됩니다 (예: "79회 한국사_문제지(심화).pdf",
 *   "79회 한국사_답지(심화).pdf"). 파일명에 "문제지/문제"와 "답지/정답지/답안지/정답/답안" 같은
 *   유형 키워드, 그리고 괄호 안 표기((심화)/(기본) 등)를 자동으로 제거하고 남는 부분으로 같은
 *   회차인지 판단해 짝을 맞춥니다. 정답지 없이 문제지만 올리면 AI가 정답을 추정해 처리하며,
 *   이 경우 해설 앞에 "⚠ AI 추정"이 붙습니다. 정답지만 올라오고 문제지가 없으면 "대기" 상태로
 *   가져오기로그에 기록되고, 짝이 되는 문제지가 올라올 때까지 기다립니다.
 */

const PDF_ROOT_FOLDER_NAME = "한국사PDF";
const PDF_INBOX_NAME = "받은PDF";
const PDF_DONE_NAME = "처리완료";
const PDF_FAILED_NAME = "처리실패";
const IMPORT_LOG_SHEET = "가져오기로그";

/* ---------------- 최초 1회: 폴더 구성 ---------------- */
function setupPdfFolders() {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), PDF_ROOT_FOLDER_NAME);
  const inbox = getOrCreateFolder_(root, PDF_INBOX_NAME);
  const done = getOrCreateFolder_(root, PDF_DONE_NAME);
  const failed = getOrCreateFolder_(root, PDF_FAILED_NAME);

  PropertiesService.getScriptProperties().setProperties({
    PDF_INBOX_ID: inbox.getId(),
    PDF_DONE_ID: done.getId(),
    PDF_FAILED_ID: failed.getId()
  });

  ensureImportLogSheet_();

  Logger.log("폴더 구성 완료. '받은PDF' 폴더 링크: %s", inbox.getUrl());
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function ensureImportLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(IMPORT_LOG_SHEET);
  if (!sheet) sheet = ss.insertSheet(IMPORT_LOG_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 5).setValues([["처리시각", "파일명", "결과", "추가된 문제 수", "메모"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#1B2A4A").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logImport_(filename, result, addedCount, memo) {
  const sheet = ensureImportLogSheet_();
  sheet.appendRow([new Date(), filename, result, addedCount, memo || ""]);
}

/* ---------------- 메인: 받은PDF 폴더 처리 ---------------- */
function processIncomingPDFs() {
  const props = PropertiesService.getScriptProperties();
  const inboxId = props.getProperty("PDF_INBOX_ID");
  if (!inboxId) {
    Logger.log("먼저 setupPdfFolders()를 실행해 폴더를 만들어주세요.");
    return;
  }
  const inbox = DriveApp.getFolderById(inboxId);
  const doneFolder = DriveApp.getFolderById(props.getProperty("PDF_DONE_ID"));
  const failedFolder = DriveApp.getFolderById(props.getProperty("PDF_FAILED_ID"));

  const groups = groupPdfFiles_(inbox);
  const groupKeys = Object.keys(groups);
  if (!groupKeys.length) {
    Logger.log("받은PDF 폴더에 처리할 파일이 없습니다.");
    return;
  }

  groupKeys.forEach((key) => {
    const group = groups[key];
    const level = detectLevel_(group.question.getName()) || (group.answer && detectLevel_(group.answer.getName()));
    try {
      const result = extractQuestionsFromPDF_(key, group.question, group.answer, level);
      const added = appendQuestionsToSheet_(result, level);
      moveFiles_([group.question, group.answer].filter(Boolean), doneFolder);
      const memoParts = [];
      if (!group.answer) memoParts.push("⚠ 정답지 없이 AI 추정으로 처리됨");
      if (!level) memoParts.push("⚠ 파일명에서 급수(기본/심화)를 못 찾아 AI가 문서에서 직접 판단함");
      logImport_(key, "성공", added, memoParts.join(" / "));
    } catch (err) {
      moveFiles_([group.question, group.answer].filter(Boolean), failedFolder);
      logImport_(key, "실패", 0, String(err));
      Logger.log("처리 실패 [%s]: %s", key, err);
    }
  });
}

// 파일명에서 급수(기본/심화)를 감지. 못 찾으면 null(→ AI가 문서 표지를 보고 직접 판단하게 함)
function detectLevel_(name) {
  if (/심화/.test(name)) return "심화";
  if (/기본/.test(name)) return "기본";
  return null;
}

// 파일명을 "회차키"로 묶는다. 예: "79회 한국사_문제지(심화).pdf" / "79회 한국사_답지(심화).pdf" -> 같은 키로 매칭
// "(심화)"/"(기본)" 표기는 지우지 않고 남겨두어, 같은 회차라도 급수가 다르면 별도 그룹이 되게 한다.
function groupPdfFiles_(inbox) {
  const files = inbox.getFilesByType(MimeType.PDF);
  const groups = {};
  while (files.hasNext()) {
    const file = files.next();
    const rawName = file.getName().replace(/\.pdf$/i, "");
    const isAnswer = /답안|답지|정답/.test(rawName); // "답지"만 있는 정답지 파일명도 인식
    const key = extractRoundKey_(rawName);
    if (!groups[key]) groups[key] = { question: null, answer: null };
    if (isAnswer) groups[key].answer = file;
    else groups[key].question = file;
  }
  // 문제지가 없는(정답지만 있는) 그룹은 처리 대상에서 제외하되, 로그에 "대기" 상태로 남김
  Object.keys(groups).forEach((k) => {
    if (!groups[k].question) {
      logImport_(k, "대기", 0, "문제지가 아직 없어 매칭 대기 중 (정답지만 발견됨)");
      delete groups[k];
    }
  });
  return groups;
}

// 문제지/답지 등 유형 키워드만 제거하고, "(심화)"/"(기본)" 같은 급수 표기는 그대로 남겨서
// 같은 회차·같은 급수의 두 파일만 짝지어지도록 한다.
function extractRoundKey_(rawName) {
  let key = rawName;
  key = key.replace(/문제지|정답지|답안지|답지|정답|답안|문제/g, " ");
  key = key.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return key || rawName;
}

function moveFiles_(files, targetFolder) {
  files.forEach((f) => { if (f) f.moveTo(targetFolder); });
}

/* ---------------- Claude API 호출 ---------------- */
function extractQuestionsFromPDF_(roundKey, questionFile, answerFile, levelHint) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("스크립트 속성에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");

  const content = [];
  content.push({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: Utilities.base64Encode(questionFile.getBlob().getBytes()) }
  });
  if (answerFile) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: Utilities.base64Encode(answerFile.getBlob().getBytes()) }
    });
  }

  const eraList = "선사시대, 고조선~여러 나라, 삼국시대, 남북국시대, 고려시대, 조선전기, 조선후기, 근대, 일제강점기, 현대";
  const levelInstruction = levelHint
    ? `이 회차는 "${levelHint}" 급수입니다. 모든 문항의 level 값을 "${levelHint}"로 고정하세요.`
    : "파일명에 급수 표시가 없습니다. 문제지 표지(첫 페이지)에 적힌 급수를 확인해 모든 문항에 동일하게 적용하세요.";
  const instruction = [
    `첫 번째 PDF는 한국사능력검정시험 "${roundKey}" 회차의 문제지입니다.`,
    answerFile ? "두 번째 PDF는 같은 회차의 정답지입니다. 정답 번호를 정확히 그 파일에서 확인해 반영하세요." :
                 "정답지가 없습니다. 각 문항의 정답을 본인의 한국사 지식으로 신중하게 판단하고, explanation 맨 앞에 반드시 \"⚠ AI 추정: \" 문구를 붙이세요.",
    levelInstruction,
    "",
    "각 문항을 분석해서 아래 JSON 배열 형식으로만 응답하세요. 다른 설명, 인사말, 코드블록 표시(```) 없이 응답의 첫 글자부터 '['로 시작하는 순수 JSON 배열만 출력합니다.",
    "",
    "[",
    '  {"num": 1, "era": "<아래 10개 중 정확히 하나>", "category": "정치|경제|사회|문화|대외관계|사상·종교|독립운동 중 하나",',
    '   "level": "기본 또는 심화 중 하나",',
    '   "q": "문제 본문(사진·지도 자료는 자연어로 풀어써서 텍스트만으로도 이해 가능하게)",',
    '   "choices": ["보기1","보기2","보기3","보기4"], "answer": 1~4 중 정답 번호,',
    '   "explanation": "정답 근거를 2~3문장으로, 학생이 이해하기 쉽게"}',
    "]",
    "",
    `era 값은 반드시 다음 중 하나여야 합니다: ${eraList}`,
    "문제 번호(num)는 문제지에 표기된 원래 번호를 그대로 사용하세요.",
    "이미지 판독이 불가능해 문제를 구성할 수 없는 극소수 문항은 배열에서 제외해도 됩니다."
  ].join("\n");

  content.push({ type: "text", text: instruction });

  const payload = {
    model: "claude-sonnet-5",
    max_tokens: 16000,
    thinking: { type: "disabled" }, // 확장 사고를 끄지 않으면 사고 과정에 토큰을 다 써버려 답변이 비어버림
    messages: [{ role: "user", content: content }]
  };

  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error("Claude API 오류(" + res.getResponseCode() + "): " + res.getContentText().slice(0, 500));
  }

  const body = JSON.parse(res.getContentText());
  const rawText = (body.content || []).map((b) => b.text || "").join("\n").trim();

  if (!rawText) {
    throw new Error(
      "Claude 응답이 비어 있습니다. stop_reason=" + (body.stop_reason || "?") +
      ", content 블록 수=" + ((body.content || []).length) +
      ", 블록 타입=[" + (body.content || []).map((b) => b.type).join(",") + "]" +
      ", usage=" + JSON.stringify(body.usage || {})
    );
  }

  // 코드블록(```)이나 앞뒤 설명 문장이 섞여 있어도, 첫 '['부터 마지막 ']'까지만 잘라 JSON으로 시도
  const startIdx = rawText.indexOf("[");
  const endIdx = rawText.lastIndexOf("]");
  const jsonText = (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx)
    ? rawText.slice(startIdx, endIdx + 1)
    : rawText;

  let items;
  try {
    items = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      "Claude 응답을 JSON으로 파싱하지 못했습니다 (stop_reason=" + (body.stop_reason || "?") + "): " +
      jsonText.slice(0, 300)
    );
  }
  if (!Array.isArray(items) || !items.length) {
    throw new Error("추출된 문항이 없습니다. stop_reason=" + (body.stop_reason || "?") + ", 원문 앞부분: " + rawText.slice(0, 200));
  }
  return { roundKey: roundKey, items: items };
}

/* ---------------- 시트에 반영 ---------------- */
function appendQuestionsToSheet_(result, levelHint) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) throw new Error("questions 시트가 없습니다. 먼저 setupSheets()를 실행하세요.");

  const existingIds = new Set(
    sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues().flat().filter(String)
  );
  const eraSet = new Set(["선사시대","고조선~여러 나라","삼국시대","남북국시대","고려시대","조선전기","조선후기","근대","일제강점기","현대"]);
  const roundDigits = result.roundKey.replace(/[^0-9]/g, "");

  const rows = [];
  result.items.forEach((it) => {
    const level = levelHint || (it.level === "기본" ? "기본" : "심화");
    const levelLetter = level === "기본" ? "b" : "s";
    const id = "h" + roundDigits + levelLetter + "_" + String(it.num).padStart(2, "0");
    if (existingIds.has(id)) return; // 중복 방지
    if (!it.q || !Array.isArray(it.choices) || it.choices.length !== 4) return;
    const answerNum = Number(it.answer);
    if (![1,2,3,4].includes(answerNum)) return;
    const era = eraSet.has(it.era) ? it.era : "현대"; // 알 수 없는 값이면 임시로 '현대'에 넣고 나중에 검수
    rows.push([id, era, it.category || "", "기출", level, it.q,
      it.choices[0], it.choices[1], it.choices[2], it.choices[3],
      answerNum, it.explanation || ""]);
    existingIds.add(id);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
  }
  return rows.length;
}

/* ---------------- 시험 일정 알림 (스크래핑 아님, 안전) ---------------- */
// 새 회차 시험일 기준 약 3주 뒤(정답 발표 이후)에 "새 기출문제 PDF 받아서 넣어주세요" 메일을 보냅니다.
// examDates 배열은 historyexam.go.kr 공지에서 확인해 본인이 직접 채워주세요(자동 조회 아님).
function setupExamReminder() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendExamReminderIfDue") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendExamReminderIfDue").timeBased().everyDays(1).atHour(9).create();
  Logger.log("매일 오전 9시 알림 체크 트리거 등록 완료. examDates 배열을 본인 일정에 맞게 수정하세요.");
}

function sendExamReminderIfDue() {
  const examDates = [
    "2026-10-17" // 제80회 시험일. 다음 회차 공지가 나오면 이 배열에 추가하세요.
  ];
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  examDates.forEach((d) => {
    const remindDate = Utilities.formatDate(
      new Date(new Date(d).getTime() + 21 * 86400000), Session.getScriptTimeZone(), "yyyy-MM-dd"
    ); // 시험일 + 21일(정답 발표 이후 추정)
    if (today === remindDate) {
      MailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        "[한국사 스터디] 새 기출문제 PDF 등록 알림",
        "historyexam.go.kr 에서 " + d + " 시행 회차의 문제지·정답지 PDF를 받아 '한국사PDF/받은PDF' 폴더에 넣어주세요.\n" +
        "넣어두시면 자동으로 questions 시트에 반영됩니다."
      );
    }
  });
}
