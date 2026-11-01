/**
 * mf-sync.js — brauzer yaddaşı ⇄ Supabase (app_kv) sinxronizasiyası
 * ──────────────────────────────────────────────────────────────────
 * Səhifələr əvvəlki kimi localStorage / IndexedDB ilə işləyir. Bu fayl:
 *   1) sinxron açarların dəyişikliyini tutur və Supabase `app_kv` cədvəlinə yazır,
 *   2) başqa cihazdan gələn dəyişiklikləri yerli yaddaşa (LS + IndexedDB) yazır və səhifəni yeniləyir,
 *   3) mobil InputPad-dən `inbox`-a düşən əməliyyatları gelirxerc_cache logunun sonuna əlavə edir.
 *
 * Qayda: açar başına "son yazan qalib". Siyahı açarlarında (log, kredit, borc) iki cihaz
 * eyni anda dəyişibsə, id-si olan / olmayan sətirlər birləşdirilir ki, əlavələr itməsin.
 * Tema kimi cihaza məxsus açarlar sinxron olunmur.
 *
 * Yüklənmə sırası:  supabase-config.js → mf-supabase.js → mf-sync.js
 */
(function () {
  'use strict';
  if (!window.MFRest || !window.MFAuth || !window.MFDB) return;

  // ── Sinxron olunan açarlar ──────────────────────────────────
  // idb: səhifələrin oxuduğu IndexedDB yerləri  [store, növ, ad]
  //   növ 'array'  → massiv obyekt kimi, 'string' → mətn kimi saxlanır
  var KEYS = {
    gelirxerc_cache:      { arr: true,  idb: [['settings', 'array', 'gelirxerc_cache'], ['budget', 'string', 'gelirxerc_cache']] },
    credit_log_v1:        { arr: true,  idb: [['settings', 'array', 'credit_log_v1']] },
    borc_log_v1:          { arr: true,  idb: [['settings', 'array', 'borc_log_v1']] },
    kreditler_v2:         { arr: true,  idb: [['settings', 'array', 'credits_idb_v1']] },
    transfers_offline_v1: { arr: true,  idb: [['settings', 'array', 'transfers_offline_v1']] },
    mf_transactions:      { arr: true,  idb: [] },
    mf_opening_bal:       { arr: false, idb: [['settings', 'string', 'mf_opening_bal']] },
    budgetApp2025:        { arr: false, idb: [] },
    budgetBalances2025:   { arr: false, idb: [] },
    budgetRecurring2025:  { arr: false, idb: [] },
    budgetOverrides2025:  { arr: false, idb: [] }
  };
  var LOG_KEY = 'gelirxerc_cache';
  var META_KEY = 'mf_sync_meta';
  var POLL_MS = 15000;
  var PUSH_DELAY_MS = 1200;

  var LS = window.localStorage;
  var proto = Storage.prototype;
  var rawSet = proto.setItem, rawRemove = proto.removeItem;
  var applying = false;            // öz yazımlarımızı "dəyişiklik" saymamaq üçün

  // ── Meta: hər açar üçün son tanınan server versiyası və "göndərilməyib" bayrağı ──
  var meta = {};
  try { meta = JSON.parse(LS.getItem(META_KEY) || '{}') || {}; } catch (e) { meta = {}; }
  function saveMeta() { try { rawSet.call(LS, META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function m(key) { return meta[key] || (meta[key] = { rev: null, dirty: false }); }

  // ── IndexedDB (db.js ilə eyni sxem) ─────────────────────────
  var _dbp = null;
  function openDB() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open('BudgetAppDB', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result, s;
        if (!db.objectStoreNames.contains('transactions')) {
          s = db.createObjectStore('transactions', { keyPath: 'id' });
          s.createIndex('Tarix', 'Tarix', { unique: false });
          s.createIndex('Emeliyyat', 'Emeliyyat', { unique: false });
          s.createIndex('Kateqoriya', 'Kateqoriya', { unique: false });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('transfers')) {
          s = db.createObjectStore('transfers', { keyPath: 'id' });
          s.createIndex('tarix', 'tarix', { unique: false });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('credits')) {
          s = db.createObjectStore('credits', { keyPath: 'id' });
          s.createIndex('tarix', 'tarix', { unique: false });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
        ['settings', 'budget', 'meta'].forEach(function (n) {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'key' });
        });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return _dbp;
  }
  function idbGet(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var r = db.transaction(store, 'readonly').objectStore(store).get(key);
        r.onsuccess = function () { res(r.result ? r.result.value : null); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }
  function idbPut(store, key, value) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put({ key: key, value: value });
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbDel(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  // ── Köməkçilər ──────────────────────────────────────────────
  function parseArr(s) {
    if (s == null) return null;
    try { var p = JSON.parse(s); return Array.isArray(p) ? p : null; } catch (e) { return null; }
  }
  function isEmptyVal(s) {
    if (s == null || s === '' || s === '[]' || s === '{}' || s === 'null') return true;
    return false;
  }
  function itemKey(it) {
    return it && typeof it === 'object' && it.id != null ? 'id:' + it.id : 'js:' + JSON.stringify(it);
  }
  // Uzaq siyahı + yalnız yerlidə olan sətirlər (id və ya məzmun üzrə)
  function mergeArrays(localStr, remoteStr) {
    var l = parseArr(localStr), r = parseArr(remoteStr);
    if (!l || !r) return localStr;
    var seen = {};
    r.forEach(function (it) { seen[itemKey(it)] = 1; });
    var out = r.slice();
    l.forEach(function (it) { if (!seen[itemKey(it)]) out.push(it); });
    return JSON.stringify(out);
  }

  // Yerli yaddaşa yaz (LS + səhifələrin oxuduğu IndexedDB yerləri), hook-u keçərək
  function writeLocal(key, value) {
    applying = true;
    try {
      if (value == null) rawRemove.call(LS, key); else rawSet.call(LS, key, value);
    } catch (e) { console.warn('[sync] LS yazıla bilmədi:', key, e.message); }
    applying = false;
    var jobs = KEYS[key].idb.map(function (spec) {
      var store = spec[0], kind = spec[1], name = spec[2];
      if (value == null) return idbDel(store, name);
      if (kind === 'array') {
        var a = parseArr(value);
        return a ? idbPut(store, name, a) : Promise.resolve();
      }
      return idbPut(store, name, value);
    });
    return Promise.all(jobs.map(function (p) { return p.catch(function () {}); }));
  }

  // İlk sinxronda: yerli ən dolu variantı seç (səhifələr IDB-ni LS-dən üstün tuta bilir)
  function bestLocal(key) {
    var cands = [LS.getItem(key)];
    var jobs = KEYS[key].idb.map(function (spec) {
      return idbGet(spec[0], spec[2]).then(function (v) {
        if (v == null) return;
        cands.push(typeof v === 'string' ? v : JSON.stringify(v));
      }).catch(function () {});
    });
    return Promise.all(jobs).then(function () {
      var best = null, bestLen = -1;
      cands.forEach(function (c) {
        if (c == null) return;
        var a = KEYS[key].arr ? parseArr(c) : null;
        var len = a ? a.length : (isEmptyVal(c) ? 0 : 1);
        if (len > bestLen) { best = c; bestLen = len; }
      });
      return best;
    });
  }

  // ── localStorage hook: sinxron açar dəyişəndə "dirty" işarələ ──
  proto.setItem = function (k, v) {
    rawSet.apply(this, arguments);
    if (this === LS && !applying && KEYS[k]) markDirty(k);
  };
  proto.removeItem = function (k) {
    rawRemove.apply(this, arguments);
    if (this === LS && !applying && KEYS[k]) markDirty(k);
  };

  var pushTimer = null;
  function markDirty(k) {
    m(k).dirty = true; saveMeta();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(cycle, PUSH_DELAY_MS);
  }

  // ── Server əməliyyatları ────────────────────────────────────
  function enc(s) { return encodeURIComponent(s); }

  async function pullAll() {
    var changed = [];
    var heads = await MFRest('GET', 'app_kv?select=key,updated_at');
    var remote = {};
    (heads || []).forEach(function (r) { remote[r.key] = r.updated_at; });

    for (var key in KEYS) {
      var mm = m(key);
      if (remote[key]) {
        if (mm.rev === remote[key]) continue;          // artıq bizdə var
        if (mm.dirty) continue;                         // yerli dəyişiklik gözləyir — push həll edəcək
        var rows = await MFRest('GET', 'app_kv?select=key,value,updated_at&key=eq.' + enc(key));
        if (!rows || !rows[0]) continue;
        var rv = rows[0].value;
        var local = LS.getItem(key);
        if (mm.rev == null && local != null && local !== rv && !isEmptyVal(local)) {
          try { rawSet.call(LS, 'mf_sync_backup_' + key, local); } catch (e) {}   // ilk sinxronda üzərinə yazılan yerli nüsxə
        }
        await writeLocal(key, rv);
        mm.rev = rows[0].updated_at; mm.dirty = false;
        changed.push(key);
      } else if (mm.rev == null && !mm.dirty) {
        // Serverdə yoxdur: yerli data varsa ilk dəfə yüklə
        var best = await bestLocal(key);
        if (best != null && !isEmptyVal(best)) {
          if (best !== LS.getItem(key)) await writeLocal(key, best);
          mm.dirty = true;
        }
      }
    }
    saveMeta();
    return changed;
  }

  async function pushKey(key) {
    var mm = m(key);
    for (var attempt = 0; attempt < 3; attempt++) {
      var val = LS.getItem(key);
      var res;
      if (mm.rev == null) {
        if (val == null) { mm.dirty = false; return false; }
        try {
          res = await MFRest('POST', 'app_kv', { key: key, value: val }, { 'Prefer': 'return=representation' });
        } catch (e) {
          if (e.status === 409) { res = 'conflict'; } else throw e;
        }
      } else {
        res = await MFRest('PATCH',
          'app_kv?key=eq.' + enc(key) + '&updated_at=eq.' + enc(mm.rev),
          { value: val }, { 'Prefer': 'return=representation' });
        if (Array.isArray(res) && !res.length) res = 'conflict';
      }
      if (res === 'conflict') {
        // Başqa cihaz arada dəyişib: serverdəki versiyanı götür, siyahıdırsa birləşdir
        var rows = await MFRest('GET', 'app_kv?select=key,value,updated_at&key=eq.' + enc(key));
        if (!rows || !rows[0]) { mm.rev = null; continue; }
        var merged = KEYS[key].arr ? mergeArrays(val, rows[0].value) : val;
        if (merged !== val) { await writeLocal(key, merged); }
        mm.rev = rows[0].updated_at;
        pushKey._merged = true;
        continue;
      }
      var row = Array.isArray(res) ? res[0] : res;
      if (row && row.updated_at) mm.rev = row.updated_at;
      if (LS.getItem(key) === val || LS.getItem(key) == null && val == null) mm.dirty = false;
      return true;
    }
    return false;
  }

  async function pushDirty() {
    var touched = false;
    pushKey._merged = false;
    for (var key in KEYS) {
      if (!m(key).dirty) continue;
      await pushKey(key);
      touched = true;
    }
    saveMeta();
    return pushKey._merged;
  }

  // Mobil inbox → gelirxerc_cache
  async function importInbox() {
    var rows = await MFDB.pullNew();
    if (!rows.length) return false;
    var cur = parseArr(LS.getItem(LOG_KEY)) || [];
    var have = {};
    cur.forEach(function (r) { if (r && r.id) have[r.id] = 1; });
    var add = [], ack = [];
    rows.forEach(function (r) {
      ack.push(r.id);
      if (have[r.id]) return;
      have[r.id] = 1;
      add.push({
        id: r.id,
        Tarix: r.tarix || new Date().toISOString().split('T')[0],
        Emeliyyat: r.emeliyyat || 'Xərc',
        Kateqoriya: r.kateqoriya || '',
        Qeyd: r.qeyd || '',
        Mebleg: String(r.mebleg || '0')
      });
    });
    if (add.length) {
      await writeLocal(LOG_KEY, JSON.stringify(cur.concat(add)));
      m(LOG_KEY).dirty = true; saveMeta();
      await pushKey(LOG_KEY);                 // əvvəl serverə yaz, sonra inbox-da "processed" et
      saveMeta();
    }
    await MFDB.markProcessed(ack);
    return add.length > 0;
  }

  // ── Səhifəni yenilə ─────────────────────────────────────────
  function refreshUI() {
    try { window.dispatchEvent(new CustomEvent('sync-ok', { detail: 'mf-sync' })); } catch (e) {}
    if (window.FireSync) return;          // sync.js olan səhifələr özü yeniləyir
    try {
      if (typeof loadCache === 'function' && typeof render === 'function') {
        Promise.resolve(loadCache()).then(function () { render(); });
      } else if (typeof loadState === 'function') { loadState(); }
      else if (typeof loadData === 'function') { loadData(); }
    } catch (e) { console.warn('[sync] yenilənmə xətası:', e.message); }
  }

  // ── Kiçik vəziyyət nöqtəsi (sol-aşağı) ──────────────────────
  var dot = null;
  function setStatus(state, msg) {
    if (!dot) {
      if (!document.body) return;
      dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;left:8px;bottom:8px;width:9px;height:9px;border-radius:50%;z-index:9999;opacity:.7;pointer-events:none;';
      document.body.appendChild(dot);
    }
    dot.style.background = state === 'ok' ? '#22c55e' : state === 'busy' ? '#f59e0b' : '#ef4444';
    dot.title = msg || '';
  }

  // ── Dövrə ───────────────────────────────────────────────────
  var busy = false, again = false;
  async function cycle() {
    if (!MFAuth.session()) return;
    if (busy) { again = true; return; }
    busy = true;
    setStatus('busy', 'Sinxronizasiya...');
    try {
      var changed = await pullAll();
      var imported = await importInbox();
      var merged = await pushDirty();
      if (changed.length || imported || merged) refreshUI();
      setStatus('ok', 'Sinxron · ' + new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('[sync] xəta:', e.message);
      setStatus('err', 'Sinxron deyil: ' + e.message);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(cycle, 300); }
    }
  }

  window.MFSync = { now: cycle };

  function start() {
    cycle();
    setInterval(cycle, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cycle(); });
    window.addEventListener('online', cycle);
    window.addEventListener('mf-signed-in', cycle);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
