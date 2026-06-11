// ── Find the best header row (most non-empty cells in first 5 rows) ──────────
function _findHeaderRow(ws) {
  if (!ws['!ref']) return 0;
  const range = XLSX.utils.decode_range(ws['!ref']);
  let bestRow = 0, bestCount = 0;
  for (let R = range.s.r; R <= Math.min(range.s.r + 5, range.e.r); R++) {
    let count = 0;
    for (let C = range.s.c; C <= Math.min(range.s.c + 40, range.e.c); C++) {
      const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
      if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim()) count++;
    }
    if (count > bestCount) { bestCount = count; bestRow = R; }
  }
  return bestRow;
}

// ── File loading: handleFile(), checkReady() ───────────────────────────────
// ── File handling ──────────────────────────────────────────────────────────
function handleFile(evt, role) {
  const file = evt.target.files[0];
  if (!file) return;

  const dzId = role === 'moeder' ? 'dz-moeder' : 'dz-expediting';
  const fnId = role === 'moeder' ? 'fn-moeder' : 'fn-expediting';
  const dz   = document.getElementById(dzId);
  const fn   = document.getElementById(fnId);

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });

      // Moederlijst: zoek het werkblad dat 'IHC PO' in rij 1 bevat (robuust voor elk bestand)
      // Expediting : gebruik altijd het eerste werkblad (index 0)
      let sheetName;
      if (role === 'moeder') {
        sheetName = null;
        for (const name of wb.SheetNames) {
          const ws_check = wb.Sheets[name];
          const range_check = ws_check['!ref'];
          if (!range_check) continue;
          const rng = XLSX.utils.decode_range(range_check);
          // Scan first 5 rows for 'IHC PO'
          outer: for (let R = rng.s.r; R <= Math.min(rng.s.r + 4, rng.e.r); R++) {
            for (let C = rng.s.c; C <= Math.min(rng.s.c + 10, rng.e.c); C++) {
              const cell = ws_check[XLSX.utils.encode_cell({r: R, c: C})];
              if (cell && String(cell.v||'').trim().toLowerCase() === 'ihc po') {
                sheetName = name;
                break outer;
              }
            }
          }
          if (sheetName) break;
        }
        if (!sheetName) {
          setStatus(`Fout: geen werkblad gevonden met kolom "IHC PO" in "${file.name}". Beschikbare bladen: ${wb.SheetNames.join(', ')}.`, true);
          return;
        }
      } else {
        sheetName = wb.SheetNames[0];
      }

      const ws   = wb.Sheets[sheetName];
      // For expediting: headers may be in row 3 — find row with most filled cells
      const hdrRow = role === 'expediting' ? _findHeaderRow(ws) : 0;
      const rawAll = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: role === 'expediting' });
      let data;
      if (role === 'expediting' && hdrRow > 0) {
        const _seenHdrs = {};
        const hdrs = rawAll[hdrRow].map((h, i) => {
          let name = (h && String(h).trim()) || `__COL_${i}`;
          if (_seenHdrs[name]) { _seenHdrs[name]++; name = `${name}_${_seenHdrs[name]}`; }
          else _seenHdrs[name] = 1;
          return name;
        });
        data = rawAll.slice(hdrRow + 1)
          .filter(r => r.some(c => c !== null && c !== undefined && String(c).trim()))
          .map(r => { const obj = {}; hdrs.forEach((h, i) => obj[h] = r[i] ?? ''); return obj; });
        fileData[role] = { data, name: file.name, sheet: sheetName, headerRow: hdrRow, headers: hdrs };
      } else {
        data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        fileData[role] = { data, name: file.name, sheet: sheetName };
      }
      dz.classList.add('loaded');
      fn.textContent = `${file.name} — blad: "${sheetName}"`;
      if (role === 'moeder') { _lastMoederName = file.name; autoPickSubFromFilename(file.name); }
      checkReady();
    } catch(err) {
      setStatus('Fout bij lezen: ' + err.message, true);
    }
  };
  reader.readAsArrayBuffer(file);
}


// ── SharePoint URL loader ─────────────────────────────────────────────────
function toggleSP(role) {
  const cb   = document.getElementById(`sp-toggle-${role}`);
  const wrap = document.getElementById(`sp-wrap-${role}`);
  const dz   = document.getElementById(`dz-${role}`);
  wrap.classList.toggle('visible', cb.checked);
  dz.style.opacity       = cb.checked ? '0.4' : '';
  dz.style.pointerEvents = cb.checked ? 'none' : '';
}

async function loadFromSP(role) {
  const urlEl = document.getElementById(`sp-url-${role}`);
  const btn   = urlEl.nextElementSibling;
  let url = (urlEl.value || '').trim();
  if (!url) { setStatus('Vul een SharePoint URL in.', true); return; }

  // Ensure download=1 is present so SharePoint returns the raw file
  if (!url.includes('download=1') && !url.includes('?download='))
    url += (url.includes('?') ? '&' : '?') + 'download=1';

  btn.disabled = true; btn.textContent = '⏳ Laden…';
  setStatus(`SharePoint bestand ophalen (${role})…`);

  try {
    // credentials:'include' sends the browser's SharePoint login cookie
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/octet-stream, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('text/html'))
      throw new Error('SharePoint stuurde een loginpagina — open SharePoint eerst in dit browservenster en probeer opnieuw.');

    const buf  = await resp.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
    const fn   = document.getElementById(`fn-${role}`);
    const dz   = document.getElementById(`dz-${role}`);
    const name = url.split('/').pop().split('?')[0] || `${role}.xlsx`;

    let sheetName;
    if (role === 'moeder') {
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws['!ref']) continue;
        const rng = XLSX.utils.decode_range(ws['!ref']);
        outer: for (let R = rng.s.r; R <= Math.min(rng.s.r+4, rng.e.r); R++)
          for (let C = rng.s.c; C <= Math.min(rng.s.c+10, rng.e.c); C++) {
            const cell = ws[XLSX.utils.encode_cell({r:R,c:C})];
            if (cell && String(cell.v||'').trim().toLowerCase() === 'ihc po') { sheetName = sn; break outer; }
          }
        if (sheetName) break;
      }
      if (!sheetName) sheetName = wb.SheetNames[0];
    } else {
      sheetName = wb.SheetNames[0];
    }

    const ws   = wb.Sheets[sheetName];
    const hdrRow = role === 'expediting' ? _findHeaderRow(ws) : 0;
    const rawAll = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: role === 'expediting' });
    let data;
    if (role === 'expediting' && hdrRow > 0) {
      const _seenHdrs2 = {};
      const hdrs = rawAll[hdrRow].map((h, i) => {
        let name = (h && String(h).trim()) || `__COL_${i}`;
        if (_seenHdrs2[name]) { _seenHdrs2[name]++; name = `${name}_${_seenHdrs2[name]}`; }
        else _seenHdrs2[name] = 1;
        return name;
      });
      data = rawAll.slice(hdrRow + 1)
        .filter(r => r.some(c => c !== null && c !== undefined && String(c).trim()))
        .map(r => { const obj = {}; hdrs.forEach((h, i) => obj[h] = r[i] ?? ''); return obj; });
      fileData[role] = { data, name, sheet: sheetName, headerRow: hdrRow, headers: hdrs };
    } else {
      data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      fileData[role] = { data, name, sheet: sheetName };
    }
    dz.classList.add('loaded');
    fn.textContent = `${name} — blad: "${sheetName}"`;
    setStatus(`${name} geladen via SharePoint (${data.length} rijen)`);
    if (role === 'moeder') { _lastMoederName = name; autoPickSubFromFilename(name); }
    checkReady();
  } catch(err) {
    setStatus('SharePoint fout: ' + err.message, true);
  }
  btn.disabled = false; btn.textContent = '⬇ Laden';
}

function checkReady() {
  const ready = fileData.expediting && fileData.moeder;
  document.getElementById('btn-run').disabled = !ready;
  setStatus(ready
    ? 'Klaar — klik Verwerken'
    : 'Selecteer Sub Project(en) uit de bedrijfsbrede lijst en laad de moederlijst');
}

// Drag-and-drop
document.querySelectorAll('.drop-zone').forEach(dz => {
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const input = dz.querySelector('input[type=file]');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
});


// ── Expediting via centrale lijst: Sub Project ID-filter (upload op Admin) ──
// De expediting-lijst wordt niet meer hier geüpload, maar één keer op de
// Admin-pagina (ExpeditingData). Hier kiest de gebruiker welke Sub Project ID's
// uit dat bedrijfsbrede totaaloverzicht meegenomen worden.
let _centralRaw = null;          // { headers, rows } uit ExpeditingData
let _subKey     = null;          // header-naam van de Sub Project ID-kolom
let _subList    = [];            // [{ sub, count }]
const _selectedSubs = new Set(); // gekozen Sub Project ID's (blijft staan bij zoeken)
const _autoPickedSubs = new Set(); // subset: automatisch gekozen via bestandsnaam
let _lastMoederName = '';        // bestandsnaam van de laatst geladen moederlijst

async function initExpeditingFilter() {
  const statusEl = document.getElementById('exp-status');
  const pickEl   = document.getElementById('exp-pick');
  if (!statusEl || !window.ExpeditingData) return;
  let raw = null, m = null;
  try { raw = await ExpeditingData.loadRaw(); m = await ExpeditingData.meta(); } catch (e) {}
  if (!raw || !raw.rows || !raw.rows.length) {
    statusEl.innerHTML = '⚠ Geen centrale lijst geladen. Upload de bedrijfsbrede Expediten op de <a href="../Admin/">Admin-pagina</a>.';
    if (pickEl) pickEl.style.display = 'none';
    return;
  }
  _centralRaw = raw;
  // Sub Project ID-kolom: op naam, anders kolomindex 5 (kolom F)
  _subKey = raw.headers.find(h => /sub\s*project\s*id/i.test(String(h)))
         || raw.headers.find(h => /sub\s*project/i.test(String(h)))
         || raw.headers[5];
  const counts = new Map();
  raw.rows.forEach(r => { const s = String(r[_subKey] ?? '').trim(); if (s) counts.set(s, (counts.get(s) || 0) + 1); });
  _subList = [...counts.entries()].map(([sub, count]) => ({ sub, count }))
             .sort((a, b) => String(a.sub).localeCompare(String(b.sub), undefined, { numeric: true }));
  const fname = (m && m.filename) ? m.filename : 'Bedrijfsbreed Expediten';
  statusEl.innerHTML = `📋 <b>${esc(fname)}</b><br>${raw.rows.length} regels · ${_subList.length} Sub Projecten`;
  if (pickEl) pickEl.style.display = 'block';
  renderSubList();
  // moederlijst al geladen vóór de centrale lijst? Probeer dan nu te koppelen.
  if (_lastMoederName && !_selectedSubs.size) autoPickSubFromFilename(_lastMoederName);
}

function renderSubList() {
  const list = document.getElementById('exp-list');
  if (!list) return;
  const q = (document.getElementById('exp-search').value || '').toLowerCase();
  const items = _subList.filter(o => !q || String(o.sub).toLowerCase().includes(q));
  list.innerHTML = items.length
    ? items.map(o => `<label class="exp-item">`
        + `<input type="checkbox" class="exp-cb" value="${esc(o.sub)}" ${_selectedSubs.has(o.sub) ? 'checked' : ''} onchange="toggleSub(this)">`
        + `<span>${esc(o.sub)}</span><span class="exp-n">${o.count}</span></label>`).join('')
    : '<div class="exp-empty">Geen Sub Project ID gevonden</div>';
}

function toggleSub(cb) {
  if (cb.checked) _selectedSubs.add(cb.value); else _selectedSubs.delete(cb.value);
  applyExpSelection();
}

function selectAllSubs(on) {
  const q = (document.getElementById('exp-search').value || '').toLowerCase();
  _subList.filter(o => !q || String(o.sub).toLowerCase().includes(q))
          .forEach(o => { if (on) _selectedSubs.add(o.sub); else _selectedSubs.delete(o.sub); });
  renderSubList();
  applyExpSelection();
}

function applyExpSelection() {
  const sel = document.getElementById('exp-sel-count');
  const fn  = document.getElementById('fn-expediting');
  if (!_centralRaw) return;
  if (!_selectedSubs.size) {
    fileData.expediting = null;
    if (sel) sel.textContent = '0 geselecteerd';
    if (fn)  fn.textContent  = '—';
    checkReady();
    return;
  }
  const rows = _centralRaw.rows.filter(r => _selectedSubs.has(String(r[_subKey] ?? '').trim()));
  fileData.expediting = { data: rows, headers: _centralRaw.headers, name: 'Bedrijfsbreed Expediten', sheet: 'Result', headerRow: 0 };
  if (sel) sel.textContent = `${_selectedSubs.size} project(en) · ${rows.length} regels`;
  if (fn)  fn.textContent  = `${_selectedSubs.size} Sub Project(en) — ${rows.length} regels`;
  checkReady();
}

// ── Sub Project ID afleiden uit de moederlijst-bestandsnaam ────────────────
// Zoekt in de bestandsnaam naar een code die overeenkomt met een bekend
// Sub Project ID uit de centrale lijst en vinkt die automatisch aan.
function _filenameMatchesSub(fname, sub) {
  const f = String(fname).toLowerCase();
  const s = String(sub).trim().toLowerCase();
  if (!s) return false;
  const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 1) exacte code op woordgrens (01320 matcht niet binnen 010132099)
  if (new RegExp('(^|[^0-9a-z])' + escRe(s) + '([^0-9a-z]|$)', 'i').test(f)) return true;
  // 2) numeriek zonder voorloopnullen (01320 ↔ 1320, bv. "YN1320")
  const sNum = s.replace(/^0+/, '');
  if (sNum && sNum !== s &&
      new RegExp('(^|[^0-9])' + escRe(sNum) + '([^0-9]|$)').test(f)) return true;
  return false;
}

function autoPickSubFromFilename(filename) {
  if (!_centralRaw || !_subList.length) return;   // centrale lijst nog niet geladen
  const hits = _subList.map(o => o.sub).filter(sub => _filenameMatchesSub(filename, sub));
  const note = document.getElementById('exp-autopick-note');
  if (note) note.remove();
  if (!hits.length) return;                        // niets herkend: bestaande selectie ongemoeid
  // vervang de vorige auto-keuze (handmatige selecties blijven staan)
  _autoPickedSubs.forEach(s => _selectedSubs.delete(s));
  _autoPickedSubs.clear();
  hits.forEach(s => { _selectedSubs.add(s); _autoPickedSubs.add(s); });
  renderSubList();
  applyExpSelection();
  const st = document.getElementById('exp-status');
  if (st) st.insertAdjacentHTML('beforeend',
    `<div id="exp-autopick-note" style="color:var(--ihc-teal,#00B4D8);margin-top:.3rem">✓ Sub Project ${hits.map(esc).join(', ')} herkend uit bestandsnaam</div>`);
}

// init zodra alle scripts (incl. ExpeditingData) geladen zijn
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initExpeditingFilter);
else initExpeditingFilter();
