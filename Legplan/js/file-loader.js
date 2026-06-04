/* ══════════════════════════════════════════════════════════════
   Royal IHC — Legplan File Loader  (v2 — robust auto-load)
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  console.log('[file-loader] Legplan file-loader.js geladen');

  window.moederData    = window.moederData    || [];
  window.moederHeaders = window.moederHeaders || [];

  /* ── Toast notification ─────────────────────────────── */
  function toast(msg, ok){
    const d=document.createElement('div');
    d.textContent=msg;
    Object.assign(d.style,{
      position:'fixed',top:'1rem',right:'1rem',zIndex:'99999',
      padding:'.6rem 1.2rem',borderRadius:'8px',fontSize:'.78rem',fontWeight:'600',
      color:'#fff',background:ok?'#16a34a':'#dc2626',
      boxShadow:'0 4px 14px rgba(0,0,0,.35)',opacity:'0',
      transition:'opacity .3s',fontFamily:'Segoe UI,sans-serif',maxWidth:'360px'
    });
    document.body.appendChild(d);
    requestAnimationFrame(()=>d.style.opacity='1');
    setTimeout(()=>{d.style.opacity='0';setTimeout(()=>d.remove(),400)},4000);
  }

  /* ── Wait for SheetJS (XLSX) to be available ────────── */
  function waitForXLSX(timeout){
    timeout = timeout || 8000;
    return new Promise((ok,fail)=>{
      if(typeof XLSX!=='undefined'){ok(XLSX);return;}
      const t0=Date.now();
      const iv=setInterval(()=>{
        if(typeof XLSX!=='undefined'){clearInterval(iv);ok(XLSX);return;}
        if(Date.now()-t0>timeout){clearInterval(iv);fail(new Error('XLSX library niet geladen na '+timeout+'ms'));}
      },100);
    });
  }

  /* ── Robust ArrayBuffer conversion ──────────────────── */
  function toUint8Array(raw){
    if(raw instanceof Uint8Array) return raw;
    if(raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if(raw && raw.buffer && raw.buffer instanceof ArrayBuffer) return new Uint8Array(raw.buffer);
    // IndexedDB sometimes returns an object with {0:...,1:...} after structured clone
    if(raw && typeof raw==='object' && !(raw instanceof Blob)){
      // Could be {data: ArrayBuffer, ...} wrapper
      if(raw.data) return toUint8Array(raw.data);
      // Last resort: try to build from object keys
      const keys=Object.keys(raw).filter(k=>!isNaN(k)).sort((a,b)=>a-b);
      if(keys.length>0) return new Uint8Array(keys.map(k=>raw[k]));
    }
    throw new Error('Kan data niet converteren naar Uint8Array (type: '+(typeof raw)+')');
  }

  /* ── IndexedDB read ─────────────────────────────────── */
  const DB_NAME='ihc-logistics-files', DB_VER=1, STORE='files';
  function _openDB(){
    return new Promise((ok,fail)=>{
      const r=indexedDB.open(DB_NAME,DB_VER);
      r.onupgradeneeded=e=>e.target.result.createObjectStore(STORE);
      r.onsuccess=e=>ok(e.target.result);
      r.onerror=e=>fail(e.target.error);
    });
  }
  async function _dbGet(key){
    const db=await _openDB();
    return new Promise((ok,fail)=>{
      const tx=db.transaction(STORE,'readonly');
      const r=tx.objectStore(STORE).get(key);
      r.onsuccess=()=>ok(r.result||null);
      r.onerror=e=>fail(e.target.error);
    });
  }
  async function _dbPut(key,buf,name){
    const db=await _openDB();
    return new Promise((ok,fail)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({data:buf,name:name,ts:Date.now()},key);
      tx.oncomplete=()=>ok();
      tx.onerror=e=>fail(e.target.error);
    });
  }

  /* ── Status element finder (flexible) ───────────────── */
  function findStatusEl(which){
    return document.getElementById('drop-status-'+which)
        || document.getElementById('status-'+which)
        || document.querySelector('[data-file-status="'+which+'"]')
        || document.querySelector('.file-status-'+which);
  }
  function findDropZone(which){
    return document.getElementById('dz-'+which)
        || document.getElementById('drop-'+which)
        || document.querySelector('[data-drop-zone="'+which+'"]');
  }
  function setStatus(which, msg, ok){
    const el=findStatusEl(which);
    if(el){el.textContent=(ok?'\u2705 ':'\u23F3 ')+msg;el.style.color=ok?'#22c55e':'inherit';}
    const dz=findDropZone(which);
    if(dz){if(ok)dz.classList.add('loaded');else dz.classList.remove('loaded');}
    console.log('[file-loader] '+which+': '+msg);
  }


  /* ══════════════════════════════════════════════════════
     Parse Moederlijst (same logic as PO-Matcher)
  ══════════════════════════════════════════════════════ */
  function parseMoederlijst(uint8, fileName){
    console.log('[file-loader] Parsing moederlijst:', fileName, '('+uint8.length+' bytes)');
    const wb = XLSX.read(uint8, {type:'array', cellDates:true});
    console.log('[file-loader] Sheets gevonden:', wb.SheetNames.join(', '));

    const KEYWORDS = ['deliveryref','ihc po','description','po number','item','quantity','weight'];
    let bestSheet = wb.SheetNames[1] || wb.SheetNames[0];
    let bestHeaderIdx = 0;
    let bestScore = 0;

    for(const sn of wb.SheetNames){
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:'', raw:true});
      for(let r=0; r<Math.min(10, raw.length); r++){
        const cells = (raw[r]||[]).map(c=>String(c||'').toLowerCase());
        const score = cells.filter(c=> KEYWORDS.some(kw=>c.includes(kw))).length;
        if(score > bestScore){ bestScore=score; bestSheet=sn; bestHeaderIdx=r; }
      }
    }
    console.log('[file-loader] Beste sheet:', bestSheet, 'header rij:', bestHeaderIdx+1, 'score:', bestScore);

    const raw = XLSX.utils.sheet_to_json(wb.Sheets[bestSheet], {header:1, defval:'', raw:true});
    if(raw.length < 2) return {headers:[], data:[]};

    const headers = (raw[bestHeaderIdx]||[]).map(h=>String(h||'').trim());
    const data = [];
    for(let i=bestHeaderIdx+1; i<raw.length; i++){
      const row=raw[i];
      if(!row || !row.some(c=> c!==''&&c!==null&&c!==undefined)) continue;
      const obj={};
      headers.forEach((h,j)=>{ obj[h]=(row[j]!==undefined&&row[j]!==null)?row[j]:''; });
      data.push(obj);
    }
    console.log('[file-loader] Moederlijst geparsed:', data.length, 'rijen,', headers.length, 'kolommen');
    return {headers, data};
  }

  function applyMoeder(result, source){
    window.moederHeaders = result.headers;
    window.moederData = result.data;
    setStatus('moeder', result.data.length+' rijen geladen'+(source?' ('+source+')':''), true);
    if(typeof window.renderLegplan==='function'){console.log('[file-loader] → renderLegplan()');window.renderLegplan();}
    else if(typeof window.initLegplan==='function'){console.log('[file-loader] → initLegplan()');window.initLegplan();}
  }

  /* ── Manual upload ──────────────────────────────────── */
  window.handleFile = function(file, type){
    console.log('[file-loader] Handmatig bestand:', file.name, 'type:', type);
    const reader = new FileReader();
    reader.onload = async function(e){
      const buf=e.target.result;
      try{await _dbPut('moederlijst',buf,file.name);}catch(err){console.warn('[file-loader] IDB store fail:',err);}
      await waitForXLSX();
      applyMoeder(parseMoederlijst(new Uint8Array(buf), file.name), file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── Auto-load ──────────────────────────────────────── */
  async function autoLoad(){
    console.log('[file-loader] === Legplan auto-load gestart ===');
    try{
      await waitForXLSX();
      console.log('[file-loader] XLSX library beschikbaar ✓');
    }catch(err){
      console.error('[file-loader] XLSX niet beschikbaar:', err.message);
      toast('XLSX library niet geladen — auto-load mislukt', false);
      return;
    }

    try{
      console.log('[file-loader] IndexedDB openen voor "moederlijst"...');
      const rec = await _dbGet('moederlijst');
      console.log('[file-loader] moederlijst record:', rec ? ('gevonden, name='+rec.name+', data type='+(typeof rec.data)) : 'NIET gevonden');
      if(rec && rec.data){
        const uint8 = toUint8Array(rec.data);
        console.log('[file-loader] Uint8Array lengte:', uint8.length);
        const result = parseMoederlijst(uint8, rec.name||'Moederlijst');
        applyMoeder(result, 'cache: '+(rec.name||'Moederlijst'));
        toast('Moederlijst geladen uit cache ('+result.data.length+' rijen)', true);
      } else {
        console.log('[file-loader] Geen moederlijst in IndexedDB');
        setStatus('moeder','Nog niet geladen — upload via hoofdpagina', false);
      }
    }catch(err){
      console.error('[file-loader] Auto-load FOUT:', err);
      toast('Moederlijst auto-load mislukt: '+err.message, false);
    }
    window.dispatchEvent(new CustomEvent('ihc-autoload-complete'));
  }

  /* ── Live events ───────────────────────────────────── */
  window.addEventListener('ihc-file-loaded', async(e)=>{
    const {key,name}=e.detail;
    if(key!=='moederlijst') return;
    console.log('[file-loader] ihc-file-loaded voor moederlijst:', name);
    try{
      await waitForXLSX();
      const rec=await _dbGet(key);
      if(!rec||!rec.data)return;
      applyMoeder(parseMoederlijst(toUint8Array(rec.data),name),'upload: '+name);
    }catch(err){console.error('[file-loader] event handler fout:',err);}
  });

  window.addEventListener('ihc-cache-cleared',()=>{
    console.log('[file-loader] Cache cleared');
    window.moederData=[];window.moederHeaders=[];
    setStatus('moeder','Nog niet geladen',false);
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',autoLoad);
  else autoLoad();
})();
