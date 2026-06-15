// ── Legplan tab: container nav, renderLegplan, runLegplanAI, exportLegplanPDF
// ── Multi-container state ─────────────────────────────────────────────────
let _containerPlan = [];

// ── Legplan-filters: locatie + niet-geboekt ───────────────────────────────
let _lpSelectedLocs = null;   // null = alle locaties; anders Set van geselecteerde
let _lpLocs = [];             // huidige distinct locaties (volgorde = checkbox-index)
let _activeContainerIdx = 0;

function buildContainerNav() {
  const nav = document.getElementById('lp-container-nav');
  if (!nav) return;
  if (_containerPlan.length <= 1) { nav.style.display = 'none'; return; }
  nav.style.display = 'flex';
  nav.innerHTML = `<span class="lp-cn-label">📦 Container:</span>` +
    _containerPlan.map(({placed, containerKey}, i) =>
      `<button class="lp-cn-btn${i===0?' active':''}" onclick="showContainerView(${i})">
        ${i+1} · ${CONTAINERS[containerKey].label} <span style="opacity:.65;font-size:.58rem">${placed.length} collo's</span>
      </button>`
    ).join('');
}

function showContainerView(idx) {
  _activeContainerIdx = idx;
  document.querySelectorAll('.lp-cn-btn').forEach((b,i) => b.classList.toggle('active', i===idx));
  const {placed, containerKey} = _containerPlan[idx];
  const ctEl = document.getElementById('lp-container-type');
  const n = _containerPlan.length;
  if (ctEl) {
    ctEl.textContent = CONTAINERS[containerKey].label +
      (n > 1 ? ` · ${idx+1}/${n}` : '') + ` · ${placed.length} collo's`;
    ctEl.style.background = '';
    ctEl.style.color = '';
  }
  setTimeout(() => { drawVisualization(placed, containerKey); }, 40);
  buildLegend(placed);
  buildCargoTable(placed);
  updateLegplanStats(placed, containerKey);
}

function getLegplanBaseRows() {
  const inclNRY = document.getElementById('toggle-nry')?.checked ?? false;
  return allRows.filter(r => {
    if (!r.noMatch) return false;
    const alBlank = !r.colAL || r.colAL.trim() === '';
    if (!alBlank) return false;
    const zVal  = (r.colZ||'').trim().toLowerCase();
    const isNRY = zVal === 'not received yet' || zVal === '';
    if (isNRY && !inclNRY) return false;
    return true;
  });
}

function _lpDistinctLocs(rows) {
  const s = new Set();
  rows.forEach(r => s.add(((r.colLocation||'').trim()) || '(geen locatie)'));
  return [...s].sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
}

function buildLegplanLocFilter(baseRows) {
  const list = document.getElementById('lp-loc-list');
  if (!list) return;
  _lpLocs = _lpDistinctLocs(baseRows);
  if (_lpSelectedLocs === null) _lpSelectedLocs = new Set(_lpLocs);   // standaard: alles aan
  const allChecked = _lpLocs.length > 0 && _lpLocs.every(l => _lpSelectedLocs.has(l));
  let html = `<label class="lp-loc-item lp-loc-all"><input type="checkbox" ${allChecked?'checked':''} onchange="lpSelectAllLocs(this.checked)"><b>Alle locaties</b></label>`;
  html += _lpLocs.map((l, i) =>
    `<label class="lp-loc-item"><input type="checkbox" ${_lpSelectedLocs.has(l)?'checked':''} onchange="lpToggleLoc(${i}, this.checked)">${esc(l)}</label>`
  ).join('');
  list.innerHTML = html;
}

function lpToggleLoc(idx, on) {
  const loc = _lpLocs[idx];
  if (loc === undefined) return;
  if (!_lpSelectedLocs) _lpSelectedLocs = new Set();
  if (on) _lpSelectedLocs.add(loc); else _lpSelectedLocs.delete(loc);
  renderLegplan();
}

function lpSelectAllLocs(on) {
  _lpSelectedLocs = on ? new Set(_lpLocs) : new Set();
  renderLegplan();
}

function getLegplanRows() {
  const notBooked = document.getElementById('toggle-notbooked')?.checked ?? false;
  return getLegplanBaseRows().filter(r => {
    // Locatie-filter
    if (_lpSelectedLocs) {
      const loc = ((r.colLocation||'').trim()) || '(geen locatie)';
      if (!_lpSelectedLocs.has(loc)) return false;
    }
    // Niet-geboekt: shipmentnummer ingevuld én B/L of container leeg
    if (notBooked) {
      const hasShip = (r.colShipment||'').trim() !== '';
      const noBL    = (r.colAL||'').trim() === '';
      const noCont  = (r.colContainer||'').trim() === '';
      if (!(hasShip && (noBL || noCont))) return false;
    }
    return true;
  });
}

function renderLegplan() {
  buildLegplanLocFilter(getLegplanBaseRows());
  const rows = getLegplanRows();
  const tbody = document.getElementById('legplan-tbody');
  const statsEl = document.getElementById('legplan-stats');
  if(tbody) tbody.innerHTML='';
  if(statsEl) statsEl.textContent='';
  if(!rows.length){
    if(tbody) tbody.innerHTML='<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:1.5rem">Geen regels gevonden</td></tr>';
    return;
  }
  const seenC=new Set();
  const unique=rows.filter(r=>{
    const k=(r.colCollo||r.combined||'').toLowerCase();
    if(seenC.has(k))return false;seenC.add(k);return true;
  });
  const frag=document.createDocumentFragment();
  unique.forEach((r,i)=>{
    const zVal  = (r.colZ||'').trim().toLowerCase();
    const isNRY = zVal === 'not received yet' || zVal === '';
    const badge = isNRY
      ? '<span class="badge-nry">⏳ Verwacht</span>'
      : '<span class="badge-confirmed">✓ Bevestigd</span>';
    const tr=document.createElement('tr');
    if(isNRY) tr.className='lp-row-nry';
    tr.innerHTML=`<td>${i+1}</td><td class="cell-supplier">${esc(r.colSupplier||'—')}</td>
      <td>${esc(r.colMaterial||'—')}</td><td class="cell-collo">${esc(r.colCollo||'—')}</td>
      <td>${esc(r.colPackaging||'—')}</td>
      <td style="text-align:right">${esc(r.colLength||'—')}</td>
      <td style="text-align:right">${esc(r.colWidth||'—')}</td>
      <td style="text-align:right">${esc(r.colHeight||'—')}</td>
      <td style="text-align:right">${parseFloat(r.colVolume||0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:600">${esc(r.colGrossWeight||'—')}</td>
      <td style="text-align:right">${esc(r.colNettWeight||'—')}</td>
      <td>${badge}</td>`;
    frag.appendChild(tr);
  });
  if(tbody) tbody.appendChild(frag);
  const nConfirmed = unique.filter(r=>{ const z=(r.colZ||'').trim().toLowerCase(); return z!=='not received yet'&&z!==''; }).length;
  const nExpected  = unique.length - nConfirmed;
  let totVol=0,totGross=0,totNett=0;
  unique.forEach(r=>{
    const l=parseFloat(r.colLength)||0,w=parseFloat(r.colWidth)||0,h=parseFloat(r.colHeight)||0;
    totVol+=(l>0&&w>0&&h>0)?l*w*h/1000000:(parseFloat(r.colVolume)||0);
    totGross+=parseFloat(r.colGrossWeight||0)||0;
    totNett+=parseFloat(r.colNettWeight||0)||0;
  });
  if(statsEl) statsEl.innerHTML=
    `<span>${unique.length} collo's</span>`+
    (nConfirmed ? `<span style="color:var(--green)">✓ ${nConfirmed} bevestigd</span>` : '')+
    (nExpected  ? `<span style="color:var(--amber)">⏳ ${nExpected} verwacht</span>`  : '')+
    `<span>Vol: <strong>${totVol.toFixed(2)} m³</strong></span>`+
    `<span>Bruto: <strong>${totGross.toLocaleString('nl-NL')} kg</strong></span>`+
    `<span>Netto: <strong>${totNett.toLocaleString('nl-NL')} kg</strong></span>`;
}

async function runLegplanAI() {
  const rows=getLegplanRows();
  if(!rows.length){alert('Geen legplan regels beschikbaar.');return;}
  const btn=document.getElementById('btn-legplan-ai');
  const resultEl=document.getElementById('legplan-ai-result');
  btn.disabled=true; btn.textContent='⏳ Berekenen…';

  const seenC=new Set();
  const unique=rows.filter(r=>{
    const k=(r.colCollo||r.combined||'').toLowerCase();
    if(seenC.has(k))return false;seenC.add(k);return true;
  });

  const units = expandToUnits(unique);
  let totVol=0,totKg=0,maxDim=0;
  unique.forEach(r=>{
    const l=parseFloat(r.colLength)||0,w=parseFloat(r.colWidth)||0,h=parseFloat(r.colHeight)||0;
    totVol += (l>0&&w>0&&h>0)?l*w*h/1000000:(parseFloat(r.colVolume)||0);
    totKg  += parseFloat(r.colGrossWeight||0)||0;
    [l,w,h].forEach(v=>{if(v>maxDim)maxDim=v;});
  });

  // Try every container size; pick whichever needs the fewest containers.
  // Ties are broken by smallest size (order of the array = smallest first).
  const _trials = ['20ft','40ft','40ft HC'].map(key => ({
    key, plan: packBinMulti(units, key)
  }));
  const _best = _trials.reduce((best, cur) => {
    const bPlaced = best.plan.reduce((s,c)=>s+c.placed.length, 0);
    const cPlaced = cur.plan.reduce((s,c)=>s+c.placed.length, 0);
    const bMiss = units.length - bPlaced;
    const cMiss = units.length - cPlaced;
    // Prefer: fewer unplaced items first, then fewer containers, then natural order (smaller)
    if (cMiss < bMiss) return cur;
    if (cMiss === bMiss && cur.plan.length < best.plan.length) return cur;
    return best;
  }, _trials[0]);
  const containerKey = _best.key;
  _containerPlan = _best.plan;
  _activeContainerIdx = 0;

  if(!_containerPlan.length){ btn.disabled=false; btn.textContent='🤖 Container Advies'; return; }

  // Show result panel
  resultEl.classList.add('visible');
  buildContainerNav();
  showContainerView(0);   // draws canvases, legend, cargo table, stats for container 1

  // ── Claude API advice ───────────────────────────────────────────────────
  const apiKey=document.getElementById('legplan-apikey').value.trim();
  const adviceEl=document.getElementById('lp-advice-text');
  if(!apiKey){
    if(adviceEl)adviceEl.innerHTML='<em style="color:var(--muted)">Vul een API key in voor AI-advies.</em>';
    btn.disabled=false; btn.textContent='🤖 Container Advies'; return;
  }
  if(adviceEl)adviceEl.innerHTML='<em style="color:var(--muted)">AI analyseert…</em>';
  btn.textContent='⏳ AI…';

  // Build summary across all containers for the prompt
  const allPlaced = _containerPlan.flatMap(cp => cp.placed);
  const totalUnplaced = units.filter(u => !allPlaced.find(p => p._ri===u._ri));
  const c = CONTAINERS[containerKey];
  const containerSummary = _containerPlan.map(({placed}, i) => {
    const lines = placed.map(item =>
      `  Collo ${item.colCollo||'?'}: ${item.pl.toFixed(0)}×${item.pw.toFixed(0)}×${item.ph.toFixed(0)}cm @ X${item.px.toFixed(0)}/Y${item.py.toFixed(0)} · ${item.colGrossWeight||'?'}kg`
    ).join('\n');
    return `Container ${i+1} (${CONTAINERS[placed[0]?containerKey:containerKey].label}):\n${lines}`;
  }).join('\n\n');
  const unplacedLines = totalUnplaced.map(u =>
    `  Collo ${u.colCollo||'?'}: ${u._l}×${u._w}×${u._h}cm · ${u.colGrossWeight||'?'}kg`
  ).join('\n');

  const prompt=`Logistiek expert. Beknopt legplan advies (max 200 woorden):\n\nContainertype: ${c.label} (${c.len}×${c.w}×${c.h}cm, ${c.cbm}CBM, ${c.maxKg}kg max)\nAantal containers: ${_containerPlan.length}\nTotaal collo's: ${allPlaced.length} geplaatst van ${units.length}\n\n${containerSummary}${unplacedLines?'\n\nNiet geplaatst:\n'+unplacedLines:''}\n\nFocus: laadvolgorde per container, gewichtsverdeling, aandachtspunten (hijsplan bij >5t, ADR etc.), volgorde van laden. Antwoord in het Nederlands.`;

  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    if(!resp.ok){const eb=await resp.json().catch(()=>({}));throw new Error(`HTTP ${resp.status}: ${eb?.error?.message||resp.statusText}`);}
    const data=await resp.json();
    const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
    if(adviceEl)adviceEl.innerHTML=text.split('\n').filter(l=>l.trim()).map(l=>`<p>${esc(l)}</p>`).join('');
  }catch(err){if(adviceEl)adviceEl.innerHTML=`<em style="color:var(--ihc-red)">Fout: ${esc(String(err))}</em>`;}
  btn.disabled=false; btn.textContent='🤖 Container Advies';
}


// ── PDF Export: all containers ───────────────────────────────────────────
async function exportLegplanPDF() {
  const resultEl = document.getElementById('legplan-ai-result');
  if (!resultEl || !resultEl.classList.contains('visible') || !_containerPlan.length) {
    alert('Genereer eerst een Container Advies voordat je exporteert.');
    return;
  }
  const btn = document.getElementById('btn-legplan-pdf');
  btn.disabled = true; btn.textContent = '⏳ PDF maken…';

  try {
    // Render each container to canvas and capture image data
    const containerImages = [];
    for (let i = 0; i < _containerPlan.length; i++) {
      showContainerView(i);
      await new Promise(r => setTimeout(r, 80));
      const cvS = document.getElementById('lp-canvas-side');
      const cvT = document.getElementById('lp-canvas-top');
      containerImages.push({
        idx: i,
        containerKey: _containerPlan[i].containerKey,
        placed: _containerPlan[i].placed,
        imgS: cvS ? cvS.toDataURL('image/png') : '',
        imgT: cvT ? cvT.toDataURL('image/png') : '',
      });
    }
    // Restore original view
    showContainerView(_activeContainerIdx);

    // AI advice
    const adviceHTML = document.getElementById('lp-advice-text')?.innerHTML || '';

    // Collo table from legplan rows
    const legplanRows = getLegplanRows();
    const seenC = new Set();
    const unique = legplanRows.filter(r=>{
      const k=(r.colCollo||r.combined||'').toLowerCase();
      if(seenC.has(k))return false;seenC.add(k);return true;
    });
    const colloTableRows = unique.map((r,i) => {
      const col = COLLO_COLORS[i % COLLO_COLORS.length];
      return `<tr>
        <td><span style="display:inline-block;width:12px;height:12px;background:${col};border-radius:2px;vertical-align:middle"></span></td>
        <td>${esc(r.colCollo||String(i+1))}</td>
        <td>${esc(r.colSupplier||'—')}</td>
        <td>${esc(r.colMaterial||'—')}</td>
        <td>${esc(r.colPackaging||'—')}</td>
        <td style="text-align:right">${esc(r.colLength||'—')}</td>
        <td style="text-align:right">${esc(r.colWidth||'—')}</td>
        <td style="text-align:right">${esc(r.colHeight||'—')}</td>
        <td style="text-align:right">${parseFloat(r.colVolume||0).toFixed(2)}</td>
        <td style="text-align:right">${esc(r.colGrossWeight||'—')}</td>
        <td style="text-align:right">${esc(r.colNettWeight||'—')}</td>
      </tr>`;
    }).join('');

    const now = new Date().toLocaleDateString('nl-NL', {day:'2-digit',month:'2-digit',year:'numeric'});
    const cType = CONTAINERS[containerImages[0].containerKey].label;

    // Build container sections HTML
    const containerSections = containerImages.map(({idx, containerKey, placed, imgS, imgT}) => {
      const c = CONTAINERS[containerKey];
      const totVol = placed.reduce((s,r)=>s+(r._l>0&&r._w>0&&r._h>0?r._l*r._w*r._h/1e6:parseFloat(r.colVolume||0)),0);
      const totKg  = placed.reduce((s,r)=>s+(parseFloat(r.colGrossWeight||0)||0),0);
      const usedLen= placed.length?Math.max(...placed.map(p=>p.px+p.pl)):0;
      const volP   = Math.min(100,totVol/c.cbm*100);
      const wgtP   = Math.min(100,totKg/c.maxKg*100);
      const lenP   = Math.min(100,usedLen/c.len*100);
      return `
      <div class="container-section${idx>0?' page-break':''}">
        <div class="ct-header">
          <span class="container-badge">${idx+1}/${containerImages.length} · ${c.label}</span>
          <span style="font-size:8pt;color:#666">${placed.length} collo's · Vol ${totVol.toFixed(2)} m³ / ${c.cbm} m³ (${volP.toFixed(1)}%) · ${totKg.toLocaleString('nl-NL')} kg / ${c.maxKg.toLocaleString('nl-NL')} kg (${wgtP.toFixed(1)}%)</span>
        </div>
        <div class="pdf-grid">
          <div class="view-section">
            <div class="view-label">Zijaanzicht</div>
            ${imgS?`<img class="view-img" src="${imgS}">`:''} 
          </div>
          <div class="view-section">
            <div class="view-label">Bovenaanzicht</div>
            ${imgT?`<img class="view-img" src="${imgT}">`:''} 
          </div>
        </div>
        <div class="stats-row">
          <div class="stat-box"><div class="stat-box-label">Volume</div><div class="stat-box-val">${totVol.toFixed(2)} m³</div><div class="stat-box-sub">van ${c.cbm} m³</div><div class="bar-wrap"><div style="height:100%;background:#00B4D8;border-radius:3px;width:${volP.toFixed(1)}%"></div></div></div>
          <div class="stat-box"><div class="stat-box-label">Gewicht</div><div class="stat-box-val">${totKg.toLocaleString('nl-NL')} kg</div><div class="stat-box-sub">van ${c.maxKg.toLocaleString('nl-NL')} kg</div><div class="bar-wrap"><div style="height:100%;background:#D91F2C;border-radius:3px;width:${wgtP.toFixed(1)}%"></div></div></div>
          <div class="stat-box"><div class="stat-box-label">Lengte benut</div><div class="stat-box-val">${usedLen.toFixed(0)} cm</div><div class="stat-box-sub">van ${c.len} cm</div><div class="bar-wrap"><div style="height:100%;background:#f59e0b;border-radius:3px;width:${lenP.toFixed(1)}%"></div></div></div>
        </div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Legplan — ${_containerPlan.length}× ${cType}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 16mm; }
  * { box-sizing:border-box; margin:0; padding:0; font-family: Arial, sans-serif; }
  body { background:#fff; color:#111; font-size:10pt; }
  .page-break { page-break-before: always; padding-top: 8px; }
  .pdf-header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #D91F2C; padding-bottom:8px; margin-bottom:12px; }
  .pdf-title { font-size:18pt; font-weight:800; letter-spacing:.03em; }
  .pdf-title span { color:#D91F2C; }
  .pdf-meta { font-size:8pt; color:#666; text-align:right; line-height:1.6; }
  .container-badge { display:inline-block; background:#D91F2C; color:#fff; font-size:11pt; font-weight:800; padding:3px 12px; border-radius:3px; }
  .container-section { margin-bottom:10px; }
  .ct-header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .pdf-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px; }
  .view-label { font-size:7pt; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#888; margin-bottom:4px; }
  .view-img { width:100%; border:1px solid #ccc; border-radius:3px; display:block; }
  .stats-row { display:flex; gap:10px; margin-bottom:10px; }
  .stat-box { flex:1; border:1px solid #e0e0e0; border-radius:3px; padding:6px 10px; }
  .stat-box-label { font-size:7pt; text-transform:uppercase; letter-spacing:.08em; color:#888; }
  .stat-box-val { font-size:13pt; font-weight:800; margin:2px 0; }
  .stat-box-sub { font-size:8pt; color:#555; }
  .bar-wrap { height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden; margin-top:4px; }
  .collo-section { margin-top:8px; }
  .collo-title { font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#555; margin-bottom:6px; border-bottom:1px solid #e0e0e0; padding-bottom:3px; }
  table { width:100%; border-collapse:collapse; font-size:7.5pt; }
  th { background:#f5f5f5; padding:4px 6px; text-align:left; border-bottom:1px solid #ddd; font-weight:700; font-size:7pt; text-transform:uppercase; letter-spacing:.05em; color:#555; }
  td { padding:3px 6px; border-bottom:1px solid #eee; }
  tr:nth-child(even) td { background:#fafafa; }
  .advice-section { margin-top:10px; padding:8px 12px; border:1px solid #e0e0e0; border-left:3px solid #D91F2C; border-radius:3px; font-size:8.5pt; line-height:1.6; color:#222; }
  .advice-title { font-size:8pt; font-weight:700; text-transform:uppercase; color:#D91F2C; margin-bottom:6px; }
  p { margin-bottom:4px; }
</style></head><body>
<div class="pdf-header">
  <div>
    <div class="pdf-title">Royal <span>IHC</span> — Legplan</div>
    <div style="margin-top:6px">${_containerPlan.length > 1 ? `<span class="container-badge">${_containerPlan.length}× ${cType}</span>` : `<span class="container-badge">${cType}</span>`}</div>
  </div>
  <div class="pdf-meta">
    Totaal collo's: ${containerImages.reduce((s,c)=>s+c.placed.length,0)} geplaatst · ${unique.length} in legplan<br>
    Gegenereerd: ${now}
  </div>
</div>

${containerSections}

<div class="collo-section">
  <div class="collo-title">Collo overzicht</div>
  <table>
    <thead><tr><th></th><th>Collo #</th><th>Leverancier</th><th>Materiaal</th><th>Type verpakking</th>
      <th style="text-align:right">L cm</th><th style="text-align:right">B cm</th><th style="text-align:right">H cm</th>
      <th style="text-align:right">Vol m³</th><th style="text-align:right">Bruto kg</th><th style="text-align:right">Netto kg</th>
    </tr></thead>
    <tbody>${colloTableRows}</tbody>
  </table>
</div>

${adviceHTML ? `<div class="advice-section"><div class="advice-title">🤖 AI Advies</div>${adviceHTML}</div>` : ''}

</body></html>`;

    const w = window.open('','_blank');
    if(!w){ alert('Pop-up geblokkeerd — sta pop-ups toe voor deze pagina.'); btn.disabled=false; btn.textContent='⬇ PDF Export'; return; }
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{ w.focus(); w.print(); }, 400);
  } catch(err) {
    alert('PDF fout: ' + err.message);
  }
  btn.disabled=false; btn.textContent='⬇ PDF Export';
}



