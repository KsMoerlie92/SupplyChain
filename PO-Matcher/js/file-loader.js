/* ══════════════════════════════════════════════════════════════
   Royal IHC — PO-Matcher File Loader  v3
   ──────────────────────────────────────────────────────────────
   Strategie: haal bestanden uit IndexedDB en injecteer ze als
   File-objecten in de bestaande <input> velden. Dan draait de
   bestaande handleFile(event, type) gewoon alsof de gebruiker
   het bestand zelf heeft geselecteerd.
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  console.log('[file-loader] PO-Matcher file-loader.js v3 geladen');

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

  /* ── Wait for XLSX library ──────────────────────────── */
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

  /* ── Robust ArrayBuffer extraction from IDB record ─── */
  function toArrayBuffer(raw){
    if(raw instanceof ArrayBuffer) return raw;
    if(raw instanceof Uint8Array) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(raw && raw.buffer && raw.buffer instanceof ArrayBuffer) return raw.buffer;
    if(raw && typeof raw==='object'){
      if(raw.data) return toArrayBuffer(raw.data);
      const keys=Object.keys(raw).filter(k=>!isNaN(k));
      if(keys.length>0) return new Uint8Array(keys.sort((a,b)=>a-b).map(k=>raw[k])).buffer;
    }
    throw new Error('Kan data niet converteren naar ArrayBuffer (type: '+(typeof raw)+')');
  }

  /* ── IndexedDB helpers ──────────────────────────────── */
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

  /* ══════════════════════════════════════════════════════
     Inject a File into an <input type="file"> and trigger
     its existing onchange / change handler.
  ══════════════════════════════════════════════════════ */
  function injectFile(inputEl, arrayBuffer, fileName){
    console.log('[file-loader] Injecteren van "'+fileName+'" in <input#'+inputEl.id+'>');

    // Determine MIME type
    let mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if(fileName.endsWith('.xls')) mime='application/vnd.ms-excel';
    if(fileName.endsWith('.xlsm')) mime='application/vnd.ms-excel.sheet.macroEnabled.12';

    // Create a real File object
    const file = new File([arrayBuffer], fileName, {type: mime, lastModified: Date.now()});
    console.log('[file-loader] File object aangemaakt:', file.name, file.size, 'bytes');

    // Use DataTransfer to set the file on the input
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    console.log('[file-loader] Input.files ingesteld, files.length:', inputEl.files.length);

    // Trigger the change event → existing handleFile(event, type) runs
    inputEl.dispatchEvent(new Event('change', {bubbles: true}));
    console.log('[file-loader] Change event gedispatched op <input#'+inputEl.id+'>');
  }

  /* ══════════════════════════════════════════════════════
     AUTO-LOAD: read IndexedDB → inject into inputs
  ══════════════════════════════════════════════════════ */
  async function autoLoad(){
    console.log('[file-loader] === Auto-load gestart ===');

    // Wait for XLSX so the existing handleFile can parse
    try{
      await waitForXLSX();
      console.log('[file-loader] XLSX library beschikbaar ✓');
    }catch(err){
      console.error('[file-loader] '+err.message);
      toast(err.message, false);
      return;
    }

    let loaded = 0;

    /* ── Moederlijst ──────────────────────────────────── */
    try{
      console.log('[file-loader] Zoeken naar "moederlijst" in IndexedDB...');
      const rec = await _dbGet('moederlijst');

      if(rec && rec.data){
        console.log('[file-loader] moederlijst gevonden: name="'+rec.name+'", data type='+
          (rec.data.constructor?rec.data.constructor.name:typeof rec.data));

        const buf = toArrayBuffer(rec.data);
        console.log('[file-loader] ArrayBuffer grootte:', buf.byteLength, 'bytes');

        const input = document.getElementById('file-moeder');
        if(input){
          injectFile(input, buf, rec.name || 'Moederlijst.xlsx');
          loaded++;
        } else {
          console.warn('[file-loader] <input#file-moeder> NIET gevonden op deze pagina');
        }
      } else {
        console.log('[file-loader] Geen moederlijst in IndexedDB');
      }
    }catch(err){
      console.error('[file-loader] Moederlijst auto-load FOUT:', err);
      toast('Moederlijst laden mislukt: '+err.message, false);
    }

    /* ── Expediting ───────────────────────────────────── */
    try{
      console.log('[file-loader] Zoeken naar "expediting" in IndexedDB...');
      const rec = await _dbGet('expediting');

      if(rec && rec.data){
        console.log('[file-loader] expediting gevonden: name="'+rec.name+'", data type='+
          (rec.data.constructor?rec.data.constructor.name:typeof rec.data));

        const buf = toArrayBuffer(rec.data);
        console.log('[file-loader] ArrayBuffer grootte:', buf.byteLength, 'bytes');

        const input = document.getElementById('file-expediting');
        if(input){
          injectFile(input, buf, rec.name || 'Expediting.xlsx');
          loaded++;
        } else {
          console.warn('[file-loader] <input#file-expediting> NIET gevonden op deze pagina');
        }
      } else {
        console.log('[file-loader] Geen expediting in IndexedDB');
      }
    }catch(err){
      console.error('[file-loader] Expediting auto-load FOUT:', err);
      toast('Expediting laden mislukt: '+err.message, false);
    }

    /* ── Resultaat ────────────────────────────────────── */
    if(loaded > 0){
      toast(loaded + ' bestand(en) automatisch ingeladen uit cache', true);
      console.log('[file-loader] === Auto-load klaar: '+loaded+' bestand(en) geïnjecteerd ===');
    } else {
      console.log('[file-loader] === Auto-load klaar: niets gevonden in cache ===');
    }
    window.dispatchEvent(new CustomEvent('ihc-autoload-complete', {detail:{loaded}}));
  }

  /* ══════════════════════════════════════════════════════
     Event: nieuw bestand geüpload via hoofdpagina/nav
  ══════════════════════════════════════════════════════ */
  window.addEventListener('ihc-file-loaded', async(e)=>{
    const {key, name} = e.detail;
    console.log('[file-loader] ihc-file-loaded event:', key, name);
    try{
      await waitForXLSX();
      const rec = await _dbGet(key);
      if(!rec || !rec.data) return;
      const buf = toArrayBuffer(rec.data);

      if(key === 'moederlijst'){
        const input = document.getElementById('file-moeder');
        if(input) injectFile(input, buf, name || rec.name || 'Moederlijst.xlsx');
      } else if(key === 'expediting'){
        const input = document.getElementById('file-expediting');
        if(input) injectFile(input, buf, name || rec.name || 'Expediting.xlsx');
      }
    }catch(err){console.error('[file-loader] ihc-file-loaded handler fout:', err);}
  });

  /* ══════════════════════════════════════════════════════
     Event: cache gewist (project wisselen)
  ══════════════════════════════════════════════════════ */
  window.addEventListener('ihc-cache-cleared', ()=>{
    console.log('[file-loader] Cache cleared — inputs resetten');

    // Reset file inputs
    ['file-moeder','file-expediting'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.value='';
    });

    // Reset filename displays
    ['fn-moeder','fn-expediting'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.textContent='—';
    });

    // Reset drop zone states
    ['dz-moeder','dz-expediting'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.classList.remove('loaded','has-file');
    });

    // Reset global data
    window.moederData=[];window.expediteData=[];
    window.moederHeaders=[];window.expediteHeaders=[];

    toast('Cache gewist — upload nieuwe bestanden', true);
  });

  /* ── Start ─────────────────────────────────────────── */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', autoLoad);
  } else {
    autoLoad();
  }

})();
