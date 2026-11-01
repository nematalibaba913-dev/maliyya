/**
 * mf-supabase.js — InputPad üçün (girişsiz, YALNIZ YAZMA)
 * ──────────────────────────────────────────────────────────
 * InputPad ayrıca tətbiqdir: giriş (auth) yoxdur.
 * Supabase tərəfində anonim istifadəçi yalnız `inbox` cədvəlinə sətir əlavə edə bilər
 * (oxuya, dəyişə, silə bilməz) — bax: supabase_setup.sql.
 *
 *  MFAuth.isConfigured()  — konfiq doldurulubmu
 *  MFDB.insertInbox(tx)   — yeni əməliyyat göndər (eyni id təkrar gəlsə, uğurlu sayılır)
 */
(function () {
  'use strict';

  var CFG = window.MF_SUPABASE || {};

  function configured() {
    return !!(CFG.url && CFG.anonKey) && String(CFG.url).indexOf('YOUR-') === -1 &&
           String(CFG.anonKey).indexOf('YOUR-') === -1;
  }

  function mkErr(msg, status) {
    var e = new Error(msg); e.status = status || 0; return e;
  }

  window.MFAuth = { isConfigured: configured };

  window.MFDB = {
    insertInbox: function (tx) {
      if (!configured()) return Promise.reject(mkErr('Supabase konfiqurasiya olunmayıb', 0));
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
      return fetch(String(CFG.url).replace(/\/+$/, '') + '/rest/v1/inbox', {
        method: 'POST',
        headers: {
          'apikey': CFG.anonKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      }).then(function (r) {
        if (r.ok) return null;
        if (r.status === 409) return null;            // eyni id artıq var — təkrar göndərmə, problem yoxdur
        return r.text().then(function (t) {
          throw mkErr('HTTP ' + r.status + ' ' + t, r.status);
        });
      });
    }
  };
})();
