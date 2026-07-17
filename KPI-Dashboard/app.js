// Expediting KPI Dashboard — data-driven
// Berekent KPI's per Sub Project ID uit de bedrijfsbrede expediting-lijst.
// 4 KPI's automatisch, 3 handmatig. Elke geuploade lijst = nieuw meetmoment.

let CONFIG = null, HISTORY = null, BASE_HISTORY = null, SUBPROJECTS = null, chart = null;
const LS_KEY = 'kpiHistoryOverride';
const PALETTE = ['#003366','#E8B923','#4A90C2','#2e7d32','#C62828','#7B4FA0','#F9A825'];

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
  document.getElementById('appTitle').textContent    = CONFIG.meta.title;
  document.getElementById('appSubtitle').textContent = CONFIG.meta.subtitle;
  const ms = document.getElementById('milestones'); ms.innerHTML = '';
  (CONFIG.meta.milestones || []).forEach(m => {
    const s = document.createElement('span'); s.className = 'pill'; s.textContent = m; ms.appendChild(s);
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
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  document.getElementById('downloadHistoryBtn').addEventListener('click', downloadHistory);
  document.getElementById('resetBtn').addEventListener('click', resetHistory);
  renderAll();
}

function buildSubprojectSelect() {
  const sel = document.getElementById('subprojectSelect');
  const prev = sel.value; sel.innerHTML = '';
  const seen = new Set(); const list = [];
  (SUBPROJECTS || []).forEach(sp => { list.push(sp); seen.add(sp.id); });
  HISTORY.forEach(mm => Object.keys(mm.subprojects || {}).forEach(id => {
    if (!seen.has(id)) {
      seen.add(id);
      list.push({ id, description: (mm.subprojects[id].description || ''), total: mm.subprojects[id].total || 0 });
    }
  }));
  list.forEach(sp => {
    const o = document.createElement('option'); o.value = sp.id;
    o.textContent = sp.id === '__ALL__' ? 'Bedrijfsbreed (alle projecten)'
      : sp.id + (sp.description ? ' — ' + sp.description : '') + (sp.total ? '  (' + sp.total + ')' : '');
    sel.appendChild(o);
  });
  sel.value = prev && seen.has(prev) ? prev : '__ALL__';
}
function buildKpiSelect() {
  const sel = document.getElementById('kpiSelect'); const prev = sel.value; sel.innerHTML = '';
  const oAll = document.createElement('option'); oAll.value = 'Alle'; oAll.textContent = "Alle KPI's"; sel.appendChild(oAll);
  CONFIG.kpis.forEach(k => {
    const o = document.createElement('option'); o.value = k.id; o.textContent = k.name; sel.appendChild(o);
  });
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
function shortName(n) { return n.length > 28 ? n.slice(0, 25) + '…' : n; }

function kpiById(id)   { return CONFIG.kpis.find(k => k.id === id); }
function historyAsc()  { return [...HISTORY].sort((a, b) => a.meetmoment.date < b.meetmoment.date ? -1 : 1); }
function historyDesc() { return [...HISTORY].sort((a, b) => a.meetmoment.date > b.meetmoment.date ? -1 : 1); }
function getNode(mm, spid) {
  if (!mm) return null;
  if (spid === '__ALL__') return mm.aggregate || null;
  return (mm.subprojects && mm.subprojects[spid]) ? mm.subprojects[spid] : null;
}
function getValue(mm, spid, kpiId) {
  const n = getNode(mm, spid);
  if (!n || !n.kpis) return null;
  const v = n.kpis[kpiId]; return (v === undefined) ? null : v;
}
function getStatus(kpi, value) {
  if (value === null || value === undefined || value === '') return { label: '—', cls: 'na' };
  if (kpi.direction === 'count_only') return { label: String(value), cls: 'na' };
  if (kpi.direction === 'lower_better') {
    if (value <= kpi.green)  return { label: 'OK',          cls: 'ok'   };
    if (value <= kpi.yellow) return { label: 'Aandacht',    cls: 'warn' };
    return                          { label: 'Buiten norm', cls: 'bad'  };
  } else {
    if (value >= kpi.green)  return { label: 'OK',          cls: 'ok'   };
    if (value >= kpi.yellow) return { label: 'Aandacht',    cls: 'warn' };
    return                          { label: 'Buiten norm', cls: 'bad'  };
  }
}
function fmt(kpi, v) {
  if (v === null || v === undefined) return '—';
  if (kpi.unit === '#') return String(Math.round(v));
  return (Math.round(v * 10) / 10).toString();
}
function round1(x) { return Math.round(x * 10) / 10; }
function mean(a)   { return a.reduce((s, x) => s + x, 0) / a.length; }

function toDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return isNaN(d) ? null : d; }
  if (typeof v === 'string' && v.trim() !== '') { const d = new Date(v); return isNaN(d) ? null : d; }
  return null;
}
function isEmpty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// name mag een string zijn of een lijst met alternatieve kolomnamen
function findCol(headers, name) {
  const names = Array.isArray(name) ? name : [name];
  for (const n of names) {
    let i = headers.indexOf(n); if (i >= 0) return i;
    const low = String(n).toLowerCase().trim();
    i = headers.findIndex(h => String(h).toLowerCase().trim() === low);
    if (i >= 0) return i;
  }
  return -1;
}

/*  Rapportagestructuur
 *  ───────────────────
 *  Alle regels
 *    ├─ Al geleverd (Received/Arrived)      → buiten de rapportage: hier valt
 *    │                                         niets meer te expediten
 *    └─ OPEN regels  = noemer van de KPI's hieronder
 *         ├─ Bevestigd (= Confirmed)        → KPI not_confirmed_pct (% bevestigd, higher_better)
 *         ├─ Administratie niet bijgewerkt  → KPI stale_admin_pct
 *         │    PO's (≥ stale_min_lines regels) waarvan álle regels bevestigd
 *         │    zijn, met identieke datums die in het verleden liggen.
 *         └─ EXPEDITEERBAAR → late_pct, avg_delay, critical_delay, not_yet_expedited
 */
function computeKpisForLines(lines, C, rules) {
  if (!lines.length) return null;
  const CONF  = String((rules && rules.confirmed_status) || 'Confirmed').toLowerCase();
  const DELIV = ((rules && rules.delivered_statuses) || ['Received', 'Arrived']).map(s => String(s).toLowerCase());
  const MINL  = (rules && rules.stale_min_lines) || 2;
  const stat        = r => String(r[C.pls] || '').trim().toLowerCase();
  const isConfirmed = r => stat(r) === CONF;

  // 0. Al geleverd → buiten de rapportage (anders tellen ze als 'niet bevestigd')
  const geleverd = lines.filter(r =>  DELIV.includes(stat(r)));
  const open     = lines.filter(r => !DELIV.includes(stat(r)));
  const total    = open.length;

  if (!total) return {
    late_pct: null, avg_delay: null, critical_delay: null, not_yet_expedited: null,
    not_confirmed_pct: null, stale_admin_pct: null,
    schedule_adherence: null, field_visits: null, ncr: null,
    _counts: { totaal: lines.length, geleverd: geleverd.length, open: 0,
               expediteerbaar: 0, bevestigd: 0, niet_bevestigd: 0, admin_open: 0 }
  };

  // 1. Bevestigd / niet bevestigd
  const confirmed    = open.filter(r =>  isConfirmed(r));   // ← telt mee als KPI-waarde
  const notConfirmed = open.filter(r => !isConfirmed(r));   // ← bewaard voor _counts / badge

  // 2. PO's met alles bevestigd, identieke datums, in het verleden.
  //    Minimaal MINL regels: bij één regel is 'alle datums identiek' triviaal waar.
  const today = startOfToday();
  const byPo  = {};
  for (const r of open) {
    const po = String((C.po >= 0 ? r[C.po] : '') || '').trim();
    if (!po) continue;
    (byPo[po] = byPo[po] || []).push(r);
  }
  const stale = new Set();
  if (C.po >= 0) {
    for (const po in byPo) {
      const grp = byPo[po];
      if (grp.length < MINL)          continue;   // te weinig regels om te vergelijken
      if (!grp.every(isConfirmed))    continue;
      const ds = grp.map(r => toDate(r[C.stale])).filter(Boolean);
      if (ds.length !== grp.length)   continue;   // niet elke regel heeft een datum
      const t0 = ds[0].getTime();
      if (!ds.every(d => d.getTime() === t0)) continue;   // datums niet identiek
      if (ds[0] >= today)             continue;   // niet in het verleden
      grp.forEach(r => stale.add(r));
    }
  }

  // 3. Wat overblijft is expediteerbaar
  const expediteerbaar = open.filter(r => isConfirmed(r) && !stale.has(r));
  const n = expediteerbaar.length;

  let late = 0; const delays = []; let nye = 0;
  for (const r of expediteerbaar) {
    if (String(r[C.ds] || '').toLowerCase() === 'late') late++;
    const w = toDate(r[C.wanted]); const p = toDate(r[C.planned]);
    if (w && p) delays.push(Math.round((p - w) / 86400000));
    if (isEmpty(r[C.lastexp])) nye++;
  }
  const pos  = delays.filter(d => d > 0);
  const crit = delays.filter(d => d > 30).length;

  return {
    late_pct:           n      ? round1(100 * late / n)           : null,
    avg_delay:          pos.length ? round1(mean(pos))             : null,
    critical_delay:     n      ? round1(100 * crit / n)           : null,
    not_yet_expedited:  n      ? round1(100 * nye  / n)           : null,
    not_confirmed_pct:           round1(100 * confirmed.length / total),  // % bevestigd (higher_better)
    stale_admin_pct:             round1(100 * stale.size / total),
    schedule_adherence: null, field_visits: null, ncr: null,
    _counts: {
      totaal:         lines.length,
      geleverd:       geleverd.length,
      open:           total,
      expediteerbaar: n,
      bevestigd:      confirmed.length,
      niet_bevestigd: notConfirmed.length,
      admin_open:     stale.size,
    },
  };
}

function computeSnapshot(headers, rows, meta) {
  const cols  = CONFIG.columns;
  const rules = CONFIG.rules || {};
  const C = {
    sp:      findCol(headers, cols.sub_project_id),
    spdesc:  findCol(headers, cols.sub_project_description),
    po:      findCol(headers, cols.po_number),
    pls:     findCol(headers, cols.po_line_status),
    ds:      findCol(headers, cols.delivery_status),
    wanted:  findCol(headers, cols.latest_wanted_receipt_date),
    planned: findCol(headers, cols.planned_delivery_date),
    lastexp: findCol(headers, cols.last_expedited),
  };
  // kolom waarop de 'administratie niet bijgewerkt'-check draait
  C.stale = C[(rules.stale_date_column === 'latest_wanted_receipt_date') ? 'wanted' : 'planned'];

  if (C.sp < 0) throw new Error("Kolom 'Sub Project ID' niet gevonden in het bestand.");
  const warn = [];
  if (C.po  < 0) warn.push("PO-nummerkolom niet gevonden — 'Administratie niet bijgewerkt' kan niet berekend worden.");
  if (C.pls < 0) warn.push("Kolom 'PO Line Status' niet gevonden — alle regels tellen als niet-bevestigd.");

  const groups = {}; const descMap = {};
  for (const r of rows) {
    const sp = String((r[C.sp] !== undefined ? r[C.sp] : '') || '').trim();
    if (!sp) continue;
    (groups[sp] = groups[sp] || []).push(r);
    if (!(sp in descMap)) descMap[sp] = String((r[C.spdesc] !== undefined ? r[C.spdesc] : '') || '').trim();
  }

  const subprojects = {}; let allLines = [];
  for (const sp in groups) {
    subprojects[sp] = {
      description: descMap[sp] || '',
      total:       groups[sp].length,
      kpis:        computeKpisForLines(groups[sp], C, rules),
    };
    allLines = allLines.concat(groups[sp]);
  }
  const aggregate = { total: allLines.length, kpis: computeKpisForLines(allLines, C, rules) };

  let date = null;
  const fn = (meta && meta.filename) || '';
  const m  = fn.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) date = m[3] + '-' + m[2] + '-' + m[1];
  if (!date) date = new Date().toISOString().slice(0, 10);

  return {
    meetmoment: { label: date, date, filename: fn || '(handmatige upload)', rows: rows.length, warnings: warn },
    aggregate,
    subprojects,
  };
}

function setStatus(msg, cls) {
  document.getElementById('uploadStatus').innerHTML =
    '<span class="' + (cls || 'info-msg') + '">' + msg + '</span>';
}

function handleFiles(list) {
  if (!list || !list.length) return;
  const file = list[0]; const name = file.name.toLowerCase();
  setStatus('Bezig met verwerken van ' + file.name + ' …', 'info-msg');

  if (name.endsWith('.json')) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (!obj.headers || !obj.rows) throw new Error("JSON mist 'headers' of 'rows'.");
        addMeetmoment(computeSnapshot(obj.headers, obj.rows, obj.meta || { filename: file.name }));
      } catch (err) { setStatus('Fout: ' + err.message, 'err-msg'); }
    };
    rd.onerror = () => setStatus('Kon bestand niet lezen.', 'err-msg');
    rd.readAsText(file);

  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb  = XLSX.read(new Uint8Array(rd.result), { type: 'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        if (!aoa.length) throw new Error('Leeg werkblad.');
        const headers = aoa[0].map(h => String(h).trim());
        const rows    = aoa.slice(1);
        addMeetmoment(computeSnapshot(headers, rows, { filename: file.name }));
      } catch (err) { setStatus('Fout: ' + err.message, 'err-msg'); }
    };
    rd.onerror = () => setStatus('Kon bestand niet lezen.', 'err-msg');
    rd.readAsArrayBuffer(file);

  } else {
    setStatus('Niet-ondersteund bestandstype. Gebruik .xlsx of .json.', 'err-msg');
  }
}

function addMeetmoment(snap) {
  HISTORY = HISTORY.filter(mm => mm.meetmoment.date !== snap.meetmoment.date);
  HISTORY.push(snap);
  localStorage.setItem(LS_KEY, JSON.stringify(HISTORY));
  buildSubprojectSelect(); buildMeetmomentSelect();
  document.getElementById('meetmomentSelect').value = snap.meetmoment.date;
  renderAll();
  const nSub = Object.keys(snap.subprojects).length;
  const warn = (snap.meetmoment.warnings || []);
  setStatus(
    '✓ Meetmoment ' + snap.meetmoment.label + ' toegevoegd — ' + nSub +
    ' Sub Project ID\'s, ' + snap.meetmoment.rows + ' regels. Vergeet niet te downloaden en te committen.' +
    (warn.length ? '<br><span class="err-msg">⚠ ' + warn.join(' ') + '</span>' : ''),
    'ok-msg'
  );
}

function downloadHistory() {
  const blob = new Blob([JSON.stringify(HISTORY, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'kpi-history.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus('kpi-history.json gedownload. Commit dit in je GitHub-repo om het voor iedereen te tonen.', 'info-msg');
}

function resetHistory() {
  localStorage.removeItem(LS_KEY);
  HISTORY = JSON.parse(JSON.stringify(BASE_HISTORY));
  buildSubprojectSelect(); buildMeetmomentSelect(); renderAll();
  setStatus('Teruggezet naar origineel meetmoment.', 'info-msg');
}

function currentMM() {
  const d = document.getElementById('meetmomentSelect').value;
  return HISTORY.find(mm => mm.meetmoment.date === d) || historyDesc()[0] || null;
}
function renderAll() { const mm = currentMM(); renderBadge(mm); renderCards(mm); renderChart(); renderTable(); }

function renderBadge(mm) {
  const el   = document.getElementById('meetmomentBadge');
  const spid = document.getElementById('subprojectSelect').value;
  if (!mm) { el.textContent = ''; return; }
  const node  = getNode(mm, spid);
  const scope = spid === '__ALL__' ? 'Bedrijfsbreed' : spid;
  const tot   = node ? node.total : 0;

  let txt = 'Meetmoment: ' + mm.meetmoment.label +
    ' · bron: '   + (mm.meetmoment.filename || '—') +
    ' · scope: '  + scope + ' (' + tot + ' regels)';

  const c = node && node.kpis && node.kpis._counts;
  if (c) txt +=
    ' → '  + c.geleverd        + ' geleverd'          +
    ' · '  + c.open            + ' open: '            +
    c.bevestigd      + ' bevestigd · '                 +
    c.niet_bevestigd + ' niet bevestigd · '            +
    c.expediteerbaar + ' expediteerbaar · '            +
    c.admin_open     + ' admin niet bijgewerkt';

  el.textContent = txt;
}

function renderCards(mm) {
  const spid   = document.getElementById('subprojectSelect').value;
  const kpiSel = document.getElementById('kpiSelect').value;
  const wrap   = document.getElementById('kpiCards'); wrap.innerHTML = '';

  CONFIG.kpis.forEach(kpi => {
    const value = getValue(mm, spid, kpi.id);
    const st    = getStatus(kpi, value);
    const node  = getNode(mm, spid);

    // onderscheid: nooit berekend (oude snapshot) vs. wel berekend maar leeg
    const nietBerekend = kpi.auto && value === null && node && node.kpis && !(kpi.id in node.kpis);
    const card = document.createElement('div');
    card.className = 'card ' + st.cls + (kpi.id === kpiSel ? ' active' : '');
    card.title = nietBerekend
      ? 'Niet berekend in dit meetmoment (oudere versie) — upload de lijst opnieuw.'
      : kpi.definition;

    const autoTag = kpi.auto
      ? '<span class="card-auto auto">automatisch</span>'
      : '<span class="card-auto manual">handmatig</span>';

    card.innerHTML =
      '<div class="card-head">' +
        '<span class="card-name">' + kpi.name + '</span>' +
        '<span class="status-dot ' + st.cls + '"></span>' +
      '</div>' +
      '<div class="card-value">' + fmt(kpi, value) +
        '<span class="unit">' + (kpi.unit === '#' ? '' : ' ' + kpi.unit) + '</span>' +
      '</div>' +
      '<div class="card-norm">Norm: ' + kpi.norm + '</div>' +
      autoTag +
      '<div class="card-def">' + (nietBerekend
        ? '<span style="color:var(--bad)">⚠ Niet berekend in dit meetmoment — upload de lijst opnieuw.</span>'
        : kpi.definition) +
      '</div>';

    card.addEventListener('click', () => {
      if (kpi.auto) { document.getElementById('kpiSelect').value = kpi.id; renderAll(); }
      else          { editManual(kpi.id); }
    });
    wrap.appendChild(card);
  });
}

function editManual(kpiId) {
  const mm   = currentMM();
  const spid = document.getElementById('subprojectSelect').value;
  const kpi  = kpiById(kpiId);
  if (!mm) return;
  let node = getNode(mm, spid);
  if (!node) {
    alert('Geen data-node voor deze scope in dit meetmoment. Kies een Sub Project ID dat voorkomt of Bedrijfsbreed.');
    return;
  }
  if (!node.kpis) node.kpis = {};
  const cur = (node.kpis[kpiId] !== null && node.kpis[kpiId] !== undefined) ? node.kpis[kpiId] : '';
  const inp = prompt(
    'Waarde voor "' + kpi.name + '" op meetmoment ' + mm.meetmoment.label +
    ' (' + (spid === '__ALL__' ? 'bedrijfsbreed' : spid) + ')\nLaat leeg om te wissen:',
    cur
  );
  if (inp === null) return;
  if (inp.trim() === '') { node.kpis[kpiId] = null; }
  else { const num = parseFloat(inp.replace(',', '.')); node.kpis[kpiId] = isNaN(num) ? null : num; }
  localStorage.setItem(LS_KEY, JSON.stringify(HISTORY));
  renderAll();
  setStatus('Handmatige KPI "' + kpi.name + '" bijgewerkt. Vergeet niet te downloaden + committen.', 'info-msg');
}

function renderChart() {
  const spid   = document.getElementById('subprojectSelect').value;
  const kpiSel = document.getElementById('kpiSelect').value;
  const note   = document.getElementById('chartNote');
  const ctx    = document.getElementById('trendChart').getContext('2d');
  if (chart) { chart.destroy(); chart = null; }

  const asc    = historyAsc();
  const labels = asc.map(mm => mm.meetmoment.label);
  let datasets = []; let type = 'line'; let yTitle = '';

  if (kpiSel !== 'Alle') {
    const kpi = kpiById(kpiSel);
    type   = (kpi.direction === 'count_only') ? 'bar' : 'line';
    yTitle = kpi.unit;
    const vals = asc.map(mm => getValue(mm, spid, kpi.id));
    datasets.push(makeDataset(kpi.name, vals, PALETTE[0], type));
    if (kpi.direction !== 'count_only') {
      datasets.push(thresholdLine('Groen-grens (' + kpi.green  + ')', kpi.green,  labels.length, '#2e7d32'));
      datasets.push(thresholdLine('Geel-grens ('  + kpi.yellow + ')', kpi.yellow, labels.length, '#8a6d00'));
    }
    note.textContent = kpi.name + ' — norm ' + kpi.norm + ' · scope: ' +
      (spid === '__ALL__' ? 'bedrijfsbreed' : spid) +
      (asc.length < 2 ? ' · (upload meer lijsten voor een trend)' : '');
  } else {
    type = 'line';
    CONFIG.kpis.forEach((kpi, idx) => {
      const vals = asc.map(mm => getValue(mm, spid, kpi.id));
      if (vals.some(v => v !== null && v !== undefined))
        datasets.push(makeDataset(kpi.name, vals, PALETTE[idx % PALETTE.length], 'line'));
    });
    note.textContent = "Alle KPI's — let op: eenheden verschillen (%, dagen, #). Scope: " +
      (spid === '__ALL__' ? 'bedrijfsbreed' : spid);
  }

  chart = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, title: { display: !!yTitle, text: yTitle } } },
    },
  });
}

function makeDataset(label, data, color, type) {
  const base = {
    label,
    data: (data || []).map(v => (v === null || v === undefined) ? null : v),
    borderColor:     color,
    backgroundColor: type === 'bar' ? color : hexAlpha(color, 0.15),
    borderWidth:     2,
    spanGaps:        true,
  };
  if (type === 'line') {
    base.tension = 0.3; base.pointRadius = 4;
    base.pointBackgroundColor = color; base.fill = false;
  }
  return base;
}
function thresholdLine(label, value, n, color) {
  return {
    label, data: new Array(n).fill(value),
    borderColor: color, borderDash: [6, 4],
    borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0,
  };
}
function hexAlpha(hex, a) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function renderTable() {
  const spid  = document.getElementById('subprojectSelect').value;
  const table = document.getElementById('detailsTable'); table.innerHTML = '';
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const hr    = document.createElement('tr'); hr.appendChild(th('Meetmoment'));
  CONFIG.kpis.forEach(k => hr.appendChild(th(k.name)));
  thead.appendChild(hr);
  historyDesc().forEach(mm => {
    const tr = document.createElement('tr'); tr.appendChild(td(mm.meetmoment.label, 'name'));
    CONFIG.kpis.forEach(kpi => {
      const v  = getValue(mm, spid, kpi.id);
      const st = getStatus(kpi, v);
      tr.appendChild(td(fmt(kpi, v), st.cls));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(thead); table.appendChild(tbody);
}
function th(text) { const e = document.createElement('th'); e.textContent = text; return e; }
function td(text, cls) {
  const e = document.createElement('td'); e.textContent = text;
  if (cls && cls !== 'name') e.className = cls;
  return e;
}
