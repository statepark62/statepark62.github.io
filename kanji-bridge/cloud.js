/* 구글 로그인 + 본인 드라이브(앱 전용 숨김 폴더)에 학습 기록 동기화. 서버 없음.
   권한은 drive.appdata 하나뿐이라, 사용자의 다른 드라이브 파일은 볼 수 없다. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FILE = 'kj_progress.json', SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  /* ---- 합치기: 한자별로 마지막에 공부한 쪽을 택한다 ---- */
  function wins(a, b) {
    var ta = a.t || 0, tb = b.t || 0;
    if (ta !== tb) return ta > tb;
    return (a.ok || 0) + (a.ng || 0) >= (b.ok || 0) + (b.ng || 0);
  }
  function mergeMap(L, R, reset) {
    var out = {}, keys = {}; Object.keys(L || {}).forEach(function (k) { keys[k] = 1; }); Object.keys(R || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var a = (L || {})[k], b = (R || {})[k], p = !a ? b : !b ? a : (wins(a, b) ? a : b);
      if (reset && (p.t || 0) < reset) return;
      out[k] = p;
    });
    return out;
  }
  function merge(L, R) {
    var reset = Math.max(L.resetAt || 0, R.resetAt || 0), nt;
    var a = L.newToday || { d: '', n: 0 }, b = R.newToday || { d: '', n: 0 };
    if (a.d === b.d) nt = { d: a.d, n: Math.max(a.n, b.n) }; else nt = a.d > b.d ? a : b;
    var useL = (L.cfgT || 0) >= (R.cfgT || 0);
    return {
      v: 1, resetAt: reset, prog: mergeMap(L.prog, R.prog, reset), wr: mergeMap(L.wr, R.wr, reset), newToday: nt,
      cfg: Object.assign({}, useL ? R.cfg : L.cfg, useL ? L.cfg : R.cfg), cfgT: Math.max(L.cfgT || 0, R.cfgT || 0)
    };
  }

  /* ---- 구글 로그인(GIS) + 드라이브 appDataFolder ---- */
  function client(opt) {
    var tok = null, exp = 0, tc = null, fileId = null, pending = null, gisP = null;
    function loadGis() {
      if (gisP) return gisP;
      gisP = new Promise(function (res, rej) {
        if (root.google && root.google.accounts && root.google.accounts.oauth2) return res();
        var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = function () { res(); }; s.onerror = function () { gisP = null; rej(new Error('구글 로그인 스크립트를 못 불러왔어요 (인터넷 연결 확인)')); };
        document.head.appendChild(s);
      });
      return gisP;
    }
    function ready() {
      return loadGis().then(function () {
        if (tc) return;
        tc = root.google.accounts.oauth2.initTokenClient({
          client_id: opt.clientId, scope: SCOPE,
          callback: function (r) {
            var p = pending; pending = null; if (!p) return;
            if (r && r.access_token) { tok = r.access_token; exp = Date.now() + (r.expires_in || 3600) * 1000; p.res(); }
            else p.rej(new Error((r && (r.error_description || r.error)) || '로그인 실패'));
          },
          error_callback: function (e) { var p = pending; pending = null; if (p) p.rej(new Error(e && e.type === 'popup_closed' ? '로그인 창이 닫혔어요' : (e && e.type) || '로그인 실패')); }
        });
      });
    }
    function signIn(silent) {
      return ready().then(function () {
        return new Promise(function (res, rej) { pending = { res: res, rej: rej }; tc.requestAccessToken(silent ? { prompt: 'none' } : {}); });
      });
    }
    function valid() { return !!tok && Date.now() < exp - 60000; }
    function api(url, init) {
      init = init || {}; init.headers = Object.assign({ Authorization: 'Bearer ' + tok }, init.headers || {});
      return fetch(url, init).then(function (r) {
        if (r.status === 401) { tok = null; throw new Error('로그인이 만료됐어요'); }
        if (!r.ok) throw new Error('드라이브 오류 ' + r.status);
        return r;
      });
    }
    function find() {
      if (fileId) return Promise.resolve(fileId);
      var q = encodeURIComponent("name='" + FILE + "'");
      return api('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1&fields=files(id)&q=' + q).then(function (r) { return r.json(); })
        .then(function (j) { fileId = j.files && j.files[0] ? j.files[0].id : null; return fileId; });
    }
    function pull() {
      return find().then(function (id) {
        if (!id) return null;
        return api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media').then(function (r) { return r.json(); });
      });
    }
    function push(obj) {
      var body = JSON.stringify(obj);
      return find().then(function (id) {
        if (id) return api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body });
        var bd = 'kjb' + Date.now();
        var multi = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FILE, parents: ['appDataFolder'] }) +
          '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + bd + '--';
        return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: multi })
          .then(function (r) { return r.json(); }).then(function (j) { fileId = j.id; });
      });
    }
    function signOut() {
      var t = tok; tok = null; exp = 0; fileId = null;
      try { if (t && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
    }
    return { signIn: signIn, valid: valid, pull: pull, push: push, signOut: signOut };
  }
  root.KJ_CLOUD = { merge: merge, client: client };
  if (typeof module !== 'undefined') module.exports = root.KJ_CLOUD;
})();
