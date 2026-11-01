/* Maliyyə: 1-ci mərhələ (giriş, ümumi log). Supabase + oflayn növbə. */
(function () {
  'use strict';

  var cfg = window.MALIYYA_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = function (n) {
    var neg = n < 0;
    var p = Math.abs(Number(n) || 0).toFixed(2).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + p.join('.') + ' ₼';
  };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var todayStr = function () {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  var curMonth = function () { return todayStr().slice(0, 7); };
  var MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
  var MON_S = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
  var shortDate = function (s) { var p = (s || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MON_S[Number(p[1]) - 1] : s; };
  var uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  };

  var DEFAULT_CATS = {
    'Xərc': ['Komissiya', 'Taksit ödənişi', 'Kirayə', 'Komunnal', 'Kontur', 'İnternet', 'Təhsil', 'Siqaret', 'Yol', 'Ərzaq', 'Restoran', 'Rüsum', 'Təmir tikinti', 'Tibb', 'Tibb (Ana)', 'Ev (Quba)', 'İdman', 'Hobby', 'Hədiyyə', 'Geyim', 'Əşya', 'Digər', 'Toy', 'Əyləncə', 'Bərbər', 'Təmizlik vasitələri', 'İş üçün', 'Səyahət', 'Heyvan məhsulları', 'Bağ'],
    'Gəlir': ['Əməkhaqqı', 'Təqaüd', 'Mükafat', 'Məzuniyyət / Ezam', 'ƏDV/CashBack', 'Satış', 'Əlavə Gəlir']
  };

  /* ── lokal saxlama (IndexedDB, açılmasa yaddaşda) ───────────── */
  var mem = {};
  var kv = (function () {
    var p;
    function open() {
      if (p) return p;
      p = new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('no idb'));
        var r = indexedDB.open('maliyya', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return p;
    }
    return {
      get: function (k) {
        return open().then(function (d) {
          return new Promise(function (res, rej) {
            var q = d.transaction('kv', 'readonly').objectStore('kv').get(k);
            q.onsuccess = function () { res(q.result); };
            q.onerror = function () { rej(q.error); };
          });
        }).catch(function () { return mem[k]; });
      },
      set: function (k, v) {
        mem[k] = v;
        return open().then(function (d) {
          return new Promise(function (res, rej) {
            var t = d.transaction('kv', 'readwrite');
            t.objectStore('kv').put(v, k);
            t.oncomplete = res;
            t.onerror = function () { rej(t.error); };
          });
        }).catch(function () {});
      }
    };
  })();

  /* ── vəziyyət ───────────────────────────────────────────────── */
  var sb = null;
  var session = null;
  var view = 'giris';
  var month = curMonth();
  var rows = [];
  var queue = [];            // gözləyən əməliyyatlar: {op:'upsert',row} | {op:'delete',id}
  var flushing = false;
  var filter = { q: '', tip: '' };
  var formOpen = false;
  var editing = null;        // redaktə olunan sətir
  var pad = { amt: '0', op: 'Xərc', cat: '', note: '', status: '', err: false };
  var rt = null;
  var rtTimer = null;

  /* ── köməkçilər ─────────────────────────────────────────────── */
  var toastTimer;
  function toast(msg, err) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 2800);
  }
  function show(id) {
    ['setup', 'login', 'app'].forEach(function (x) { $('#' + x).hidden = x !== id; });
  }
  function persistQueue() { return kv.set('queue', queue); }
  function updateSync() {
    var n = queue.length;
    var off = !navigator.onLine;
    var txt = '';
    var wait = false;
    if (n) { txt = (off ? 'Oflayn · ' : 'Göndərilir · ') + n + ' gözləyir'; wait = !off; }
    else if (off) { txt = 'Oflayn'; wait = true; }
    document.querySelectorAll('.sync-pill').forEach(function (el) {
      el.hidden = !txt;
      el.textContent = txt;
      el.classList.toggle('wait', wait);
    });
  }
  function monthRange(m) {
    var p = m.split('-').map(Number);
    var next = p[1] === 12 ? (p[0] + 1) + '-01-01' : p[0] + '-' + pad2(p[1] + 1) + '-01';
    return { from: m + '-01', to: next };
  }
  function shiftMonth(m, d) {
    var p = m.split('-').map(Number);
    var t = new Date(p[0], p[1] - 1 + d, 1);
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1);
  }
  function sortRows(a) {
    return a.sort(function (x, y) {
      if (x.tarix !== y.tarix) return x.tarix < y.tarix ? 1 : -1;
      return (x.created_at || '') < (y.created_at || '') ? 1 : -1;
    });
  }
  function applyQueue(list, m) {
    var out = list.slice();
    queue.forEach(function (o) {
      if (o.op === 'upsert') {
        var i = out.findIndex(function (x) { return x.id === o.row.id; });
        if (i >= 0) out.splice(i, 1);
        if (o.row.tarix.slice(0, 7) === m) out.push(Object.assign({}, o.row, { _pending: true }));
      } else {
        var j = out.findIndex(function (x) { return x.id === o.id; });
        if (j >= 0) out.splice(j, 1);
      }
    });
    return sortRows(out);
  }

  /* ── məlumat: oxu / göndər ──────────────────────────────────── */
  async function loadMonth() {
    var m = month;
    var r = monthRange(m);
    var base = null;
    try {
      var res = await sb.from('transactions').select('*')
        .is('deleted_at', null).gte('tarix', r.from).lt('tarix', r.to)
        .order('tarix', { ascending: false }).order('created_at', { ascending: false }).limit(5000);
      if (res.error) throw res.error;
      base = res.data || [];
      kv.set('tx_' + m, base);
    } catch (e) {
      base = (await kv.get('tx_' + m)) || [];
    }
    if (m !== month) return;
    rows = applyQueue(base, m);
    if (view === 'log') renderLogList();
  }

  async function flush() {
    if (flushing || !sb || !session) return;
    flushing = true;
    var sent = 0;
    try {
      while (queue.length) {
        var o = queue[0];
        var res;
        if (o.op === 'upsert') {
          res = await sb.from('transactions').upsert(o.row, { onConflict: 'id' });
        } else {
          res = await sb.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', o.id);
        }
        var er = res && res.error;
        if (er) {
          var retry = er.status === 401 || er.status === 403 || /JWT|fetch|network|load failed/i.test(er.message || '') || !er.code;
          if (retry) break;
          queue.shift();
          toast('Bir əməliyyat qəbul edilmədi: ' + er.message, true);
          await persistQueue();
          continue;
        }
        queue.shift();
        sent++;
        await persistQueue();
      }
    } catch (e) { /* şəbəkə yoxdur, növbədə qalır */ }
    flushing = false;
    updateSync();
    if (sent) loadMonth();
  }

  function enqueue(op) {
    queue.push(op);
    persistQueue();
    updateSync();
    return flush();
  }

  /* ── giriş / çıxış ──────────────────────────────────────────── */
  function boot() {
    if (!cfg.url || /BURAYA/.test(cfg.url) || !cfg.key) { show('setup'); return; }
    sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.onAuthStateChange(function (ev, s) {
      var had = !!session;
      session = s;
      if (s && !had) enter();
      if (!s && had) leave();
      if (!s && !had) show('login');
    });
    $('#login-form').addEventListener('submit', onLogin);
    $('#theme-btn').addEventListener('click', toggleTheme);
    $('#out-btn').addEventListener('click', logout);
    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { updateSync(); flush(); });
    window.addEventListener('offline', updateSync);
    document.addEventListener('keydown', onKey);
    $('#view').addEventListener('click', onViewClick);
    $('#view').addEventListener('input', onViewInput);
    $('#view').addEventListener('change', onViewInput);
    $('#view').addEventListener('submit', onViewSubmit);
  }

  async function onLogin(e) {
    e.preventDefault();
    var btn = $('#l-btn');
    var err = $('#l-err');
    err.textContent = '';
    btn.disabled = true;
    var res = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
    btn.disabled = false;
    if (res.error) {
      err.textContent = /fetch|network/i.test(res.error.message) ? 'Şəbəkə yoxdur. İnterneti yoxla.' : 'E-poçt və ya şifrə yanlışdır.';
    }
  }

  async function enter() {
    queue = (await kv.get('queue')) || [];
    show('app');
    subscribeRealtime();
    route();
    updateSync();
    flush();
  }
  function leave() {
    if (rt) { sb.removeChannel(rt); rt = null; }
    rows = [];
    show('login');
  }
  async function logout() {
    await sb.auth.signOut();
  }
  function toggleTheme() {
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    if (light) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('maliyya_theme', light ? 'dark' : 'light'); } catch (e) {}
  }
  function subscribeRealtime() {
    if (rt) return;
    rt = sb.channel('tx-live').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, function () {
      clearTimeout(rtTimer);
      rtTimer = setTimeout(loadMonth, 400);
    }).subscribe();
  }

  /* ── marşrut ────────────────────────────────────────────────── */
  function route() {
    var h = (location.hash || '').replace('#', '');
    view = h === 'log' ? 'log' : 'giris';
    document.querySelectorAll('#nav a[data-view]').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === view);
    });
    if (view === 'giris') renderGiris(); else renderLog();
    window.scrollTo(0, 0);
  }

  var mobileTop = '<div class="mobile-top"><span class="sync-pill" hidden></span>' +
    '<button class="link-btn" data-act="theme" type="button">Tema</button>' +
    '<button class="link-btn" data-act="out" type="button">Çıxış</button></div>';

  /* ── Giriş (keypad) ─────────────────────────────────────────── */
  function catOptions(op, selected) {
    return '<option value="" disabled' + (selected ? '' : ' selected') + '>Kateqoriya seçin</option>' +
      DEFAULT_CATS[op].map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
  }
  function renderGiris() {
    var inc = pad.op === 'Gəlir';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(function (k) {
      return '<button type="button" class="key" data-key="' + k + '"' + (k === 'del' ? ' aria-label="Sil"' : '') + '>' + (k === 'del' ? '⌫' : k) + '</button>';
    }).join('');
    $('#view').innerHTML = mobileTop +
      '<div class="pad">' +
      '<div class="seg"><button type="button" data-op="Xərc" class="' + (!inc ? 'on' : '') + '">Xərc</button>' +
      '<button type="button" data-op="Gəlir" class="' + (inc ? 'on' : '') + '">Gəlir</button></div>' +
      '<div class="amount"><span class="cur">₼</span><span class="num" id="p-amt">' + esc(pad.amt) + '</span></div>' +
      '<select id="p-cat" class="pill-field" aria-label="Kateqoriya">' + catOptions(pad.op, pad.cat) + '</select>' +
      '<input id="p-note" class="pill-field" type="text" maxlength="100" placeholder="Qeyd (isteğe bağlı)" value="' + esc(pad.note) + '">' +
      '<div class="keys">' + keys + '</div>' +
      '<button type="button" class="go' + (!inc ? ' expense' : '') + '" id="p-go" aria-label="Yadda saxla">✓</button>' +
      '<div class="status' + (pad.err ? ' err' : '') + '" id="p-status">' + esc(pad.status) + '</div>' +
      '</div>';
    updateSync();
  }
  function padKey(k) {
    var a = pad.amt;
    if (k === 'del') a = a.length > 1 ? a.slice(0, -1) : '0';
    else if (k === '.') { if (a.indexOf('.') < 0) a += '.'; }
    else if (a === '0') a = k;
    else if (!(a.indexOf('.') >= 0 && a.split('.')[1].length >= 2) && a.length < 9) a += k;
    pad.amt = a;
    var el = $('#p-amt');
    if (el) el.textContent = a;
  }
  function padStatus(msg, err) {
    pad.status = msg; pad.err = !!err;
    var el = $('#p-status');
    if (el) { el.textContent = msg; el.className = 'status' + (err ? ' err' : ''); }
    clearTimeout(padStatus.t);
    padStatus.t = setTimeout(function () { pad.status = ''; var e2 = $('#p-status'); if (e2) e2.textContent = ''; }, 3000);
  }
  async function padSubmit() {
    var a = parseFloat(pad.amt);
    if (!a || a <= 0) return padStatus('Məbləğ daxil edin', true);
    if (!pad.cat) return padStatus('Kateqoriya seçin', true);
    var row = {
      id: uuid(), tarix: todayStr(), tip: pad.op, kateqoriya: pad.cat,
      qeyd: pad.note.trim(), mebleg: Math.round(a * 100) / 100, menbe: 'giris',
      created_at: new Date().toISOString()
    };
    pad.amt = '0'; pad.cat = ''; pad.note = '';
    renderGiris();
    await enqueue({ op: 'upsert', row: row });
    padStatus(queue.length ? '📵 Saxlandı, bağlantı gələndə göndəriləcək' : '✓ Yadda saxlandı', false);
    if (row.tarix.slice(0, 7) === month) loadMonth();
  }

  /* ── Log ─────────────────────────────────────────────────────── */
  function renderLog() {
    var mp = month.split('-');
    $('#view').innerHTML = mobileTop +
      '<div class="page-head"><h1>Gəlir &amp; Xərc Log</h1>' +
      '<div class="month-nav"><button type="button" data-act="prev" aria-label="Əvvəlki ay">‹</button>' +
      '<span class="lbl">' + MONTHS[Number(mp[1]) - 1] + ' ' + mp[0] + '</span>' +
      '<button type="button" data-act="next" aria-label="Sonrakı ay">›</button></div></div>' +
      '<div class="tiles" id="tiles"></div>' +
      '<div id="form-slot"></div>' +
      '<div class="card"><div class="filters">' +
      '<input id="f-q" type="search" placeholder="Axtar: kateqoriya, qeyd" value="' + esc(filter.q) + '" aria-label="Axtar">' +
      '<select id="f-tip" aria-label="Növ"><option value="">Hamısı</option><option value="Gəlir"' + (filter.tip === 'Gəlir' ? ' selected' : '') + '>Gəlir</option><option value="Xərc"' + (filter.tip === 'Xərc' ? ' selected' : '') + '>Xərc</option></select>' +
      '<button class="btn btn-primary" type="button" data-act="new">+ Yeni</button></div>' +
      '<div class="list" id="list"></div></div>';
    renderForm();
    renderLogList();
    loadMonth();
    updateSync();
  }
  function renderForm() {
    var slot = $('#form-slot');
    if (!slot) return;
    if (!formOpen) { slot.innerHTML = ''; return; }
    var r = editing || { tarix: todayStr(), tip: 'Xərc', kateqoriya: '', qeyd: '', mebleg: '' };
    var all = DEFAULT_CATS['Xərc'].concat(DEFAULT_CATS['Gəlir']);
    slot.innerHTML = '<form class="card" id="tx-form" style="margin-bottom:12px" novalidate>' +
      '<div class="form-grid">' +
      '<div><label for="x-date">Tarix</label><input id="x-date" type="date" value="' + esc(r.tarix) + '" required></div>' +
      '<div><label for="x-tip">Əməliyyat</label><select id="x-tip"><option' + (r.tip === 'Gəlir' ? ' selected' : '') + '>Gəlir</option><option' + (r.tip === 'Xərc' ? ' selected' : '') + '>Xərc</option></select></div>' +
      '<div><label for="x-cat">Kateqoriya</label><input id="x-cat" list="x-cats" value="' + esc(r.kateqoriya) + '" autocomplete="off" required>' +
      '<datalist id="x-cats">' + all.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div><label for="x-amt">Məbləğ</label><input id="x-amt" type="number" step="0.01" min="0.01" inputmode="decimal" value="' + esc(r.mebleg) + '" required></div>' +
      '<div class="full"><label for="x-note">Qeyd</label><input id="x-note" type="text" maxlength="100" value="' + esc(r.qeyd) + '"></div>' +
      '</div><div class="form-err" id="x-err" role="alert"></div>' +
      '<div class="form-actions"><button class="btn btn-primary" type="submit">' + (editing ? 'Yadda saxla' : 'Əlavə et') + '</button>' +
      '<button class="btn btn-ghost" type="button" data-act="cancel">Ləğv</button></div></form>';
    var f = $('#x-amt');
    if (f && !editing) f.focus();
  }
  function renderLogList() {
    var list = $('#list');
    if (!list) return;
    var inc = 0, exp = 0;
    rows.forEach(function (r) { if (r.tip === 'Gəlir') inc += Number(r.mebleg); else exp += Number(r.mebleg); });
    $('#tiles').innerHTML =
      '<div class="tile"><div class="k">Gəlir</div><div class="v in">' + money(inc) + '</div></div>' +
      '<div class="tile"><div class="k">Xərc</div><div class="v out">' + money(exp) + '</div></div>' +
      '<div class="tile"><div class="k">Qalıq</div><div class="v ' + (inc - exp >= 0 ? 'in' : 'out') + '">' + money(inc - exp) + '</div></div>';
    var q = filter.q.trim().toLowerCase();
    var shown = rows.filter(function (r) {
      if (filter.tip && r.tip !== filter.tip) return false;
      if (!q) return true;
      return (r.kateqoriya + ' ' + r.qeyd).toLowerCase().indexOf(q) >= 0;
    });
    if (!shown.length) {
      list.innerHTML = '<div class="empty">' + (rows.length ? 'Filtrə uyğun əməliyyat yoxdur.' : 'Bu ay əməliyyat yoxdur. “+ Yeni” düyməsi və ya Giriş səhifəsi ilə əlavə et.') + '</div>';
      return;
    }
    list.innerHTML = shown.map(function (r) {
      var isIn = r.tip === 'Gəlir';
      return '<div class="row" data-id="' + esc(r.id) + '">' +
        '<div class="d">' + esc(shortDate(r.tarix)) + '</div>' +
        '<div class="c"><b>' + esc(r.kateqoriya) + (r._pending ? '<span class="pend">gözləyir</span>' : '') + '</b>' + (r.qeyd ? '<small>' + esc(r.qeyd) + '</small>' : '') + '</div>' +
        '<div class="a ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+' : '−') + money(r.mebleg) + '</div>' +
        '<div class="acts"><button class="act" type="button" data-act="edit" aria-label="Redaktə">✎</button>' +
        '<button class="act del" type="button" data-act="del" aria-label="Sil">✕</button></div></div>';
    }).join('');
  }

  async function saveForm() {
    var err = $('#x-err');
    var d = $('#x-date').value;
    var cat = $('#x-cat').value.trim();
    var amt = parseFloat($('#x-amt').value);
    if (!d) { err.textContent = 'Tarix seç.'; return; }
    if (!cat) { err.textContent = 'Kateqoriya yaz.'; return; }
    if (!amt || amt <= 0) { err.textContent = 'Məbləğ 0-dan böyük olmalıdır.'; return; }
    var row = {
      id: editing ? editing.id : uuid(), tarix: d, tip: $('#x-tip').value, kateqoriya: cat,
      qeyd: $('#x-note').value.trim(), mebleg: Math.round(amt * 100) / 100,
      menbe: editing ? (editing.menbe || 'log') : 'log',
      created_at: editing ? editing.created_at : new Date().toISOString()
    };
    var wasEdit = !!editing;
    formOpen = false; editing = null;
    renderForm();
    if (row.tarix.slice(0, 7) !== month) {
      month = row.tarix.slice(0, 7);
      rows = [];
      renderLog();
    }
    await enqueue({ op: 'upsert', row: row });
    toast(wasEdit ? 'Yeniləndi' : 'Əlavə edildi');
    loadMonth();
  }

  /* ── hadisələr ──────────────────────────────────────────────── */
  function onViewClick(e) {
    var t = e.target.closest('[data-act],[data-key],[data-op],#p-go');
    if (!t) return;
    if (t.id === 'p-go') return padSubmit();
    if (t.dataset.key) return padKey(t.dataset.key);
    if (t.dataset.op) { pad.op = t.dataset.op; pad.cat = ''; return renderGiris(); }
    var act = t.dataset.act;
    if (act === 'theme') return toggleTheme();
    if (act === 'out') return logout();
    if (act === 'prev' || act === 'next') {
      month = shiftMonth(month, act === 'next' ? 1 : -1);
      rows = [];
      return renderLog();
    }
    if (act === 'new') { formOpen = !formOpen || !!editing; editing = null; return renderForm(); }
    if (act === 'cancel') { formOpen = false; editing = null; return renderForm(); }
    var rowEl = t.closest('.row');
    var id = rowEl && rowEl.dataset.id;
    if (act === 'edit' && id) {
      editing = rows.find(function (r) { return r.id === id; }) || null;
      formOpen = !!editing;
      renderForm();
      var f = $('#form-slot');
      if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'del' && id) {
      if (!t.classList.contains('armed')) {
        t.classList.add('armed'); t.textContent = 'Əminsən?';
        setTimeout(function () { if (t.isConnected) { t.classList.remove('armed'); t.textContent = '✕'; } }, 3000);
        return;
      }
      rows = rows.filter(function (r) { return r.id !== id; });
      renderLogList();
      enqueue({ op: 'delete', id: id }).then(function () { toast('Silindi'); });
    }
  }
  function onViewInput(e) {
    var t = e.target;
    if (t.id === 'p-cat') pad.cat = t.value;
    else if (t.id === 'p-note') pad.note = t.value;
    else if (t.id === 'f-q') { filter.q = t.value; renderLogList(); }
    else if (t.id === 'f-tip') { filter.tip = t.value; renderLogList(); }
  }
  function onViewSubmit(e) {
    if (e.target.id === 'tx-form') { e.preventDefault(); saveForm(); }
  }
  function onKey(e) {
    if (view !== 'giris' || !$('#p-amt')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') padKey(e.key === ',' ? '.' : e.key);
    else if (e.key === 'Backspace') padKey('del');
    else if (e.key === 'Enter') padSubmit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
