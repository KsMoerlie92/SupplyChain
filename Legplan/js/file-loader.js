/* ══════════════════════════════════════════════════════════════
   Royal IHC — Legplan File Loader  v3
   ──────────────────────────────────────────────────────────────
   Injecteert bestanden uit IndexedDB als File-objecten in de
   bestaande <input> velden → bestaande handleFile() neemt over.
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  console.log('[file-loader] Legplan file-loader.js v3 geladen');

  /* ── Toast ──────────────────────────────────────────── */
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

  /* ── Wait for XLSX ──────────────────────────────────── */
  function waitForXLSX(timeout){
    timeout=timeout||8000;
    return new Promise((ok,fail)=>{
      if(typeof XLSX!=='undefined'){ok();return;}
      const t0=Date.now();
      const iv=setInterval(()=>{
        if(typeof XLSX!=='undefined'){clearInterval(iv);ok();return;}
        if(Date.now()-t0>timeout){clearInterval(iv);fail(new Error('XLSX library niet geladen na '+timeout+'ms'));}
      },100);
    });
  }

  /* ── Robust ArrayBuffer conversion ──────────────────── */
  function toArrayBuffer(raw){
    if(raw instanceof ArrayBuffer) return raw;
    if(raw instanceof Uint8Array) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(raw && raw.buffer && raw.buffer instanceof ArrayBuffer) return raw.buffer;
    if(raw && typeof raw==='object'){
      if(raw.data) return toArrayBuffer(raw.data);
      const keys=Object.keys(raw).filter(k=>!isNaN(k));
      if(keys.length>0) return new Uint8Array(keys.sort((a,b)=>a-b).map(k=>raw[k])).buffer;
    }
    throw new Error('Kan data niet converteren naar ArrayBuffer');
  }

  /* ── IndexedDB ──────────────────────────────────────── */
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

  /* ── Inject File into input ─────────────────────────── */
  function injectFile(inputEl, arrayBuffer, fileName){
    console.log('[file-loader] Injecteren van "'+fileName+'" in <input#'+inputEl.id+'>');
    let mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if(fileName.endsWith('.xls')) mime='application/vnd.ms-excel';
    if(fileName.endsWith('.xlsm')) mime='application/vnd.ms-excel.sheet.macroEnabled.12';

    const file = new File([arrayBuffer], fileName, {type: mime, lastModified: Date.now()});
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event('change', {bubbles: true}));
    console.log('[file-loader] Change event gedispatched op <input#'+inputEl.id+'>');
  }

  /* ── Find the moeder input (try multiple IDs) ──────── */
  function findMoederInput(){
    return document.getElementById('file-moeder')
        || document.getElementById('file-moederlijst')
        || document.querySelector('input[type="file"][accept*=".xlsx"]');
  }

  /* ── Auto-load ──────────────────────────────────────── */
  async function autoLoad(){
    console.log('[file-loader] === Legplan auto-load gestart ===');

    try{
      await waitForXLSX();
      console.log('[file-loader] XLSX ✓');
    }catch(err){
      console.error('[file-loader] '+err.message);
      toast(err.message, false);
      return;
    }

    try{
      const rec = await _dbGet('moederlijst');
      if(rec && rec.data){
        console.log('[file-loader] moederlijst gevonden:', rec.name);
        const buf = toArrayBuffer(rec.data);
        const input = findMoederInput();
        if(input){
          injectFile(input, buf, rec.name || 'Moederlijst.xlsx');
          toast('Moederlijst geladen uit cache', true);
        } else {
          console.warn('[file-loader] Geen file input gevonden op deze pagina');
        }
      } else {
        console.log('[file-loader] Geen moederlijst in IndexedDB');
      }
    }catch(err){
      console.error('[file-loader] Auto-load FOUT:', err);
      toast('Auto-load mislukt: '+err.message, false);
    }
    window.dispatchEvent(new CustomEvent('ihc-autoload-complete'));
  }

  /* ── Events ─────────────────────────────────────────── */
  window.addEventListener('ihc-file-loaded', async(e)=>{
    const {key, name}=e.detail;
    if(key!=='moederlijst') return;
    try{
      await waitForXLSX();
      const rec=await _dbGet(key);
      if(!rec||!rec.data) return;
      const input=findMoederInput();
      if(input) injectFile(input, toArrayBuffer(rec.data), name||rec.name||'Moederlijst.xlsx');
    }catch(err){console.error('[file-loader] event fout:',err);}
  });

  window.addEventListener('ihc-cache-cleared', ()=>{
    console.log('[file-loader] Cache cleared');
    const input=findMoederInput();
    if(input) input.value='';
    const fn=document.getElementById('fn-moeder')||document.getElementById('fn-moederlijst');
    if(fn) fn.textContent='—';
    window.moederData=[];window.moederHeaders=[];
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', autoLoad);
  else autoLoad();
})();
