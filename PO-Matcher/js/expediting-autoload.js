// ── PO-Matcher — automatische koppeling van de bedrijfsbrede expeditinglijst ──
// Vervangt de handmatige upload. Leest de centrale lijst via de gedeelde
// datalaag (shared/expediting-data.js): eerst het gecommitte expediting-data.json,
// anders de lokaal (via Admin) opgeslagen lijst. Beheer via /Admin/.

async function autoloadExpediting() {
  const dz = document.getElementById('dz-expediting');
  const fn = document.getElementById('fn-expediting');

  if (!window.ExpeditingData) {
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
let _poSubProject = '';
let _poExpAll = [];

function _poExpRows() {
  if (!_poSubProject) return _poExpAll;
  return _poExpAll.filter(r => String(r['Sub Project ID'] ?? '').trim() === _poSubProject);
}

function _applyPOSubProject() {
  if (fileData.expediting) fileData.expediting.data = _poExpRows();
  const n = _poExpRows().length;
  const st = document.getElementById('po-sp-status');
  if (st) st.textContent = _poSubProject ? `Project ${_poSubProject}: ${n} regels` : `Alle projecten: ${n} regels`;
  // Al gematcht? Opnieuw uitvoeren met de nieuwe selectie.
  const sm = document.getElementById('st-match');
  if (sm && sm.textContent && sm.textContent !== '—' && typeof runMatcher === 'function' && fileData.moeder)
    runMatcher();
}

function _buildPOSubProjectSelector(rows) {
  const dz = document.getElementById('dz-expediting');
  if (!dz || document.getElementById('po-subproject')) return;
  const ids = [...new Set(rows.map(r => String(r['Sub Project ID'] ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));

  if (!document.getElementById('po-sp-style')) {
    const s = document.createElement('style'); s.id = 'po-sp-style';
    s.textContent =
      `.po-sp-wrap{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin:.6rem 0 0;padding:.55rem .8rem;` +
      `background:var(--navy-mid,#0F2040);border:1px solid var(--steel,#1e3a6e);border-radius:8px}` +
      `.po-sp-wrap label{display:flex;align-items:center;gap:.5rem;font-family:var(--mono,monospace);font-size:.72rem;` +
      `font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--white,#F0F4FA)}` +
      `.po-sp-wrap select{font-family:var(--mono,monospace);font-size:.8rem;padding:.35rem .5rem;border-radius:6px;` +
      `border:1px solid var(--steel,#1e3a6e);background:var(--navy,#0A1628);color:var(--white,#F0F4FA)}` +
      `.po-sp-status{font-family:var(--mono,monospace);font-size:.7rem;color:var(--teal,#00B4D8)}`;
    document.head.appendChild(s);
  }

  const wrap = document.createElement('div');
  wrap.className = 'po-sp-wrap';
  wrap.innerHTML =
    `<label>🔗 Sub Project ID
      <select id="po-subproject">
        <option value="">Alle projecten (${rows.length})</option>
        ${ids.map(id => {
          const n = rows.filter(r => String(r['Sub Project ID'] ?? '').trim() === id).length;
          return `<option value="${id}">${id} (${n})</option>`;
        }).join('')}
      </select>
    </label>
    <span class="po-sp-status" id="po-sp-status">Alle projecten: ${rows.length} regels</span>`;
  dz.parentNode.insertBefore(wrap, dz.nextSibling);
  wrap.querySelector('#po-subproject').addEventListener('change', function () {
    _poSubProject = this.value;
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
