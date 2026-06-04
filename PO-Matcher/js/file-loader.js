/* ── Royal IHC PO-Matcher — File Loader with IndexedDB auto-load ── */
(function(){
  "use strict";

  /* ══════════════════════════════════════════════════════════
     Global state — other scripts read these
  ══════════════════════════════════════════════════════════ */
  window.moederData    = window.moederData    || [];
  window.expediteData  = window.expediteData  || [];
  window.expediteHeaders = window.expediteHeaders || [];
  window.moederHeaders = window.moederHeaders || [];

  /* ══════════════════════════════════════════════════════════
     IndexedDB helpers (use shared IHC_DB if available)
  ══════════════════════════════════════════════════════════ */
  const DB_NAME='ihc-logistics-files', DB_VER=1, STORE='files';
  function _openDB(){
    if(window.IHC_DB && window.IHC_DB.openDB) return window.IHC_DB.openDB();
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

  /* ══════════════════════════════════════════════════════════
     Parse Moederlijst (Sheet2 = data sheet)
  ══════════════════════════════════════════════════════════ */
  function parseMoederlijst(arrayBuffer, fileName){
    const wb = XLSX.read(arrayBuffer, {type:'array', cellDates:true});

    // Find the data sheet — Sheet2 or first sheet with "Deliveryref" / "IHC PO"
    let sheetName = wb.SheetNames[1] || wb.SheetNames[0]; // Sheet2 by default
    for(const sn of wb.SheetNames){
      const s = wb.Sheets[sn];
      const json = XLSX.utils.sheet_to_json(s, {header:1, range:0, defval:''});
      if(json.length>0){
        const firstRow = json[0].map(c=>String(c).toLowerCase());
        if(firstRow.some(c=>c.includes('deliveryref')||c.includes('ihc po'))){
          sheetName = sn; break;
        }
      }
    }

    const sheet = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:true});
    if(raw.length < 2) return {headers:[], data:[]};

    // First row = headers
    const headers = raw[0].map(h=>String(h).trim());
    const data = [];
    for(let i=1;i<raw.length;i++){
      const row = raw[i];
      // skip fully empty rows
      if(!row.some(c=> c!==''&&c!==null&&c!==undefined)) continue;
      const obj = {};
      headers.forEach((h,j)=>{ obj[h] = row[j]!==undefined ? row[j] : ''; });
      data.push(obj);
    }

    console.log(`[file-loader] Moederlijst "${fileName}" → ${data.length} rijen uit sheet "${sheetName}"`);
    return {headers, data};
  }

  /* ══════════════════════════════════════════════════════════
     Parse Expediting lijst (auto-detect header row)
  ══════════════════════════════════════════════════════════ */
  function parseExpeditingLijst(arrayBuffer, fileName){
    const wb = XLSX.read(arrayBuffer, {type:'array', cellDates:true, raw:true});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:true});

    // Find header row: row with most non-empty cells in first 10 rows
    let headerIdx = 0, maxFilled = 0;
    for(let i=0; i<Math.min(10, raw.length); i++){
      const filled = raw[i].filter(c=> c!==''&&c!==null&&c!==undefined).length;
      if(filled > maxFilled){ maxFilled = filled; headerIdx = i; }
    }

    // Deduplicate headers (some columns have same name)
    const rawHeaders = raw[headerIdx].map(h=>String(h||'').trim());
    const seen = {};
    const headers = rawHeaders.map(h=>{
      if(!h) return h;
      if(!seen[h]){ seen[h]=1; return h; }
      seen[h]++;
      return h+'_'+seen[h];
    });

    const data = [];
    for(let i=headerIdx+1; i<raw.length; i++){
      const row = raw[i];
      if(!row.some(c=> c!==''&&c!==null&&c!==undefined)) continue;
      const obj = {};
      headers.forEach((h,j)=>{ obj[h] = row[j]!==undefined ? row[j] : ''; });
      data.push(obj);
    }

    console.log(`[file-loader] Expediting "${fileName}" → ${data.length} rijen, header rij ${headerIdx+1}`);
    return {headers, data};
  }

  /* ══════════════════════════════════════════════════════════
     Apply loaded data to the page
  ══════════════════════════════════════════════════════════ */
  function applyMoederData(result){
    window.moederHeaders = result.headers;
    window.moederData = result.data;
    showFieldStatus('moeder', result.data.length + ' rijen geladen');
    // Try to trigger matching if both files are loaded
    if(typeof window.runMatch === 'function' && window.moederData.length && window.expediteData.length){
      window.runMatch();
    }
  }

  function applyExpediteData(result){
    window.expediteHeaders = result.headers;
    window.expediteData = result.data;
    showFieldStatus('expedite', result.data.length + ' rijen geladen');
    if(typeof window.runMatch === 'function' && window.moederData.length && window.expediteData.length){
      window.runMatch();
    }
  }

  function showFieldStatus(which, msg){
    // Look for status elements in the page
    const el = document.getElementById('drop-status-'+which)
            || document.querySelector('[data-file-status="'+which+'"]');
    if(el){
      el.textContent = '\u2705 ' + msg;
      el.style.color = '#22c55e';
    }
    console.log(`[file-loader] ${which}: ${msg}`);
  }

  /* ══════════════════════════════════════════════════════════
     Manual file upload handler (existing drop zones still work)
  ══════════════════════════════════════════════════════════ */
  window.handleFile = function(file, type){
    const reader = new FileReader();
    reader.onload = async function(e){
      const buf = e.target.result;

      // Store in IndexedDB for cross-page sharing
      const dbKey = type === 'moeder' ? 'moederlijst' : 'expediting';
      try{
        if(window.IHC_DB && window.IHC_DB.put){
          await window.IHC_DB.put(dbKey, buf, file.name);
        } else {
          // Fallback: store directly
          const db = await _openDB();
          await new Promise((ok,fail)=>{
            const tx=db.transaction(STORE,'readwrite');
            tx.objectStore(STORE).put({data:buf,name:file.name,ts:Date.now()},dbKey);
            tx.oncomplete=()=>ok();
            tx.onerror=e=>fail(e.target.error);
          });
        }
      }catch(err){ console.warn('IndexedDB store failed:',err); }

      // Parse and apply
      if(type === 'moeder'){
        const result = parseMoederlijst(new Uint8Array(buf), file.name);
        applyMoederData(result);
      } else {
        const result = parseExpeditingLijst(new Uint8Array(buf), file.name);
        applyExpediteData(result);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ══════════════════════════════════════════════════════════
     Auto-load from IndexedDB on page load
  ══════════════════════════════════════════════════════════ */
  async function autoLoad(){
    let loaded = 0;

    try{
      const moederRec = await _dbGet('moederlijst');
      if(moederRec && moederRec.data){
        const buf = moederRec.data instanceof ArrayBuffer ? moederRec.data : moederRec.data;
        const result = parseMoederlijst(new Uint8Array(buf), moederRec.name || 'Moederlijst');
        applyMoederData(result);
        showFieldStatus('moeder', result.data.length + ' rijen (uit cache: ' + (moederRec.name||'Moederlijst') + ')');
        loaded++;
      }
    }catch(err){ console.warn('[file-loader] Moederlijst auto-load failed:', err); }

    try{
      const expRec = await _dbGet('expediting');
      if(expRec && expRec.data){
        const buf = expRec.data instanceof ArrayBuffer ? expRec.data : expRec.data;
        const result = parseExpeditingLijst(new Uint8Array(buf), expRec.name || 'Expediting');
        applyExpediteData(result);
        showFieldStatus('expedite', result.data.length + ' rijen (uit cache: ' + (expRec.name||'Expediting') + ')');
        loaded++;
      }
    }catch(err){ console.warn('[file-loader] Expediting auto-load failed:', err); }

    if(loaded > 0){
      console.log(`[file-loader] ${loaded} bestand(en) automatisch geladen uit IndexedDB`);
    }
  }

  /* ── Listen for new uploads from nav bar ────────────── */
  window.addEventListener('ihc-file-loaded', async(e)=>{
    const {key, name} = e.detail;
    try{
      const rec = await _dbGet(key);
      if(!rec || !rec.data) return;
      const buf = new Uint8Array(rec.data instanceof ArrayBuffer ? rec.data : rec.data);
      if(key === 'moederlijst'){
        applyMoederData(parseMoederlijst(buf, name));
      } else if(key === 'expediting'){
        applyExpediteData(parseExpeditingLijst(buf, name));
      }
    }catch(err){ console.warn('[file-loader] ihc-file-loaded handler error:', err); }
  });

  /* ── Init ──────────────────────────────────────────── */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', autoLoad);
  } else {
    autoLoad();
  }

})();
