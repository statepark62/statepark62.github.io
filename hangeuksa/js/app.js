/* ============================================================
   史 한국사 스터디 — 앱 로직
   ============================================================ */

const DEFAULT_DATA_URL = "./data/questions.json";

let BANK = { questions: [], flashcards: [] };
let RECORDS = {};     // qid -> {qid, correctCount, wrongCount, streak}
let SETTINGS = { examDate: "", level: "심화(1~3급)", dataUrl: DEFAULT_DATA_URL, lastSync: "" };

let quizState = { era: "all", source: "all", level: "all", current: null, answered: false };
let flashState = { era: "all", pool: [], idx: 0 };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- 초기화 ---------------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadSettings();
  await loadRecords();
  await loadBank();
  buildEraSelects();
  renderQuiz();
  renderFlash();
  renderWrongNotes();
  renderStats();
  updateDday();
  bindNav();
  bindSettingsSheet();
  watchOnline();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

/* ---------------- 데이터 로드 ---------------- */
async function loadBank() {
  try {
    const res = await fetch(SETTINGS.dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch fail");
    const json = await res.json();
    BANK = json;
    await Store.idbPut("bank", { key: "main", data: json, ts: Date.now() });
    SETTINGS.lastSync = new Date().toLocaleString("ko-KR");
    await saveSettings();
  } catch (e) {
    const cached = await Store.idbGet("bank", "main");
    if (cached) {
      BANK = cached.data;
    } else {
      BANK = { questions: [], flashcards: [] };
    }
  }
  refreshSyncStatus();
}

async function loadRecords() {
  const all = await Store.idbGetAll("records");
  RECORDS = {};
  all.forEach((r) => (RECORDS[r.qid] = r));
}

async function loadSettings() {
  const rows = await Store.idbGetAll("settings");
  rows.forEach((r) => {
    if (r.key === "examDate") SETTINGS.examDate = r.value;
    if (r.key === "level") SETTINGS.level = r.value;
    if (r.key === "dataUrl") SETTINGS.dataUrl = r.value || DEFAULT_DATA_URL;
    if (r.key === "lastSync") SETTINGS.lastSync = r.value;
    if (r.key === "globalStreak") SETTINGS.globalStreak = r.value;
  });
}

async function saveSettings() {
  await Store.idbPut("settings", { key: "examDate", value: SETTINGS.examDate });
  await Store.idbPut("settings", { key: "level", value: SETTINGS.level });
  await Store.idbPut("settings", { key: "dataUrl", value: SETTINGS.dataUrl });
  await Store.idbPut("settings", { key: "lastSync", value: SETTINGS.lastSync });
  await Store.idbPut("settings", { key: "globalStreak", value: SETTINGS.globalStreak || 0 });
}

async function saveRecord(qid, correct) {
  const r = RECORDS[qid] || { qid, correctCount: 0, wrongCount: 0, streak: 0 };
  if (correct) {
    r.correctCount++;
    r.streak = Math.min((r.streak || 0) + 1, 2);
    SETTINGS.globalStreak = (SETTINGS.globalStreak || 0) + 1;
  } else {
    r.wrongCount++;
    r.streak = 0;
    SETTINGS.globalStreak = 0;
  }
  r.lastSeenAt = Date.now();
  RECORDS[qid] = r;
  await Store.idbPut("records", r);
  await saveSettings();
}

/* ---------------- 탭 내비게이션 ---------------- */
function bindNav() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  if (name === "wrong") renderWrongNotes();
  if (name === "stats") renderStats();
}

/* ---------------- 시대 필터 셀렉트 구성 ---------------- */
function buildEraSelects() {
  const eras = ["all", ...Array.from(new Set(BANK.questions.map((q) => q.era)))];
  const labels = eras.map((e) => (e === "all" ? "전체 시대" : e));
  ["#quiz-era", "#flash-era"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = eras.map((e, i) => `<option value="${e}">${labels[i]}</option>`).join("");
  });
  $("#quiz-era").addEventListener("change", (e) => { quizState.era = e.target.value; renderQuiz(); });
  $("#quiz-source").addEventListener("change", (e) => { quizState.source = e.target.value; renderQuiz(); });
  $("#quiz-level").addEventListener("change", (e) => { quizState.level = e.target.value; renderQuiz(); });
  $("#flash-era").addEventListener("change", (e) => { flashState.era = e.target.value; flashState.idx = 0; renderFlash(); });
}

/* ---------------- 문제풀이 ---------------- */
function weightedPick(pool) {
  const weights = pool.map((q) => {
    const r = RECORDS[q.id];
    if (!r) return 3; // 처음 보는 문제는 우선순위 보통
    if (r.streak >= 2) return 1; // 마스터한 문제는 드물게
    return 3 + r.wrongCount * 3; // 틀린 적 많을수록 더 자주
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rnd -= weights[i];
    if (rnd <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function getQuizPool(era, source, level) {
  return BANK.questions.filter((q) => {
    const eraOk = era === "all" || q.era === era;
    const srcOk = !source || source === "all" || q.source === source;
    const lvlOk = !level || level === "all" || (q.level || "심화") === level;
    return eraOk && srcOk && lvlOk;
  });
}

function renderQuiz(forceQ) {
  const card = $("#quiz-card");
  const pool = getQuizPool(quizState.era, quizState.source, quizState.level);
  if (!pool.length) {
    card.innerHTML = `<div class="empty-state"><div class="glyph">史</div><p>해당 조건의 문제가 없습니다.<br>필터를 바꿔보세요.</p></div>`;
    return;
  }
  const q = forceQ || weightedPick(pool);
  quizState.current = q;
  quizState.answered = false;

  card.innerHTML = `
    <div class="tag-row">
      <span class="tag era">${q.era}</span>
      <span class="tag cat">${q.category}</span>
      <span class="tag lvl-${q.level || "심화"}">${q.level || "심화"}</span>
      <span class="tag src-${q.source || "기출"}">${q.source || "기출"}</span>
    </div>
    <p class="q-text">${q.q}</p>
    <div class="choices">
      ${q.choices.map((c, i) => `<button class="choice-btn" data-i="${i}"><span class="idx">${i + 1}</span><span>${c}</span></button>`).join("")}
    </div>
    <div class="explain-box" id="explain-box">${q.explanation}</div>
    <button class="next-btn" id="next-btn">다음 문제 →</button>
  `;

  $$(".choice-btn", card).forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(parseInt(btn.dataset.i, 10)));
  });
  $("#next-btn").addEventListener("click", () => renderQuiz());
}

async function handleAnswer(choiceIdx) {
  if (quizState.answered) return;
  quizState.answered = true;
  const q = quizState.current;
  const correct = choiceIdx === q.answer;

  $$(".choice-btn").forEach((btn) => {
    const i = parseInt(btn.dataset.i, 10);
    btn.classList.add("disabled");
    if (i === q.answer) btn.classList.add("correct");
    else if (i === choiceIdx) btn.classList.add("wrong");
  });

  $("#explain-box").classList.add("show");
  $("#next-btn").classList.add("show");

  playSeal(correct);
  await saveRecord(q.id, correct);
}

function playSeal(correct) {
  const el = $("#seal-stamp");
  el.classList.remove("play", "wrong");
  void el.offsetWidth; // 리플로우로 애니메이션 재시작
  el.textContent = correct ? "認" : "誤";
  if (!correct) el.classList.add("wrong");
  el.classList.add("play");
}

/* ---------------- 플래시카드 ---------------- */
function renderFlash() {
  const pool = flashState.era === "all" ? BANK.flashcards : BANK.flashcards.filter((f) => f.era === flashState.era);
  flashState.pool = pool;
  const wrap = $("#flash-wrap");
  if (!pool.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="glyph">史</div><p>암기카드가 없습니다.</p></div>`;
    return;
  }
  if (flashState.idx >= pool.length) flashState.idx = 0;
  const f = pool[flashState.idx];

  wrap.innerHTML = `
    <div class="flash-progress">${flashState.idx + 1} / ${pool.length}</div>
    <div class="flash-card" id="flash-card">
      <div class="flash-inner">
        <div class="flash-face front">
          <div class="flash-era">${f.era}</div>
          <div class="flash-term">${f.term}</div>
          <div class="flip-hint">탭하여 뜻 보기</div>
        </div>
        <div class="flash-face back">
          <div class="flash-def">${f.def}</div>
          <div class="flip-hint">탭하여 되돌리기</div>
        </div>
      </div>
    </div>
    <div class="flash-nav">
      <button id="flash-prev">← 이전</button>
      <button id="flash-next" class="primary">다음 →</button>
    </div>
  `;

  $("#flash-card").addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("flipped");
  });
  $("#flash-prev").addEventListener("click", () => {
    flashState.idx = (flashState.idx - 1 + pool.length) % pool.length;
    renderFlash();
  });
  $("#flash-next").addEventListener("click", () => {
    flashState.idx = (flashState.idx + 1) % pool.length;
    renderFlash();
  });
}

/* ---------------- 오답노트 ---------------- */
function renderWrongNotes() {
  const list = $("#wrong-list");
  const items = Object.values(RECORDS)
    .filter((r) => r.wrongCount > 0 && r.streak < 2)
    .sort((a, b) => b.wrongCount - a.wrongCount);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="glyph">史</div><p>아직 쌓인 오답이 없습니다.<br>문제를 풀면 여기에 자동으로 모입니다.</p></div>`;
    return;
  }

  list.innerHTML = items
    .map((r) => {
      const q = BANK.questions.find((qq) => qq.id === r.qid);
      if (!q) return "";
      const dots = [0, 1].map((i) => `<span class="${i < (r.streak || 0) ? "on" : ""}"></span>`).join("");
      return `
        <div class="wrong-item" data-qid="${q.id}">
          <div class="wtop">
            <span class="tag era">${q.era}</span>
            <div class="mastery-dots">${dots}</div>
          </div>
          <div class="wq">${q.q}</div>
        </div>`;
    })
    .join("");

  $$(".wrong-item", list).forEach((el) => {
    el.addEventListener("click", () => {
      const q = BANK.questions.find((qq) => qq.id === el.dataset.qid);
      switchView("quiz");
      renderQuiz(q);
      $("main").scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------------- 통계 ---------------- */
function renderStats() {
  const recs = Object.values(RECORDS);
  const totalAnswered = recs.reduce((s, r) => s + r.correctCount + r.wrongCount, 0);
  const totalCorrect = recs.reduce((s, r) => s + r.correctCount, 0);
  const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const mastered = recs.filter((r) => r.streak >= 2).length;

  $("#stat-total").textContent = totalAnswered;
  $("#stat-accuracy").textContent = accuracy + "%";
  $("#stat-streak").textContent = SETTINGS.globalStreak || 0;
  $("#stat-mastered").textContent = mastered;

  const eras = Array.from(new Set(BANK.questions.map((q) => q.era)));
  const eraBox = $("#era-bars");
  eraBox.innerHTML = eras
    .map((era) => {
      const qids = BANK.questions.filter((q) => q.era === era).map((q) => q.id);
      let c = 0, t = 0;
      qids.forEach((id) => {
        const r = RECORDS[id];
        if (r) { c += r.correctCount; t += r.correctCount + r.wrongCount; }
      });
      const pct = t ? Math.round((c / t) * 100) : 0;
      return `
        <div class="era-bar-row">
          <div class="erb-top"><span>${era}</span><span>${t ? pct + "%" : "미학습"}</span></div>
          <div class="era-bar-track"><div class="era-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");
}

/* ---------------- D-day ---------------- */
function updateDday() {
  const chip = $("#dday-chip");
  if (!SETTINGS.examDate) {
    chip.textContent = "시험일 미설정";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(SETTINGS.examDate);
  const diff = Math.round((target - today) / 86400000);
  chip.textContent = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

/* ---------------- 설정 시트 ---------------- */
function bindSettingsSheet() {
  const overlay = $("#sheet-overlay");
  const sheet = $("#settings-sheet");

  $("#gear-btn").addEventListener("click", () => {
    $("#set-examdate").value = SETTINGS.examDate || "";
    $("#set-level").value = SETTINGS.level || "심화(1~3급)";
    $("#set-dataurl").value = SETTINGS.dataUrl || DEFAULT_DATA_URL;
    refreshSyncStatus();
    overlay.classList.add("show");
    sheet.classList.add("show");
  });

  const close = () => { overlay.classList.remove("show"); sheet.classList.remove("show"); };
  overlay.addEventListener("click", close);

  $("#save-settings").addEventListener("click", async () => {
    SETTINGS.examDate = $("#set-examdate").value;
    SETTINGS.level = $("#set-level").value;
    SETTINGS.dataUrl = $("#set-dataurl").value.trim() || DEFAULT_DATA_URL;
    await saveSettings();
    updateDday();
    close();
  });

  $("#sync-now").addEventListener("click", async () => {
    SETTINGS.dataUrl = $("#set-dataurl").value.trim() || DEFAULT_DATA_URL;
    $("#sync-status").textContent = "동기화 중...";
    await loadBank();
    buildEraSelects();
    renderQuiz();
    renderFlash();
    renderStats();
  });
}

function refreshSyncStatus() {
  const el = $("#sync-status");
  if (!el) return;
  el.textContent = `문제 ${BANK.questions.length}개 · 암기카드 ${BANK.flashcards.length}개 보유 · 마지막 동기화: ${SETTINGS.lastSync || "-"}`;
}

/* ---------------- 오프라인 표시 ---------------- */
function watchOnline() {
  const badge = $("#offline-badge");
  const update = () => badge.classList.toggle("show", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
