/**
 * credit-plan.js — Kreditlər səhifəsindəki aylıq ödənişləri cari il üzrə proqnoza çıxarır
 * ──────────────────────────────────────────────────────────────────────────────
 * MFCreditPlan.items(year) → [{ id, monthKey:'YYYY-MM', date:'YYYY-MM-DD', day, amount, name }]
 *   id = 'cr_<kreditId>' ; ay üzrə düzəliş açarı proqnozda  id + '_' + monthKey
 * Hər kredit üçün: başlama tarixindən hər ay (1..müddət) ödəniş. Gizlədilmiş kredit və 0 aylıq ödəniş atlanır.
 */
(function (root) {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function readCredits() {
    try { var a = JSON.parse(localStorage.getItem('kreditler_v2') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  // Başlanğıc tarixdən n ay sonra (ay sonu aşmasın: 31 Yan + 1 ay = 28/29 Fev)
  function addMonths(startStr, n) {
    var p = String(startStr || '').slice(0, 10).split('-').map(Number);
    if (p.length < 3 || isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) return null;
    var y = p[0], m = p[1] - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(y, m + 1, 0).getDate();
    return { y: y, m: m + 1, d: Math.min(p[2], last) };
  }
  function items(year, credits) {
    var out = [];
    (credits || readCredits()).forEach(function (cr) {
      var monthly = parseFloat(cr.monthly) || 0;
      var term = parseInt(cr.termMonths, 10) || 0;
      if (cr.hidden || !(monthly > 0) || !(term > 0) || !cr.startDate) return;
      for (var n = 1; n <= term; n++) {
        var due = addMonths(cr.startDate, n);
        if (!due || due.y !== year) continue;
        out.push({
          id: 'cr_' + cr.id,
          monthKey: due.y + '-' + pad(due.m),
          date: due.y + '-' + pad(due.m) + '-' + pad(due.d),
          day: due.d, amount: monthly, name: cr.name || cr.bank || 'Kredit'
        });
      }
    });
    return out;
  }
  root.MFCreditPlan = { items: items, addMonths: addMonths };
})(window);
