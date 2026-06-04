/* ── Royal IHC — Cache Reset Helper ────────────────────── */
(function(){
  "use strict";

  const DB_NAME = 'ihc-logistics-files', DB_VER = 1, STORE = 'files';

  function openDB(){
    return new Promise((ok, fail) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      r.onsuccess = e => ok(e.target.result);
      r.onerror   = e => fail(e.target.error);
    });
  }

  /**
   * Wist bestanden uit IndexedDB.
   * @param {string[]} keys – default ['moederlijst','expediting']
   * @returns {Promise<void>}
   */
  async function clearCache(keys){
    keys = keys || ['moederlijst', 'expediting'];
    const db = await openDB();
    return new Promise((ok, fail) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      keys.forEach(k => store.delete(k));
      tx.oncomplete = () => {
        /* Reset in-memory state */
        if(window.moederData)    window.moederData    = [];
        if(window.expediteData)  window.expediteData  = [];
        if(window.moederHeaders) window.moederHeaders = [];
        if(window.expediteHeaders) window.expediteHeaders = [];

        window.dispatchEvent(new CustomEvent('ihc-cache-cleared', { detail: { keys } }));
        ok();
      };
      tx.onerror = e => fail(e.target.error);
    });
  }

  window.IHC_clearCache = clearCache;
})();
