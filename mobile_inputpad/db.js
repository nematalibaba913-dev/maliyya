/**
 * db.js — BudgetAppDB IndexedDB Helper
 * ─────────────────────────────────────
 * Bütün səhifələr bu fayldan import edir.
 * localStorage əvəzinə əsas data mənbəyi budur.
 *
 * Store-lar:
 *   transactions  keyPath: "id"
 *   transfers     keyPath: "id"
 *   credits       keyPath: "id"
 *   settings      keyPath: "key"   (opening_bal, cats, theme...)
 *   budget        keyPath: "key"   (budgetApp2025, balances, recurring, overrides)
 *   meta          keyPath: "key"   (migration flags, sync timestamps)
 */

const DB_NAME    = 'BudgetAppDB';
const DB_VERSION = 1;

let _db = null;

// ── DB açılması ───────────────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = function(e) {
      const db = e.target.result;

      // transactions store
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('Tarix',      'Tarix',      { unique: false });
        txStore.createIndex('Emeliyyat',  'Emeliyyat',  { unique: false });
        txStore.createIndex('Kateqoriya', 'Kateqoriya', { unique: false });
        txStore.createIndex('createdAt',  'createdAt',  { unique: false });
      }

      // transfers store
      if (!db.objectStoreNames.contains('transfers')) {
        const trStore = db.createObjectStore('transfers', { keyPath: 'id' });
        trStore.createIndex('tarix',     'tarix',     { unique: false });
        trStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // credits store
      if (!db.objectStoreNames.contains('credits')) {
        const crStore = db.createObjectStore('credits', { keyPath: 'id' });
        crStore.createIndex('tarix',     'tarix',     { unique: false });
        crStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // settings store — key/value cütləri (string key)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // budget store — key/value cütləri
      if (!db.objectStoreNames.contains('budget')) {
        db.createObjectStore('budget', { keyPath: 'key' });
      }

      // meta store — migrasiya flag-ləri, version, timestamps
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    req.onsuccess = function(e) {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = function(e) {
      console.error('[DB] Açılma xətası:', e.target.error);
      reject(e.target.error);
    };
  });
}

// ── Yardımçı: transaction wrapper ────────────────────────────
function _tx(storeName, mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req   = fn(store);
      if (req) {
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      } else {
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      }
    });
  });
}

function _getAll(storeName) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req   = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  });
}

// ════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════

function getAllTransactions() {
  return _getAll('transactions');
}

function addTransaction(tx) {
  if (!tx.id)        tx.id        = String(Date.now()) + Math.random().toString(36).slice(2,7);
  if (!tx.createdAt) tx.createdAt = new Date().toISOString();
  if (!tx.updatedAt) tx.updatedAt = new Date().toISOString();
  if (!tx.source)    tx.source    = 'manual';
  return _tx('transactions', 'readwrite', store => store.put(tx));
}

function addTransactionsBulk(items) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      let count = 0;
      items.forEach(item => {
        if (!item.id)        item.id        = String(Date.now()) + Math.random().toString(36).slice(2,7);
        if (!item.createdAt) item.createdAt = new Date().toISOString();
        if (!item.updatedAt) item.updatedAt = new Date().toISOString();
        if (!item.source)    item.source    = 'bulk';
        store.put(item);
        count++;
      });
      tx.oncomplete = () => resolve(count);
      tx.onerror    = () => reject(tx.error);
    });
  });
}

function updateTransaction(tx) {
  tx.updatedAt = new Date().toISOString();
  return _tx('transactions', 'readwrite', store => store.put(tx));
}

function deleteTransaction(id) {
  return _tx('transactions', 'readwrite', store => store.delete(id));
}

// ════════════════════════════════════════
// TRANSFERS
// ════════════════════════════════════════

function getAllTransfers() {
  return _getAll('transfers');
}

function addTransfer(item) {
  if (!item.id)        item.id        = String(Date.now()) + Math.random().toString(36).slice(2,7);
  if (!item.createdAt) item.createdAt = new Date().toISOString();
  return _tx('transfers', 'readwrite', store => store.put(item));
}

function updateTransfer(item) {
  return _tx('transfers', 'readwrite', store => store.put(item));
}

function deleteTransfer(id) {
  return _tx('transfers', 'readwrite', store => store.delete(id));
}

// ════════════════════════════════════════
// CREDITS
// ════════════════════════════════════════

function getAllCredits() {
  return _getAll('credits');
}

function addCredit(item) {
  if (!item.id)        item.id        = String(Date.now()) + Math.random().toString(36).slice(2,7);
  if (!item.createdAt) item.createdAt = new Date().toISOString();
  return _tx('credits', 'readwrite', store => store.put(item));
}

function updateCredit(item) {
  return _tx('credits', 'readwrite', store => store.put(item));
}

function deleteCredit(id) {
  return _tx('credits', 'readwrite', store => store.delete(id));
}

// ════════════════════════════════════════
// SETTINGS  (key/value)
// ════════════════════════════════════════

function getSetting(key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req   = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror   = () => reject(req.error);
    });
  });
}

function setSetting(key, value) {
  return _tx('settings', 'readwrite', store => store.put({ key, value }));
}

// ════════════════════════════════════════
// BUDGET  (key/value)
// ════════════════════════════════════════

function getBudget(key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('budget', 'readonly');
      const store = tx.objectStore('budget');
      const req   = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror   = () => reject(req.error);
    });
  });
}

function setBudget(key, value) {
  return _tx('budget', 'readwrite', store => store.put({ key, value }));
}

// ════════════════════════════════════════
// META  (key/value)
// ════════════════════════════════════════

function getMeta(key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const req   = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror   = () => reject(req.error);
    });
  });
}

function setMeta(key, value) {
  return _tx('meta', 'readwrite', store => store.put({ key, value }));
}

// ════════════════════════════════════════
// MİQRASİYA: localStorage → IndexedDB
// ════════════════════════════════════════

/**
 * migrateFromLocalStorage()
 * İlk açılışda köhnə localStorage məlumatlarını IndexedDB-yə köçürür.
 * Miqrasiya bitdikdə meta['migration_v1_done'] = true saxlanır.
 * Köhnə localStorage datası silinmir (fallback üçün).
 */
async function migrateFromLocalStorage() {
  // Artıq miqrasiya olubsa keç
  const done = await getMeta('migration_v1_done');
  if (done) return { skipped: true };

  console.log('[DB] Miqrasiya başlayır...');
  let counts = { transactions: 0, transfers: 0, credits: 0, settings: 0, budget: 0 };

  // ── 1) Transactions ──────────────────────────────────────
  const existingTxIds = new Set((await getAllTransactions()).map(t => t.id).filter(Boolean));

  // mf_transactions əsas mənbədir
  let txItems = [];
  try {
    const raw = localStorage.getItem('mf_transactions');
    if (raw) txItems = JSON.parse(raw) || [];
  } catch(e) {}

  // legacy 'transactions' — merge et, duplicate-ı sil
  try {
    const legacy = JSON.parse(localStorage.getItem('transactions') || '[]');
    legacy.forEach(lt => {
      // id yoxsa, mövcud txItems içindəki eyni məlumatla uyğunlaşdır
      const isDup = txItems.some(t =>
        t.Tarix === lt.Tarix &&
        t.Emeliyyat === lt.Emeliyyat &&
        t.Mebleg === String(lt.Mebleg) &&
        t.Kateqoriya === lt.Kateqoriya
      );
      if (!isDup) txItems.push(lt);
    });
  } catch(e) {}

  // IndexedDB-yə yaz (duplicate-lardan qaç)
  for (const tx of txItems) {
    if (!tx.id) tx.id = String(Date.now()) + '_' + Math.random().toString(36).slice(2,6);
    if (existingTxIds.has(tx.id)) continue;
    if (!tx.createdAt) tx.createdAt = new Date().toISOString();
    if (!tx.updatedAt) tx.updatedAt = new Date().toISOString();
    if (!tx.source)    tx.source    = 'migrated';
    await addTransaction(tx);
    existingTxIds.add(tx.id);
    counts.transactions++;
  }

  // ── 2) Transfers ─────────────────────────────────────────
  const existingTrIds = new Set((await getAllTransfers()).map(t => t.id).filter(Boolean));
  try {
    const transfers = JSON.parse(localStorage.getItem('mf_transfers') || '[]');
    for (const tr of transfers) {
      if (!tr.id) tr.id = String(Date.now()) + '_tr_' + Math.random().toString(36).slice(2,5);
      if (existingTrIds.has(tr.id)) continue;
      await addTransfer(tr);
      existingTrIds.add(tr.id);
      counts.transfers++;
    }
  } catch(e) {}

  // ── 3) Credits ───────────────────────────────────────────
  const existingCrIds = new Set((await getAllCredits()).map(c => c.id).filter(Boolean));
  try {
    const credits = JSON.parse(localStorage.getItem('kreditler_v2') || '[]');
    for (const cr of credits) {
      if (!cr.id) cr.id = String(Date.now()) + '_cr_' + Math.random().toString(36).slice(2,5);
      if (existingCrIds.has(cr.id)) continue;
      await addCredit(cr);
      existingCrIds.add(cr.id);
      counts.credits++;
    }
  } catch(e) {}

  // ── 4) Settings ──────────────────────────────────────────
  const settingKeys = ['mf_opening_bal', 'mf_cats', 'lastResetDate'];
  for (const k of settingKeys) {
    const v = localStorage.getItem(k);
    if (v != null) {
      await setSetting(k, v);
      counts.settings++;
    }
  }

  // ── 5) Budget ────────────────────────────────────────────
  const budgetKeys = ['budgetApp2025', 'budgetBalances2025', 'budgetRecurring2025', 'budgetOverrides2025'];
  for (const k of budgetKeys) {
    const v = localStorage.getItem(k);
    if (v != null) {
      await setBudget(k, v);
      counts.budget++;
    }
  }

  // ── Miqrasiya tamamlandı ──────────────────────────────────
  await setMeta('migration_v1_done', true);
  await setMeta('migration_v1_date', new Date().toISOString());
  await setMeta('app_version', '5.0');

  console.log('[DB] Miqrasiya tamamlandı:', counts);
  return { done: true, counts };
}

// ════════════════════════════════════════
// EXPORT / IMPORT
// ════════════════════════════════════════

async function exportAllData() {
  const [transactions, transfers, credits] = await Promise.all([
    getAllTransactions(),
    getAllTransfers(),
    getAllCredits(),
  ]);

  // settings
  const settings = {};
  for (const k of ['mf_opening_bal', 'mf_cats', 'lastResetDate']) {
    const v = await getSetting(k);
    if (v != null) settings[k] = v;
  }

  // budget
  const budget = {};
  for (const k of ['budgetApp2025', 'budgetBalances2025', 'budgetRecurring2025', 'budgetOverrides2025']) {
    const v = await getBudget(k);
    if (v != null) budget[k] = v;
  }

  return {
    version: '5.0',
    exportedAt: new Date().toISOString(),
    transactions,
    transfers,
    credits,
    settings,
    budget,
  };
}

async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Yanlış data formatı');

  let counts = { transactions: 0, transfers: 0, credits: 0, settings: 0, budget: 0 };

  // Transactions
  if (Array.isArray(data.transactions)) {
    const existing = new Set((await getAllTransactions()).map(t => t.id).filter(Boolean));
    for (const tx of data.transactions) {
      if (!tx.id || existing.has(tx.id)) continue;
      await addTransaction(tx);
      existing.add(tx.id);
      counts.transactions++;
    }
  }

  // Transfers
  if (Array.isArray(data.transfers)) {
    const existing = new Set((await getAllTransfers()).map(t => t.id).filter(Boolean));
    for (const tr of data.transfers) {
      if (!tr.id || existing.has(tr.id)) continue;
      await addTransfer(tr);
      existing.add(tr.id);
      counts.transfers++;
    }
  }

  // Credits
  if (Array.isArray(data.credits)) {
    const existing = new Set((await getAllCredits()).map(c => c.id).filter(Boolean));
    for (const cr of data.credits) {
      if (!cr.id || existing.has(cr.id)) continue;
      await addCredit(cr);
      existing.add(cr.id);
      counts.credits++;
    }
  }

  // Settings
  if (data.settings && typeof data.settings === 'object') {
    for (const [k, v] of Object.entries(data.settings)) {
      await setSetting(k, v);
      counts.settings++;
    }
  }

  // Budget
  if (data.budget && typeof data.budget === 'object') {
    for (const [k, v] of Object.entries(data.budget)) {
      await setBudget(k, v);
      counts.budget++;
    }
  }

  return counts;
}

// ── Global export ─────────────────────────────────────────────
window.BudgetDB = {
  openDB,
  // Transactions
  getAllTransactions,
  addTransaction,
  addTransactionsBulk,
  updateTransaction,
  deleteTransaction,
  // Transfers
  getAllTransfers,
  addTransfer,
  updateTransfer,
  deleteTransfer,
  // Credits
  getAllCredits,
  addCredit,
  updateCredit,
  deleteCredit,
  // Settings
  getSetting,
  setSetting,
  // Budget
  getBudget,
  setBudget,
  // Meta
  getMeta,
  setMeta,
  // Migration & IO
  migrateFromLocalStorage,
  exportAllData,
  importAllData,
};
