/* 구글 시트(게시된 CSV) → 앱 데이터 모델. 열 이름(한국어 머리글)으로 찾으므로 열 순서를 바꿔도 된다.
   규칙은 build_app_data.py와 같다: 연상 숨김(AI 의심), 예시/주의 단어 분류, 학습 순서. */
(function () {
  'use strict';
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], f = '', q = false, i = 0, n = text.length, c;
    while (i < n) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
        f += c; i++; continue;
      }
      if (c === '"') { q = true; i++; }
      else if (c === ',') { row.push(f); f = ''; i++; }
      else if (c === '\r') { i++; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; }
      else { f += c; i++; }
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  }
  function table(rows, need, name) {
    if (!rows.length) throw new Error(name + ' 탭이 비어 있어요');
    var head = rows[0].map(function (h) { return h.trim(); });
    need.forEach(function (h) { if (head.indexOf(h) < 0) throw new Error(name + ' 탭에 \'' + h + '\' 열이 없어요'); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = (r[i] || '').trim(); }); return o; });
  }
  function split(s, re) { return (s || '').split(re).map(function (t) { return t.trim(); }).filter(Boolean); }
  var FIRST = '一二三四五六七八九十百千万円日月火水木金土';
  function assemble(kanjiRows, wordRows, built) {
    var K = table(kanjiRows, ['한자', '급', '한국음', '음독', '훈음'], '한자');
    var W = wordRows ? table(wordRows, ['한자', '단어', '읽기', 'relation', 'keep'], '단어') : [];
    K = K.filter(function (r) { return r['한자']; });
    if (K.length < 200) throw new Error('한자가 ' + K.length + '개뿐이에요 (200개 미만)');
    var by = {};
    W.forEach(function (w) { (by[w['한자']] = by[w['한자']] || []).push(w); });
    var out = K.map(function (r) {
      var rv = r['검수'], ai = r['AI검수요청'] === '예';
      var show = (!ai || rv === 'OK' || rv === '수정함') && rv !== '제외';
      var gr = parseInt(r['학년'], 10);
      var e = {
        k: r['한자'], lv: parseInt(r['급'], 10) || 5, st: parseInt(r['획수'], 10) || 0, gr: isNaN(gr) ? 9 : gr,
        ko: split(r['한국음'], /[\/、,]/), hun: r['훈음'], on: split(r['음독'], /[、,]/),
        kun: split(r['훈독'], /[、,]/).map(function (t) { return t.replace(/\./g, '・'); }),
        en: r['뜻'] || '', rule: r['규칙판정'] || '', exc: split(r['예외읽기'], /[、,]/),
        mn: show ? r['연상'] : '', shape: r['자형 설명'] || '', link: r['음독 연결 설명'] || '', excn: r['예외 설명'] || '', kt: r['훈독 팁'] || '',
        ai: ai, rv: rv === '수정함' ? '수정' : rv, ex: [], fr: []
      };
      (by[e.k] || []).forEach(function (w) {
        if (w['숨김'] === 'Y' || w['검수'] === '제외') return;
        var it = { w: w['단어'], r: w['읽기'], ko: w['한국어 대응'] || '', rel: w['relation'], note: w['설명'] || '' };
        if (it.rel === 'false_friend' || w['주의단어'] === 'Y') e.fr.push(it);
        else if ((it.rel === 'same' || it.rel === 'similar') && (w['keep'] === '1' || w['keep'] === 'TRUE') && w['신뢰도'] !== 'low') e.ex.push(it);
      });
      e.bw = e.ex.length === 0;
      return e;
    });
    out.sort(function (a, b) {
      var fa = FIRST.indexOf(a.k), fb = FIRST.indexOf(b.k);
      return (b.lv - a.lv) || ((fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb)) || (a.gr - b.gr) || (a.st - b.st);
    });
    return { meta: { built: built || '', count: out.length, source: 'sheet' }, kanji: out };
  }
  var root = typeof window !== "undefined" ? window : globalThis; root.KJ_SHEET = { parseCSV: parseCSV, assemble: assemble };
  if (typeof module !== 'undefined') module.exports = root.KJ_SHEET;
})();
