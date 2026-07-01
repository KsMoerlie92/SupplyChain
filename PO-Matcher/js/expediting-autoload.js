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
  try { raw = await ExpeditingData.loadRaw(); meta = await ExpeditingData.meta(); }
  catch (e) { console.error('Centrale expediting-lijst lezen mislukt:', e); }

  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) {
    if (fn) fn.textContent = '⚠ Geen centrale lijst — stel in via Admin';
    if (typeof setStatus === 'function')
      setStatus('Geen bedrijfsbrede expeditinglijst gevonden — upload deze in Admin.', true);
    return;
  }

  // De rijen zijn al header-gesleuteld → direct bruikbaar voor de matcher
  fileData.expediting = {
    data: raw.rows,
    headers: raw.headers,
    name: (meta && meta.filename) || 'Bedrijfsbrede expeditinglijst',
    source: meta && meta.source,
  };

  if (dz) dz.classList.add('loaded');
  const srcLbl = (meta && meta.source === 'repo') ? 'centraal' : 'lokaal';
  if (fn) fn.textContent = `🔗 ${fileData.expediting.name} (${srcLbl}) — ${raw.rows.length} rijen`;
  if (typeof setStatus === 'function')
    setStatus(`Bedrijfsbrede expeditinglijst gekoppeld (${raw.rows.length} rijen).`);
  if (typeof checkReady === 'function') checkReady();
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
