
// "?"? DATA "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
const DEFAULT_CREDITS = [];

let credits = [];
let creditLog = [];
let payTarget = null;
let editTarget = null;
let curTab = 'active';
const CHARTS = {};

// ?? STATE - lokal/IndexedDB ?????????????????????????????
const STORAGE_KEY = "credits_idb_v1";
const LOG_KEY     = "credit_log_v1";
let _creditsSaving = false;

function loadState(){
  try{ const parsed=JSON.parse(localStorage.getItem("kreditler_v2")||"[]"); if(Array.isArray(parsed)) credits=parsed; }catch(e){}
  try{ const log=JSON.parse(localStorage.getItem(LOG_KEY)||"[]"); if(Array.isArray(log)) creditLog=log; }catch(e){}

  if(window.BudgetDB){
    BudgetDB.openDB()
      .then(()=>Promise.all([
        BudgetDB.getSetting(STORAGE_KEY),
        BudgetDB.getSetting(LOG_KEY)
      ]))
      .then(([cr,lg])=>{
        if(Array.isArray(cr)) credits=cr;
        if(Array.isArray(lg)) creditLog=lg;
        renderAll();
      })
      .catch(console.error);
  }

  renderAll();
}

function saveState(){
  localStorage.setItem("kreditler_v2", JSON.stringify(credits));
  localStorage.setItem(LOG_KEY, JSON.stringify(creditLog));
  if(window.BudgetDB){
    try{
      BudgetDB.setSetting(STORAGE_KEY, credits);
      BudgetDB.setSetting(LOG_KEY, creditLog);
    }catch(e){ console.error(e); }
  }
}// "?"? CALC "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function calc(cr){
  // Faktiki ödTnilmiY (bütün payments, excludeCalc daxil ⇄ kreditin öz qalıq hesabı üçün)
  const paidAmt = (cr.payments||[]).reduce((s,p)=>s+(p.amount||0), 0);
  const remainAmt = Math.max(0, cr.totalPayable - paidAmt);
  const paidMonths = (cr.payments||[]).length;
  const remainMonths = Math.max(0, cr.termMonths - paidMonths);
  const pct = cr.totalPayable > 0 ? Math.min(100, (paidAmt/cr.totalPayable)*100) : 0;
  const isDone = remainAmt < 0.01;
  const isNew  = paidMonths === 0;
  // Növbəti ödTniY tarixi
  const start = new Date(cr.startDate);
  const next = new Date(start);
  next.setMonth(next.getMonth() + paidMonths + 1);
  // Bu günT qalıq: kredit balansı (sadT formula)
  const todayBalance = remainAmt > 0 ? remainAmt : 0;
  return { paidAmt, remainAmt, paidMonths, remainMonths, pct, isDone, isNew, nextPayDate: next };
}

function fmt(n){ return new Intl.NumberFormat('az-AZ',{minimumFractionDigits:0,maximumFractionDigits:0}).format(n)+' ₼'; }
function fmtDate(d){
  if(!d || isNaN(d)) return '—';
  const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
function fmtDateInput(d){ return d.toISOString().split('T')[0]; }

// "?"? RENDER "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function renderAll(){
  renderSummary();
  renderCards();
  renderLog();
  if(curTab === 'charts') renderCharts();
}

function renderSummary(){
  const active = credits.filter(cr=>!cr.hidden);
  let totalTaken=0, totalRemain=0, totalPaid=0, totalPayable=0;
  let lastPayDates = [];
  active.forEach(cr=>{
    const cv = calc(cr);
    totalTaken    += cr.taken;
    totalRemain   += cv.remainAmt;
    totalPaid     += cv.paidAmt;
    totalPayable  += cr.totalPayable;
    // Son ödTniY tarixi (Bitmə tarixi)
    if(cr.endDate) lastPayDates.push(cr.endDate);
  });
  // Ən gec Bitmə tarixi
  lastPayDates.sort();
  const lastEnd = lastPayDates.length ? lastPayDates[lastPayDates.length-1] : null;
  const lastEndFmt = lastEnd ? (()=>{ const d=new Date(lastEnd); return d.getDate()+'.'+(d.getMonth()+1).toString().padStart(2,'0')+'.'+d.getFullYear(); })() : '—';

  document.getElementById('s-taken').textContent       = fmt(totalTaken);
  document.getElementById('s-taken-sub').textContent   = active.length + ' kredit';
  document.getElementById('s-total').textContent       = fmt(totalPayable);
  document.getElementById('s-total-sub').textContent   = 'ümumi ödəniləcək';
  document.getElementById('s-remain').textContent      = fmt(totalRemain);
  document.getElementById('s-remain-sub').textContent  = lastEndFmt;
  document.getElementById('s-paid').textContent        = fmt(totalPaid);
  document.getElementById('s-paid-sub').textContent    = active.filter(cr=>!calc(cr).isDone).length + ' aktiv';
}

function renderCards(){
  const activeEl = document.getElementById('cards-active');
  const doneEl   = document.getElementById('cards-done');
  const active = credits.filter(cr=>!cr.hidden && !calc(cr).isDone);
  const done   = credits.filter(cr=>!cr.hidden &&  calc(cr).isDone);

  activeEl.innerHTML = active.length
    ? active.map(buildCard).join('')
    : '<div style="text-align:center;color:var(--muted);padding:32px;font-size:13px;">Aktiv kredit yoxdur. + Yeni Kredit düymTsini sıxın.</div>';

  doneEl.innerHTML = done.length
    ? done.map(buildCard).join('')
    : '<div style="text-align:center;color:var(--muted);padding:32px;font-size:13px;">Tamamlanmış kredit yoxdur.</div>';
}

function buildCard(cr){
  const c = calc(cr);
  const badgeCls = c.isDone ? 'badge-done' : c.isNew ? 'badge-new' : 'badge-active';
  const badgeTxt = c.isDone ? 'Tamamlandı' : c.isNew ? 'Yeni' : 'Aktiv';
  const pColor = c.pct > 75 ? '#10b981' : c.pct > 40 ? '#f59e0b' : cr.color;
  const histHtml = (cr.payments||[]).length
    ? [...cr.payments].reverse().map((p,ri)=>{
        const realIdx = (cr.payments.length-1-ri);
        return `<div class="hist-item">
          <span class="hist-date">${p.date}</span>
          <span class="hist-amt">${fmt(p.amount)}</span>
          <button class="hist-del" onclick="deletePayment('${cr.id}',${realIdx})">-</button>
        </div>`;
      }).join('')
    : '<div style="color:var(--dim);font-size:12px;text-align:center;padding:8px;">Ödəniş yoxdur</div>';

  return `<div class="credit-card${c.isDone?' done-card':''}" id="card-${cr.id}">
    <div class="cr-head" style="background:${cr.color}18;border-bottom:2px solid ${cr.color}40;">
      <div>
        <div class="cr-name" style="color:${cr.color};">${cr.name}</div>
        <div class="cr-bank">${cr.bank||cr.name} · ${cr.rate}% · ${cr.termMonths} ay</div>
      </div>
      <span class="cr-badge ${badgeCls}" style="background:${cr.color}22;color:${cr.color};">${badgeTxt}</span>
    </div>
    <div class="cr-body">
      <div class="cr-stats">
        <div><div class="stat-lbl">Alınan</div><div class="stat-val c-blue">${fmt(cr.taken)}</div></div>
        <div><div class="stat-lbl">Ümumi borc</div><div class="stat-val">${fmt(cr.totalPayable)}</div></div>
        <div><div class="stat-lbl">Qalıq Məbləğ</div><div class="stat-val c-red">${fmt(c.remainAmt)}</div></div>
        <div><div class="stat-lbl">Ödənilmiş</div><div class="stat-val c-green">${fmt(c.paidAmt)}</div></div>
        <div><div class="stat-lbl">Qalıq ay</div><div class="stat-val">${c.remainMonths} ay</div></div>
        <div><div class="stat-lbl">Ödənilmiş ay</div><div class="stat-val">${c.paidMonths} ay</div></div>
      </div>
      <div class="prog-wrap">
        <div class="prog-head"><span>${c.paidMonths}/${cr.termMonths} ay</span><span style="font-weight:700;color:${pColor}">${Math.round(c.pct)}%</span></div>
        <div class="prog-track"><div class="prog-fill" style="width:${c.pct}%;background:linear-gradient(90deg,${pColor},${pColor}aa)"></div></div>
      </div>
    </div>
    <div class="pay-row">
      <div>
        <div class="next-pay">Növbəti: <strong>${fmtDate(c.nextPayDate)}</strong></div>
        <div class="next-pay" style="margin-top:2px;">Bitmə: <strong>${cr.endDate}</strong></div>
      </div>
      <span class="pay-amt">${fmt(cr.monthly)}</span>
      <button class="btn-pay" onclick="openPayModal('${cr.id}')" ${c.isDone?'disabled':''}>✓ Ödəniş</button>
    </div>
    <div class="cr-actions">
      <button class="btn-xs" onclick="toggleHist('${cr.id}')">gY"< Tarix (${(cr.payments||[]).length})</button>
      <button class="btn-xs" onclick="openEditModal('${cr.id}')">✏️ RedaktT</button>
      <button class="btn-xs danger" onclick="deleteCredit('${cr.id}')">gY-' Sil</button>
    </div>
    <div class="hist-section" id="hist-${cr.id}">
      <div class="hist-inner">
        <div class="hist-title">Ödəniş Tarixi</div>
        <div class="hist-list">${histHtml}</div>
      </div>
    </div>
    <button class="btn-hist" onclick="toggleHist('${cr.id}')"><span id="ha-${cr.id}">▾</span> Ödəniş tarixi</button>
  </div>`;
}

// "?"? TAB "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function switchTab(tab){
  curTab = tab;
  ['active','done','charts'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('active', t===tab);
  });
  document.getElementById('cards-active').style.display  = tab==='active'  ? '' : 'none';
  document.getElementById('cards-done').style.display    = tab==='done'    ? '' : 'none';
  document.getElementById('section-charts').style.display= tab==='charts'  ? '' : 'none';
  if(tab==='charts') renderCharts();
}

function toggleHist(id){
  const s = document.getElementById('hist-'+id);
  const a = document.getElementById('ha-'+id);
  const open = s.classList.toggle('open');
  if(a) a.textContent = open ? '▾' : '▾';
}

// "?"? PAY MODAL "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function openPayModal(id){
  const cr = credits.find(c=>c.id===id);
  if(!cr) return;
  payTarget = id;
  const c = calc(cr);
  document.getElementById('pay-title').textContent = '✓ Ödəniş — '+cr.name;
  document.getElementById('pay-suggest').textContent = fmt(cr.monthly);
  document.getElementById('pay-date').value = fmtDateInput(new Date());
  document.getElementById('pay-amount').value = cr.monthly;
  document.getElementById('pay-modal').classList.add('show');
}
function closePayModal(){ document.getElementById('pay-modal').classList.remove('show'); payTarget=null; }

function confirmPay(){
  if(!payTarget) return;
  const cr = credits.find(c=>c.id===payTarget);
  if(!cr) return;
  const date   = document.getElementById('pay-date').value;
  const amount = parseFloat(document.getElementById('pay-amount').value)||0;

  if(!amount||amount<=0){ toast('M?bl?g daxil edin','err'); return; }
  if(!date){ toast('Tarix seçin','err'); return; }

  const payment = { date, amount };
  cr.payments = cr.payments || [];
  cr.payments.push(payment);
  cr.payments.sort((a,b)=>a.date.localeCompare(b.date));

  addLog({ id:'log_'+Date.now(), date, type:'X?rc', note: cr.name + ' - ayliq ödəniş', amount, creditId: cr.id });

  saveState();

  const c = calc(cr);
  renderAll();
  closePayModal();
  toast(c.isDone ? cr.name+' Tamamlandı! ?' : 'ödəniş qeyd edildi ?', 'ok');
}

function deletePayment(creditId, idx){
  const cr = credits.find(c=>c.id===creditId);
  if(!cr||!confirm('Bu ödənişi silm?k ist?yirsiniz?')) return;
  cr.payments.splice(idx,1);
  saveState();
  renderAll();
  toast('ödəniş silindi','ok');
}// "?"? ADD MODAL "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function openAddModal(){
  document.getElementById('a-name').value='';
  document.getElementById('a-amount').value='';
  document.getElementById('a-monthly').value='';
  document.getElementById('a-term').value='36';
  document.getElementById('a-rate').value='';
  document.getElementById('a-start').value=fmtDateInput(new Date());
  document.getElementById('add-modal').classList.add('show');
}
function closeAddModal(){ document.getElementById('add-modal').classList.remove('show'); }

function saveNewCredit(){
  const name   = document.getElementById("a-name").value.trim();
  const amount = parseFloat(document.getElementById("a-amount").value)||0;
  const monthly= parseFloat(document.getElementById("a-monthly").value)||0;
  const term   = parseInt(document.getElementById("a-term").value)||36;
  const rate   = parseFloat(document.getElementById("a-rate").value)||0;
  const start  = document.getElementById("a-start").value;
  if(!name||!amount||!monthly||!start){ toast("Bütün sahələri doldurun","err"); return; }
  const endD = new Date(start); endD.setMonth(endD.getMonth()+term);
  const cr = {
    id: "cr_"+Date.now(),
    name, bank: name,
    taken: amount,
    totalPayable: monthly * term,
    monthly, termMonths: term, rate,
    startDate: start, endDate: fmtDateInput(endD),
    color: ['#3b82f6','#10b981','#f59e0b','#7c3aed','#ef4444'][credits.length%5],
    payments: []
  };
  credits.unshift(cr);
  saveState();
  addLog({ id:'log_'+Date.now(), date:start, type:'G?lir', note: name+' - kredit alindi', amount, creditId: cr.id });
  renderAll();
  closeAddModal();
  toast(name+' ?lav? edildi ?','ok');
}function openEditModal(id){
  const cr = credits.find(c=>c.id===id);
  if(!cr) return;
  editTarget = id;
  document.getElementById('e-name').value   = cr.name;
  document.getElementById('e-amount').value = cr.taken;
  document.getElementById('e-monthly').value= cr.monthly;
  document.getElementById('e-term').value   = cr.termMonths;
  document.getElementById('e-rate').value   = cr.rate;
  document.getElementById('e-start').value  = cr.startDate;
  document.getElementById('edit-modal').classList.add('show');
}
function closeEditModal(){ document.getElementById('edit-modal').classList.remove('show'); editTarget=null; }

function saveEdit(){
  const cr = credits.find(c=>c.id===editTarget);
  if(!cr) return;
  cr.name    = document.getElementById('e-name').value.trim()||cr.name;
  cr.bank    = cr.name;
  cr.taken   = parseFloat(document.getElementById('e-amount').value)||cr.taken;
  cr.monthly = parseFloat(document.getElementById('e-monthly').value)||cr.monthly;
  cr.termMonths = parseInt(document.getElementById('e-term').value)||cr.termMonths;
  cr.rate    = parseFloat(document.getElementById('e-rate').value)||cr.rate;
  cr.startDate = document.getElementById('e-start').value||cr.startDate;
  cr.totalPayable = cr.monthly * cr.termMonths;
  const end = new Date(cr.startDate); end.setMonth(end.getMonth()+cr.termMonths);
  cr.endDate = fmtDateInput(end);
  saveState(); closeEditModal(); renderAll();
  toast('Kredit yeniləndi ✓','ok');
}

// "?"? DELETE "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function deleteCredit(id){
  const cr = credits.find(c=>c.id===id);
  if(!cr||!confirm(cr.name+' kreditini silm?k ist?yirsiniz?')) return;
  credits = credits.filter(c=>c.id!==id);
  // Log v? ödənişl?r toxunulmur (tarix— qalsin)
  saveState(); renderAll();
  toast('Kredit silindi','ok');
}
// "?"? CHARTS "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function renderCharts(){
  const active = credits.filter(cr=>!cr.hidden);
  if(!active.length) return;

  // 1. Aylıq ödTniY yükü
  const labels = active.map(cr=>cr.name);
  const monthlyData = active.map(cr=>cr.monthly);
  const colors = active.map(cr=>cr.color||'#3b82f6');

  destroyChart('ch-monthly');
  CHARTS['ch-monthly'] = new Chart(document.getElementById('ch-monthly'),{
    type:'bar',
    data:{labels,datasets:[{label:'Aylıq (₼)',data:monthlyData,backgroundColor:colors.map(c=>c+'99'),borderColor:colors,borderWidth:1.5,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'var(--muted)'},grid:{display:false}},y:{ticks:{color:'var(--muted)'},grid:{color:'rgba(128,128,128,.1)'}}}}
  });

  // 2. Borc azalması
  destroyChart('ch-progress');
  const progressDatasets = active.map(cr=>{
    const points = [];
    let remaining = cr.totalPayable;
    points.push(remaining);
    const sorted = [...(cr.payments||[])].sort((a,b)=>a.date.localeCompare(b.date));
    sorted.forEach(p=>{ remaining=Math.max(0,remaining-p.amount); points.push(remaining); });
    // Fill to term length
    while(points.length <= cr.termMonths) points.push(remaining);
    return {label:cr.name, data:points.slice(0,cr.termMonths+1), borderColor:cr.color, backgroundColor:'transparent', borderWidth:2, tension:.4, pointRadius:0};
  });
  const maxMonths = Math.max(...active.map(cr=>cr.termMonths));
  const progLabels = Array.from({length:maxMonths+1},(_,i)=>i===0?'Başlanğıc':i+'. ay');
  CHARTS['ch-progress'] = new Chart(document.getElementById('ch-progress'),{
    type:'line',
    data:{labels:progLabels,datasets:progressDatasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--muted)',font:{size:11}}}},scales:{x:{ticks:{color:'var(--muted)',maxTicksLimit:12},grid:{display:false}},y:{ticks:{color:'var(--muted)',callback:v=>Math.round(v)+'₼'},grid:{color:'rgba(128,128,128,.1)'}}}}
  });

  // 3. Pie chart: ödTnilmiY vs qalıq ⇄ xarici etiketlTr + faizlTr
  destroyChart('ch-donut');
  let totalPaid=0, totalRemain=0;
  active.forEach(cr=>{ const cv=calc(cr); totalPaid+=cv.paidAmt; totalRemain+=cv.remainAmt; });
  const totalAll = totalPaid + totalRemain;
  const paidPct  = totalAll > 0 ? Math.round((totalPaid/totalAll)*100) : 0;
  const remainPct= 100 - paidPct;

  // External label plugin
  const pieLabelsPlugin = {
    id: 'pieLabels',
    afterDatasetsDraw(chart){
      const {ctx, data, chartArea:{left,right,top,bottom,width,height}} = chart;
      const cx = left + width/2, cy = top + height/2;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      meta.data.forEach((arc, i)=>{
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = arc.outerRadius;
        // Label line endpoint
        const lx = cx + Math.cos(angle) * (r + 18);
        const ly = cy + Math.sin(angle) * (r + 18);
        // Text endpoint
        const tx = cx + Math.cos(angle) * (r + 32);
        const ty = cy + Math.sin(angle) * (r + 32);
        // Line
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle)*r, cy + Math.sin(angle)*r);
        ctx.lineTo(lx, ly);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = i===0 ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Text
        const pct = i===0 ? paidPct : remainPct;
        const lbl = (i===0 ? 'Ödənilmiş' : 'Qalıq') + ' ' + pct + '%';
        ctx.fillStyle = i===0 ? '#10b981' : '#ef4444';
        ctx.font = 'bold 11px Inter,sans-serif';
        ctx.textAlign = Math.cos(angle) > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, tx + (Math.cos(angle)>0?4:-4), ty);
      });
      ctx.restore();
    }
  };

  CHARTS['ch-donut'] = new Chart(document.getElementById('ch-donut'),{
    type:'pie',
    data:{
      labels:['Ödənilmiş ('+paidPct+'%)','Qalıq ('+remainPct+'%)'],
      datasets:[{
        data:[totalPaid, totalRemain],
        backgroundColor:['rgba(16,185,129,.75)','rgba(239,68,68,.75)'],
        borderColor:['#10b981','#ef4444'],
        borderWidth:2,
        hoverOffset:6
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      layout:{ padding:{left:50,right:50,top:20,bottom:20} },
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ctx.label + ': ' + Math.round(ctx.parsed) + ' ₼' }}
      }
    },
    plugins:[pieLabelsPlugin]
  });
}

function destroyChart(id){
  if(CHARTS[id]){ try{CHARTS[id].destroy();}catch(e){} delete CHARTS[id]; }
}

// "?"? TOAST "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function toast(msg, type='ok'){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.className='toast '+type+' show';
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),3000);
}
window._backupToast = (m,e)=>toast(m,e?'err':'ok');

// "?"? NAV "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
function navOpen(){document.getElementById('navDrawer').classList.add('open');document.getElementById('navOverlay').classList.add('open');}
function navClose(){document.getElementById('navDrawer').classList.remove('open');document.getElementById('navOverlay').classList.remove('open');}

// ?? MODAL CLOSE ON OVERLAY ?????????????????????????
['add-modal','pay-modal','edit-modal'].forEach(id=>{
  document.getElementById(id).addEventListener('click',function(e){
    if(e.target===this) this.classList.remove('show');
  });
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    ['add-modal','pay-modal','edit-modal'].forEach(id=>document.getElementById(id).classList.remove('show'));
    navClose();
  }
});

// ?? LOG HELPERS ???????????????????????????????????????
function addLog(entry){
  creditLog = creditLog || [];
  creditLog.push(entry);
  saveState();
  renderLog();
}
function editLog(idx, updated){
  if(creditLog[idx]){ creditLog[idx] = {...creditLog[idx], ...updated}; saveState(); renderLog(); }
}
function deleteLog(idx){
  creditLog.splice(idx,1); saveState(); renderLog();
}
function renderLog(){
  const tbody = document.getElementById("log-body");
  if(!tbody) return;
  const rows = [...(creditLog||[])].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const cntEl = document.getElementById("log-count");
  if(cntEl) cntEl.textContent = `(${rows.length} s?tr)`;
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="5" style="padding:8px;color:var(--muted);">Log bosdur</td></tr>'; return; }
  tbody.innerHTML = rows.map((r,i)=>{
    const isIncome = (r.type||'').toLowerCase().startsWith('g');
    const badgeColor = isIncome ? 'var(--green)' : 'var(--red)';
    return `<tr>
      <td style="padding:8px;">${fmtDate(new Date(r.date))}</td>
      <td style="padding:8px;"><span style="display:inline-block;padding:4px 8px;border-radius:10px;background:${badgeColor}20;color:${badgeColor};font-weight:700;font-size:11px;">${r.type||''}</span></td>
      <td style="padding:8px;">${r.note||''}</td>
      <td style="padding:8px;">${fmt(r.amount||0)}</td>
      <td style="padding:8px;white-space:nowrap;">
        <button class="btn-xs" onclick="promptEditLog(${i})">Edit</button>
        <button class="btn-xs danger" onclick="deleteLog(${i})">Sil</button>
      </td>
    </tr>`;
  }).join('');
}
function promptEditLog(idx){
  const r = creditLog[idx]; if(!r) return;
  const amt = prompt('M?bl?g', r.amount); if(amt===null) return;
  const note = prompt('Qeyd', r.note||''); if(note===null) return;
  const date = prompt('Tarix (YYYY-MM-DD)', r.date||''); if(date===null) return;
  const type = prompt('Tip (G?lir/X?rc)', r.type||''); if(type===null) return;
  editLog(idx,{amount:parseFloat(amt)||0,type,note,date});
}
// ?? INIT ?????????????????????????????????????????????
document.getElementById('today-date').textContent =
  new Date().toLocaleDateString('az-AZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

(function(){
  const t = localStorage.getItem('page_theme_credits') || localStorage.getItem('kredit_theme') || 'light';
  if(t==='dark') document.body.setAttribute('data-theme','dark');
})();

loadState();

