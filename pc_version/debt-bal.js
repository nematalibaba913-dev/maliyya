/* Borc Balansı = (alınan − qaytarılan) fərqi; Borclar səhifəsindəki rəqəmlə eyni qayda.
   Ümumi balansda borc hissəsi üçün borc loqu əvəzinə bu rəqəm götürülür. */
window.MFDebt = {
  net: function(transfers){
    var tot = {'borc-aldim':0,'borc-verdim':0,'qaytardim':0,'mene-qaytardi':0};
    (transfers||[]).forEach(function(t){
      if(t.done) return;
      if(tot[t.type] === undefined) return;
      tot[t.type] += +((parseFloat(t.amount)||0) - (parseFloat(t.paid)||0)).toFixed(2);
    });
    return Math.round((tot['borc-aldim'] + tot['mene-qaytardi'] - tot['borc-verdim'] - tot['qaytardim'])*100)/100;
  },
  read: function(){
    try{ var a = JSON.parse(localStorage.getItem('transfers_offline_v1')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
  }
};
