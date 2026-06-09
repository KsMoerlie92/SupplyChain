/* ============================================================
   shared/expediting-core.js
   Enige bron van waarheid voor: kolommapping, normalisatie,
   prioriteringsscore en leverancier-bundeling.
   Gebruikt door: Admin (upload), Expediting Mailer, en elke
   pagina die de mailer-functie aanroept.
   ============================================================ */
(function (global) {
  'use strict';

  const OPEN = ['Released', 'Confirmed', 'Planned'];
  const EU = new Set('NL BE DE FR IT ES PT PL RO CZ SK HU AT DK SE FI IE GR BG HR SI LT LV EE LU MT CY EU'.split(' '));
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // welke Excel-kolom hoort bij welk modelveld
  const COLS = {
    po:'Purchase Order No', sub:'Sub Project ID', subDesc:'Sub Project Description',
    supplier:'Supplier Name', buyer:'Buyer Name', tc:'Technical Coordinator Name',
    part:'Part No', desc:'Description', uref:'Unified Reference Code',
    qtyRec:'Purchase Qty to Receive', status:'PO Line Status', dstatus:'Delivery Status',
    lwr:'Latest Wanted Receipt Date', planned:'Planned Delivery Date',
    lastConf:'Last Confirmed', lastExp:'Last Expedited', total:'Total/Currency',
    origin:'Country of Origin', customs:'Customs Stat No', terms:'Delivery Terms',
    fatReq:'FAT Date Required'
  };

  function toDate(v){
    if(v==null||v==='') return null;
    if(v instanceof Date) return isNaN(v)?null:v;
    if(typeof v==='number'){ const d=new Date(Math.round((v-25569)*86400*1000)); return isNaN(d)?null:d; }
    const d=new Date(v); return isNaN(d)?null:d;
  }
  function num(v){ return typeof v==='number'?v:(parseFloat(v)||0); }
  function dmy(d){ d=toDate(d); if(!d) return '—'; const z=n=>String(n).padStart(2,'0'); return `${z(d.getDate())}/${z(d.getMonth()+1)}/${d.getFullYear()}`; }
  function shortD(d){ d=toDate(d); if(!d) return '—'; return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // densest of first 7 rows = headerrij
  function detectHeader(raw){
    let best=0,bestN=-1;
    for(let i=0;i<Math.min(7,raw.length);i++){
      const n=(raw[i]||[]).filter(c=>c!=null&&c!=='').length;
      if(n>bestN){bestN=n;best=i;}
    }
    return best;
  }

  // raw = array-of-arrays (XLSX sheet_to_json header:1). Geeft genormaliseerde OPEN regels.
  function normalizeFromRaw(raw){
    const h=detectHeader(raw);
    const header=(raw[h]||[]).map(x=>String(x==null?'':x).trim());
    const ix={}; header.forEach((c,i)=>{ if(!(c in ix)) ix[c]=i; }); // dedupe: eerste wint
    const g=(row,name)=>{ const i=ix[COLS[name]]; return i==null?null:row[i]; };
    const out=[];
    for(let r=h+1;r<raw.length;r++){
      const row=raw[r]; if(!row||row.every(c=>c==null||c==='')) continue;
      const status=g(row,'status'); if(!OPEN.includes(status)) continue;
      const o={
        po:g(row,'po'), sub:g(row,'sub'), subDesc:g(row,'subDesc'),
        supplier:g(row,'supplier'), buyer:g(row,'buyer'), tc:g(row,'tc'),
        part:g(row,'part'), desc:g(row,'desc'), uref:g(row,'uref'),
        qtyRec:g(row,'qtyRec'), status, dstatus:g(row,'dstatus'),
        lwr:toDate(g(row,'lwr')), planned:toDate(g(row,'planned')),
        lastConf:toDate(g(row,'lastConf')), lastExp:toDate(g(row,'lastExp')),
        total:num(g(row,'total')), origin:g(row,'origin'),
        customs:g(row,'customs'), terms:g(row,'terms'), fatReq:toDate(g(row,'fatReq'))
      };
      o.unconf=(status==='Released')||!o.lastConf;
      o.late=o.dstatus==='Late';
      out.push(o);
    }
    return out;
  }

  // urgentie × bevestigingsgat × waarde × herkomst × incoterms
  function score(o, today){
    today=today||startOfToday();
    let s=0;
    if(o.lwr){
      const days=(today-toDate(o.lwr))/86400000;
      if(days>0) s+=Math.min(days,60)*0.6; else s+=Math.max(0,14+days)*0.25;
    }
    if(o.status==='Released'||!o.lastConf) s+=10;
    else if(o.planned&&o.lastConf&&toDate(o.lastConf)<toDate(o.planned)) s+=4;
    if(o.total>100000) s+=8; else if(o.total>25000) s+=4; else if(o.total>5000) s+=2;
    const oc=String(o.origin||'').trim().toUpperCase();
    if(oc&&!EU.has(oc)) s+=5;
    if(o.customs) s+=2;
    const t=String(o.terms||'').toUpperCase();
    if(t&&!t.startsWith('DAP')) s+=2;
    return s;
  }
  function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }

  // bundel per leverancier (over alle projecten)
  function aggregate(lines, today){
    today=today||startOfToday();
    const m=new Map();
    for(const o of lines){
      o.score=score(o,today);
      const k=o.supplier||'(onbekend)';
      if(!m.has(k)) m.set(k,{supplier:k,lines:[],projects:new Set(),buyers:new Map(),score:0,late:0,unconf:0,value:0});
      const grp=m.get(k);
      grp.lines.push(o);
      if(o.sub) grp.projects.add(o.sub);
      if(o.buyer) grp.buyers.set(o.buyer,(grp.buyers.get(o.buyer)||0)+1);
      grp.score+=o.score; if(o.late)grp.late++; if(o.unconf)grp.unconf++; grp.value+=o.total;
    }
    const arr=[...m.values()];
    arr.forEach(g=>{ g.nProj=g.projects.size;
      g.topBuyer=[...g.buyers.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0])[0]||''; });
    arr.sort((a,b)=>b.score-a.score);
    return arr;
  }

  global.ExpeditingCore = {
    OPEN, EU, MONTHS, COLS,
    toDate, num, dmy, shortD, esc, detectHeader,
    normalizeFromRaw, score, aggregate, startOfToday
  };
})(window);
