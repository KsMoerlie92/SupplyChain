/* ══════════════════════════════════════════════════════════════
   Royal IHC — Data Bridge  v1
   ──────────────────────────────────────────────────────────────
   Onderschept bestandsuploads op de hoofdpagina en slaat een
   kopie op in IndexedDB zodat sub-pagina's (PO-Matcher, Legplan)
   de data kunnen ophalen via file-loader.js.

   GEBRUIK: voeg toe aan index.html (NA je bestaande scripts):
     <script src="shared/data-bridge.js"></script>
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  const TAG  = '[data-bridge]';
  const DB   = 'ihc-logistics-files';
  const VER  = 1;
  const STORE= 'files';

  /* map input-id → IDB key */
  const MAP = {
    'file-moeder'    : 'moederlijst',
    'file-moederlijst': 'moederlijst',
    'file-expediting': 'expediting'
  };

  console.log(TAG, 'v1 geladen');

  /* ── IndexedDB helpers ─────────────────────────────── */
  function openDB(){
    return new Promise((ok, fail) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE);
          console.log(TAG, 'Object store "'+STORE+'" aangemaakt');
        }
      };
      r.onsuccess = e => ok(e.target.result);
      r.onerror   = e => fail(e.target.error);
    });
  }

  async function dbPut(key, value){
    const db = await openDB();
    return new Promise((ok, fail) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { console.log(TAG, '✅ "'+key+'" opgeslagen in IDB'); ok(); };
      tx.onerror    = e  => { console.error(TAG, '❌ put fout:', e.target.error); fail(e.target.error); };
    });
  }

  async function dbGet(key){
    const db = await openDB();
    return new Promise((ok, fail) => {
      const tx = db.transaction(STORE, 'readonly');
      const r  = tx.objectStore(STORE).get(key);
      r.onsuccess = () => ok(r.result || null);
      r.onerror   = e  => fail(e.target.error);
    });
  }

  async function dbKeys(){
    const db = await openDB();
    return new Promise((ok, fail) => {
      const tx = db.transaction(STORE, 'readonly');
      const r  = tx.objectStore(STORE).getAllKeys();
      r.onsuccess = () => ok(r.result);
      r.onerror   = e  => fail(e.target.error);
    });
  }

  /* ── Bestand opslaan ───────────────────────────────── */
  async function storeFile(file, idbKey){
    console.log(TAG, 'Opslaan: "'+file.name+'" ('+file.size+' bytes) → key "'+idbKey+'"');
    try {
      const buf = await file.arrayBuffer();
      console.log(TAG, '  ArrayBuffer OK:', buf.byteLength, 'bytes');

      await dbPut(idbKey, {
        data: buf,
        name: file.name,
        ts:   Date.now()
      });

      /* verify – lees meteen terug */
      const check = await dbGet(idbKey);
      if(check && check.data){
        console.log(TAG, '  ✅ Verificatie OK: "'+idbKey+'" → '+check.data.byteLength+' bytes, name="'+check.name+'"');
      } else {
        console.error(TAG, '  ❌ Verificatie MISLUKT: data niet teruggevonden!');
      }

      /* localStorage flag */
      updateFlags(idbKey, true);

      /* custom event */
      window.dispatchEvent(new CustomEvent('ihc-file-stored', {
        detail: { key: idbKey, name: file.name, size: file.size }
      }));

    } catch(err){
      console.error(TAG, '❌ Opslaan mislukt:', err);
    }
  }

  /* ── localStorage flags ────────────────────────────── */
  function updateFlags(key, stored){
    let flags = {};
    try { flags = JSON.parse(localStorage.getItem('ihc-files-stored') || '{}'); } catch(e){}
    flags[key] = stored;
    localStorage.setItem('ihc-files-stored', JSON.stringify(flags));
    console.log(TAG, 'localStorage flags:', JSON.stringify(flags));
  }

  /* ── Input listeners ───────────────────────────────── */
  function attachToInput(inputId){
    const el = document.getElementById(inputId);
    if(!el){
      console.log(TAG, 'Input #'+inputId+' niet gevonden (normaal als niet op deze pagina)');
      return;
    }
    const idbKey = MAP[inputId];
    if(!idbKey){
      console.warn(TAG, 'Geen IDB key mapping voor #'+inputId);
      return;
    }

    el.addEventListener('change', function(e){
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      console.log(TAG, 'change event op #'+inputId+': "'+file.name+'"');
      storeFile(file, idbKey);
    });

    console.log(TAG, '✅ Listener op #'+inputId+' → key "'+idbKey+'"');
  }

  /* ── Drop zone listeners ───────────────────────────── */
  function attachToDropZone(dzId, inputId){
    const dz = document.getElementById(dzId);
    if(!dz) return;
    const idbKey = MAP[inputId];
    if(!idbKey) return;

    dz.addEventListener('drop', function(e){
      const files = e.dataTransfer && e.dataTransfer.files;
      if(!files || !files.length) return;
      console.log(TAG, 'drop event op #'+dzId+': "'+files[0].name+'"');
      storeFile(files[0], idbKey);
    });

    console.log(TAG, '✅ Drop listener op #'+dzId);
  }

  /* ── MutationObserver fallback ─────────────────────── */
  /* Als inputs later in de DOM verschijnen (SPA) */
  function watchDOM(){
    const observer = new MutationObserver(() => {
      Object.keys(MAP).forEach(id => {
        const el = document.getElementById(id);
        if(el && !el.dataset.bridgeAttached){
          el.dataset.bridgeAttached = 'true';
          attachToInput(id);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Status check bij laden ────────────────────────── */
  async function checkStatus(){
    try {
      const keys = await dbKeys();
      console.log(TAG, '── IDB Status ──');
      if(keys.length === 0){
        console.log(TAG, '  (leeg — nog geen bestanden opgeslagen)');
      }
      for(const k of keys){
        const rec = await dbGet(k);
        const sz  = rec && rec.data ? (rec.data.byteLength || '?') : 0;
        const nm  = rec && rec.name ? rec.name : '?';
        const ts  = rec && rec.ts ? new Date(rec.ts).toLocaleString('nl') : '?';
        console.log(TAG, '  "'+k+'": '+nm+' ('+((+sz)/1024).toFixed(0)+' KB) — '+ts);
      }
      console.log(TAG, '────────────────');
    } catch(err){
      console.error(TAG, 'Status check fout:', err);
    }
  }

  /* ── Init ──────────────────────────────────────────── */
  function init(){
    console.log(TAG, 'Init...');

    /* Attach to known inputs */
    Object.keys(MAP).forEach(id => attachToInput(id));

    /* Attach to known drop zones */
    attachToDropZone('dz-moeder', 'file-moeder');
    attachToDropZone('dz-expediting', 'file-expediting');

    /* Watch for late-appearing inputs */
    if(document.body) watchDOM();
    else document.addEventListener('DOMContentLoaded', watchDOM);

    /* Status */
    checkStatus();

    console.log(TAG, 'Init afgerond ✅');
  }

  /* Start */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
