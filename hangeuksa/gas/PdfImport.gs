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
 *
 * [사진·지도 등 시각자료 처리] 문제지 PDF를 구글 문서로 변환해 내장된 이미지를 추출하고,
 *   문항 번호 근처에 있는 이미지를 그 문항과 연결해 별도 이미지 파일로 저장합니다.
 *   이 기능을 쓰려면 왼쪽 "서비스" 옆 + 버튼을 눌러 "Drive API"를 고급 서비스로 추가해야 합니다.
 *   (추가하지 않아도 텍스트 추출 자체는 정상 동작하며, 이미지만 비어 있게 됩니다.)
 */

const PDF_ROOT_FOLDER_NAME = "한국사PDF";
const PDF_INBOX_NAME = "받은PDF";
const PDF_DONE_NAME = "처리완료";
const PDF_FAILED_NAME = "처리실패";
const PDF_IMAGE_NAME = "이미지";
const IMPORT_LOG_SHEET = "가져오기로그";

/* ---------------- 최초 1회: 폴더 구성 ---------------- */
function setupPdfFolders() {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), PDF_ROOT_FOLDER_NAME);
  const inbox = getOrCreateFolder_(root, PDF_INBOX_NAME);
  const done = getOrCreateFolder_(root, PDF_DONE_NAME);
  const failed = getOrCreateFolder_(root, PDF_FAILED_NAME);
  const images = getOrCreateFolder_(root, PDF_IMAGE_NAME);

  PropertiesService.getScriptProperties().setProperties({
    PDF_ROOT_ID: root.getId(),
    PDF_INBOX_ID: inbox.getId(),
    PDF_DONE_ID: done.getId(),
    PDF_FAILED_ID: failed.getId(),
    PDF_IMAGE_ID: images.getId()
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

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 4.5 * 60 * 1000; // Apps Script 6분 제한 대비 여유(4분 30초)를 두고 스스로 멈춤

  groupKeys.forEach((key) => {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      logImport_(key, "대기", 0, "이번 실행 시간(4분 30초) 초과 우려로 다음 트리거 실행 때 이어서 처리됩니다.");
      return; // 이 회차는 받은PDF에 그대로 남아 다음 실행 때 처리됨
    }
    const group = groups[key];
    const level = detectLevel_(group.question.getName()) || (group.answer && detectLevel_(group.answer.getName()));

    // 1단계: 문항 텍스트부터 추출해서 시트에 반영(이미지 없이). 이 단계가 핵심이라 먼저 안전하게 끝낸다.
    let appendResult;
    try {
      const result = extractQuestionsFromPDF_(key, group.question, group.answer, level);
      appendResult = appendQuestionsToSheet_(result, level, {});
      moveFiles_([group.question, group.answer].filter(Boolean), doneFolder);
      const memoParts = [];
      if (!group.answer) memoParts.push("⚠ 정답지 없이 AI 추정으로 처리됨");
      if (!level) memoParts.push("⚠ 파일명에서 급수(기본/심화)를 못 찾아 AI가 문서에서 직접 판단함");
      if (result.partialErrors && result.partialErrors.length) {
        memoParts.push("⚠ 일부 구간 실패: " + result.partialErrors.join(" | "));
      }
      logImport_(key, "성공(텍스트)", appendResult.added, memoParts.join(" / "));
    } catch (err) {
      moveFiles_([group.question, group.answer].filter(Boolean), failedFolder);
      logImport_(key, "실패", 0, String(err));
      Logger.log("처리 실패 [%s]: %s", key, err);
      return; // 텍스트 추출 자체가 실패하면 이미지 단계는 진행하지 않음
    }

    // 2단계: 텍스트가 안전하게 저장된 뒤, 남은 시간이 있으면 이미지 추출을 시도(실패해도 무방).
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      logImport_(key, "이미지 대기", 0, "시간 초과 우려로 이미지 추출은 건너뜀 — 문항 텍스트는 이미 반영됨.");
      return;
    }
    try {
      const questionsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("questions");
      const imageMap = extractImagesFromPdf_(group.question, key);
      const filled = fillImageUrls_(questionsSheet, appendResult.startRow, appendResult.rowMeta, imageMap);
      logImport_(key, "이미지 완료", filled, "이미지 " + filled + "개 연결됨");
    } catch (imgErr) {
      logImport_(key, "이미지 실패", 0, String(imgErr) + " (문항 텍스트는 이미 반영되어 있음)");
      Logger.log("이미지 추출 실패 [%s]: %s (텍스트는 이미 반영됨)", key, imgErr);
    }

    // 3단계: 새로 들어온 문항에 대해 암기카드를 자동 동기화(가벼운 텍스트 호출이라 대부분 빠르게 끝남).
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      logImport_(key, "암기카드 대기", 0, "시간 초과 우려로 건너뜀 — syncFlashcardsFromQuestions()를 나중에 직접 실행하세요.");
      return;
    }
    try {
      const added = syncFlashcardsFromQuestions();
      logImport_(key, "암기카드 동기화", added, added + "개 신규 카드 추가됨");
    } catch (flashErr) {
      logImport_(key, "암기카드 실패", 0, String(flashErr));
      Logger.log("암기카드 동기화 실패 [%s]: %s", key, flashErr);
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

/* ---------------- 이미지 추출 (PDF → 구글문서 변환 → 인라인 이미지 수집) ---------------- */
// 문제지 PDF를 임시로 구글 문서로 변환하면, PDF에 내장된 이미지가 문서 안에 인라인 이미지로
// 그대로 들어갑니다. 문서를 순서대로 훑으면서 "N." 형태의 문항 번호를 만날 때마다 "지금부터는
// N번 문제"로 기억해두고, 그 사이에 나오는 인라인 이미지를 N번 문제의 이미지로 저장합니다.
function extractImagesFromPdf_(questionFile, roundKey) {
  if (typeof Drive === "undefined") {
    throw new Error("Drive 고급 서비스가 꺼져 있습니다. 왼쪽 '서비스' + 버튼 > Drive API 추가 필요.");
  }
  const props = PropertiesService.getScriptProperties();
  const imageRootId = props.getProperty("PDF_IMAGE_ID");
  if (!imageRootId) throw new Error("이미지 폴더가 없습니다. setupPdfFolders()를 먼저 실행하세요.");
  const imageRoot = DriveApp.getFolderById(imageRootId);
  const roundFolder = getOrCreateFolder_(imageRoot, roundKey.replace(/[\\\/:*?"<>|]/g, "_"));

  const blob = questionFile.getBlob();
  const tempMeta = Drive.Files.create(
    { name: "TEMP_" + questionFile.getName(), mimeType: MimeType.GOOGLE_DOCS },
    blob
  );
  const docId = tempMeta.id;
  const numToUrl = {};

  try {
    const body = DocumentApp.openById(docId).getBody();
    let currentNum = null;
    const n = body.getNumChildren();
    for (let i = 0; i < n; i++) {
      const el = body.getChild(i);
      const type = el.getType();
      if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
        const para = (type === DocumentApp.ElementType.PARAGRAPH) ? el.asParagraph() : el.asListItem();
        const text = para.getText();
        const m = text.match(/^\s*(\d{1,2})[.\)]\s?\S/); // "12." 또는 "12)" 뒤에 바로 내용이 오는 패턴
        if (m) {
          const num = parseInt(m[1], 10);
          if (num >= 1 && num <= 50) currentNum = num;
        }
        collectInlineImagesFromContainer_(para, currentNum, numToUrl, roundFolder, roundKey);
      } else if (type === DocumentApp.ElementType.TABLE) {
        const table = el.asTable();
        for (let r = 0; r < table.getNumRows(); r++) {
          const row = table.getRow(r);
          for (let c = 0; c < row.getNumCells(); c++) {
            const cell = row.getCell(c);
            for (let k = 0; k < cell.getNumChildren(); k++) {
              const child = cell.getChild(k);
              if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
                const cp = child.asParagraph();
                const ct = cp.getText();
                const cm = ct.match(/^\s*(\d{1,2})[.\)]\s?\S/);
                if (cm) {
                  const cn = parseInt(cm[1], 10);
                  if (cn >= 1 && cn <= 50) currentNum = cn;
                }
                collectInlineImagesFromContainer_(cp, currentNum, numToUrl, roundFolder, roundKey);
              }
            }
          }
        }
      }
    }
  } finally {
    Drive.Files.update({ trashed: true }, docId); // 임시 변환 문서는 정리(추출한 이미지 파일만 남김)
  }

  return numToUrl;
}

function collectInlineImagesFromContainer_(container, currentNum, numToUrl, roundFolder, roundKey) {
  if (currentNum === null || numToUrl[currentNum]) return; // 번호 미확정이거나 이미 이미지 확보했으면 스킵

  // 1) 본문에 딱 붙은 인라인 이미지
  const count = container.getNumChildren();
  for (let j = 0; j < count; j++) {
    const child = container.getChild(j);
    if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
      saveExtractedImage_(child.asInlineImage().getBlob(), currentNum, numToUrl, roundFolder, roundKey);
      return;
    }
  }

  // 2) 문단 옆에 "떠 있는" 배치 이미지(사진·지도 등은 PDF→문서 변환 시 이쪽으로 오는 경우가 많음)
  if (typeof container.getPositionedImages === "function") {
    const posImages = container.getPositionedImages();
    if (posImages && posImages.length) {
      saveExtractedImage_(posImages[0].getBlob(), currentNum, numToUrl, roundFolder, roundKey);
    }
  }
}

function saveExtractedImage_(imgBlob, currentNum, numToUrl, roundFolder, roundKey) {
  const filename = roundKey.replace(/\s+/g, "") + "_" + currentNum + ".png";
  const file = roundFolder.createFile(imgBlob).setName(filename);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  numToUrl[currentNum] = "https://lh3.googleusercontent.com/d/" + file.getId();
}

/* ---------------- Claude API 호출 (문항 구간을 나눠 여러 번 호출) ---------------- */
const BATCH_SIZE = 10; // 한 번에 요청할 문항 수 — 너무 크면 max_tokens에 걸려 응답이 끊김
const MAX_QUESTIONS = 50; // 한능검은 회차당 50문항

// PDF blob을 Anthropic Files API에 업로드하고 file_id를 반환한다.
// UrlFetchApp의 payload에 Blob을 그대로 넣으면 Apps Script가 자동으로 multipart/form-data로
// 인코딩해 전송한다(수동 바이트 조립 불필요, 대용량 파일에도 안전).
function uploadPdfToClaudeFiles_(blob, apiKey) {
  const safeBlob = blob.copyBlob().setName("upload.pdf"); // 한글/괄호 등이 든 원본 파일명은 Files API가 거부함
  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/files", {
    method: "post",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14"
    },
    payload: { file: safeBlob },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Files API 업로드 실패(" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300));
  }
  const body = JSON.parse(res.getContentText());
  if (!body.id) throw new Error("Files API 응답에 id가 없습니다: " + res.getContentText().slice(0, 200));
  return body.id;
}

function deleteClaudeFile_(fileId, apiKey) {
  UrlFetchApp.fetch("https://api.anthropic.com/v1/files/" + fileId, {
    method: "delete",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14"
    },
    muteHttpExceptions: true
  });
}

function extractQuestionsFromPDF_(roundKey, questionFile, answerFile, levelHint) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("스크립트 속성에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");

  // PDF를 Anthropic Files API에 한 번만 업로드하고, 이후 배치 호출들은 file_id만 참조한다.
  // (매번 base64로 통째로 재전송하면 대용량 PDF에서 Apps Script 6분 제한에 걸릴 수 있음)
  const questionFileId = uploadPdfToClaudeFiles_(questionFile.getBlob(), apiKey);
  const answerFileId = answerFile ? uploadPdfToClaudeFiles_(answerFile.getBlob(), apiKey) : null;

  const content = [];
  content.push({
    type: "document",
    source: { type: "file", file_id: questionFileId },
    cache_control: { type: "ephemeral" }
  });
  if (answerFileId) {
    content.push({
      type: "document",
      source: { type: "file", file_id: answerFileId },
      cache_control: { type: "ephemeral" }
    });
  }

  const allItems = [];
  const batchErrors = [];
  for (let start = 1; start <= MAX_QUESTIONS; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, MAX_QUESTIONS);
    try {
      const items = fetchQuestionsRangeWithRetry_(apiKey, content, roundKey, answerFile, levelHint, start, end, 0);
      allItems.push.apply(allItems, items);
    } catch (e) {
      batchErrors.push(start + "~" + end + "번: " + e);
    }
  }

  // 업로드해둔 파일은 더 이상 필요 없으니 정리(실패해도 무시 — 필수 동작 아님)
  try { deleteClaudeFile_(questionFileId, apiKey); } catch (e) {}
  if (answerFileId) { try { deleteClaudeFile_(answerFileId, apiKey); } catch (e) {} }

  if (!allItems.length) {
    throw new Error("모든 구간에서 추출 실패 — " + batchErrors.join(" | "));
  }
  if (batchErrors.length) {
    Logger.log("일부 구간 실패했지만 나머지는 성공 [%s]: %s", roundKey, batchErrors.join(" | "));
  }
  return { roundKey: roundKey, items: allItems, partialErrors: batchErrors };
}

// 구간을 요청했는데 JSON이 깨지는 등으로 실패하면, 특정 문항의 답변 내용 문제일 수 있으므로
// 범위를 절반으로 쪼개 재시도한다(최소 1문항까지). 그래도 안 되는 문항만 최종적으로 누락된다.
function fetchQuestionsRangeWithRetry_(apiKey, content, roundKey, answerFile, levelHint, start, end, depth) {
  try {
    return callClaudeBatch_(apiKey, content, roundKey, answerFile, levelHint, start, end);
  } catch (e) {
    if (end > start && depth < 5) {
      const mid = Math.floor((start + end) / 2);
      Logger.log("[%s] %s~%s번 실패 → %s~%s / %s~%s 로 쪼개 재시도: %s", roundKey, start, end, start, mid, mid + 1, end, e);
      const left = fetchQuestionsRangeWithRetry_(apiKey, content, roundKey, answerFile, levelHint, start, mid, depth + 1);
      const right = fetchQuestionsRangeWithRetry_(apiKey, content, roundKey, answerFile, levelHint, mid + 1, end, depth + 1);
      return left.concat(right);
    }
    throw e; // 1문항까지 쪼갰는데도 실패하면 그 문항만 최종 누락 처리
  }
}

function callClaudeBatch_(apiKey, docContent, roundKey, answerFile, levelHint, startNum, endNum) {
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
    `이번 요청에서는 문항 번호 ${startNum}번부터 ${endNum}번까지만 추출하세요. 그 범위를 벗어난 문항은 절대 포함하지 마세요.`,
    `문제지에 ${startNum}번부터 ${endNum}번까지 문항이 실제로 없다면(예: 마지막 구간), 빈 배열 []만 응답하세요.`,
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
    "이미지 판독이 불가능해 문제를 구성할 수 없는 극소수 문항은 배열에서 제외해도 됩니다.",
    "",
    "중요(JSON 형식 준수): 값 안에서는 큰따옴표(\")를 절대 그대로 쓰지 마세요. 사료나 신문 기사를 인용해야",
    "하면 큰따옴표 대신 작은따옴표(') 또는 「 」 를 사용하세요. 줄바꿈 문자도 넣지 말고 모든 문장을 한 줄로 이어",
    "쓰세요. 유효한 JSON 문법을 반드시 지켜야 합니다."
  ].join("\n");

  const content = docContent.concat([{ type: "text", text: instruction }]);

  const payload = {
    model: "claude-sonnet-5",
    max_tokens: 8000, // 한 구간(10문항) 분량이면 충분하고, 넘치면 다음 재시도에서 더 잘게 쪼갤 수 있음
    thinking: { type: "disabled" }, // 확장 사고를 끄지 않으면 사고 과정에 토큰을 다 써버려 답변이 비어버림
    messages: [{ role: "user", content: content }]
  };

  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14,prompt-caching-2024-07-31"
    },
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
      "응답이 비어 있음. stop_reason=" + (body.stop_reason || "?") +
      ", 블록 타입=[" + (body.content || []).map((b) => b.type).join(",") + "]"
    );
  }

  const startIdx = rawText.indexOf("[");
  const endIdx = rawText.lastIndexOf("]");
  let jsonText = (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx)
    ? rawText.slice(startIdx, endIdx + 1)
    : rawText;
  // 문자열 값 안에 이스케이프되지 않은 줄바꿈이 섞여 나오는 경우가 있어(JSON 문법 위반), 공백으로 치환
  jsonText = jsonText.replace(/[\r\n]+/g, " ");

  let items;
  try {
    items = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("JSON 파싱 실패(stop_reason=" + (body.stop_reason || "?") + "): " + jsonText.slice(0, 300));
  }
  if (!Array.isArray(items)) {
    throw new Error("배열이 아닌 응답: " + jsonText.slice(0, 200));
  }
  return items;
}

/* ---------------- 시트에 반영 ---------------- */
// imageMap을 아직 모르는 상태(텍스트 먼저 저장)로 호출하고, 나중에 fillImageUrls_로 채워 넣는 2단계 구조.
function appendQuestionsToSheet_(result, levelHint, imageMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("questions");
  if (!sheet) throw new Error("questions 시트가 없습니다. 먼저 setupSheets()를 실행하세요.");

  const existingIds = new Set(
    sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues().flat().filter(String)
  );
  const eraSet = new Set(["선사시대","고조선~여러 나라","삼국시대","남북국시대","고려시대","조선전기","조선후기","근대","일제강점기","현대"]);
  const roundDigits = result.roundKey.replace(/[^0-9]/g, "");
  imageMap = imageMap || {};

  const rows = [];
  const rowMeta = []; // 나중에 이미지 채워 넣을 때 필요한 (시트 행 번호, 문항 번호) 매핑
  result.items.forEach((it) => {
    const level = levelHint || (it.level === "기본" ? "기본" : "심화");
    const levelLetter = level === "기본" ? "b" : "s";
    const id = "h" + roundDigits + levelLetter + "_" + String(it.num).padStart(2, "0");
    if (existingIds.has(id)) return; // 중복 방지
    if (!it.q || !Array.isArray(it.choices) || it.choices.length !== 4) return;
    const answerNum = Number(it.answer);
    if (![1,2,3,4].includes(answerNum)) return;
    const era = eraSet.has(it.era) ? it.era : "현대"; // 알 수 없는 값이면 임시로 '현대'에 넣고 나중에 검수
    const imageUrl = imageMap[it.num] || "";
    rows.push([id, era, it.category || "", "기출", level, it.q,
      it.choices[0], it.choices[1], it.choices[2], it.choices[3],
      answerNum, it.explanation || "", imageUrl]);
    rowMeta.push({ num: it.num });
    existingIds.add(id);
  });

  let startRow = -1;
  if (rows.length) {
    startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 13).setValues(rows);
  }
  return { added: rows.length, startRow: startRow, rowMeta: rowMeta };
}

// 이미지맵을 이미 저장된 행에 나중에 채워 넣는다(imageUrl은 마지막 열=13번째 열 고정).
function fillImageUrls_(sheet, startRow, rowMeta, imageMap) {
  if (startRow === -1 || !rowMeta.length || !imageMap) return 0;
  let filled = 0;
  rowMeta.forEach((meta, i) => {
    const url = imageMap[meta.num];
    if (url) {
      sheet.getRange(startRow + i, 13).setValue(url);
      filled++;
    }
  });
  return filled;
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
