/**
 * backup.js — v6
 * Export: localStorage → JSON
 * Import: JSON → localStorage
 */
(function() {
'use strict';

async function downloadBackup() {
  try {
    let data = { version: '6.0', exportedAt: new Date().toISOString() };

    data.credits   = JSON.parse(localStorage.getItem('kreditler_v2')  || '[]');
    data.transfers = JSON.parse(localStorage.getItem('mf_transfers')   || '[]');
    data.settings  = { mf_opening_bal: localStorage.getItem('mf_opening_bal') };
    data.transactions = JSON.parse(localStorage.getItem('mf_transactions') || '[]');
    // Proqnoz - yalnız localStorage
    data.budget = {
      budgetApp2025:       localStorage.getItem('budgetApp2025'),
      budgetBalances2025:  localStorage.getItem('budgetBalances2025'),
      budgetRecurring2025: localStorage.getItem('budgetRecurring2025'),
      budgetOverrides2025: localStorage.getItem('budgetOverrides2025'),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maliyya_backup_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    if (window._backupToast) window._backupToast('Backup yükləndi ✓');
  } catch(e) {
    console.error('[backup] Export xəta:', e);
    if (window._backupToast) window._backupToast('Export xəta: ' + e.message, true);
  }
}

function triggerImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); };
  inp.click();
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());

    if (data.credits)   localStorage.setItem('kreditler_v2', JSON.stringify(data.credits));
    if (data.transfers) localStorage.setItem('mf_transfers',  JSON.stringify(data.transfers));
    if (data.settings && data.settings.mf_opening_bal)
      localStorage.setItem('mf_opening_bal', data.settings.mf_opening_bal);
    if (Array.isArray(data.transactions))
      localStorage.setItem('mf_transactions', JSON.stringify(data.transactions));
    if (data.budget) {
      Object.entries(data.budget).forEach(([k,v]) => { if(v) localStorage.setItem(k, v); });
    }

    window.dispatchEvent(new CustomEvent('sync-ok', { detail: 'import' }));
    if (window._backupToast) window._backupToast('İmport uğurlu ✓');
  } catch(e) {
    console.error('[backup] Import xəta:', e);
    if (window._backupToast) window._backupToast('Import xəta: ' + e.message, true);
  }
}

async function downloadExcel() {
  try {
    const txs = JSON.parse(localStorage.getItem('mf_transactions') || '[]');
    if (!txs.length) { if (window._backupToast) window._backupToast('Məlumat yoxdur', true); return; }
    const rows = [['Tarix','Əməliyyat','Kateqoriya','Qeyd','Məbləğ']];
    txs.forEach(t => rows.push([t.Tarix||'', t.Emeliyyat||'', t.Kateqoriya||'', (t.Qeyd||'').replace(/\t/g,' '), t.Mebleg||'0']));
    const tsv  = '\uFEFF' + rows.map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maliyya_' + new Date().toISOString().split('T')[0] + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    if (window._backupToast) window._backupToast('Excel yükləndi ✓');
  } catch(e) {
    if (window._backupToast) window._backupToast('Excel xəta: ' + e.message, true);
  }
}

window.BackupSystem = { downloadBackup, importBackup, triggerImport, downloadExcel };
window.downloadBackup = downloadBackup;
window.downloadExcel  = downloadExcel;
})();
