/* 한자 징검다리 앱 로직 (의존 라이브러리 없음). 데이터는 data.js의 window.KANJI_DATA. */
(function () {
  'use strict';
  var DATA = window.KANJI_DATA || { meta: {}, kanji: [] };
  var KJ = DATA.kanji, BY = {};
  KJ.forEach(function (e) { BY[e.k] = e; });
  var REPORT_FORM_URL = ''; // 구글 폼 주소를 넣으면 설정 화면에 '신고 폼 열기' 링크가 생김
  var INTERVALS = [0, 1, 3, 7, 14, 30];
  var KEY = 'kj_state_v1';

  /* ---------- 저장 ---------- */
  function load() { try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} return null; }
  var S = load() || {};
  S.prog = S.prog || {};
  S.cfg = Object.assign({ perDay: 5, level: 0 }, S.cfg || {});
  S.newToday = S.newToday || { d: '', n: 0 };
  S.reports = S.reports || [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- 도구 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function inLevel(e) { return !S.cfg.level || e.lv === S.cfg.level; }
  function stateOf(k) { var p = S.prog[k]; if (!p || !p.seen) return 0; return p.b >= 4 ? 2 : 1; }

  /* 받침 → 음독 끝소리 규칙 */
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄱ', 'ㄴ', 'ㄴ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var ENDING = { 'ㄱ': 'く·き', 'ㅂ': 'う', 'ㄹ': 'つ·ち', 'ㄴ': 'ん', 'ㅁ': 'ん', 'ㅇ': 'う·い' };
  function jong(syl) { var c = (syl || '').charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return ''; return JONG[c % 28]; }

  var ALLW = [];
  KJ.forEach(function (e) { e.ex.forEach(function (w) { ALLW.push({ w: w.w, r: w.r, ko: w.ko, k: e.k }); }); });

  /* ---------- 상태 ---------- */
  var V = { view: 'home', sess: null, detail: null, report: null, toast: '', confirmReset: false, q: '', lv: 0 };
  var app = document.getElementById('app');

  /* ---------- 문제 만들기 ---------- */
  function sample(pool, n, avoid) {
    var out = [], seen = {};
    shuffle(pool).forEach(function (x) { if (out.length < n && !seen[x] && avoid.indexOf(x) < 0) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function qHun(e) {
    var same = KJ.filter(function (x) { return x.hun && x.k !== e.k && x.lv === e.lv; });
    var any = KJ.filter(function (x) { return x.hun && x.k !== e.k; });
    var pool = (same.length >= 8 ? same : any).map(function (x) { return x.hun; });
    var ds = sample(pool, 3, [e.hun]);
    return {
      type: 'hun', tag: '훈음', cls: '', prompt: '<div class="qk" lang="ja">' + esc(e.k) + '</div><p>이 한자의 훈음은?</p>',
      choices: shuffle([e.hun].concat(ds)), ok: [e.hun], why: '<b lang="ja" class="kj">' + esc(e.k) + '</b> = ' + esc(e.hun) + (e.ko[0] ? ' · 한국음 ‘' + esc(e.ko[0]) + '’' : '')
    };
  }
  function qOn(e) {
    var good = e.on.filter(function (o) { return e.exc.indexOf(o) < 0; });
    if (!good.length) good = e.on;
    var ans = pick(good);
    var pool = [];
    KJ.forEach(function (x) { if (x.k !== e.k) x.on.forEach(function (o) { pool.push(o); }); });
    var ds = sample(pool, 3, e.on);
    return {
      type: 'on', tag: '한국음 → 음독', cls: 'jp', prompt: '<div class="qk" lang="ja">' + esc(e.k) + '</div><p>한국음은 ‘' + esc(e.ko[0]) + '’이에요. 일본 음독은?</p>',
      choices: shuffle([ans].concat(ds)), ok: e.on, why: esc(e.link || ('한국음 ‘' + e.ko[0] + '’ → ' + e.on.join('·')))
    };
  }
  function qRead(e) {
    var w = pick(e.ex), len = w.r.length;
    var near = ALLW.filter(function (x) { return x.r !== w.r && Math.abs(x.r.length - len) <= 1; }).map(function (x) { return x.r; });
    var ds = sample(near.length >= 6 ? near : ALLW.map(function (x) { return x.r; }), 3, [w.r]);
    return {
      type: 'read', tag: '읽기', cls: 'jp', prompt: '<div class="qw" lang="ja">' + esc(w.w) + '</div><p>읽는 법은?</p>',
      choices: shuffle([w.r].concat(ds)), ok: [w.r], why: '<b lang="ja" class="kj">' + esc(w.w) + '</b> = 한국어 ‘' + esc(w.ko) + '’ · ' + esc(w.r) + (w.rel === 'similar' && w.note ? '<br>' + esc(w.note) : '')
    };
  }
  function qKo(e) {
    var w = pick(e.ex), len = w.w.length;
    var near = ALLW.filter(function (x) { return x.w !== w.w && x.ko !== w.ko && x.w.length === len; }).map(function (x) { return x.w; });
    var ds = sample(near.length >= 6 ? near : ALLW.filter(function (x) { return x.ko !== w.ko; }).map(function (x) { return x.w; }), 3, [w.w]);
    return {
      type: 'ko', tag: '한국어 → 일본어', cls: 'jp', prompt: '<div class="qko">' + esc(w.ko) + '</div><p>일본어로는 어떤 단어일까요?</p>',
      choices: shuffle([w.w].concat(ds)), ok: [w.w], why: '한국어 ‘' + esc(w.ko) + '’ = <b lang="ja" class="kj">' + esc(w.w) + '</b> (' + esc(w.r) + ')' + (w.rel === 'similar' && w.note ? '<br>' + esc(w.note) : '')
    };
  }
  function makeQuestion(e, prefer) {
    var types = [];
    if (e.hun) types.push('hun');
    if (e.on.length && e.ko.length) types.push('on');
    if (e.ex.length) { types.push('read'); types.push('ko'); }
    var p = S.prog[e.k] || {};
    var t = prefer && types.indexOf(prefer) >= 0 ? prefer : null;
    if (!t) { var c = types.filter(function (x) { return x !== p.lt; }); t = pick(c.length ? c : types); }
    return { t: t, q: { hun: qHun, on: qOn, read: qRead, ko: qKo }[t](e) };
  }

  /* ---------- 복습 일정 ---------- */
  function dueList() {
    var t = today();
    return KJ.filter(function (e) { var p = S.prog[e.k]; return p && p.seen && p.due <= t && inLevel(e); })
      .sort(function (a, b) { return S.prog[a.k].due < S.prog[b.k].due ? -1 : 1; });
  }
  function newLeft() { var t = today(); if (S.newToday.d !== t) return S.cfg.perDay; return Math.max(0, S.cfg.perDay - S.newToday.n); }
  function unseen() { return KJ.filter(function (e) { return !(S.prog[e.k] && S.prog[e.k].seen) && inLevel(e); }); }
  function bump(k, correct) {
    var p = S.prog[k] || { b: 0, ok: 0, ng: 0, seen: true };
    p.seen = true;
    if (correct) { p.b = Math.min(5, p.b + 1); p.ok++; } else { p.b = Math.max(0, p.b - 2); p.ng++; }
    p.due = addDays(INTERVALS[p.b]);
    S.prog[k] = p;
  }
  function startSession(extra) {
    var q = [];
    dueList().slice(0, 20).forEach(function (e) { q.push({ k: e.k, mode: 'rev', n: 1 }); });
    var n = extra ? S.cfg.perDay : newLeft();
    unseen().slice(0, n).forEach(function (e) { q.push({ k: e.k, mode: 'new', n: 2 }); });
    if (!q.length) { toast('지금 할 학습이 없어요. 내일 다시 오세요.'); return; }
    var t = today();
    if (S.newToday.d !== t) S.newToday = { d: t, n: 0 };
    S.newToday.n += q.filter(function (x) { return x.mode === 'new'; }).length;
    save();
    V.sess = { queue: q, i: 0, total: q.length, step: null, right: 0, wrong: 0, retry: {} };
    V.view = 'study';
    nextStep();
  }
  /* 하루 한도와 상관없이 새 한자를 지금 불러온다. list: 한자 데이터 배열 */
  function forceNew(list) {
    var s = V.sess, queued = {};
    if (s) s.queue.forEach(function (x) { queued[x.k] = 1; });
    list = list.filter(function (e) { return !queued[e.k] && stateOf(e.k) === 0; });
    if (!list.length) { toast('더 불러올 새 한자가 없어요.'); return; }
    var t = today();
    if (S.newToday.d !== t) S.newToday = { d: t, n: 0 };
    S.newToday.n += list.length; save();
    var items = list.map(function (e) { return { k: e.k, mode: 'new', n: 2 }; });
    if (!s) {
      V.sess = { queue: items, i: 0, total: items.length, step: null, right: 0, wrong: 0, retry: {} };
      V.view = 'study'; V.detail = null; nextStep(); return;
    }
    var done = s.step && s.step.kind === 'done';
    var pos = done ? s.queue.length : s.i + 1;
    Array.prototype.splice.apply(s.queue, [pos, 0].concat(items));
    s.total += items.length;
    V.view = 'study'; V.detail = null;
    if (done) nextStep(); else { render(); toast('새 한자 ' + items.length + '개를 곧 보여 드릴게요.'); }
  }
  function nextNew(n) {
    var queued = {};
    if (V.sess) V.sess.queue.forEach(function (x) { queued[x.k] = 1; });
    return unseen().filter(function (e) { return !queued[e.k]; }).slice(0, n);
  }
  function nextStep() {
    var s = V.sess;
    if (s.i >= s.queue.length) { s.step = { kind: 'done' }; render(); return; }
    var it = s.queue[s.i];
    var e = BY[it.k];
    if (it.mode === 'new' && !it.shown) { it.shown = true; s.step = { kind: 'intro', e: e }; render(); return; }
    var prefer = it.mode === 'new' ? (it.n === 2 ? (e.hun ? 'hun' : 'on') : (e.ex.length ? 'ko' : 'on')) : null;
    var m = makeQuestion(e, prefer);
    s.step = { kind: 'q', e: e, q: m.q, t: m.t, answered: null };
    render();
  }
  function answer(idx) {
    var st = V.sess.step; if (st.answered != null) return;
    var val = st.q.choices[idx];
    var ok = st.q.ok.indexOf(val) >= 0;
    st.answered = idx; st.correct = ok;
    var it = V.sess.queue[V.sess.i];
    var first = !it.counted;
    if (first) { bump(st.e.k, ok); it.counted = true; }
    S.prog[st.e.k].lt = st.t;
    if (ok) V.sess.right++; else V.sess.wrong++;
    it.n--;
    if (!ok && !V.sess.retry[it.k]) { V.sess.retry[it.k] = 1; V.sess.queue.push({ k: it.k, mode: 'rev', n: 1, counted: true }); V.sess.total++; }
    save(); render();
  }
  function advance() {
    var s = V.sess, it = s.queue[s.i];
    if (it.n > 0) { /* 같은 한자의 다음 문제 */ } else { s.i++; }
    nextStep();
  }

  /* ---------- 화면 조각 ---------- */
  var ICON = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    study: '<path d="M4 5h7a3 3 0 013 3v12a2 2 0 00-2-2H4zM20 5h-7"/><path d="M20 5v13h-6"/>',
    list: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'
  };
  function tabs() {
    var items = [['home', '홈'], ['study', '학습'], ['list', '한자'], ['warn', '주의'], ['set', '설정']];
    return '<div class="tabs"><nav>' + items.map(function (t) {
      var cur = V.view === t[0] ? ' aria-current="page"' : '';
      return '<button class="tab" data-act="tab" data-v="' + t[0] + '"' + cur + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t[0] === 'set' ? 'gear' : t[0]] + '</svg>' + t[1] + '</button>';
    }).join('') + '</nav></div>';
  }
  function ruleBadge(e) {
    if (e.rule === 'match') return '<span class="chip ok">받침 규칙에 맞아요</span>';
    if (e.rule === 'weak') return '<span class="chip amber">받침이 없어 규칙이 느슨해요</span>';
    return '<span class="chip warn">예외 읽기가 있어요</span>';
  }
  function detailHTML(e, learn) {
    var h = '<div class="card">';
    h += '<div class="hero"><div class="big kj" lang="ja">' + esc(e.k) + '</div>';
    h += '<div class="hun">' + (e.hun ? esc(e.hun) : esc(e.en)) + '</div>';
    h += '<div class="chips"><span class="chip">N' + e.lv + '</span><span class="chip">' + e.st + '획</span>' + ruleBadge(e);
    if (e.ai) h += '<span class="chip amber">AI 초안</span>';
    h += '</div></div>';
    var sound = e.ko[0] || '';
    var jg = jong(sound);
    h += '<div class="bridge"><div class="ko">' + esc(sound) + '<small>' + (jg ? esc(jg) + ' 받침' : '받침 없음') + '</small></div><div class="arrow">→</div><div class="ja" lang="ja">' + esc(e.on.join('・')) + '</div></div>';
    if (e.ko.length > 1) h += '<p class="small muted center">다른 한국음: ' + esc(e.ko.slice(1).join(', ')) + '</p>';
    if (e.link) h += '<div class="field"><h3>한국음에서 일본 음독으로</h3><p>' + esc(e.link) + '</p></div>';
    if (e.excn) h += '<div class="callout amber"><b>예외 읽기</b><br>' + esc(e.excn) + '</div>';
    if (e.ex.length) {
      h += '<div class="field"><h3>한국어 한자어와 같은 단어</h3><ul class="words">';
      e.ex.forEach(function (w) {
        h += '<li><span class="w" lang="ja">' + esc(w.w) + '</span><span class="r">' + esc(w.r) + '</span><span class="eq">한국어 ‘' + esc(w.ko) + '’' + (w.rel === 'similar' && w.note ? ' · ' + esc(w.note) : '') + '</span></li>';
      });
      h += '</ul></div>';
    } else {
      h += '<div class="callout">이 한자는 한국어 한자어로 이어 줄 만한 쉬운 단어가 아직 없어요. 읽기와 뜻을 그대로 익혀 주세요.</div>';
    }
    if (e.fr.length) {
      h += '<div class="field"><h3>헷갈리기 쉬운 단어</h3><ul class="words warnlist">';
      e.fr.forEach(function (w) { h += '<li><span class="w" lang="ja">' + esc(w.w) + '</span><span class="r">' + esc(w.r) + '</span><span class="eq"><b>한국어 ‘' + esc(w.ko) + '’와 달라요.</b> ' + esc(w.note) + '</span></li>'; });
      h += '</ul></div>';
    }
    if (e.mn) h += '<div class="field"><h3>기억 도우미</h3><p>' + esc(e.mn) + '</p></div>';
    if (e.shape) h += '<div class="field"><h3>자형</h3><p>' + esc(e.shape) + '</p></div>';
    if (e.kun.length || e.kt) h += '<div class="field"><h3>훈독</h3>' + (e.kun.length ? '<p lang="ja"><b>' + esc(e.kun.join('、')) + '</b></p>' : '') + (e.kt ? '<p class="small muted">' + esc(e.kt) + '</p>' : '') + '</div>';
    if (learn && stateOf(e.k) === 0) h += '<button class="btn primary wide" data-act="learnnow" data-k="' + esc(e.k) + '">지금 이 한자 배우기</button>';
    h += '<div class="sub"><span class="small muted">뜻(영어): ' + esc(e.en) + '</span><button class="btn ghost" data-act="report" data-k="' + esc(e.k) + '">오류 신고</button></div>';
    return h + '</div>';
  }

  /* ---------- 화면 ---------- */
  function viewHome() {
    var due = dueList().length, nl = Math.min(newLeft(), unseen().length);
    var mastered = KJ.filter(function (e) { return stateOf(e.k) === 2; }).length;
    var seenN = KJ.filter(function (e) { return stateOf(e.k) >= 1; }).length;
    var h = '<div class="top"><div class="brand lang-ja" lang="ja">漢字 → 한자</div><h1>한자 징검다리</h1>';
    h += '<p class="lead muted">학교(學校)처럼 한국어에 이미 있는 한자어를 디딤돌 삼아, 일본어 한자의 음독을 건너가요.</p></div>';
    h += '<div class="stats"><div class="stat"><b>' + due + '</b><span>오늘 복습</span></div><div class="stat"><b>' + nl + '</b><span>새 한자</span></div><div class="stat"><b>' + mastered + '<small class="muted" style="font-size:16px">/' + KJ.length + '</small></b><span>익힌 한자</span></div></div>';
    var can = due + nl > 0;
    h += '<div class="row"><button class="btn primary wide" data-act="start"' + (can ? '' : ' disabled') + '>' + (can ? '오늘 학습 시작' : '오늘 학습을 모두 마쳤어요') + '</button>';
    h += '</div>';
    if (nextNew(1).length) {
      h += '<div class="sect"><p class="small muted center">오늘 한도와 상관없이 다음 새 한자를 바로 불러올 수 있어요.</p><div class="row">';
      h += '<button class="btn" style="flex:1" data-act="more" data-n="1">+1개</button>';
      h += '<button class="btn" style="flex:1" data-act="more" data-n="5">+5개</button>';
      h += '<button class="btn" style="flex:1" data-act="more" data-n="10">+10개</button></div></div>';
    }
    if (seenN === 0) h += '<div class="callout">처음이시군요. ‘오늘 학습 시작’을 누르면 새 한자 ' + S.cfg.perDay + '개를 카드로 보고 바로 퀴즈로 확인해요.</div>';
    var ex = [['学', '학', '', 'がく'], ['入', '입', 'ㅂ', 'にゅう'], ['日', '일', 'ㄹ', 'にち'], ['本', '본', 'ㄴ', 'ほん'], ['三', '삼', 'ㅁ', 'さん'], ['工', '공', 'ㅇ', 'こう']];
    h += '<div class="sect"><details><summary>한국음 받침으로 일본 음독 끝소리 짐작하기</summary>';
    h += '<div class="scroll-x"><table class="rule"><tr><th>한국음 받침</th><th>일본 음독 끝소리</th><th>예</th></tr>';
    h += '<tr><td>ㄱ</td><td>く·き</td><td><span class="on" lang="ja">学</span> 학→がく</td></tr>';
    h += '<tr><td>ㅂ</td><td>う</td><td><span class="on" lang="ja">入</span> 입→にゅう</td></tr>';
    h += '<tr><td>ㄹ</td><td>つ·ち</td><td><span class="on" lang="ja">日</span> 일→にち</td></tr>';
    h += '<tr><td>ㄴ·ㅁ</td><td>ん</td><td><span class="on" lang="ja">本</span> 본→ほん</td></tr>';
    h += '<tr><td>ㅇ</td><td>う·い</td><td><span class="on" lang="ja">工</span> 공→こう</td></tr>';
    h += '<tr><td>없음</td><td>정해져 있지 않아요</td><td><span class="on" lang="ja">二</span> 이→に</td></tr></table></div>';
    h += '<p class="small muted">모든 한자가 이 규칙을 따르지는 않아요. 예외는 한자 카드에 따로 적혀 있어요.</p></details></div>';
    var frs = []; KJ.forEach(function (e) { e.fr.forEach(function (w) { frs.push({ e: e, w: w }); }); });
    if (frs.length) {
      var f = pick(frs);
      h += '<div class="callout warn"><b>오늘의 헷갈리는 단어</b><br><span class="kj" lang="ja" style="font-size:24px">' + esc(f.w.w) + '</span> (' + esc(f.w.r) + ') ≠ 한국어 ‘' + esc(f.w.ko) + '’<br><span class="small">' + esc(f.w.note) + '</span></div>';
    }
    return h;
  }

  function viewStudy() {
    var s = V.sess;
    if (!s) {
      return '<div class="top"><h1>학습</h1></div><div class="callout">시작한 학습이 없어요. 홈에서 ‘오늘 학습 시작’을 눌러 주세요.</div><button class="btn primary wide" data-act="tab" data-v="home">홈으로</button>';
    }
    var st = s.step, pct = Math.round(100 * Math.min(s.i, s.total) / s.total);
    var h = '<div class="progressbar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>';
    if (st.kind === 'intro') {
      h += '<p class="qtag">새 한자 · ' + (s.i + 1) + ' / ' + s.total + '</p>' + detailHTML(st.e);
      h += '<button class="btn primary wide" data-act="next">퀴즈로 확인하기</button>' + moreBar();
    } else if (st.kind === 'q') {
      var q = st.q;
      h += '<div class="qwrap"><p class="qtag">' + esc(q.tag) + ' · ' + (s.i + 1) + ' / ' + s.total + '</p><div class="qprompt">' + q.prompt + '</div><div class="choices">';
      q.choices.forEach(function (c, i) {
        var cls = 'choice ' + q.cls;
        if (st.answered != null) { if (q.ok.indexOf(c) >= 0) cls += ' right'; else if (i === st.answered) cls += ' wrong'; }
        h += '<button class="' + cls + '" data-act="ans" data-i="' + i + '"' + (st.answered != null ? ' disabled' : '') + ' lang="' + (q.cls === 'jp' ? 'ja' : 'ko') + '">' + esc(c) + '</button>';
      });
      h += '</div>';
      if (st.answered != null) {
        h += '<div class="feedback"><div class="verdict ' + (st.correct ? 'ok' : 'ng') + '">' + (st.correct ? '정답이에요' : '아쉬워요') + '</div><div>' + q.why + '</div>';
        h += '<div class="row"><button class="btn primary" style="flex:1" data-act="next">다음</button><button class="btn" data-act="card" data-k="' + esc(st.e.k) + '">카드 보기</button></div>' + moreBar() + '</div>';
      }
      h += '</div>';
    } else {
      var tot = s.right + s.wrong;
      h += '<div class="top"><h1>수고했어요</h1><p class="lead muted">' + tot + '문제 중 ' + s.right + '개 맞혔어요.</p></div>';
      var due = dueList().length;
      h += '<div class="callout">다음 복습은 간격에 맞춰 알려 드려요. 지금 복습할 한자: ' + due + '개</div>';
      h += '<div class="row"><button class="btn primary wide" data-act="tab" data-v="home">홈으로</button>';
      h += '</div>' + moreBar(true);
    }
    return h;
  }
  function moreBar(big) {
    if (!nextNew(1).length) return '';
    return '<div class="row" style="justify-content:center"><button class="btn' + (big ? ' wide' : ' ghost') + '" data-act="more" data-n="1">+ 다음 한자 1개 불러오기</button>' + (big ? '<button class="btn wide" data-act="more" data-n="5">+ 다음 한자 5개 불러오기</button>' : '') + '</div>';
  }

  function viewList() {
    var q = V.q.trim();
    var list = KJ.filter(function (e) {
      if (V.lv && e.lv !== V.lv) return false;
      if (!q) return true;
      return e.k.indexOf(q) >= 0 || (e.hun || '').indexOf(q) >= 0 || e.ko.join(' ').indexOf(q) >= 0 || e.on.join(' ').indexOf(q) >= 0 || e.kun.join(' ').indexOf(q) >= 0;
    });
    var h = '<div class="top"><h1>한자</h1></div>';
    h += '<div class="tools"><input id="q" type="search" placeholder="한자·훈음·한국음·읽기 검색" value="' + esc(V.q) + '" aria-label="검색">';
    h += '<select id="lv" aria-label="급 선택"><option value="0"' + (V.lv === 0 ? ' selected' : '') + '>전체</option><option value="5"' + (V.lv === 5 ? ' selected' : '') + '>N5</option><option value="4"' + (V.lv === 4 ? ' selected' : '') + '>N4</option></select></div>';
    h += '<div class="legend"><span><i></i>아직 안 봄</span><span><i class="s1"></i>학습 중</span><span><i class="s2"></i>익힘</span><span>' + list.length + '자</span></div>';
    h += '<div class="grid">' + list.map(function (e) {
      return '<button class="tile s' + stateOf(e.k) + '" data-act="card" data-k="' + esc(e.k) + '"><span class="t" lang="ja">' + esc(e.k) + '</span><span class="h">' + esc((e.hun || e.en).split(' ')[0]) + '</span></button>';
    }).join('') + '</div>';
    if (!list.length) h += '<div class="callout">찾는 한자가 없어요.</div>';
    return h;
  }

  function viewWarn() {
    var h = '<div class="top"><h1>헷갈리는 단어</h1><p class="lead muted">한국어에도 비슷한 말이 있지만 뜻이 다르거나, 한국어에서는 거의 쓰지 않는 일본어 단어예요.</p></div>';
    var n = 0;
    KJ.forEach(function (e) {
      e.fr.forEach(function (w) {
        n++;
        h += '<div class="card"><div class="sub"><span class="w kj" lang="ja" style="font-size:34px">' + esc(w.w) + '</span><span class="muted" lang="ja">' + esc(w.r) + '</span></div>';
        h += '<div class="callout warn"><b>한국어 ‘' + esc(w.ko) + '’와 달라요.</b><br>' + esc(w.note) + '</div>';
        h += '<button class="btn ghost" data-act="card" data-k="' + esc(e.k) + '"><span lang="ja">' + esc(e.k) + '</span> 한자 카드 보기</button></div>';
      });
    });
    if (!n) h += '<div class="callout">아직 모아 둔 단어가 없어요.</div>';
    return h;
  }

  function reportsText() {
    return S.reports.map(function (r) { return '[' + r.t + '] ' + r.k + ' / ' + r.f + ' / ' + r.m; }).join('\n');
  }
  function viewSet() {
    var h = '<div class="top"><h1>설정</h1></div>';
    h += '<div class="sect"><label for="perday">하루에 배울 새 한자</label><select id="perday">' + [3, 5, 10, 20].map(function (n) { return '<option value="' + n + '"' + (S.cfg.perDay === n ? ' selected' : '') + '>' + n + '개</option>'; }).join('') + '</select></div>';
    h += '<div class="sect"><label for="cfglv">공부할 급</label><select id="cfglv"><option value="0"' + (S.cfg.level === 0 ? ' selected' : '') + '>N5 → N4 전체</option><option value="5"' + (S.cfg.level === 5 ? ' selected' : '') + '>N5만</option><option value="4"' + (S.cfg.level === 4 ? ' selected' : '') + '>N4만</option></select></div>';
    h += '<div class="sect"><h2>오류 신고</h2><p class="small muted">한자 카드의 ‘오류 신고’로 남긴 내용이에요. 이 기기에만 저장돼요. 복사해서 보내 주세요.</p>';
    if (S.reports.length) {
      h += '<textarea id="rep" readonly>' + esc(reportsText()) + '</textarea><div class="row"><button class="btn" data-act="copyrep">복사</button><button class="btn ghost" data-act="clearrep">신고 목록 비우기</button></div>';
    } else h += '<div class="callout">신고한 내용이 없어요.</div>';
    if (REPORT_FORM_URL) h += '<a class="btn" href="' + esc(REPORT_FORM_URL) + '" target="_blank" rel="noopener">신고 폼 열기</a>';
    h += '</div>';
    h += '<div class="sect"><h2>학습 기록</h2>';
    if (!V.confirmReset) h += '<button class="btn danger" data-act="reset1">학습 기록 모두 지우기</button>';
    else h += '<div class="callout warn">정말 모든 학습 기록을 지울까요? 되돌릴 수 없어요.</div><div class="row"><button class="btn danger" data-act="reset2">지우기</button><button class="btn" data-act="reset0">취소</button></div>';
    h += '</div>';
    h += '<div class="sect small muted"><p>데이터: 한자 ' + KJ.length + '자 · 빌드 ' + esc(DATA.meta.built || '') + '</p><p>한자 설명은 AI 초안을 바탕으로 해요. ‘AI 초안’ 표시가 있거나 이상한 곳이 보이면 오류 신고를 눌러 주세요.</p></div>';
    return h;
  }

  function overlays() {
    var h = '';
    if (V.detail) {
      h += '<div class="overlay" role="dialog" aria-modal="true" aria-label="한자 카드"><div class="inner"><div class="row" style="justify-content:flex-end"><button class="btn" data-act="closecard">닫기</button></div>' + detailHTML(BY[V.detail], true) + '<button class="btn wide" data-act="closecard">닫기</button></div></div>';
    }
    if (V.report) {
      var e = BY[V.report];
      h += '<div class="overlay" style="z-index:35" role="dialog" aria-modal="true" aria-label="오류 신고"><div class="inner"><div class="sheet"><h2><span lang="ja">' + esc(e.k) + '</span> 오류 신고</h2>';
      h += '<div><label for="rf">어디가 이상한가요?</label><select id="rf" style="width:100%"><option>훈음</option><option>한국음·음독 연결 설명</option><option>예시 단어</option><option>연상·자형 설명</option><option>훈독</option><option>기타</option></select></div>';
      h += '<div><label for="rm">내용</label><textarea id="rm" placeholder="무엇이 어떻게 틀렸는지 적어 주세요."></textarea></div>';
      h += '<div class="row"><button class="btn primary" style="flex:1" data-act="sendrep" data-k="' + esc(e.k) + '">저장</button><button class="btn" data-act="closerep">취소</button></div></div></div></div>';
    }
    if (V.toast) h += '<div class="toast" role="status">' + esc(V.toast) + '</div>';
    return h;
  }

  function render() {
    var body = { home: viewHome, study: viewStudy, list: viewList, warn: viewWarn, set: viewSet }[V.view]();
    var keepQ = document.activeElement && document.activeElement.id === 'q';
    app.innerHTML = body + tabs() + overlays();
    if (keepQ) { var el = document.getElementById('q'); if (el) { el.focus(); var l = el.value.length; try { el.setSelectionRange(l, l); } catch (e) {} } }
  }
  var toastTimer = null;
  function toast(m) { V.toast = m; render(); clearTimeout(toastTimer); toastTimer = setTimeout(function () { V.toast = ''; render(); }, 2200); }

  /* ---------- 이벤트 ---------- */
  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'tab') { V.view = b.getAttribute('data-v'); V.detail = null; V.confirmReset = false; render(); window.scrollTo(0, 0); }
    else if (a === 'start') startSession(false);
    else if (a === 'startmore') startSession(true);
    else if (a === 'more') forceNew(nextNew(+b.getAttribute('data-n')));
    else if (a === 'learnnow') forceNew([BY[b.getAttribute('data-k')]]);
    else if (a === 'ans') answer(+b.getAttribute('data-i'));
    else if (a === 'next') advance();
    else if (a === 'card') { V.detail = b.getAttribute('data-k'); render(); }
    else if (a === 'closecard') { V.detail = null; render(); }
    else if (a === 'report') { V.report = b.getAttribute('data-k'); render(); }
    else if (a === 'closerep') { V.report = null; render(); }
    else if (a === 'sendrep') {
      var m = (document.getElementById('rm').value || '').trim(), f = document.getElementById('rf').value;
      if (!m) { toast('내용을 적어 주세요.'); return; }
      S.reports.push({ k: b.getAttribute('data-k'), f: f, m: m, t: today() }); save(); V.report = null; toast('신고를 저장했어요.');
    }
    else if (a === 'copyrep') {
      var txt = reportsText(), done = function () { toast('복사했어요.'); };
      var fallback = function () { var ta = document.getElementById('rep'); if (ta) { ta.select(); } toast('목록을 선택했어요. 길게 눌러 복사하세요.'); };
      try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
    }
    else if (a === 'clearrep') { S.reports = []; save(); render(); }
    else if (a === 'reset1') { V.confirmReset = true; render(); }
    else if (a === 'reset0') { V.confirmReset = false; render(); }
    else if (a === 'reset2') { S.prog = {}; S.newToday = { d: '', n: 0 }; V.sess = null; V.confirmReset = false; save(); toast('학습 기록을 지웠어요.'); }
  });
  app.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') { V.q = ev.target.value; render(); }
  });
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'lv') { V.lv = +t.value; render(); }
    else if (t.id === 'perday') { S.cfg.perDay = +t.value; save(); render(); }
    else if (t.id === 'cfglv') { S.cfg.level = +t.value; save(); render(); }
  });

  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.__KJ_NO_SW) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.__KJ = { S: S, V: V, KJ: KJ, startSession: startSession, makeQuestion: makeQuestion, forceNew: forceNew };
})();
