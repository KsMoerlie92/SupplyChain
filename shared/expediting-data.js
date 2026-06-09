/* ============================================================
   shared/expediting-data.js
   Bedrijfsbrede Expeditelijst centraal in de browser (IndexedDB).
   Eén upload op de Admin-pagina -> beschikbaar op alle pagina's.
   ============================================================ */
(function (global) {
  'use strict';
  const DB='ihc_expediting', STORE='kv', VER=1;

  function open(){
    return new Promise((res,rej)=>{
      const req=indexedDB.open(DB,VER);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess=()=>res(req.result);
      req.onerror=()=>rej(req.error);
    });
  }
  function tx(mode,fn){
    return open().then(db=>new Promise((res,rej)=>{
      const t=db.transaction(STORE,mode), st=t.objectStore(STORE); let out;
      Promise.resolve(fn(st)).then(v=>{out=v;});
      t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);
    }));
  }
  const get=k=>tx('readonly',st=>new Promise(r=>{const q=st.get(k);q.onsuccess=()=>r(q.result);}));
  const put=(k,v)=>tx('readwrite',st=>{st.put(v,k);});

  // sla genormaliseerde regels + meta op
  async function save(lines, meta){
    await put('dataset', lines);
    await put('meta', Object.assign({ uploaded:new Date().toISOString(), rows:lines.length }, meta||{}));
    return true;
  }
  async function load(){ return (await get('dataset'))||null; }       // array | null
  async function meta(){ return (await get('meta'))||null; }
  async function clear(){ await put('dataset',null); await put('meta',null); }

  global.ExpeditingData = { save, load, meta, clear };
})(window);
