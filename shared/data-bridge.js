/* ══════════════════════════════════════════════════════════════
   Royal IHC — Data Bridge  v2
   ──────────────────────────────────────────────────────────────
   Wrapt window.handleFile() — GEEN eigen event listeners.
   Slaat een kopie op in IndexedDB na elk bestandsupload.
   Breekt NOOIT de bestaande functionaliteit.

   GEBRUIK: <script src="shared/data-bridge.js"></script>
            Onderaan index.html, NA je eigen scripts.
   ══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  const TAG   = '[data-bridge]';
  const DB    = 'ihc-logistics-files';
  const VER   = 1;
  const STORE = 'files';

  /* type-parameter → IDB key */
  const KEY_MAP = {
    'moeder'     : 'moederlijst',
    'moederlijst': 'moederlijst',
    'expediting' : 'expediting',
    'exp'        : 'expediting'
  };

  console.log(TAG, 'v2 geladen');

  /* ── IndexedDB ─────────────────────────────────────── */
  function openDB(){
    return new Promise(function(ok, fail){
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE);
        }
      };
      r.onsuccess = function(e){ ok(e.target.result); };
      r.onerror   = function(e){ fail(e.target.error); };
    });
  }

  function dbPut(key, value){
    return openDB().then(function(db){
      return new Promise(function(ok, fail){
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function(){ ok(); };
        tx.onerror    = function(e){ fail(e.target.error); };
      });
    });
  }

  function dbGet(key){
    return openDB().then(function(db){
      return new Promise(function(ok, fail){
        var tx = db.transaction(STORE, 'readonly');
        var r  = tx.objectStore(STORE).get(key);
        r.onsuccess = function(){ ok(r.result || null); };
        r.onerror   = function(e){ fail(e.target.error); };
      });
    });
  }

  /* ── Opslaan ───────────────────────────────────────── */
  function storeFile(file, idbKey){
    console.log(TAG, 'Opslaan: "'+file.name+'" ('+file.size+' bytes) → "'+idbKey+'"');

    var reader = new FileReader();
    reader.onload = function(){
      var buf = reader.result;
      console.log(TAG, '  ArrayBuffer:', buf.byteLength, 'bytes');

      dbPut(idbKey, { data: buf, name: file.name, ts: Date.now() })
        .then(function(){
          console.log(TAG, '  ✅ "'+idbKey+'" opgeslagen');
          /* verificatie */
          return dbGet(idbKey);
        })
        .then(function(rec){
          if(rec && rec.data){
            console.log(TAG, '  ✅ Verificatie OK:', rec.data.byteLength, 'bytes');
          } else {
            console.warn(TAG, '  ⚠ Verificatie: niet teruggevonden');
          }
          /* localStorage flag */
          try {
            var f = JSON.parse(localStorage.getItem('ihc-files-stored') || '{}');
            f[idbKey] = true;
            localStorage.setItem('ihc-files-stored', JSON.stringify(f));
          } catch(e){}
        })
        .catch(function(err){
          console.error(TAG, '  ❌ IDB fout:', err);
        });
    };
    reader.onerror = function(){
      console.error(TAG, '  ❌ FileReader fout');
    };
    reader.readAsArrayBuffer(file);
  }

  /* ── Na handleFile: sla bestand op ─────────────────── */
  function afterHandleFile(event, type){
    try {
      var file = null;

      /* Probeer file uit event.target (input change) */
      if(event && event.target && event.target.files && event.target.files.length){
        file = event.target.files[0];
      }
      /* Probeer dataTransfer (drag-drop) */
      if(!file && event && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length){
        file = event.dataTransfer.files[0];
      }

      if(!file){
        console.log(TAG, 'Geen bestand gevonden in event voor type "'+type+'"');
        return;
      }

      var idbKey = KEY_MAP[type] || KEY_MAP[String(type).toLowerCase()];
      if(!idbKey){
        console.log(TAG, 'Onbekend type "'+type+'" — skip');
        return;
      }

      storeFile(file, idbKey);
    } catch(err){
      /* NOOIT laten propageren */
      console.error(TAG, 'Fout in afterHandleFile:', err);
    }
  }

  /* ── Wrap handleFile ───────────────────────────────── */
  var WRAPPED = '__bridge_wrapped__';

  function wrapHandleFile(){
    if(typeof window.handleFile !== 'function'){
      return false; /* nog niet beschikbaar */
    }
    if(window.handleFile[WRAPPED]){
      console.log(TAG, 'handleFile al gewrapt — skip');
      return true;
    }

    var original = window.handleFile;

    window.handleFile = function bridgedHandleFile(event, type){
      /* 1) Origineel EERST — altijd */
      var result;
      try {
        result = original.apply(this, arguments);
      } catch(err){
        console.error(TAG, 'Originele handleFile gooide fout:', err);
        throw err; /* gooi door zodat bestaande error handling werkt */
      }

      /* 2) Dan stilletjes opslaan in IDB */
      afterHandleFile(event, type);

      return result;
    };

    window.handleFile[WRAPPED] = true;
    console.log(TAG, '✅ handleFile() gewrapt — uploads worden nu opgeslagen in IDB');
    return true;
  }

  /* ── Poll tot handleFile bestaat ───────────────────── */
  function waitAndWrap(){
    if(wrapHandleFile()) return;

    console.log(TAG, 'Wacht op window.handleFile()...');
    var t0 = Date.now();
    var iv = setInterval(function(){
      if(wrapHandleFile()){
        clearInterval(iv);
      } else if(Date.now() - t0 > 15000){
        clearInterval(iv);
        console.warn(TAG, '⚠ handleFile() niet gevonden na 15s — bridge inactief');
      }
    }, 200);
  }

  /* ── Start ─────────────────────────────────────────── */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', waitAndWrap);
  } else {
    waitAndWrap();
  }

})();
