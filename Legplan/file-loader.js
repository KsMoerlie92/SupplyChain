/* ══════════════════════════════════════════════════════════════
   Royal IHC — Legplan File Loader  v4
   ──────────────────────────────────────────────────────────────
   Wacht op window.load + handleFile() → inject + groen + auto-klik
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  console.log('[file-loader] Legplan v4 script geladen');

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

  /* ── Poll helper ────────────────────────────────────── */
  function waitFor(condFn, label, timeout){
    timeout = timeout || 10000;
    return new Promise((ok, fail) => {
      if(condFn()){ console.log('[file-loader] '+label+' ✓ (direct)'); ok(); return; }
      const t0 = Date.now();
      const iv = setInterval(() => {
        if(condFn()){ clearInterval(iv); console.log('[file-loader] '+label+' ✓ (na '+(Date.now()-t0)+'ms)'); ok(); }
        else if(Date.now()-t0 > timeout){ clearInterval(iv); fail(new Error(label+' niet beschikbaar na '+timeout+'ms')); }
      }, 150);
    });
  }

  /* ── ArrayBuffer extractie ──────────────────────────── */
  function toArrayBuffer(raw){
    if(raw instanceof ArrayBuffer) return raw;
    if(raw instanceof Uint8Array) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(ArrayBuffer.isView(raw)) return raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
    if(raw && typeof raw === 'object'){
      if(raw.data) return toArrayBuffer(raw.data);
      const keys = Object.keys(raw).filter(k => !isNaN(k));
      if(keys.length > 0) return new Uint8Array(keys.sort((a,b)=>a-b).map(k=>raw[k])).buffer;
    }
    throw new Error('Kan niet converteren naar ArrayBuffer');
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

  /* ── Inject + groen ─────────────────────────────────── */
  function injectFile(inputId, arrayBuffer, fileName){
    const input = document.getElementById(inputId);
    if(!input){
      console.error('[file-loader] Input #'+inputId+' niet gevonden');
      console.log('[file-loader] Aanwezige inputs:', Array.from(document.querySelectorAll('input[type=file]')).map(i=>i.id||'(geen id)'));
      return false;
    }
    let mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if(fileName.toLowerCase().endsWith('.xls')) mime='application/vnd.ms-excel';
    if(fileName.toLowerCase().endsWith('.xlsm')) mime='application/vnd.ms-excel.sheet.macroEnabled.12';

    const file = new File([arrayBuffer], fileName, {type:mime, lastModified:Date.now()});
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    console.log('[file-loader] ✅ "'+fileName+'" → #'+inputId);
    return true;
  }

  function markGreen(zoneId, fnId, fileName){
    const zone = document.getElementById(zoneId);
    if(zone){
      zone.classList.add('loaded','has-file');
      zone.style.borderColor='#22c55e';
      zone.style.borderStyle='solid';
      zone.style.backgroundColor='rgba(34,197,94,.06)';
    }
    const fn = document.getElementById(fnId);
    if(fn){ fn.textContent=fileName; fn.style.color='#22c55e'; }
  }

  function autoClickVerwerken(delay){
    setTimeout(()=>{
      let btn=null;
      const sels=['#btn-verwerk','#btn-process','#btn-run','.btn-verwerk','.btn-process'];
      for(const s of sels){ btn=document.querySelector(s); if(btn) break; }
      if(!btn){
        for(const b of document.querySelectorAll('button,input[type=button],.btn')){
          const t=(b.textContent||b.value||'').toLowerCase();
          if(t.includes('verwerk')||t.includes('process')||t.includes('genereer')||t.includes('start')){btn=b;break;}
        }
      }
      if(btn){ console.log('[file-loader] ✅ Auto-klik:',btn.textContent.trim()); btn.click(); }
      else{ console.log('[file-loader] Geen Verwerken-knop gevonden'); }
    }, delay||800);
  }

  /* ── Auto-load ──────────────────────────────────────── */
  async function autoLoad(){
    console.log('[file-loader] === Legplan auto-load gestart ===');

    try{ await waitFor(()=>typeof XLSX!=='undefined','XLSX'); }
    catch(err){ console.error('[file-loader]',err.message); toast(err.message,false); return; }

    try{ await waitFor(()=>typeof window.handleFile==='function','handleFile()'); }
    catch(err){ console.error('[file-loader]',err.message); toast(err.message,false); return; }

    try{
      const rec = await _dbGet('moederlijst');
      if(rec && rec.data){
        const buf = toArrayBuffer(rec.data);
        const name = rec.name || 'Moederlijst.xlsx';
        // Try common input IDs for legplan
        const inputId = document.getElementById('file-moeder') ? 'file-moeder'
                      : document.getElementById('file-moederlijst') ? 'file-moederlijst'
                      : null;
        if(!inputId){
          // Fallback: first file input on page
          const first = document.querySelector('input[type=file]');
          if(first && first.id){
            console.log('[file-loader] Fallback input:', first.id);
            injectFile(first.id, buf, name);
          } else if(first){
            first.setAttribute('id','_fl_auto_input');
            injectFile('_fl_auto_input', buf, name);
          }
        } else {
          injectFile(inputId, buf, name);
        }
        markGreen('dz-moeder','fn-moeder', name);
        toast('Moederlijst geladen uit cache', true);
        autoClickVerwerken(800);
      } else {
        console.log('[file-loader] Geen moederlijst in cache');
      }
    }catch(err){
      console.error('[file-loader] Auto-load fout:', err);
      toast('Auto-load mislukt: '+err.message, false);
    }

    window.dispatchEvent(new CustomEvent('ihc-autoload-complete'));
  }

  /* ── Events ─────────────────────────────────────────── */
  window.addEventListener('ihc-file-loaded', async(e)=>{
    const {key,name}=e.detail||{};
    if(key!=='moederlijst') return;
    try{
      await waitFor(()=>typeof XLSX!=='undefined','XLSX',5000);
      await waitFor(()=>typeof window.handleFile==='function','handleFile',5000);
      const rec=await _dbGet(key);
      if(!rec||!rec.data)return;
      const inputId=document.getElementById('file-moeder')?'file-moeder':'file-moederlijst';
      injectFile(inputId,toArrayBuffer(rec.data),name||rec.name||'Moederlijst.xlsx');
      markGreen('dz-moeder','fn-moeder',name||rec.name);
    }catch(err){console.error('[file-loader]',err);}
  });

  window.addEventListener('ihc-cache-cleared',()=>{
    const inp=document.getElementById('file-moeder')||document.getElementById('file-moederlijst');
    if(inp)inp.value='';
    const fn=document.getElementById('fn-moeder');
    if(fn){fn.textContent='\u2014';fn.style.color='';}
    const dz=document.getElementById('dz-moeder');
    if(dz){dz.classList.remove('loaded','has-file');dz.style.borderColor='';dz.style.borderStyle='';dz.style.backgroundColor='';}
  });

  /* ── Start ──────────────────────────────────────────── */
  if(document.readyState==='complete') setTimeout(autoLoad,200);
  else window.addEventListener('load', ()=>setTimeout(autoLoad,200));
})();
