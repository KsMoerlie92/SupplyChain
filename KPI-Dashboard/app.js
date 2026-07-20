// Expediting KPI Dashboard — data-driven
// Berekent KPI's per Sub Project ID uit de bedrijfsbrede expediting-lijst.
// 4 KPI's automatisch, 3 handmatig. Elke geuploade lijst = nieuw meetmoment.

let CONFIG = null, HISTORY = null, BASE_HISTORY = null, SUBPROJECTS = null, chart = null;
const LS_KEY = 'kpiHistoryOverride';
const PALETTE = ['#003366','#E8B923','#4A90C2','#2e7d32','#C62828','#7B4FA0','#F9A825'];

// Projectfilter — alleen YN/EN-scheepsprojecten (zelfde prefixes als shared/expediting-core.js).
// Lokale fallback zodat het dashboard óók filtert als expediting-core.js hier niet geladen is.
const PROJECT_PREFIXES = ['YN', 'EN'];
function keepProject(id){
  if (id === '__ALL__') return true;
  const s = String(id == null ? '' : id).trim().toUpperCase();
  return PROJECT_PREFIXES.some(p => s.startsWith(p));
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [cfg, hist, subs] = await Promise.all([
      fetch('kpi-config.json', {cache:'no-store'}).then(r=>r.json()),
      fetch('kpi-history.json', {cache:'no-store'}).then(r=>r.json()),
      fetch('subprojects.json', {cache:'no-store'}).then(r=>r.json()),
    ]);
    CONFIG = cfg; BASE_HISTORY = hist; SUBPROJECTS = subs;
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    HISTORY = stored || JSON.parse(JSON.stringify(BASE_HISTORY));
    init();
    warnIfStale();
  } catch (err) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#C62828">' +
      '<h2>Fout bij laden</h2><p>' + err.message + '</p>' +
      '<p>Draai je dit lokaal? Start <code>python -m http.server</code> zodat fetch() werkt.</p></div>';
  }
});

// Een meetmoment is "verouderd" als het berekend is met een oudere versie van
// deze app, waarin een inmiddels toegevoegde automatische KPI nog niet bestond.
// Die sleutel ontbreekt dan in de opgeslagen snapshot -> de kaart toont "—".
// Zonder de bronlijst valt dat niet te herberekenen: de lijst moet opnieuw
// geupload worden. Daarom melden we het in plaats van stil "—" te tonen.
function missingAutoKpis(mm) {
  const auto = CONFIG.kpis.filter(k => k.auto).map(k => k.id);
  const k = (mm && mm.aggregate && mm.aggregate.kpis) || {};
  return auto.filter(id => !(id in k));
}
function staleMeetmomenten() {
  return HISTORY.filter(mm => (mm.meetmoment.rows > 0) && missingAutoKpis(mm).length > 0);
}
function warnIfStale() {
  const stale = staleMeetmomenten();
  if (!stale.length) return;
  const miss = missingAutoKpis(stale[0])
    .map(id => { const k = kpiById(id); return k ? k.name : id; });
  setStatus('⚠ ' + stale.length + ' meetmoment(en) zijn berekend met een oudere versie en missen: <b>' +
    miss.join(', ') + '</b>. Deze KPI\'s tonen daarom "—". ' +
    'Upload de bijbehorende bedrijfsbrede lijst opnieuw — dat herberekent het meetmoment ' +
    '(zelfde datum = overschrijven) en vult de ontbrekende waarden aan.', 'err-msg');
}

function init() {
  document.getElementById('appTitle').textContent = CONFIG.meta.title;
  document.getElementById('appSubtitle').textContent = CONFIG.meta.subtitle;
  const ms = document.getElementById('milestones'); ms.innerHTML = '';
  (CONFIG.meta.milestones || []).forEach(m => {
    const s = document.createElement('span'); s.className='pill'; s.textContent=m; ms.appendChild(s);
  });
  buildSubprojectSelect(); buildKpiSelect(); buildMeetmomentSelect();
  document.getElementById('subprojectSelect').addEventListener('change', renderAll);
  document.getElementById('kpiSelect').addEventListener('change', renderAll);
  document.getElementById('meetmomentSelect').addEventListener('change', renderAll);

  const fileInput = document.getElementById('fileInput');
  document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleFiles(e.target.files));
  const dz = document.getElementById('dropZone');
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  document.getElementById('downloadHistoryBtn').addEventListener('click', downloadHistory);
  document.getElementById('resetBtn').addEventListener('click', resetHistory);
  renderAll();
}

function buildSubprojectSelect() {
  const sel = document.getElementById('subprojectSelect');
  const prev = sel.value; sel.innerHTML = '';
  const seen = new Set(); const list = [];
  // Alleen YN/EN-projecten in de dropdown (Bedrijfsbreed/__ALL__ blijft altijd staan)
  (SUBPROJECTS || []).forEach(sp => { if (keepProject(sp.id)) { list.push(sp); seen.add(sp.id); } });
  HISTORY.forEach(mm => Object.keys(mm.subprojects || {}).forEach(id => {
    if (!seen.has(id) && keepProject(id)) { seen.add(id);
      list.push({id, description:(mm.subprojects[id].description||''), total:mm.subprojects[id].total||0}); }
  }));
  list.forEach(sp => {
    const o = document.createElement('option'); o.value = sp.id;
    o.textContent = sp.id === '__ALL__' ? 'Bedrijfsbreed (alle projecten)'
      : sp.id + (sp.description ? ' — ' + sp.description : '') + (sp.total ? '  ('+sp.total+')' : '');
    sel.appendChild(o);
  });
  sel.value = prev && seen.has(prev) ? prev : '__ALL__';
  const st = document.getElementById('subprojectStatus');
  if (st) { const nProj = list.filter(sp => sp.id !== '__ALL__').length;
    st.textContent = nProj + ' YN/EN-project' + (nProj === 1 ? '' : 'en') + ' beschikbaar'; }
}
function buildKpiSelect() {
  const sel = document.getElementById('kpiSelect'); const prev = sel.value; sel.innerHTML = '';
  const oAll = document.createElement('option'); oAll.value='Alle'; oAll.textContent="Alle KPI's"; sel.appendChild(oAll);
  CONFIG.kpis.forEach(k => { const o=document.createElement('option'); o.value=k.id; o.textContent=k.name; sel.appendChild(o); });
  sel.value = prev || 'Alle';
}
function buildMeetmomentSelect() {
  const sel = document.getElementById('meetmomentSelect'); const prev = sel.value; sel.innerHTML = '';
  const desc = historyDesc();
  desc.forEach(mm => {
    const o = document.createElement('option'); o.value = mm.meetmoment.date;
    o.textContent = mm.meetmoment.label + (mm.meetmoment.filename ? ' · ' + shortName(mm.meetmoment.filename) : '');
    sel.appendChild(o);
  });
  const dates = desc.map(m => m.meetmoment.date);
  sel.value = (prev && dates.includes(prev)) ? prev : (dates[0] || '');
}
function shortName(n){ return n.length>28 ? n.slice(0,25)+'…' : n; }

function kpiById(id){ return CONFIG.kpis.find(k=>k.id===id); }
function historyAsc(){ return [...HISTORY].sort((a,b)=> a.meetmoment.date < b.meetmoment.date ? -1 : 1); }
function historyDesc(){ return [...HISTORY].sort((a,b)=> a.meetmoment.date > b.meetmoment.date ? -1 : 1); }
function getNode(mm, spid){ if (!mm) return null;
  if (spid === '__ALL__') return mm.aggregate || null;
  return (mm.subprojects && mm.subprojects[spid]) ? mm.subprojects[spid] : null; }
function getValue(mm, spid, kpiId){ const n = getNode(mm, spid);
  if (!n || !n.kpis) return null; const v = n.kpis[kpiId]; return (v===undefined)?null:v; }
function getStatus(kpi, value){
  if (value===null || value===undefined || value==='') return {label:'—', cls:'na'};
  if (kpi.direction==='count_only') return {label:String(value), cls:'na'};
  if (kpi.direction==='lower_better'){
    if (value<=kpi.green) return {label:'OK', cls:'ok'};
    if (value<=kpi.yellow) return {label:'Aandacht', cls:'warn'};
    return {label:'Buiten norm', cls:'bad'};
  } else {
    if (value>=kpi.green) return {label:'OK', cls:'ok'};
    if (value>=kpi.yellow) return {label:'Aandacht', cls:'warn'};
    return {label:'Buiten norm', cls:'bad'};
  }
}
function fmt(kpi, v){ if (v===null || v===undefined) return '—';
  if (kpi.unit==='#') return String(Math.round(v)); return (Math.round(v*10)/10).toString(); }
function round1(x){ return Math.round(x*10)/10; }
function mean(a){ return a.reduce((s,x)=>s+x,0)/a.length; }

function toDate(v){
  if (v instanceof Date) return isNaN(v)?null:v;
  if (typeof v === 'number'){ const d = new Date(Date.UTC(1899,11,30) + v*86400000); return isNaN(d)?null:d; }
  if (typeof v === 'string' && v.trim()!==''){ const d = new Date(v); return isNaN(d)?null:d; }
  return null;
}
function isEmpty(v){ return v===null||v===undefined||(typeof v==='string'&&v.trim()===''); }
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
// name mag een string zijn of een lijst met alternatieve kolomnamen
function findCol(headers, name){
  const names = Array.isArray(name) ? name : [name];
  for (const n of names){
    let i = headers.indexOf(n); if (i>=0) return i;
    const low = String(n).toLowerCase().trim();
    i = headers.findIndex(h => String(h).toLowerCase().trim()===low);
    if (i>=0) return i;
  }
  return -1;
}

/*  Rapportagestructuur
 *  ───────────────────
 *  Alle regels
 *    ├─ Al geleverd (Received/Arrived)      → buiten de rapportage: hier valt
 *    │                                         niets meer te expediten
 *    └─ OPEN regels  = noemer van de KPI's hieronder
 *         ├─ Niet bevestigd (≠ Confirmed)   → KPI not_confirmed_pct
 *         ├─ Administratie niet bijgewerkt  → KPI stale_admin_pct
 *         │    PO's (≥ stale_min_lines regels) waarvan álle regels bevestigd
 *         │    zijn, met identieke datums die in het verleden liggen.
 *         └─ EXPEDITEERBAAR → late_pct, avg_delay, critical_delay, not_yet_expedited
 */
function computeKpisForLines(lines, C, rules){
  if (!lines.length) return null;
  const CONF = String((rules && rules.confirmed_status) || 'Confirmed').toLowerCase();
  const DELIV = ((rules && rules.delivered_statuses) || ['Received','Arrived']).map(s=>String(s).toLowerCase());
  const MINL = (rules && rules.stale_min_lines) || 2;
  const stat = r => String(r[C.pls]||'').trim().toLowerCase();
  const isConfirmed = r => stat(r)===CONF;

  // 0. Al geleverd → 
