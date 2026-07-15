/* ============================================================
   shared/expediting-data.js
   Bedrijfsbrede Expediten (totaaloverzicht).
   - Beheerder uploadt op Admin -> download "expediting-data.json"
     en commit dat naar shared/ -> beschikbaar voor ALLE gebruikers.
   - IndexedDB dient als lokale preview/cache (vóór committen / als fallback).
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

  // ── Lokaal (IndexedDB): preview op de Admin-pagina vóór het committen ──────
  async function save(lines, meta, raw){
    await put('dataset', lines);
    if (raw) await put('raw', raw);                  // { headers, rows } — rauw, voor PO-Matcher e.d.
    await put('meta', Object.assign({ uploaded:new Date().toISOString(), rows:lines.length }, meta||{}));
    return true;
  }
  async function clear(){ await put('dataset',null); await put('raw',null); await put('meta',null); }
  // direct uit IndexedDB (door de Admin-pagina gebruikt voor de "wat ga ik committen"-status)
  async function loadLocal(){    return (await get('dataset'))||null; }
  async function loadRawLocal(){ return (await get('raw'))||null; }
  async function metaLocal(){    return (await get('meta'))||null; }

  // ── Bedrijfsbreed bestand vastgelegd in de repo (shared/expediting-data.json) ──
  // Eén keer door de beheerder gecommit -> beschikbaar voor ALLE gebruikers.
  // Valt terug op de lokaal (IndexedDB) geüploade lijst als het bestand er niet is.
  const _SELF = (document.currentScript && document.currentScript.src) || '';
  const _JSON_URL = _SELF ? _SELF.replace(/[^/]+$/, 'expediting-data.json') : '../shared/expediting-data.json';
  let _committed; // memo: { raw, lines, meta } | null

  async function _fetchCommitted(){
    try{
      const res = await fetch(_JSON_URL, { cache:'no-cache' });
      if(!res.ok) return null;
      const j = await res.json();
      if(!j || !Array.isArray(j.headers) || !Array.isArray(j.rows)) return null;
      const headers = j.headers;
      const rows = j.rows.map(arr => { const o={}; for(let i=0;i<headers.length;i++) o[headers[i]] = arr[i]==null?'':arr[i]; return o; });
      let lines = [];
      try { if (global.ExpeditingCore) lines = ExpeditingCore.normalizeFromRaw([headers, ...j.rows]); } catch(e){}
      const meta = Object.assign({ rows: rows.length, source:'repo' }, j.meta||{});
      return { raw:{ headers, rows }, lines, meta };
    }catch(e){ return null; }
  }
  async function _ensureCommitted(){
    if(_committed!==undefined) return _committed;
    _committed = await _fetchCommitted();
    return _committed;
  }

  // Lezen op de consumerende pagina's: eerst het gecommitte bestand, anders lokaal.
  async function load(){    const c=await _ensureCommitted(); return c ? c.lines : ((await get('dataset'))||null); }
  async function loadRaw(){ const c=await _ensureCommitted(); return c ? c.raw   : ((await get('raw'))||null); }
  async function meta(){    const c=await _ensureCommitted(); return c ? c.meta  : ((await get('meta'))||null); }

  // Kolommen die de tools + datalaag nodig hebben. Overige kolommen worden
  // uit het commit-bestand gelaten om het klein en snel te houden.
  const KEEP_COLS = [
    'Purchase Order No','Order No','Line No','Release No','PO Line Status',
    'Sub Project ID','Sub Project Description','Technical Coordinator Name','Buyer Name','Supplier Name',
    'Part No','Description','Unified Reference Code','Qty','Purchase Qty to Receive','Purch UoM',
    'Delivery Status','Latest Wanted Receipt Date','Planned Delivery Date','Last Expedited','Last Confirmed',
    'Total/Currency','Delivery Terms','FAT Date Required','Country of Origin','Customs Stat No',
    // Nodig voor Large Item Overview + FAT Overview:
    'Delivery Address','FAT Location','Net Weight','Total Net Weight','Weight UoM'
  ];
  // Bouw het commit-bestand (compacte arrays) uit een rauwe tabel { headers, rows(objecten) }
  function buildCommitJSON(rawTable, metaObj){
    const headers = rawTable.headers.filter(h => KEEP_COLS.includes(h));
    const rows = rawTable.rows.map(o => headers.map(h => { const v=o[h]; return v instanceof Date ? v.toISOString() : (v==null?'':v); }));
    return JSON.stringify({ meta: Object.assign({ uploaded:new Date().toISOString(), rows: rows.length }, metaObj||{}), headers, rows });
  }

  global.ExpeditingData = { save, load, loadRaw, meta, clear, loadLocal, loadRawLocal, metaLocal, buildCommitJSON };
})(window);
