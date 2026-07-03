// ── PO-Matcher — automatische koppeling van de bedrijfsbrede expeditinglijst ──
// Vervangt de handmatige upload. Leest de centrale lijst via de gedeelde
// datalaag (shared/expediting-data.js): eerst het gecommitte expediting-data.json,
// anders de lokaal (via Admin) opgeslagen lijst. Beheer via /Admin/.

// Laadt een script en wacht tot het klaar is
function _loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('kon niet laden: ' + src));
    document.head.appendChild(s);
  });
}
// Zorgt dat de centrale datalaag beschikbaar is, ook als index.html hem niet laadt
async function _ensureDataLayer() {
  if (window.ExpeditingData) return true;
  try {
    if (!window.ExpeditingCore) await _loadScript('../shared/expediting-core.js');
    await _loadScript('../shared/expediting-data.js');
  } catch (e) { console.error('Datalaag laden mislukt:', e); }
  return !!window.ExpeditingData;
}

async function autoloadExpediting() {
  const dz = document.getElementById('dz-expediting');
  const fn = document.getElementById('fn-expediting');

  if (!(await _ensureDataLayer())) {
    if (fn) fn.textContent = '⚠ Centrale datalaag niet geladen';
    return;
  }

  let raw = null, meta = null;
  try { raw = await window.ExpeditingData.loadRaw(); meta = await window.ExpeditingData.meta(); }
  catch (e) { console.error('Centrale expediting-lijst lezen mislukt:', e); }

  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) {
    if (fn) fn.textContent = '⚠ Geen centrale lijst — stel in via Admin';
    if (typeof setStatus === 'function')
      setStatus('Geen bedrijfsbrede expeditinglijst gevonden — upload deze in Admin.', true);
    return;
  }

  // De rijen zijn al header-gesleuteld → direct bruikbaar voor de matcher
  _poExpAll = raw.rows;
  fileData.expediting = {
    data: raw.rows,
    allData: raw.rows,
    headers: raw.headers,
    name: (meta && meta.filename) || 'Bedrijfsbrede expeditinglijst',
    source: meta && meta.source,
  };

  if (dz) dz.classList.add('loaded');
  const srcLbl = (meta && meta.source === 'repo') ? 'centraal' : 'lokaal';
  if (fn) fn.textContent = `🔗 ${fileData.expediting.name} (${srcLbl}) — ${raw.rows.length} rijen`;
  if (typeof setStatus === 'function')
    setStatus(`Bedrijfsbrede expeditinglijst gekoppeld (${raw.rows.length} rijen).`);
  _buildPOSubProjectSelector(raw.rows);
  if (typeof checkReady === 'function') checkReady();
}

// ── Sub Project ID-selectie ──────────────────────────────────────────────────
// Filtert welke expediting-regels de matcher tegen de moederlijst gebruikt.
let _poSubProjects = new Set();   // meervoudige selectie; leeg = alle projecten
let _poExpAll = [];
let _poSubKey = 'Sub Project ID';

// Vindt de juiste kolomnaam, ongeacht spaties/hoofdletters/schrijfwijze
function _detectSubKey(rows, headers) {
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const hs = (headers && headers.length) ? headers : (rows[0] ? Object.keys(rows[0]) : []);
  return hs.find(h => norm(h) === 'subprojectid')
      || hs.find(h => norm(h).includes('subproject'))
      || hs.find(h => norm(h).includes('project') && norm(h).includes('id'))
      || 'Sub Project ID';
}

function _poExpRows() {
  if (_poSubProjects.size === 0) return _poExpAll;   // geen selectie = alle projecten
  return _poExpAll.filter(r => _poSubProjects.has(String(r[_poSubKey] ?? '').trim()));
}

function _applyPOSubProject() {
  if (fileData.expediting) fileData.expediting.data = _poExpRows();
  const cnt = document.getElementById('po-sp-count');
  if (cnt) cnt.textContent = _poSubProjects.size + ' geselecteerd';
  // Al gematcht? Opnieuw uitvoeren met de nieuwe selectie.
  const sm = document.getElementById('st-match');
  if (sm && sm.textContent && sm.textContent !== '—' && typeof runMatcher === 'function' && fileData.moeder)
    runMatcher();
}

function _injectPOSubStyle() {
  if (document.getElementById('po-sp-style')) return;
  const s = document.createElement('style'); s.id = 'po-sp-style';
  s.textContent =
    `.po-sp-panel{margin:.6rem 0 0;padding:1rem 1.1rem;background:var(--navy-mid,#0F2040);` +
    `border:1px solid var(--steel,#1e3a6e);border-radius:12px;font-family:var(--mono,monospace)}` +
    `.po-sp-head{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:.8rem;letter-spacing:.03em;color:var(--white,#F0F4FA)}` +
    `.po-sp-sub{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--grey,#8FA3BF);margin:.35rem 0 .8rem}` +
    `.po-sp-sub b{color:var(--white,#F0F4FA);font-weight:600}` +
    `.po-sp-search{width:100%;box-sizing:border-box;padding:.55rem .8rem;border-radius:8px;border:1px solid var(--steel,#1e3a6e);` +
    `background:var(--navy,#0A1628);color:var(--white,#F0F4FA);font-family:inherit;font-size:.8rem;outline:none}` +
    `.po-sp-search:focus{border-color:var(--teal,#00B4D8)}` +
    `.po-sp-actions{display:flex;align-items:center;gap:.5rem;margin:.7rem 0 .4rem}` +
    `.po-sp-btn{font-family:inherit;font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:.4rem .8rem;` +
    `border-radius:6px;border:1px solid var(--steel,#1e3a6e);background:transparent;color:var(--white,#F0F4FA);cursor:pointer;transition:border-color .15s,background .15s}` +
    `.po-sp-btn:hover{border-color:var(--teal,#00B4D8);background:rgba(0,180,216,.1)}` +
    `.po-sp-count{margin-left:auto;font-size:.72rem;color:var(--teal,#00B4D8)}` +
    `.po-sp-list{max-height:210px;overflow-y:auto;border:1px solid var(--steel,#1e3a6e);border-radius:8px;background:rgba(10,22,40,.4)}` +
    `.po-sp-list::-webkit-scrollbar{width:10px}.po-sp-list::-webkit-scrollbar-thumb{background:var(--steel,#1e3a6e);border-radius:5px}` +
    `.po-sp-item{display:flex;align-items:center;gap:.6rem;padding:.4rem .8rem;cursor:pointer;font-size:.76rem;color:var(--white,#F0F4FA);border-bottom:1px solid rgba(30,58,110,.25)}` +
    `.po-sp-item:hover{background:rgba(0,180,216,.07)}` +
    `.po-sp-item input{accent-color:var(--teal,#00B4D8);width:14px;height:14px;cursor:pointer}` +
    `.po-sp-item .po-sp-n{margin-left:auto;color:var(--grey,#8FA3BF);font-size:.72rem}` +
    `.po-sp-item.hidden{display:none}`;
  document.head.appendChild(s);
}

function _buildPOSubProjectSelector(rows) {
  const dz = document.getElementById('dz-expediting');
  if (!dz || document.getElementById('po-sp-panel')) return;
  _poSubKey = _detectSubKey(rows, fileData.expediting && fileData.expediting.headers);

  const counts = new Map();
  rows.forEach(r => { const id = String(r[_poSubKey] ?? '').trim(); if (id) counts.set(id, (counts.get(id) || 0) + 1); });
  const ids = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));

  _injectPOSubStyle();
  const fname = (fileData.expediting && fileData.expediting.name) || 'Bedrijfsbrede lijst';

  const panel = document.createElement('div');
  panel.className = 'po-sp-panel';
  panel.id = 'po-sp-panel';
  panel.innerHTML =
    `<div class="po-sp-head">📋 Bedrijfsbreed Expediten — selecteer Sub Project ID</div>` +
    `<div class="po-sp-sub">📄 <b>${fname}</b> — ${rows.length} regels · ${ids.length} Sub Projecten</div>` +
    `<input class="po-sp-search" id="po-sp-search" placeholder="🔍 Zoek Sub Project ID…" autocomplete="off">` +
    `<div class="po-sp-actions">` +
    `<button class="po-sp-btn" id="po-sp-all" type="button">Alles</button>` +
    `<button class="po-sp-btn" id="po-sp-none" type="button">Wis</button>` +
    `<span class="po-sp-count" id="po-sp-count">0 geselecteerd</span>` +
    `</div>` +
    `<div class="po-sp-list" id="po-sp-list">` +
    ids.map(id => `<label class="po-sp-item" data-id="${id}"><input type="checkbox" value="${id}"><span class="po-sp-id">${id}</span><span class="po-sp-n">${counts.get(id)}</span></label>`).join('') +
    `</div>`;
  dz.parentNode.insertBefore(panel, dz.nextSibling);

  panel.querySelector('#po-sp-list').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) _poSubProjects.add(e.target.value); else _poSubProjects.delete(e.target.value);
    _applyPOSubProject();
  });
  panel.querySelector('#po-sp-search').addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    panel.querySelectorAll('.po-sp-item').forEach(it =>
      it.classList.toggle('hidden', !!q && !it.dataset.id.toLowerCase().includes(q)));
  });
  panel.querySelector('#po-sp-all').addEventListener('click', () => {
    panel.querySelectorAll('.po-sp-item:not(.hidden) input').forEach(cb => { cb.checked = true; _poSubProjects.add(cb.value); });
    _applyPOSubProject();
  });
  panel.querySelector('#po-sp-none').addEventListener('click', () => {
    panel.querySelectorAll('.po-sp-item input').forEach(cb => cb.checked = false);
    _poSubProjects.clear();
    _applyPOSubProject();
  });
}

// Vervang de handmatige upload-UI door de automatische koppeling
function _setupExpeditingAutoConnect() {
  const dz = document.getElementById('dz-expediting');
  if (dz) {
    const fileInput = dz.querySelector('input[type=file]');
    if (fileInput) { fileInput.style.display = 'none'; fileInput.removeAttribute('onchange'); }
    const spWrap = document.getElementById('sp-wrap-expediting');
    if (spWrap) spWrap.style.display = 'none';
    const spToggle = document.getElementById('sp-toggle-expediting');
    if (spToggle && spToggle.closest('label')) spToggle.closest('label').style.display = 'none';
    const title = dz.querySelector('.dz-title');
    if (title) title.textContent = 'Expediting Lijst (bedrijfsbreed)';
    dz.style.cursor = 'default';
  }
  autoloadExpediting();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', _setupExpeditingAutoConnect);
else
  _setupExpeditingAutoConnect();
