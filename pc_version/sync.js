/**
 * sync.js — v7 (Google-suz)
 *
 * Məlumat axını:
 *   Mobil InputPad → Supabase `inbox` cədvəli → GelirXerc_log.html (avtomatik çəkir)
 *   Giriş (auth) və inbox məntiqi: mf-supabase.js
 *
 * Bu fayl yalnız UI yeniləmə bildirişlərini (sync-ok / gist-ready) idarə edir.
 * localStorage: yalnız UI cache + tema. IndexedDB: db.js.
 */

function _currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}
function _isInputPad() { return _currentPage() === 'InputPad.html'; }

// ── UI bildiriş ───────────────────────────────────────────────
const _bc = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('maliyya_sync') : null;

if (_bc) {
  _bc.onmessage = e => {
    if (e.data && e.data.type === 'refresh') {
      window.dispatchEvent(new CustomEvent('sync-ok', { detail: e.data.detail || 'broadcast' }));
    }
  };
}

function _notifyUIRefresh(detail) {
  window.dispatchEvent(new CustomEvent('sync-ok', { detail: detail || 'update' }));
  if (_bc) _bc.postMessage({ type: 'refresh', detail });
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  setTimeout(() => {
    if (typeof loadData  === 'function') loadData();
    if (typeof renderAll === 'function') renderAll();
    if (typeof render    === 'function') render();
    window.dispatchEvent(new CustomEvent('gist-ready'));
  }, 100);
}

// ── sync-ok gəldikdə render funksiyalarını çağır ──────────────
window.addEventListener('sync-ok', function(e) {
  if (_isInputPad()) return;
  if (typeof loadData  === 'function') loadData();
  if (typeof renderAll === 'function') renderAll();
  if (typeof render    === 'function') render();
});

// ── Başlatma ──────────────────────────────────────────────────
(function() {
  function _start() { init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else {
    setTimeout(_start, 50);
  }
})();

// Global export
window.FireSync = window.SBSync = window.GistSync = {
  pull: async () => ({ ok: true, rows: [] }),
  push: async () => ({ ok: true }),
  startPolling: () => {},
  notifyRefresh: _notifyUIRefresh,
};
