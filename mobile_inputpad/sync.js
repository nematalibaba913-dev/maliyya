/**
 * sync.js — Mobil InputPad versiyası
 * ────────────────────────────────────
 * Polling yoxdur, DB bridge yoxdur.
 * Göndərmə məntiqi InputPad.html + mf-supabase.js içindədir.
 */

window.FireSync = window.SBSync = window.GistSync = {
  pull: async () => ({ ok: true, rows: [] }),
  push: async () => ({ ok: true }),
};

// gist-ready event-i göndər ki InputPad init() işləsin
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () =>
    window.dispatchEvent(new CustomEvent('gist-ready')));
} else {
  setTimeout(() => window.dispatchEvent(new CustomEvent('gist-ready')), 0);
}

