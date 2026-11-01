/**
 * receipt.js — InputPad: e-kassa çekinin şəklindən xərcləri oxu
 * ────────────────────────────────────────────────────────────
 * 1) Çekin şəkli (e-kassa "Çeki yüklə" ilə endirilən və ya foto) brauzerdə OCR ilə oxunur
 *    (tesseract.js, fayllar ocr/ qovluğunda — kənar serverə heç nə göndərilmir).
 * 2) Hər mal ayrı sətir kimi çıxarılır, kateqoriyaya uyğunlaşdırılır.
 * 3) İstifadəçi baxır, düzəldir, təsdiq edir → hər sətir `inbox`-a ayrı xərc kimi gedir.
 *    Kateqoriyası tapılmayan sətir qırmızı qalır və seçilməyincə göndərmək olmur.
 *
 * Təmiz funksiyalar (parseReceipt, suggestCategory) UI-dan ayrıdır — test üçün.
 */
(function (root) {
  'use strict';

  /* ───────────── Köməkçi: hərf normallaşdırma ───────────── */
  function fold(s) {
    return String(s || '')
      .replace(/[Əə]/g, 'e')            // Ə ə
      .replace(/[ıİ]/g, 'i')            // ı İ
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  /* ───────────── Rəqəm oxuma ─────────────
     Çekdə məbləğ həmişə 2 onluqla çap olunur (4.80). OCR bəzən nöqtəni itirir ("480"). */
  function money(tok) {
    tok = String(tok || '').replace(',', '.').replace(/[^\d.]/g, '');
    if (!tok) return NaN;
    if (/^\d+\.\d{1,3}$/.test(tok)) return parseFloat(tok);
    if (/^\d+$/.test(tok)) return tok.length >= 3 ? parseInt(tok, 10) / 100 : parseInt(tok, 10);
    return NaN;
  }
  function qty(tok) {
    tok = String(tok || '').replace(',', '.').replace(/[^\d.]/g, '');
    if (/^0\d+$/.test(tok)) return parseFloat('0.' + tok.slice(1));   // "040" → 0.40
    var n = parseFloat(tok);
    return isNaN(n) ? NaN : n;
  }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ───────────── Çeki mətndən ayır ───────────── */
  function parseReceipt(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var folded = lines.map(fold);
    var out = { date: '', time: '', store: '', total: NaN, items: [], warnings: [] };

    // Tarix / vaxt
    var m = fold(text).match(/tarix\D{0,3}(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})/);
    if (m) out.date = m[3] + '-' + m[2] + '-' + m[1];
    var tm = fold(text).match(/vaxt\D{0,3}(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
    if (tm) out.time = tm[1].padStart(2, '0') + ':' + tm[2] + ':' + (tm[3] || '00');

    // Obyektin adı
    for (var i = 0; i < folded.length; i++) {
      var sm = lines[i].match(/^obyektin\s+ad\S*\s*:?\s*(.+)$/i) ||
               (folded[i].indexOf('obyektin ad') === 0 ? lines[i].match(/:\s*(.+)$/) : null);
      if (sm) { out.store = sm[1].trim(); break; }
    }

    // Mallar: başlıq sətrindən "Cəmi" sətrinə qədər
    var start = -1, end = folded.length;
    for (i = 0; i < folded.length; i++) {
      if (/(mehsul|mahsul)/.test(folded[i]) && /(say|qiymet|qiymat)/.test(folded[i])) { start = i; break; }
    }
    for (i = start + 1; i < folded.length; i++) {
      var tmatch = folded[i].match(/^\W*(?:c[ea]mi|cemi)\s+([\d.,]+)\s*$/);
      if (tmatch) { out.total = money(tmatch[1]); end = i; break; }
    }
    if (start < 0) start = -1;

    var TAIL = /^(.*?)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s*$/;
    var cur = null;
    for (i = start + 1; i < end; i++) {
      var ln = lines[i];
      var tail = ln.match(TAIL);
      if (tail && tail[1].replace(/\(.*?\)/g, '').trim().length >= 2) {
        var name = tail[1].replace(/\(\s*[^)]*\)\s*$/, '').trim();
        var q = qty(tail[2]), p = money(tail[3]), t = money(tail[4]);
        // Qiymət × say uyğunsuzluğu: məbləğə (cəmi sütununa) üstünlük ver
        if (isNaN(t) && !isNaN(q) && !isNaN(p)) t = r2(q * p);
        cur = { name: name, qty: q, price: p, amount: isNaN(t) ? 0 : r2(t) };
        out.items.push(cur);
      } else if (cur) {
        // Davam sətri: adın qalan hissəsi (ƏDV sətirlərini keç)
        if (/%/.test(ln) || /^[*"'“”]/.test(ln) || /dv/.test(folded[i])) continue;
        var extra = ln.replace(/\s+\d{1,2}$/, '').trim();   // sondakı tək rəqəm (sütun qalığı)
        if (extra) cur.name = (cur.name + ' ' + extra).trim();
      }
    }

    // Yoxlama: sətirlərin cəmi = çekin cəmi?
    var sum = r2(out.items.reduce(function (s, it) { return s + it.amount; }, 0));
    if (!out.items.length) out.warnings.push('Mal sətirləri tapılmadı.');
    if (!isNaN(out.total) && Math.abs(sum - out.total) > 0.011) {
      out.warnings.push('Sətirlərin cəmi (' + sum.toFixed(2) + ') çekdəki cəmlə (' + out.total.toFixed(2) + ') uyğun gəlmir — məbləğləri yoxlayın.');
    }
    if (!out.date) out.warnings.push('Tarix oxunmadı — özünüz seçin.');
    return out;
  }

  /* ───────────── Kateqoriya təxmini ───────────── */
  // Açar söz (normallaşdırılmış, söz əvvəli ilə uyğunlaşır) → kateqoriya adı.
  // Yalnız istifadəçinin kateqoriya siyahısında olan adlar təklif olunur.
  var RULES = {
    'Siqaret': ['siqaret', 'kent', 'marlboro', 'parliament', 'winston', 'camel', 'philip', 'sobranie', 'rothmans', 'mevius', 'tutun', 'qibrit', 'cakmak', 'chesterfield', 'lucky', 'bond', 'ld ', 'esse', 'vogue', 'dunhill'],
    'Təmizlik vasitələri': ['sabun', 'tualet', 'salfet', 'desmal', 'yuyucu', 'persil', 'ariel', 'fairy', 'domestos', 'klorax', 'dezinfek', 'sampun', 'pasta', 'tozu', 'tullantı', 'zibil', 'paket', 'sunger', 'bez', 'clean'],
    'Tibb': ['derman', 'vitamin', 'tablet', 'plaster', 'maska', 'sirop', 'ampula', 'shpris', 'termometr', 'bint', 'pambig', 'aptek'],
    'Yol': ['benzin', 'dizel', 'yanacaq', 'ai-9', 'a-95', 'a95', 'a92', 'bilet', 'taksi', 'metro', 'avtobus', 'bakikart'],
    'Restoran': ['pizza', 'burger', 'shaurma', 'doner', 'lahmacun', 'kafe', 'restoran', 'sandvic', 'latte', 'cappuccino', 'espresso'],
    'Heyvan məhsulları': ['whiskas', 'pedigree', 'felix', 'kitekat', 'pisik', 'it yemi', 'heyvan'],
    'Ərzaq': ['baliq', 'skumbriya', 'kilka', 'qizilbaliq', 'tuna', 'sazan', 'corek', 'lavas', 'batan', 'bulka', 'sud', 'sut', 'kefir', 'qaymaq', 'yag', 'yumurta', 'toyuq', 'et ', 'mal ', 'qoyun', 'kolbasa', 'sosiska', 'sosis', 'pendir', 'kere', 'duz', 'seker', 'un ', 'makaron', 'duyu', 'noxud', 'lobya', 'meyve', 'alma', 'armud', 'banan', 'pomidor', 'xiyar', 'kartof', 'sogan', 'sarimsaq', 'limon', 'portagal', 'mandarin', 'cay', 'kofe', 'qehve', 'bal ', 'murebbe', 'konfet', 'sokolad', 'biskvit', 'pecenye', 'su ', 'sire', 'kompot', 'ayran', 'yogurt', 'yoqurt', 'dondurma', 'konserv', 'ketchup', 'mayonez', 'sous', 'badam', 'findiq', 'cips', 'qoz', 'kismis', 'zeytun', 'yarma', 'ovsyanka', 'qida', 'ersaq', 'meyve', 'terevez', 'pomidor', 'bibar', 'kelem', 'kok']
  };

  function normName(s) { return fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function loadLearn() { try { return JSON.parse(localStorage.getItem('_ck_learn') || '{}'); } catch (e) { return {}; } }
  function saveLearn(map) { try { localStorage.setItem('_ck_learn', JSON.stringify(map)); } catch (e) {} }

  function suggestCategory(name, cats, learn) {
    var key = normName(name);
    if (!key) return '';
    learn = learn || {};
    if (learn[key] && cats.indexOf(learn[key]) >= 0) return learn[key];
    var padded = ' ' + key + ' ';
    var tokens = key.split(' ');
    var order = ['Siqaret', 'Təmizlik vasitələri', 'Tibb', 'Yol', 'Restoran', 'Heyvan məhsulları', 'Ərzaq'];
    for (var c = 0; c < order.length; c++) {
      var cat = order[c];
      if (cats.indexOf(cat) < 0) continue;
      var kws = RULES[cat];
      for (var k = 0; k < kws.length; k++) {
        var kw = kws[k];
        if (kw.slice(-1) === ' ') {                       // qısa söz: tam söz kimi
          if (padded.indexOf(' ' + kw) >= 0) return cat;
        } else if (kw.length < 4) {
          if (tokens.indexOf(kw) >= 0) return cat;
        } else {
          for (var t = 0; t < tokens.length; t++) if (tokens[t].indexOf(kw) === 0) return cat;
        }
      }
    }
    return '';
  }

  /* ───────────── Eyni çek yoxlaması ───────────── */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function receiptKey(r) { return (r.date || 'x') + '_' + (r.time || 'x') + '_' + (isNaN(r.total) ? 'x' : r.total.toFixed(2)); }
  function loadDone() { try { return JSON.parse(localStorage.getItem('_ck_done') || '[]'); } catch (e) { return []; } }
  function saveDone(a) { try { localStorage.setItem('_ck_done', JSON.stringify(a.slice(-200))); } catch (e) {} }

  var API = { parseReceipt: parseReceipt, suggestCategory: suggestCategory, normName: normName, money: money, hash: hash };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof document === 'undefined') return;
  root.MFReceipt = API;

  /* ═════════════════ UI ═════════════════ */
  var worker = null, workerLoading = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Yüklənmədi: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function getWorker(onProgress) {
    if (worker) return Promise.resolve(worker);
    if (workerLoading) return workerLoading;
    workerLoading = (typeof Tesseract !== 'undefined' ? Promise.resolve() : loadScript('ocr/tesseract.min.js'))
      .then(function () {
        return Tesseract.createWorker('eng', 1, {
          workerPath: 'ocr/worker.min.js',
          corePath: 'ocr/',
          langPath: 'ocr/',
          gzip: true,
          logger: function (m) { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); }
        });
      })
      .then(function (w) { worker = w; return w; })
      .catch(function (e) { workerLoading = null; throw e; });
    return workerLoading;
  }

  function imageToCanvas(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = 1;
        var longest = Math.max(w, h);
        if (longest > 2200) scale = 2200 / longest;          // çox böyük foto: kiçilt
        else if (w < 500) scale = 2;                         // çox kiçik: böyüt
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Şəkil açılmadı')); };
      img.src = url;
    });
  }

  var CSS = '' +
    '#ck-ov{position:fixed;inset:0;background:#000;z-index:1000;display:none;flex-direction:column;color:#fff;font-family:inherit}' +
    '#ck-ov.show{display:flex}' +
    '#ck-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;font-size:17px;font-weight:600}' +
    '#ck-x{background:#1c1c1c;border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}' +
    '#ck-body{flex:1;overflow-y:auto;padding:0 16px 12px}' +
    '.ck-big{display:block;width:100%;background:#1c1c1c;color:#fff;border:1px dashed #444;border-radius:16px;padding:28px 12px;font-size:16px;text-align:center;cursor:pointer;margin-top:10px}' +
    '.ck-hint{color:#888;font-size:13px;line-height:1.5;margin:12px 4px}' +
    '.ck-row{background:#141414;border:1px solid #262626;border-radius:14px;padding:10px;margin-bottom:10px}' +
    '.ck-row.need{border-color:#e53e3e}' +
    '.ck-r1{display:flex;gap:8px;margin-bottom:8px}' +
    '.ck-row input,.ck-row select,#ck-date{background:#1c1c1c;color:#fff;border:none;border-radius:10px;padding:9px 10px;font-size:14px;outline:none;min-width:0}' +
    '.ck-name{flex:1}.ck-amt{width:84px;text-align:right}' +
    '.ck-r2{display:flex;gap:8px;align-items:center}' +
    '.ck-cat{flex:1}' +
    '.ck-del{background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px}' +
    '.ck-warn{background:#3a2a05;color:#fbbf24;border-radius:10px;padding:8px 10px;font-size:13px;margin-bottom:10px}' +
    '.ck-sum{display:flex;justify-content:space-between;font-size:14px;color:#bbb;margin:6px 4px 10px}' +
    '#ck-foot{padding:10px 16px 16px}' +
    '#ck-ok{width:100%;background:#e53e3e;color:#fff;border:none;border-radius:14px;padding:14px;font-size:16px;font-weight:600;cursor:pointer}' +
    '#ck-ok:disabled{background:#2a2a2a;color:#777;cursor:default}' +
    '#ck-fab{position:fixed;left:16px;bottom:22px;width:46px;height:46px;border-radius:50%;border:none;background:#1c1c1c;color:#fff;font-size:20px;cursor:pointer;z-index:50;box-shadow:0 2px 10px rgba(0,0,0,.5)}';

  var el = {}, state = { parsed: null, cats: [], rows: [] };

  function build() {
    if (el.ov) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var fab = document.createElement('button');
    fab.id = 'ck-fab'; fab.type = 'button'; fab.title = 'Çek skan et'; fab.textContent = '🧾';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    var ov = document.createElement('div'); ov.id = 'ck-ov';
    ov.innerHTML =
      '<div id="ck-head"><span>🧾 Çek</span><button id="ck-x" type="button">✕</button></div>' +
      '<div id="ck-body"></div>' +
      '<div id="ck-foot" style="display:none"><button id="ck-ok" type="button">Təsdiq et və göndər</button></div>' +
      '<input id="ck-file" type="file" accept="image/*" style="display:none">';
    document.body.appendChild(ov);
    el.ov = ov;
    el.body = ov.querySelector('#ck-body');
    el.foot = ov.querySelector('#ck-foot');
    el.ok = ov.querySelector('#ck-ok');
    el.file = ov.querySelector('#ck-file');
    ov.querySelector('#ck-x').addEventListener('click', close);
    el.ok.addEventListener('click', confirmSend);
    el.file.addEventListener('change', function () { if (el.file.files[0]) handleFile(el.file.files[0]); el.file.value = ''; });
  }

  function open() { build(); showPicker(); el.ov.classList.add('show'); }
  function close() { el.ov.classList.remove('show'); }

  function showPicker(msg) {
    el.foot.style.display = 'none';
    el.body.innerHTML =
      '<button class="ck-big" type="button" id="ck-pick">📷 Çekin şəklini seç və ya çək</button>' +
      '<div class="ck-hint">e-kassa saytından "Çeki yüklə" ilə endirdiyiniz şəkli və ya kağız çekin fotosunu seçin. ' +
      'Şəkil yalnız bu cihazda oxunur, heç yerə göndərilmir. Mallar ayrı sətir kimi çıxacaq, göndərməzdən əvvəl yoxlaya və düzəldə bilərsiniz.</div>' +
      (msg ? '<div class="ck-warn">' + esc(msg) + '</div>' : '');
    el.body.querySelector('#ck-pick').addEventListener('click', function () { el.file.click(); });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function handleFile(file) {
    el.body.innerHTML = '<div class="ck-hint" id="ck-prog">Şəkil hazırlanır…</div>';
    var prog = el.body.querySelector('#ck-prog');
    imageToCanvas(file)
      .then(function (canvas) {
        prog.textContent = 'Oxuyucu yüklənir (ilk dəfə bir az çəkə bilər)…';
        return getWorker(function (p) { prog.textContent = 'Oxunur… ' + Math.round(p * 100) + '%'; })
          .then(function (w) { prog.textContent = 'Oxunur…'; return w.recognize(canvas); });
      })
      .then(function (r) {
        var parsed = parseReceipt(r.data.text);
        if (!parsed.items.length) { showPicker('Çekdən mal sətirləri oxunmadı. Şəkil aydın və çekin "Məhsulun adı … Cəmi" hissəsi görünən olmalıdır.'); return; }
        showReview(parsed);
      })
      .catch(function (e) {
        console.warn('[Çek]', e);
        showPicker('Oxuma xətası: ' + (e && e.message ? e.message : e));
      });
  }

  function showReview(parsed) {
    state.parsed = parsed;
    state.cats = (typeof getCats === 'function') ? getCats('Xərc') : [];
    var learn = loadLearn();
    state.rows = parsed.items.map(function (it) {
      return { name: it.name, amount: it.amount, cat: suggestCategory(it.name, state.cats, learn) };
    });
    var key = receiptKey(parsed);
    var dup = loadDone().indexOf(key) >= 0;
    state.key = key;

    var html = '';
    if (dup) html += '<div class="ck-warn">Bu çek əvvəl göndərilib. Yenidən göndərsəniz təkrar xərc yazılacaq.</div>';
    parsed.warnings.forEach(function (w) { html += '<div class="ck-warn">' + esc(w) + '</div>'; });
    html += '<div class="ck-r2" style="margin-bottom:10px"><span style="color:#888;font-size:13px">Tarix</span>' +
            '<input type="date" id="ck-date" value="' + esc(parsed.date) + '" style="flex:1"></div>';
    html += '<div id="ck-rows"></div>';
    html += '<div class="ck-sum"><span>Sətirlərin cəmi</span><b id="ck-total">0.00 ₼</b></div>';
    if (!isNaN(parsed.total)) html += '<div class="ck-sum" style="margin-top:-6px"><span>Çekdəki cəmi</span><span>' + parsed.total.toFixed(2) + ' ₼</span></div>';
    html += '<button class="ck-big" type="button" id="ck-add" style="padding:12px;margin-top:0">+ Sətir əlavə et</button>';
    el.body.innerHTML = html;
    el.body.querySelector('#ck-add').addEventListener('click', function () {
      state.rows.push({ name: '', amount: 0, cat: '' }); renderRows(); });
    el.foot.style.display = 'block';
    renderRows();
  }

  function renderRows() {
    var wrap = el.body.querySelector('#ck-rows');
    wrap.innerHTML = '';
    state.rows.forEach(function (row, i) {
      var d = document.createElement('div');
      d.className = 'ck-row' + (row.cat ? '' : ' need');
      var opts = '<option value="">Kateqoriya seçin</option>' + state.cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === row.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      d.innerHTML =
        '<div class="ck-r1"><input class="ck-name" maxlength="100" value="' + esc(row.name) + '" placeholder="Mal adı">' +
        '<input class="ck-amt" inputmode="decimal" value="' + (row.amount ? row.amount.toFixed(2) : '') + '" placeholder="0.00"></div>' +
        '<div class="ck-r2"><select class="ck-cat">' + opts + '</select><button class="ck-del" type="button" title="Sətri sil">✕</button></div>';
      var nm = d.querySelector('.ck-name'), am = d.querySelector('.ck-amt'), ct = d.querySelector('.ck-cat');
      nm.addEventListener('input', function () { row.name = nm.value; });
      am.addEventListener('input', function () { row.amount = money(am.value) || 0; updateTotal(); });
      ct.addEventListener('change', function () { row.cat = ct.value; d.className = 'ck-row' + (row.cat ? '' : ' need'); updateTotal(); });
      d.querySelector('.ck-del').addEventListener('click', function () { state.rows.splice(i, 1); renderRows(); });
      wrap.appendChild(d);
    });
    updateTotal();
  }

  function updateTotal() {
    var sum = state.rows.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
    var t = el.body.querySelector('#ck-total'); if (t) t.textContent = r2(sum).toFixed(2) + ' ₼';
    var missing = state.rows.filter(function (r) { return !r.cat; }).length;
    var bad = state.rows.filter(function (r) { return !(r.amount > 0); }).length;
    el.ok.disabled = !state.rows.length || missing > 0 || bad > 0;
    el.ok.textContent = missing ? 'Kateqoriyası seçilməyən: ' + missing :
                        bad ? 'Məbləği boş olan sətir var' :
                        'Təsdiq et və göndər (' + state.rows.length + ')';
  }

  function confirmSend() {
    var dateEl = el.body.querySelector('#ck-date');
    var date = dateEl && dateEl.value;
    if (!date) { alert('Tarix seçin'); return; }
    el.ok.disabled = true;
    var base = 'ck' + hash(state.key + '|' + Date.now());
    var learn = loadLearn();
    var txs = state.rows.map(function (r, i) {
      var k = normName(r.name); if (k) learn[k] = r.cat;
      return {
        id: base + '_' + (i + 1),
        createdAt: new Date().toISOString(),
        Tarix: date,
        Emeliyyat: 'Xərc',
        Kateqoriya: r.cat,
        Qeyd: String(r.name || '').trim().slice(0, 100),
        Mebleg: String(r2(r.amount)),
        source: 'inputpad_cek',
        status: 'new'
      };
    });
    saveLearn(learn);

    if (typeof showStatus === 'function') showStatus('⏳ Göndərilir...', false);
    var failed = 0;
    txs.reduce(function (p, tx) {
      return p.then(function () { return _postTx(tx); }).catch(function () {
        failed++; _offlineQueue.push(tx); _saveQueue();
      });
    }, Promise.resolve()).then(function () {
      var done = loadDone(); done.push(state.key); saveDone(done);
      if (typeof showStatus === 'function')
        showStatus(failed ? '📵 ' + failed + ' sətir offline saxlandı' : '✓ ' + txs.length + ' sətir göndərildi', false);
      if (!failed && typeof _flushQueue === 'function') _flushQueue();
      close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})(typeof window !== 'undefined' ? window : this);
