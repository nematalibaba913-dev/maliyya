/**
 * mf-supabase.js — Supabase giriş (auth) + inbox köməkçisi
 * ──────────────────────────────────────────────────────────
 * Kitabxana yoxdur, yalnız fetch. (Beləliklə service-worker offline rejimi pozulmur.)
 *
 *  MFAuth  — giriş sessiyası, login ekranı (səhifəni kilidləyir)
 *  MFDB    — inbox cədvəli: insertInbox / pullNew / markProcessed
 *
 * Konfiqurasiya: supabase-config.js  →  window.MF_SUPABASE = { url, anonKey }
 * Təhlükəsizlik əsası: Supabase Auth + RLS (bax: supabase_setup.sql).
 */
(function () {
  'use strict';

  var CFG  = window.MF_SUPABASE || {};
  var SKEY = 'mf_sb_session';
  var LOGIN_ID = 'mf-login';

  // ── Köməkçilər ──────────────────────────────────────────────
  function configured() {
    return !!(CFG.url && CFG.anonKey) && String(CFG.url).indexOf('YOUR-') === -1 &&
           String(CFG.anonKey).indexOf('YOUR-') === -1;
  }
  function base() { return String(CFG.url).replace(/\/+$/, ''); }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function fire(name) {
    try { window.dispatchEvent(new CustomEvent(name)); } catch (e) {}
  }
  function mkErr(msg, status) {
    var e = new Error(msg); e.status = status || 0; return e;
  }

  function loadS() {
    try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; }
  }
  function saveS(s) {
    try {
      if (s) localStorage.setItem(SKEY, JSON.stringify(s));
      else localStorage.removeItem(SKEY);
    } catch (e) {}
  }
  function normSession(d) {
    return {
      access_token:  d.access_token,
      refresh_token: d.refresh_token,
      expires_at:    d.expires_at || (nowSec() + (d.expires_in || 3600)),
      user: d.user ? { id: d.user.id, email: d.user.email } : null
    };
  }

  // ── Auth sorğuları ──────────────────────────────────────────
  function authPost(path, body) {
    return fetch(base() + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CFG.anonKey },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  function signIn(email, password) {
    if (!configured()) return Promise.reject(new Error('Supabase konfiqurasiya olunmayıb'));
    return authPost('token?grant_type=password', { email: email, password: password })
      .then(function (res) {
        if (!res.ok) {
          throw new Error(res.data.error_description || res.data.msg || 'Giriş uğursuz oldu');
        }
        saveS(normSession(res.data));
        removeLogin();
        fire('mf-signed-in');
        return loadS();
      });
  }

  function signOut() {
    saveS(null);
    location.reload();
  }

  // Token yeniləmə (eyni anda yalnız bir sorğu — refresh token rotasiya olunur)
  var _refreshing = null;
  function refresh() {
    if (_refreshing) return _refreshing;
    var s = loadS();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    _refreshing = authPost('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
      .then(function (res) {
        if (res.ok) { var ns = normSession(res.data); saveS(ns); return ns; }
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          saveS(null); showLogin(); return null;      // sessiya etibarsızdır
        }
        throw mkErr('refresh HTTP ' + res.status, res.status);
      })
      .then(function (v) { _refreshing = null; return v; },
            function (e) { _refreshing = null; throw e; });
    return _refreshing;
  }

  function getToken() {
    var s = loadS();
    if (!s) return Promise.resolve(null);
    if (s.expires_at - 60 > nowSec()) return Promise.resolve(s.access_token);
    return refresh().then(function (ns) { return ns ? ns.access_token : null; });
  }

  // ── REST (PostgREST) ────────────────────────────────────────
  function rest(method, path, body, extraHeaders, retried) {
    if (!configured()) return Promise.reject(mkErr('Supabase konfiqurasiya olunmayıb', 0));
    return getToken().then(function (tok) {
      if (!tok) { showLogin(); throw mkErr('auth', 401); }
      var h = { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' };
      if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
      return fetch(base() + '/rest/v1/' + path, {
        method: method, headers: h,
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        if (r.status === 401 && !retried) {
          return refresh().then(function (ns) {
            if (!ns) throw mkErr('auth', 401);
            return rest(method, path, body, extraHeaders, true);
          });
        }
        if (!r.ok) {
          return r.text().then(function (t) { throw mkErr('HTTP ' + r.status + ' ' + t, r.status); });
        }
        if (r.status === 204) return null;
        return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
      });
    });
  }

  // ── Inbox ───────────────────────────────────────────────────
  var MFDB = {
    // Mobil InputPad → yeni əməliyyat (eyni id təkrar gəlsə, ignor olunur)
    insertInbox: function (tx) {
      var row = {
        id:         String(tx.id),
        created_at: tx.createdAt || new Date().toISOString(),
        tarix:      tx.Tarix      || '',
        emeliyyat:  tx.Emeliyyat  || '',
        kateqoriya: tx.Kateqoriya || '',
        qeyd:       tx.Qeyd       || '',
        mebleg:     String(tx.Mebleg || '0'),
        source:     tx.source     || 'inputpad_mobile',
        status:     'new'
      };
      return rest('POST', 'inbox?on_conflict=id', row,
        { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });
    },

    // PC → hələ import olunmamış sətirlər
    pullNew: function () {
      return rest('GET', 'inbox?select=*&status=eq.new&order=created_at.asc&limit=500')
        .then(function (rows) { return Array.isArray(rows) ? rows : []; });
    },

    // PC → import olunanları 'processed' et
    markProcessed: function (ids) {
      if (!ids || !ids.length) return Promise.resolve();
      var chunks = [];
      for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
      return chunks.reduce(function (p, chunk) {
        return p.then(function () {
          var list = chunk.map(function (x) { return '"' + String(x).replace(/"/g, '') + '"'; }).join(',');
          return rest('PATCH', 'inbox?id=in.(' + encodeURIComponent(list) + ')',
            { status: 'processed' }, { 'Prefer': 'return=minimal' });
        });
      }, Promise.resolve());
    }
  };

  // ── Login ekranı ────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('mf-login-style')) return;
    var st = document.createElement('style');
    st.id = 'mf-login-style';
    st.textContent =
      'html.mf-locked body{visibility:hidden !important;}' +
      '#' + LOGIN_ID + '{visibility:visible !important;position:fixed;inset:0;z-index:2147483647;' +
        'background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:20px;}' +
      '#' + LOGIN_ID + ' form{width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px;}' +
      '#' + LOGIN_ID + ' h2{font-size:20px;font-weight:700;text-align:center;margin-bottom:6px;}' +
      '#' + LOGIN_ID + ' input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #30363d;' +
        'background:#161b22;color:#e6edf3;font-size:16px;outline:none;}' +
      '#' + LOGIN_ID + ' input:focus{border-color:#58a6ff;}' +
      '#' + LOGIN_ID + ' button{padding:12px;border:none;border-radius:10px;background:#3b82f6;color:#fff;' +
        'font-size:15px;font-weight:700;cursor:pointer;}' +
      '#' + LOGIN_ID + ' button:disabled{opacity:.6;cursor:default;}' +
      '#' + LOGIN_ID + ' .mf-err{color:#f85149;font-size:13px;min-height:18px;text-align:center;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function buildLogin() {
    if (document.getElementById(LOGIN_ID) || !document.body) return;
    injectStyle();
    var box = document.createElement('div');
    box.id = LOGIN_ID;
    box.innerHTML =
      '<form autocomplete="on">' +
        '<h2>Giriş</h2>' +
        '<input type="email" name="username" autocomplete="username" placeholder="E-poçt" required>' +
        '<input type="password" name="password" autocomplete="current-password" placeholder="Şifrə" required>' +
        '<button type="submit">Daxil ol</button>' +
        '<div class="mf-err"></div>' +
      '</form>';
    document.body.appendChild(box);

    var form = box.querySelector('form');
    var err  = box.querySelector('.mf-err');
    var btn  = box.querySelector('button');
    if (!configured()) err.textContent = 'Supabase konfiqurasiya olunmayıb';

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Gözləyin...';
      signIn(form.username.value.trim(), form.password.value)
        .catch(function (e) { err.textContent = e.message || 'Giriş uğursuz oldu'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Daxil ol'; });
    });
  }

  function showLogin() {
    document.documentElement.classList.add('mf-locked');
    injectStyle();
    if (document.body) buildLogin();
    else document.addEventListener('DOMContentLoaded', buildLogin);
  }

  function removeLogin() {
    document.documentElement.classList.remove('mf-locked');
    var el = document.getElementById(LOGIN_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── Qlobal ixrac + başlanğıc yoxlama ────────────────────────
  window.MFAuth = {
    isConfigured: configured,
    session: loadS,
    signIn: signIn,
    signOut: signOut,
    getToken: getToken
  };
  window.MFDB = MFDB;

  // Sessiya yoxdursa (və ya konfiq yoxdursa) səhifə kilidlənir
  if (!configured() || !loadS()) showLogin();
})();
