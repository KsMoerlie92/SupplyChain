/* ============================================================
   shared/expediting-mailer.js
   Herbruikbare Expediting Mailer-modal voor elke pagina.
   Afhankelijk van: ExpeditingCore, (optioneel) ExpeditingData,
   en window.EXPEDITING_TEMPLATES (shared/templates.js).

   Publieke API:
     ExpeditingMailer.open({lines, supplier, templateId, reason})
     ExpeditingMailer.openForPO(poNo, opts)
     ExpeditingMailer.openForPOs([poNo,...], opts)
     ExpeditingMailer.openForSupplier(name, opts)
     ExpeditingMailer.makeButton(getLinesFn, opts) -> <button>
     ExpeditingMailer.attachButton(targetEl, getLinesFn, opts)
     await ExpeditingMailer.ready()   // dataset uit IndexedDB laden
   ============================================================ */
(function (global) {
  'use strict';
  const C = () => global.ExpeditingCore;
  const T = () => global.EXPEDITING_TEMPLATES;
  let DATASET = null;          // genormaliseerde regels uit de store
  let dom = null;              // modal-DOM (lazy)
  let state = { lines:[], supplier:'', sel:new Set(), lineFilter:'all' };

  /* ---------- dataset uit de centrale opslag ---------- */
  async function ready(){
    if(DATASET) return DATASET;
    if(global.ExpeditingData){ try{ DATASET = await global.ExpeditingData.load(); }catch(e){ DATASET=null; } }
    return DATASET;
  }
  function rehydrate(lines){ // Date-velden kunnen als string terugkomen uit de store
    const core=C();
    lines.forEach(o=>{ ['lwr','planned','lastConf','lastExp','fatReq'].forEach(k=>{ o[k]=core.toDate(o[k]); });
      o.unconf=(o.status==='Released')||!o.lastConf; o.late=o.dstatus==='Late'; });
    return lines;
  }

  /* ---------- buyer-adresboek ---------- */
  function book(){ try{return JSON.parse(localStorage.getItem('ihc_buyer_emails')||'{}');}catch{return {};} }
  function saveBuyer(n,e){ if(n&&e){ const b=book(); b[n]=e; localStorage.setItem('ihc_buyer_emails',JSON.stringify(b)); } }

  /* ---------- modal-DOM (eenmalig) ---------- */
  function build(){
    if(dom) return dom;
    const root=document.createElement('div'); root.className='exm-root';
    root.innerHTML=`
      <div class="exm-overlay" data-x></div>
      <div class="exm-modal" role="dialog" aria-modal="true">
        <div class="exm-head">
          <div><b id="exmTitle">Leverancier aanschrijven</b><small id="exmSub"></small></div>
          <button class="exm-x" data-x>&times;</button>
        </div>
        <div class="exm-body">
          <div class="exm-warn" id="exmWarn" style="display:none"></div>
          <div class="exm-row">
            <div class="exm-fld"><label>Taal</label>
              <select id="exmLang"><option value="NL">Nederlands</option><option value="EN">Engels</option></select></div>
            <div class="exm-fld" style="flex:2"><label>Reden / template</label><select id="exmTpl"></select></div>
            <div class="exm-fld" style="max-width:130px"><label>Urgentie</label>
              <label class="exm-toggle"><input type="checkbox" id="exmUrgent"> URGENT</label></div>
          </div>
          <div class="exm-row">
            <div class="exm-fld"><label>Aan (leverancier — handmatig)</label><input type="text" id="exmTo" placeholder="leverancier@voorbeeld.com"></div>
            <div class="exm-fld"><label id="exmCcLbl">Cc — Buyer</label><input type="text" id="exmCc" placeholder="buyer@royalihc.com"></div>
          </div>
          <div class="exm-tools">
            <span class="exm-chip on" data-lf="all">Alle</span>
            <span class="exm-chip" data-lf="late">Te laat</span>
            <span class="exm-chip" data-lf="unconf">Onbevestigd</span>
            <button class="exm-btn ghost" id="exmToggleAll" style="padding:4px 9px;font-size:10.5px">Alles aan/uit</button>
            <span class="exm-msg" id="exmCount"></span>
          </div>
          <div class="exm-lwrap"><table class="exm-lines"><thead><tr>
            <th style="width:24px"></th><th>Project</th><th>PO-regel</th><th>Omschrijving</th>
            <th>Open</th><th>Lev.</th><th>Status</th><th>Gewenst</th><th>Laatst bev.</th></tr></thead>
            <tbody id="exmLineBody"></tbody></table></div>
          <label style="display:block;margin:12px 0 4px;font-size:10px;font-weight:700;color:#5b6b7b;text-transform:uppercase;letter-spacing:.4px">Onderwerp</label>
          <input type="text" id="exmSubject" class="exm-subj">
          <div class="exm-hint">Project - PO - Leverancier - Reden · meerdere projecten → "Royal IHC Projects [aantal]".</div>
          <label style="display:block;margin:12px 0 4px;font-size:10px;font-weight:700;color:#5b6b7b;text-transform:uppercase;letter-spacing:.4px">Voorbeeld mailtekst</label>
          <div class="exm-preview" id="exmPreview"></div>
        </div>
        <div class="exm-foot">
          <button class="exm-btn" id="exmGen">⬇ Genereer .eml (concept in Outlook)</button>
          <button class="exm-btn ghost" data-x>Annuleren</button>
          <span class="exm-msg" id="exmGenMsg"></span>
        </div>
      </div>`;
    document.body.appendChild(root);
    dom={ root,
      overlay:root.querySelector('.exm-overlay'), modal:root.querySelector('.exm-modal'),
      title:root.querySelector('#exmTitle'), sub:root.querySelector('#exmSub'), warn:root.querySelector('#exmWarn'),
      lang:root.querySelector('#exmLang'), tpl:root.querySelector('#exmTpl'), urgent:root.querySelector('#exmUrgent'),
      to:root.querySelector('#exmTo'), cc:root.querySelector('#exmCc'), ccLbl:root.querySelector('#exmCcLbl'),
      lineBody:root.querySelector('#exmLineBody'), count:root.querySelector('#exmCount'),
      subject:root.querySelector('#exmSubject'), preview:root.querySelector('#exmPreview'),
      gen:root.querySelector('#exmGen'), genMsg:root.querySelector('#exmGenMsg'),
      toggleAll:root.querySelector('#exmToggleAll') };

    root.querySelectorAll('[data-x]').forEach(b=>b.onclick=close);
    dom.lang.onchange=()=>{ fillTplOptions(); refresh(); };
    dom.tpl.onchange=refresh; dom.urgent.onchange=refresh;
    root.querySelectorAll('[data-lf]').forEach(c=>c.onclick=()=>{
      root.querySelectorAll('[data-lf]').forEach(x=>x.classList.remove('on'));
      c.classList.add('on'); state.lineFilter=c.dataset.lf; renderLines();
    });
    dom.toggleAll.onclick=()=>{ const vis=visibleIdx(); const allOn=vis.every(i=>state.sel.has(i));
      vis.forEach(i=>allOn?state.sel.delete(i):state.sel.add(i)); renderLines(); };
    dom.gen.onclick=generate;
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&dom.modal.classList.contains('on')) close(); });
    return dom;
  }

  function fillTplOptions(){
    const lang=dom.lang.value;
    dom.tpl.innerHTML=T().templates.filter(x=>x.taal===lang)
      .map(x=>`<option value="${x.id}">${C().esc(x.naam)}</option>`).join('');
  }
  function curTpl(){ return T().templates.find(t=>t.id===dom.tpl.value); }

  /* ---------- regels ---------- */
  function visibleIdx(){
    return state.lines.map((o,i)=>i).filter(i=>{ const o=state.lines[i];
      if(state.lineFilter==='late') return o.late; if(state.lineFilter==='unconf') return o.unconf; return true; });
  }
  function sbadge(s){ const m={Released:'exm-rel',Confirmed:'exm-conf'}; return `<span class="exm-badge ${m[s]||'exm-other'}">${C().esc(s)}</span>`; }
  function dbadge(s){ const m={Late:'exm-late','On Time':'exm-ontime'}; return `<span class="exm-badge ${m[s]||'exm-other'}">${C().esc(s||'—')}</span>`; }
  function renderLines(){
    const core=C(), vis=visibleIdx();
    dom.lineBody.innerHTML=vis.map(i=>{ const o=state.lines[i];
      return `<tr><td><input type="checkbox" data-i="${i}" ${state.sel.has(i)?'checked':''}></td>
        <td><b>${core.esc(o.sub||'—')}</b></td><td>${core.esc(o.po||'—')}</td>
        <td>${core.esc(String(o.desc||'').split('\n')[0]).slice(0,42)}</td>
        <td>${o.qtyRec==null?'—':o.qtyRec}</td><td>${dbadge(o.dstatus)}</td><td>${sbadge(o.status)}</td>
        <td>${core.dmy(o.lwr)}</td><td>${core.dmy(o.lastConf)}</td></tr>`; }).join('');
    dom.lineBody.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.onchange=()=>{
      const i=+cb.dataset.i; cb.checked?state.sel.add(i):state.sel.delete(i); refresh(); });
    dom.count.textContent=`${state.sel.size} van ${state.lines.length} regel(s) geselecteerd`;
    refresh();
  }
  function chosen(){ return [...state.sel].sort((a,b)=>a-b).map(i=>state.lines[i]); }

  /* ---------- onderwerp + voorbeeld ---------- */
  function inferSupplier(lines){
    const c=new Map(); lines.forEach(o=>{ if(o.supplier) c.set(o.supplier,(c.get(o.supplier)||0)+1); });
    return [...c.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0])[0]||state.supplier||'';
  }
  function buildSubject(lines){
    const tpl=curTpl(), supplier=inferSupplier(lines);
    const projs=[...new Set(lines.map(o=>o.sub).filter(Boolean))];
    const pos=[...new Set(lines.map(o=>o.po).filter(Boolean))];
    const urgent=dom.urgent.checked?'URGENT - ':'';
    const reason=tpl?tpl.onderwerp_issue:'';
    if(projs.length>1) return `${urgent}Royal IHC Projects [${projs.length}] - ${supplier} - ${reason}`;
    const poSeg=pos.length>1?`[${pos.length}] PO's`:(pos[0]||'—');
    return `${urgent}${projs[0]||'—'} - ${poSeg} - ${supplier} - ${reason}`;
  }
  function fillPlaceholders(html,lines){
    const core=C(), supplier=core.esc(inferSupplier(lines)), single=lines.length===1?lines[0]:null, en=dom.lang.value==='EN';
    const poTxt=single?core.esc(single.po):(en?'the purchase orders listed below':'de onderstaande inkooporders');
    const urefTxt=single?core.esc(single.uref||'—'):(en?'see table below':'zie onderstaande tabel');
    return html
      .replace(/\[Naam leverancier\]/g,supplier).replace(/\[Supplier Name\]/g,supplier)
      .replace(/\[PO[\u2011\-]nummer\]|\[PO[\u2011\-]regel\]/g,poTxt)
      .replace(/\[PO number\]|\[PO Number\]/g,poTxt)
      .replace(/\[Design Object[\u2011\-]nummer\]/g,urefTxt).replace(/\[Design Object Number\]/g,urefTxt);
  }
  function lineTable(lines){
    const core=C();
    const head=`<tr><th>Project</th><th>PO-regel</th><th>Omschrijving</th><th>Open</th><th>Status</th><th>Gewenst</th><th>Laatst bevestigd</th></tr>`;
    const rows=lines.map(o=>`<tr><td>${core.esc(o.sub||'—')}</td><td>${core.esc(o.po||'—')}</td>
      <td>${core.esc(String(o.desc||'').split('\n')[0])}</td><td>${o.qtyRec==null?'—':o.qtyRec}</td>
      <td>${core.esc(o.status)}</td><td>${core.dmy(o.lwr)}</td><td>${core.dmy(o.lastConf)}</td></tr>`).join('');
    return `<table>${head}${rows}</table>`;
  }
  function bodyHtml(lines){
    const tpl=curTpl(); if(!tpl) return '';
    return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${fillPlaceholders(tpl.body_html,lines)}<br><br>${lineTable(lines)}</div>`;
  }
  function refresh(){
    const ch=chosen();
    dom.subject.value=ch.length?buildSubject(ch):'';
    dom.preview.innerHTML=ch.length?bodyHtml(ch):'<i>Geen regels geselecteerd.</i>';
  }

  /* ---------- .eml ---------- */
  function generate(){
    const ch=chosen(); if(!ch.length){ dom.genMsg.textContent='Selecteer minimaal één regel.'; return; }
    const supplier=inferSupplier(ch);
    saveBuyer(dom.ccTopBuyer||'', dom.cc.value.trim());
    const to=dom.to.value.trim(), cc=dom.cc.value.trim(), subject=dom.subject.value, html=bodyHtml(ch);
    const eml=[ 'X-Unsent: 1','To: '+to, cc?('Cc: '+cc):null, 'Subject: '+subject,
      'Content-Type: text/html; charset=utf-8','Content-Transfer-Encoding: 8bit','',
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>'
    ].filter(x=>x!==null).join('\r\n');
    const safe=s=>String(s||'').replace(/[^a-z0-9]+/gi,'_').slice(0,40);
    const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([eml],{type:'message/rfc822'}));
    a.href=url; a.download=`Expediting_${safe(supplier)}_${safe(curTpl().onderwerp_issue)}.eml`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    dom.genMsg.textContent=`✓ .eml met ${ch.length} regel(s) gegenereerd — open in Outlook, vul het adres aan en verstuur.`;
  }

  /* ---------- openen ---------- */
  function close(){ if(!dom) return; dom.overlay.classList.remove('on'); dom.modal.classList.remove('on'); }
  function open(opts){
    opts=opts||{}; build();
    if(!T()){ alert('templates.js niet geladen.'); return; }
    let lines=(opts.lines||[]).slice();
    if(!lines.length){ dom.warn.style.display='block'; dom.warn.textContent='Geen regels gevonden. Upload de bedrijfsbrede lijst op de Admin-pagina, of geef regels mee.'; }
    else dom.warn.style.display='none';
    state={ lines, supplier:opts.supplier||inferSupplier(lines), sel:new Set(lines.map((_,i)=>i)), lineFilter:'all' };
    const supplier=inferSupplier(lines);
    dom.title.textContent=supplier?('Aanschrijven · '+supplier):'Leverancier aanschrijven';
    const projs=[...new Set(lines.map(o=>o.sub).filter(Boolean))];
    dom.sub.textContent=lines.length?`${lines.length} open regel(s) · ${projs.length} project(en)`:'';
    // taal/template/urgent
    if(opts.lang) dom.lang.value=opts.lang; fillTplOptions();
    if(opts.templateId){ const o=[...dom.tpl.options].find(x=>x.value===opts.templateId); if(o) dom.tpl.value=opts.templateId; }
    dom.urgent.checked=!!opts.urgent;
    // cc uit adresboek
    const grp=C().aggregate(lines)[0]; const topBuyer=grp?grp.topBuyer:'';
    dom.ccTopBuyer=topBuyer; dom.ccLbl.textContent='Cc — Buyer: '+(topBuyer||'—');
    dom.cc.value=book()[topBuyer]||''; dom.to.value=opts.to||''; dom.genMsg.textContent='';
    document.querySelectorAll('.exm-chip[data-lf]').forEach(x=>x.classList.toggle('on',x.dataset.lf==='all'));
    state.lineFilter='all';
    renderLines();
    dom.overlay.classList.add('on'); dom.modal.classList.add('on');
  }

  /* ---------- lookups op de centrale dataset ---------- */
  function norm(po){ return String(po==null?'':po).trim(); }
  function orderOf(po){ return norm(po).split('-')[0]; }
  async function linesForPOs(pos){
    await ready(); if(!DATASET) return [];
    const set=new Set(pos.map(norm)), ords=new Set(pos.map(orderOf));
    const hit=DATASET.filter(o=>set.has(norm(o.po))||ords.has(orderOf(o.po)));
    return rehydrate(hit.map(o=>Object.assign({},o)));
  }
  async function openForPO(po,opts){ const l=await linesForPOs([po]); open(Object.assign({lines:l},opts||{})); }
  async function openForPOs(pos,opts){ const l=await linesForPOs(pos); open(Object.assign({lines:l},opts||{})); }
  async function openForSupplier(name,opts){
    await ready(); const l=DATASET?rehydrate(DATASET.filter(o=>o.supplier===name).map(o=>Object.assign({},o))):[];
    open(Object.assign({lines:l,supplier:name},opts||{}));
  }

  /* ---------- knop-helpers voor host-pagina's ---------- */
  function resolve(get){ // get() mag teruggeven: array van lijn-objecten, of array/één PO-string
    const v=typeof get==='function'?get():get;
    if(v==null) return Promise.resolve([]);
    const arr=Array.isArray(v)?v:[v];
    if(arr.length && typeof arr[0]==='object') return Promise.resolve(arr); // al lijn-objecten
    return linesForPOs(arr);                                                // PO-strings -> opzoeken
  }
  function makeButton(get,opts){
    opts=opts||{}; const b=document.createElement('button');
    b.className='exm-mailbtn'+(opts.small?' sm':''); b.type='button';
    b.innerHTML=(opts.icon!==false?'✉ ':'')+(opts.label||'Mail');
    b.onclick=async e=>{ e.stopPropagation(); const lines=await resolve(get); open(Object.assign({lines},opts)); };
    return b;
  }
  function attachButton(target,get,opts){ const b=makeButton(get,opts); target.appendChild(b); return b; }

  global.ExpeditingMailer = { ready, open, openForPO, openForPOs, openForSupplier, makeButton, attachButton, linesForPOs };
})(window);
