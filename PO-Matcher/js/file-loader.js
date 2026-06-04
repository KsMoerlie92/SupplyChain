/* ══════════════════════════════════════════════════════════════
   Royal IHC — PO-Matcher File Loader  v4
   ──────────────────────────────────────────────────────────────
   Fix: wacht op window.load + handleFile() definitie vóór inject.
   Na inject: drop zones groen + auto-klik "Verwerken".
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  console.log('[file-loader] v4 script geladen');

  /* ── Toast ──────────────────────────────────────────── */
  function toast(msg, ok){
    const d=document.createElement('div');
    d.textContent=msg;
    Object.assign(d.style,{
      position:'fixed',top:'1rem',right:'1rem',zIndex:'99999',
      padding:'.65rem 1.2rem',borderRadius:'8px',fontSize:'.78rem',fontWeight:'600',
      color:'#fff',background:ok?'#16a34a':'#dc2626',
      boxShadow:'0 4px 14px rgba(0,0,0,.35)',opacity:'0',
      transition:'opacity .3s',fontFamily:'Segoe UI,sans-serif',maxWidth:'380px'
    });
    document.body.appendChild(d);
    requestAnimationFrame(()=>d.style.opacity='1');
    setTimeout(()=>{d.style.opacity='0';setTimeout(()=>d.remove(),400)},4500);
  }

  /* ── Poll helper: wacht totdat conditie true is ─────── */
  function waitFor(condFn, label, timeout){
    timeout = timeout || 10000;
    return new Promise((ok, fail) => {
      if(condFn()){ console.log('[file-loader] '+label+' ✓ (direct)'); ok(); return; }
      const t0 = Date.now();
      const iv = setInterval(() => {
        if(condFn()){
          clearInterval(iv);
          console.log('[file-loader] '+label+' ✓ (na '+(Date.now()-t0)+'ms)');
          ok();
        } else if(Date.now()-t0 > timeout){
          clearInterval(iv);
          fail(new Error(label+' niet beschikbaar na '+timeout+'ms'));
        }
      }, 150);
    });
  }

  /* ── ArrayBuffer extractie uit IDB record ───────────── */
  function toArrayBuffer(raw){
    if(raw instanceof ArrayBuffer) return raw;
    if(raw instanceof Uint8Array) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(ArrayBuffer.isView(raw)) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(raw && typeof raw === 'object'){
      if(raw.data) return toArrayBuffer(raw.data);
      const keys = Object.keys(raw).filter(k => !isNaN(k));
      if(keys.length > 0) return new Uint8Array(keys.sort((a,b)=>a-b).map(k=>raw[k])).buffer;
    }
    throw new Error('Kan niet converteren naar ArrayBuffer (type: '+(typeof raw)+', constructor: '+(raw&&raw.constructor?raw.constructor.name:'?')+')');
  }

  /* ── IndexedDB ──────────────────────────────────────── */
  const DB_NAME='ihc-logistics-files', DB_VER=1, STORE='files';
  function _openDB(){
    return new Promise((ok,fail)=>{
      const r=indexedDB.open(DB_NAME,DB_VER);
      r.onupgradeneeded=e=>{ e.target.result.createObjectStore(STORE); console.log('[file-loader] IDB store aangemaakt'); };
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
     Inject File into <input> + trigger existing handler
  ══════════════════════════════════════════════════════ */
  function injectFileIntoInput(inputId, arrayBuffer, fileName){
    const input = document.getElementById(inputId);
    if(!input){
      console.error('[file-loader] Input #'+inputId+' NIET gevonden!');
      console.log('[file-loader] Aanwezige inputs:', Array.from(document.querySelectorAll('input[type=file]')).map(i=>i.id||'(geen id)'));
      return false;
    }

    // Determine MIME
    let mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const lc = fileName.toLowerCase();
    if(lc.endsWith('.xls'))  mime = 'application/vnd.ms-excel';
    if(lc.endsWith('.xlsm')) mime = 'application/vnd.ms-excel.sheet.macroEnabled.12';

    // Build File + DataTransfer
    const file = new File([arrayBuffer], fileName, { type: mime, lastModified: Date.now() });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    console.log('[file-loader] ✅ File geïnjecteerd in #'+inputId+': "'+fileName+'" ('+file.size+' bytes)');
    console.log('[file-loader]    input.files.length =', input.files.length, ', name =', input.files[0]?.name);

    // Fire change event → triggers existing onchange="handleFile(event,'...')"
    const evt = new Event('change', { bubbles: true });
    input.dispatchEvent(evt);
    console.log('[file-loader]    change event verstuurd op #'+inputId);

    return true;
  }

  /* ══════════════════════════════════════════════════════
     Mark drop zone as green / loaded
  ══════════════════════════════════════════════════════ */
  function markDropZoneLoaded(zoneId, fnId, fileName){
    const zone = document.getElementById(zoneId);
    if(zone){
      zone.classList.add('loaded','has-file');
      zone.style.borderColor = '#22c55e';
      zone.style.borderStyle = 'solid';
      zone.style.backgroundColor = 'rgba(34,197,94,.06)';
      console.log('[file-loader] Drop zone #'+zoneId+' → groen');
    } else {
      console.warn('[file-loader] Drop zone #'+zoneId+' niet gevonden');
    }

    const fn = document.getElementById(fnId);
    if(fn){
      fn.textContent = fileName;
      fn.style.color = '#22c55e';
      console.log('[file-loader] Filename #'+fnId+' → "'+fileName+'"');
    }
  }

  /* ══════════════════════════════════════════════════════
     Auto-klik "Verwerken" knop
  ══════════════════════════════════════════════════════ */
  function autoClickVerwerken(delay){
    delay = delay || 600;
    setTimeout(() => {
      // Zoek de knop op meerdere manieren
      let btn = null;
      const selectors = [
        'button#btn-verwerk',
        'button#btn-process',
        'button#btn-run',
        'button#btn-match',
        '#btn-verwerk',
        '#btn-process',
        '.btn-verwerk',
        '.btn-process',
      ];
      for(const sel of selectors){
        btn = document.querySelector(sel);
        if(btn) break;
      }
      // Fallback: zoek button met tekst "Verwerken" / "Match" / "Process"
      if(!btn){
        const allBtns = document.querySelectorAll('button, input[type=button], .btn');
        for(const b of allBtns){
          const txt = (b.textContent||b.value||'').toLowerCase();
          if(txt.includes('verwerk') || txt.includes('match') || txt.includes('process') || txt.includes('koppel')){
            btn = b; break;
          }
        }
      }

      if(btn){
        console.log('[file-loader] ✅ "Verwerken" knop gevonden:', btn.tagName, btn.id||btn.className, '→ auto-klik');
        btn.click();
        toast('Verwerken automatisch gestart', true);
      } else {
        console.warn('[file-loader] ⚠ Geen "Verwerken" knop gevonden');
        console.log('[file-loader]   Alle buttons op pagina:', Array.from(document.querySelectorAll('button')).map(b=>(b.id||'')+':"'+(b.textContent||'').substring(0,30)+'"'));
      }
    }, delay);
  }

  /* ══════════════════════════════════════════════════════
     HOOFDFUNCTIE: Auto-load
  ══════════════════════════════════════════════════════ */
  async function autoLoad(){
    console.log('[file-loader] ══════════════════════════════════════');
    console.log('[file-loader] AUTO-LOAD GESTART');
    console.log('[file-loader] ══════════════════════════════════════');

    /* ── Stap 1: Wacht op XLSX ─────────────────────── */
    try{
      await waitFor(() => typeof XLSX !== 'undefined', 'XLSX library');
    }catch(err){
      console.error('[file-loader] ❌', err.message);
      toast(err.message, false);
      return;
    }

    /* ── Stap 2: Wacht op handleFile ───────────────── */
    try{
      await waitFor(() => typeof window.handleFile === 'function', 'handleFile() functie');
    }catch(err){
      console.error('[file-loader] ❌', err.message);
      toast('handleFile() niet gevonden — pagina script niet geladen?', false);
      return;
    }

    /* ── Stap 3: Check inputs bestaan ──────────────── */
    const inputMoeder = document.getElementById('file-moeder');
    const inputExp    = document.getElementById('file-expediting');
    console.log('[file-loader] Input #file-moeder:', inputMoeder ? 'gevonden ✓' : 'NIET gevonden ✗');
    console.log('[file-loader] Input #file-expediting:', inputExp ? 'gevonden ✓' : 'NIET gevonden ✗');

    if(!inputMoeder && !inputExp){
      console.error('[file-loader] ❌ Geen file inputs gevonden — stoppen');
      return;
    }

    let loaded = 0;

    /* ── Stap 4a: Moederlijst laden ────────────────── */
    try{
      console.log('[file-loader] IndexedDB lezen: "moederlijst"...');
      const rec = await _dbGet('moederlijst');

      if(rec && rec.data){
        const name = rec.name || 'Moederlijst.xlsx';
        console.log('[file-loader] moederlijst gevonden in IDB: "'+name+'"');
        console.log('[file-loader]   data type:', typeof rec.data);
        console.log('[file-loader]   constructor:', rec.data.constructor ? rec.data.constructor.name : '?');
        console.log('[file-loader]   byteLength:', rec.data.byteLength || 'N/A');

        const buf = toArrayBuffer(rec.data);
        console.log('[file-loader]   ArrayBuffer grootte:', buf.byteLength, 'bytes');

        if(inputMoeder){
          const ok = injectFileIntoInput('file-moeder', buf, name);
          if(ok){
            markDropZoneLoaded('dz-moeder', 'fn-moeder', name);
            loaded++;
          }
        }
      } else {
        console.log('[file-loader] Geen moederlijst in IndexedDB');
      }
    }catch(err){
      console.error('[file-loader] ❌ Moederlijst fout:', err);
      toast('Moederlijst laden mislukt: '+err.message, false);
    }

    /* ── Stap 4b: Expediting laden ─────────────────── */
    try{
      console.log('[file-loader] IndexedDB lezen: "expediting"...');
      const rec = await _dbGet('expediting');

      if(rec && rec.data){
        const name = rec.name || 'Expediting.xlsx';
        console.log('[file-loader] expediting gevonden in IDB: "'+name+'"');

        const buf = toArrayBuffer(rec.data);
        console.log('[file-loader]   ArrayBuffer grootte:', buf.byteLength, 'bytes');

        if(inputExp){
          const ok = injectFileIntoInput('file-expediting', buf, name);
          if(ok){
            markDropZoneLoaded('dz-expediting', 'fn-expediting', name);
            loaded++;
          }
        }
      } else {
        console.log('[file-loader] Geen expediting in IndexedDB');
      }
    }catch(err){
      console.error('[file-loader] ❌ Expediting fout:', err);
      toast('Expediting laden mislukt: '+err.message, false);
    }

    /* ── Stap 5: Resultaat + auto-verwerken ────────── */
    if(loaded > 0){
      toast(loaded + ' bestand(en) automatisch geladen', true);
      console.log('[file-loader] ✅ '+loaded+' bestand(en) geïnjecteerd');

      // Auto-klik "Verwerken" als beide bestanden geladen
      if(loaded >= 2){
        console.log('[file-loader] Beide bestanden geladen → auto-klik Verwerken');
        autoClickVerwerken(800);
      } else {
        console.log('[file-loader] Slechts '+loaded+' bestand(en) — wacht op handmatige upload voor Verwerken');
      }
    } else {
      console.log('[file-loader] Geen bestanden in cache — gebruiker moet uploaden');
    }

    window.dispatchEvent(new CustomEvent('ihc-autoload-complete', {detail:{loaded}}));
    console.log('[file-loader] ══════════════════════════════════════');
    console.log('[file-loader] AUTO-LOAD AFGEROND');
    console.log('[file-loader] ══════════════════════════════════════');
  }

  /* ══════════════════════════════════════════════════════
     Event: nieuw bestand via hoofdpagina / SharePoint
  ══════════════════════════════════════════════════════ */
  window.addEventListener('ihc-file-loaded', async(e) => {
    const {key, name} = e.detail || {};
    console.log('[file-loader] ihc-file-loaded event:', key, name);
    try{
      await waitFor(() => typeof XLSX !== 'undefined', 'XLSX', 5000);
      await waitFor(() => typeof window.handleFile === 'function', 'handleFile', 5000);
      const rec = await _dbGet(key);
      if(!rec || !rec.data) return;
      const buf = toArrayBuffer(rec.data);
      const fname = name || rec.name || key+'.xlsx';

      if(key === 'moederlijst'){
        injectFileIntoInput('file-moeder', buf, fname);
        markDropZoneLoaded('dz-moeder', 'fn-moeder', fname);
      } else if(key === 'expediting'){
        injectFileIntoInput('file-expediting', buf, fname);
        markDropZoneLoaded('dz-expediting', 'fn-expediting', fname);
      }
    }catch(err){ console.error('[file-loader] ihc-file-loaded fout:', err); }
  });

  /* ══════════════════════════════════════════════════════
     Event: cache gewist
  ══════════════════════════════════════════════════════ */
  window.addEventListener('ihc-cache-cleared', () => {
    console.log('[file-loader] Cache cleared event');
    ['file-moeder','file-expediting'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
    ['fn-moeder','fn-expediting'].forEach(id => {
      const el = document.getElementById(id);
      if(el){ el.textContent = '\u2014'; el.style.color = ''; }
    });
    ['dz-moeder','dz-expediting'].forEach(id => {
      const el = document.getElementById(id);
      if(el){
        el.classList.remove('loaded','has-file');
        el.style.borderColor = '';
        el.style.borderStyle = '';
        el.style.backgroundColor = '';
      }
    });
    toast('Cache gewist — upload nieuwe bestanden', true);
  });

  /* ══════════════════════════════════════════════════════
     START — wacht op window.load (alles is dan geladen)
  ══════════════════════════════════════════════════════ */
  function boot(){
    console.log('[file-loader] Boot trigger: window geladen');
    // Kleine extra delay om zeker te zijn dat inline scripts klaar zijn
    setTimeout(autoLoad, 200);
  }

  if(document.readyState === 'complete'){
    boot();
  } else {
    window.addEventListener('load', boot);
  }

})();
