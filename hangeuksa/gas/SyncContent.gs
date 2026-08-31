/**
 * 史 한국사 스터디 — flashcards / concepts 자동 채우기
 *
 * [flashcards] questions 시트에 있는데 아직 암기카드가 없는 문항을 찾아, 핵심 용어+뜻풀이로
 *   변환해 flashcards 시트에 자동 추가합니다. PDF 처리가 끝날 때마다 자동 실행되며,
 *   수동으로 questions에 문제를 추가한 경우를 위해 별도 시간 트리거로도 등록해두면 좋습니다.
 *   함수: syncFlashcardsFromQuestions
 *
 * [concepts] 시대별 핵심 개념·사건을 한 번에 생성합니다. 이미 있는 제목과 겹치지 않게
 *   새 항목 위주로 만들어지며, 다시 실행하면 그때마다 더 채워집니다.
 *   함수: generateConceptsForAllEras
 *
 * 이 파일은 Code.gs의 ERA_LIST 상수를 그대로 재사용합니다(같은 프로젝트 안에서는 파일 간
 * 최상위 const/함수가 전역으로 공유되므로 별도 선언 불필요).
 */

/* ==================== flashcards 자동 동기화 ==================== */

function syncFlashcardsFromQuestions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("questions");
  const fSheet = ss.getSheetByName("flashcards");
  if (!qSheet || !fSheet) { Logger.log("questions 또는 flashcards 시트가 없습니다."); return 0; }

  const qRows = qSheet.getDataRange().getValues();
  if (qRows.length < 2) { Logger.log("questions에 데이터가 없습니다."); return 0; }
  const qHeaders = qRows[0].map(String);
  const idx = (name) => qHeaders.indexOf(name);
  const need = ["id","era","q","choice1","choice2","choice3","choice4","answer","explanation"];
  if (need.some((n) => idx(n) === -1)) {
    Logger.log("questions 헤더가 예상과 다릅니다: %s", qHeaders.join(", "));
    return 0;
  }

  const existingFlashIds = new Set(
    fSheet.getRange(2, 1, Math.max(fSheet.getLastRow() - 1, 0), 1).getValues().flat().filter(String)
  );

  const targets = [];
  for (let i = 1; i < qRows.length; i++) {
    const r = qRows[i];
    const qid = r[idx("id")];
    if (!qid) continue;
    const flashId = "fq_" + qid;
    if (existingFlashIds.has(flashId)) continue;
    const answerNum = Number(r[idx("answer")]);
    const choices = [r[idx("choice1")], r[idx("choice2")], r[idx("choice3")], r[idx("choice4")]];
    targets.push({
      qid: String(qid),
      flashId: flashId,
      era: r[idx("era")],
      q: r[idx("q")],
      correctChoice: choices[answerNum - 1] || choices[0] || "",
      explanation: r[idx("explanation")]
    });
  }

  if (!targets.length) {
    Logger.log("새로 만들 암기카드가 없습니다(모든 문항이 이미 동기화됨).");
    return 0;
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) { Logger.log("ANTHROPIC_API_KEY가 설정되어 있지 않습니다."); return 0; }

  const FLASH_BATCH = 25;
  let totalAdded = 0;
  for (let start = 0; start < targets.length; start += FLASH_BATCH) {
    const batch = targets.slice(start, start + FLASH_BATCH);
    try {
      const cards = callClaudeForFlashcards_(apiKey, batch);
      const rows = [];
      cards.forEach((c) => {
        const t = batch.find((b) => b.qid === String(c.qid));
        if (!t || !c.term) return;
        rows.push([t.flashId, t.era, c.term, c.def || ""]);
      });
      if (rows.length) {
        fSheet.getRange(fSheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
        totalAdded += rows.length;
      }
    } catch (e) {
      Logger.log("암기카드 배치 실패(%s~%s): %s", start + 1, start + batch.length, e);
    }
  }
  Logger.log("암기카드 %s개 추가 완료.", totalAdded);
  return totalAdded;
}

function callClaudeForFlashcards_(apiKey, batch) {
  const listText = batch.map((t, i) =>
    (i + 1) + ". [id:" + t.qid + "] (" + t.era + ") 문제: " + t.q +
    " / 정답: " + t.correctChoice + " / 해설: " + t.explanation
  ).join("\n");

  const instruction = [
    "아래는 한국사 문제 목록입니다. 각 문제가 다루는 핵심 용어(인물·사건·제도·문화유산 등) 하나와,",
    "그 용어에 대한 1~2문장의 뜻풀이를 만들어주세요. 문제 문장을 그대로 반복하지 말고, 암기용",
    "'용어 카드'로 재구성하세요.",
    "",
    "다음 JSON 배열 형식으로만 응답하세요. 다른 설명 없이 이 배열만 출력합니다.",
    "값 안에는 큰따옴표(\")를 쓰지 말고(인용은 작은따옴표나 「 」 사용), 줄바꿈 없이 한 줄로 이어쓰세요.",
    '[{"qid": "문제 id 그대로", "term": "핵심 용어", "def": "뜻풀이 1~2문장"}]',
    "",
    "문제 목록:",
    listText
  ].join("\n");

  const payload = {
    model: "claude-sonnet-5",
    max_tokens: 4000,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: instruction }]
  };

  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Claude API 오류(" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300));
  }
  const body = JSON.parse(res.getContentText());
  const rawText = (body.content || []).map((b) => b.text || "").join("\n").trim();
  if (!rawText) throw new Error("응답이 비어 있음(stop_reason=" + (body.stop_reason || "?") + ")");

  const startIdx = rawText.indexOf("[");
  const endIdx = rawText.lastIndexOf("]");
  let jsonText = (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) ? rawText.slice(startIdx, endIdx + 1) : rawText;
  jsonText = jsonText.replace(/[\r\n]+/g, " ");

  const items = JSON.parse(jsonText);
  if (!Array.isArray(items)) throw new Error("배열이 아닌 응답: " + jsonText.slice(0, 200));
  return items;
}

/* ==================== concepts 일괄 생성 ==================== */

function generateConceptsForAllEras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("concepts");
  if (!sheet) { Logger.log("concepts 시트가 없습니다. 먼저 setupSheets()를 실행하세요."); return 0; }

  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) { Logger.log("ANTHROPIC_API_KEY가 설정되어 있지 않습니다."); return 0; }

  const rows = sheet.getDataRange().getValues();
  const existingByEra = {};
  let maxSeq = 0;
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || "");
    const era = rows[i][1];
    const title = rows[i][3];
    if (!id) continue;
    const m = id.match(/^c(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    if (era) (existingByEra[era] = existingByEra[era] || []).push(title);
  }

  let seq = maxSeq;
  let totalAdded = 0;
  ERA_LIST.forEach((era) => {
    try {
      const items = callClaudeForConcepts_(apiKey, era, existingByEra[era] || []);
      const newRows = [];
      items.forEach((item) => {
        if (!item || !item.title) return;
        seq++;
        const id = "c" + String(seq).padStart(4, "0");
        newRows.push([id, era, item.type === "사건" ? "사건" : "개념", item.title, item.content || ""]);
      });
      if (newRows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
        totalAdded += newRows.length;
      }
      Logger.log("[%s] %s개 추가", era, newRows.length);
    } catch (e) {
      Logger.log("[%s] 실패: %s", era, e);
    }
  });

  Logger.log("개념정리 총 %s개 추가 완료. (다시 실행하면 겹치지 않는 항목이 더 추가됩니다)", totalAdded);
  return totalAdded;
}

// 시대 하나에 대해서만 요청 — 한 번에 다 요청하면 응답이 너무 길어져 편집기에서 취소되기 쉬움
function callClaudeForConcepts_(apiKey, era, existingTitles) {
  const instruction = [
    `한국사능력검정시험 학습자를 위한 '${era}' 시대의 개념정리 카드를 만들어주세요.`,
    "시험에 자주 나오는 핵심 개념·사건을 6~8개 뽑아 정리해주세요.",
    "이미 있는 항목(" + (existingTitles.join(", ") || "없음") + ")과는 겹치지 않게 새 항목 위주로 만들어주세요.",
    "",
    "각 항목은 '개념'(제도·문화유산·인물·사상 등) 또는 '사건'(전쟁·정변·운동·조약 등) 중 하나로",
    "분류하고, content는 배경-내용-의의를 3~5문장으로 서술하세요(학생이 읽고 이해할 수 있게).",
    "",
    "다음 JSON 배열 형식으로만 응답하세요. 다른 설명 없이 이 배열만 출력합니다.",
    "값 안에는 큰따옴표(\")를 쓰지 말고(인용은 작은따옴표나 「 」 사용), 줄바꿈 없이 한 줄로 이어쓰세요.",
    '[{"type":"개념","title":"...","content":"..."}]'
  ].join("\n");

  const payload = {
    model: "claude-sonnet-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: instruction }]
  };

  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Claude API 오류(" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300));
  }
  const body = JSON.parse(res.getContentText());
  const rawText = (body.content || []).map((b) => b.text || "").join("\n").trim();
  if (!rawText) throw new Error("응답이 비어 있음(stop_reason=" + (body.stop_reason || "?") + ")");

  const startIdx = rawText.indexOf("[");
  const endIdx = rawText.lastIndexOf("]");
  let jsonText = (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) ? rawText.slice(startIdx, endIdx + 1) : rawText;
  jsonText = jsonText.replace(/[\r\n]+/g, " ");

  const items = JSON.parse(jsonText);
  if (!Array.isArray(items)) throw new Error("배열이 아닌 응답: " + jsonText.slice(0, 200));
  return items;
}
