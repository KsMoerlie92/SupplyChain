/* ── Royal IHC — Shared Navigation + IndexedDB (sub-pages) ── */
(function(){
  const DB_NAME='ihc-logistics-files', DB_VER=1, STORE='files';

  /* ── IndexedDB ──────────────────────────────── */
  function openDB(){
    return new Promise((ok,fail)=>{
      const r=indexedDB.open(DB_NAME,DB_VER);
      r.onupgradeneeded=e=>e.target.result.createObjectStore(STORE);
      r.onsuccess=e=>ok(e.target.result);
      r.onerror=e=>fail(e.target.error);
    });
  }
  async function dbPut(key,buf,name){
    const db=await openDB();
    return new Promise((ok,fail)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({data:buf,name:name,ts:Date.now()},key);
      tx.oncomplete=()=>ok();
      tx.onerror=e=>fail(e.target.error);
    });
  }
  async function dbGet(key){
    const db=await openDB();
    return new Promise((ok,fail)=>{
      const tx=db.transaction(STORE,'readonly');
      const r=tx.objectStore(STORE).get(key);
      r.onsuccess=()=>ok(r.result||null);
      r.onerror=e=>fail(e.target.error);
    });
  }

  /* expose globally */
  window.IHC_DB={openDB:openDB,get:dbGet,put:dbPut};

  /* ── detect current page ────────────────────── */
  const path=location.pathname.toLowerCase();
  function isActive(slug){ return path.includes(slug.toLowerCase()); }

  const NAV_ITEMS=[
    {icon:'\uD83D\uDD0D',label:'PO Matcher',        href:'../PO-Matcher/',            tip:'Koppel Expediting aan Moederlijst via XLOOKUP',slug:'po-matcher'},
    {icon:'\uD83D\uDCE6',label:'Legplan & CIPL',     href:'../Legplan/',               tip:'3D container packing, CIPL & merk/labels',slug:'legplan'},
    {icon:'\uD83D\uDCCB',label:'Itemlijst Validator', href:'../Itemlijst-Validator/',   tip:'Valideer & corrigeer Itemlijsten van suppliers',slug:'itemlijst-validator'},
    {icon:'\u26A0\uFE0F',label:'DG Overview',         href:'../DG-Overview/',           tip:'Dangerous Goods analyse \u2014 IHM, IMDG, EU SRR',slug:'dg-overview'},
  ];

  /* ── build nav HTML ─────────────────────────── */
  let html='<nav class="ihc-nav">';
  html+='<a class="nav-brand" href="../">Royal <span class="brand-ihc">IHC</span></a>';
  html+='<div class="nav-items">';
  NAV_ITEMS.forEach(n=>{
    const act=isActive(n.slug)?' active':'';
    html+=`<a class="nav-item${act}" href="${n.href}" data-tip="${n.tip}"><span class="nav-icon">${n.icon}</span>${n.label}</a>`;
  });
  html+='</div>';
  html+='<div class="nav-files">';
  html+='<label class="nav-file-dot" id="nav-dot-moeder" title="Moederlijst"><span class="dot"></span>ML<input type="file" accept=".xlsx,.xlsm,.xls,.csv"></label>';
  html+='<label class="nav-file-dot" id="nav-dot-exp" title="Expediting lijst"><span class="dot"></span>EXP<input type="file" accept=".xlsx,.xlsm,.xls,.csv"></label>';
  html+='</div></nav>';

  document.body.insertAdjacentHTML('afterbegin',html);

  /* ── check loaded status ────────────────────── */
  async function checkStatus(){
    try{
      const m=await dbGet('moederlijst');
      if(m&&m.data) document.getElementById('nav-dot-moeder').classList.add('loaded');
    }catch(e){}
    try{
      const x=await dbGet('expediting');
      if(x&&x.data) document.getElementById('nav-dot-exp').classList.add('loaded');
    }catch(e){}
  }
  checkStatus();

  /* ── nav file upload handlers ───────────────── */
  function wireNavUpload(dotId,dbKey){
    const el=document.getElementById(dotId);
    if(!el)return;
    const inp=el.querySelector('input[type="file"]');
    inp.addEventListener('change',async()=>{
      if(!inp.files.length)return;
      const f=inp.files[0];
      try{
        const buf=await f.arrayBuffer();
        await dbPut(dbKey,buf,f.name);
        el.classList.add('loaded');
        window.dispatchEvent(new CustomEvent('ihc-file-loaded',{detail:{key:dbKey,name:f.name}}));
      }catch(err){console.error('Nav upload error:',err)}
    });
  }
  wireNavUpload('nav-dot-moeder','moederlijst');
  wireNavUpload('nav-dot-exp','expediting');
})();
