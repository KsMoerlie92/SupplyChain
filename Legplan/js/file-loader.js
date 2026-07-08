// ── File loading: findHeaderRow, handleFile, processWorkbook, buildAllRows ──
// ── findHeaderRow ──────────────────────────────────────────────────────────
function findHeaderRow(ws) {
  const ref = ws['!ref'];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  const KNOWN_HEADERS = ['ihc po','delivery reference','collo','mark/label','item description','hs code'];
  for (let R = range.s.r; R <= Math.min(range.s.r + 60, range.e.r); R++) {
    let hits = 0;
    for (let C = range.s.c; C <= Math.min(range.s.c + 25, range.e.c); C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) continue;
      const v = String(cell.v||'').trim().toLowerCase();
      if (KNOWN_HEADERS.some(h => v.includes(h))) hits++;
    }
    if (hits >= 2) return R; // found a header row with ≥2 known column names
  }
  return 0;
}

// ── File loading ───────────────────────────────────────────────────────────
function handleFile(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  setStatus(`"${file.name}" inlezen…`);
  const dz = document.getElementById('dz-moeder');
  const fn = document.getElementById('fn-moeder');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      processWorkbook(wb, file.name, dz, fn);
    } catch(err) {
      setStatus('Fout bij lezen: ' + err.message, true);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Microsoft Authentication (MSAL) + Graph API ───────────────────────────
let _msalApp    = null;
let _msalAccount = null;

const GRAPH_SCOPES = ['Files.Read', 'Files.Read.All', 'Sites.Read.All'];

function toggleSP() {
  const cb   = document.getElementById('sp-toggle-moeder');
  const wrap = document.getElementById('sp-wrap-moeder');
  const dz   = document.getElementById('dz-moeder');
  wrap.classList.toggle('visible', cb.checked);
  dz.style.opacity       = cb.checked ? '0.4' : '';
  dz.style.pointerEvents = cb.checked ? 'none' : '';
}

function _spStatus(msg, color) {
  const el = document.getElementById('sp-signin-status');
  if (el) { el.textContent = msg; el.style.color = color || 'var(--muted)'; }
}

function _initMsal() {
  const clientId = (document.getElementById('sp-client-id')?.value || '').trim();
  if (!clientId) {
    _spStatus('⚠️ Vul eerst een Client ID in.', 'var(--amber)'); return null;
  }
  if (_msalApp && _msalApp._config?.auth?.clientId === clientId) return _msalApp;
  _msalApp = new msal.PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.href.split('?')[0].split('#')[0],
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  return _msalApp;
}

async function msalSignIn() {
  const app = _initMsal();
  if (!app) return;
  const btn = document.getElementById('btn-sp-signin');
  btn.disabled = true; btn.textContent = '⏳ Inloggen…';
  _spStatus('Popup opent — log in met je Royal IHC account…');
  try {
    await app.initialize();
    const result = await app.loginPopup({ scopes: GRAPH_SCOPES });
    _msalAccount = result.account;
    _spStatus(`✅ Ingelogd als ${result.account.username}`, 'var(--green)');
    document.getElementById('btn-sp-fetch').disabled = false;
    btn.textContent = '✓ Ingelogd';
  } catch(err) {
    _spStatus(`❌ ${err.message}`, '#ef4444');
    btn.disabled = false; btn.textContent = '🔑 Inloggen';
  }
}

// Convert a SharePoint sharing URL to Microsoft Graph driveItem content URL
function _sharingUrlToGraph(sharingUrl) {
  // base64url encode the full sharing URL with u! prefix
  const encoded = btoa(sharingUrl).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `https://graph.microsoft.com/v1.0/shares/u!${encoded}/driveItem/content`;
}

async function loadFromSP() {
  const urlEl  = document.getElementById('sp-url-moeder');
  const btn    = document.getElementById('btn-sp-fetch');
  const url    = (urlEl?.value || '').trim();
  if (!url) { setStatus('Vul een SharePoint URL in.', true); return; }
  if (!_msalApp || !_msalAccount) {
    setStatus('Log eerst in via de 🔑 Inloggen knop.', true); return;
  }
  btn.disabled = true; btn.textContent = '⏳ Laden…';
  setStatus('Toegangstoken ophalen…');
  try {
    // Silently get a fresh token
    const tokenResp = await _msalApp.acquireTokenSilent({
      scopes: GRAPH_SCOPES,
      account: _msalAccount,
    }).catch(() => _msalApp.acquireTokenPopup({ scopes: GRAPH_SCOPES }));

    const token     = tokenResp.accessToken;
    const graphUrl  = _sharingUrlToGraph(url);

    setStatus('Bestand ophalen via Microsoft Graph…');
    const resp = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Graph API: HTTP ${resp.status} — ${errText.slice(0,120)}`);
    }

    const buf  = await resp.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
    const name = url.split('/').filter(Boolean).pop().split('?')[0] || 'sharepoint.xlsx';
    const dz   = document.getElementById('dz-moeder');
    const fn   = document.getElementById('fn-moeder');
    processWorkbook(wb, name, dz, fn);
    _spStatus(`✅ ${name} geladen`, 'var(--green)');
  } catch(err) {
    setStatus('Graph fout: ' + err.message, true);
    _spStatus('❌ ' + err.message, '#ef4444');
  }
  btn.disabled = false; btn.textContent = '⬇ Bestand laden';
}

function processWorkbook(wb, filename, dz, fn) {
  // Find sheet: prefer one with IHC PO or CIPL-format data header (Delivery reference / Collo)
  const CIPL_HEADERS = ['ihc po','delivery reference','collo','mark/label','hs code'];

  // Kies het hoofd-datablad. Sla het aparte "CIPL format"-blad over (dat wordt
  // los ingelezen via _ciplWs); anders zou de CIPL-sheet — die géén Shipment-
  // kolom heeft — als databron worden gebruikt en werken de shipments niet.
  const findSheet = (skipCipl) => {
    for (const name of wb.SheetNames) {
      if (skipCipl && name.toLowerCase().includes('cipl')) continue;
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      const rng = XLSX.utils.decode_range(ws['!ref']);
      for (let R = rng.s.r; R <= Math.min(rng.s.r + 60, rng.e.r); R++) {
        let hits = 0;
        for (let C = rng.s.c; C <= Math.min(rng.s.c + 25, rng.e.c); C++) {
          const cell = ws[XLSX.utils.encode_cell({r:R,c:C})];
          if (!cell) continue;
          const v = String(cell.v||'').trim().toLowerCase();
          if (CIPL_HEADERS.some(h => v.includes(h))) hits++;
        }
        if (hits >= 2) return name;
      }
    }
    return null;
  };
  let sheetName = findSheet(true) || findSheet(false) || wb.SheetNames[0];

  const ws  = wb.Sheets[sheetName];
  const hdr = findHeaderRow(ws);
  const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, ...(hdr > 0 ? { range: hdr } : {}) });

  // Try to extract CIPL meta from the header area (rows above the data header)
  let ciplMeta = null;
  if (hdr > 5) {
    try { ciplMeta = extractCIPLMeta(ws, hdr); } catch(e) { /* ignore */ }
  }

  moederFile = {
    data,
    name: filename,
    sheet: sheetName,
    _ciplWs: wb.Sheets['CIPL format'] || null,
    ciplData: null,
    ciplMeta: ciplMeta || null
  };
  allRows = buildAllRows(data);

  dz.classList.add('loaded');
  fn.style.display = 'block';
  fn.textContent   = `${filename} — blad: "${sheetName}"`;

  setStatus(`${data.length} rijen geladen uit "${sheetName}"`);
  document.getElementById('tab-row').style.display = 'flex';
  renderLegplan();
}

// ── Extract header meta from CIPL-format sheets (rows above the data header) ─
function extractCIPLMeta(ws, hdrRow) {
  const cv = (r, c) => {
    const cell = ws[XLSX.utils.encode_cell({r: r-1, c: c-1})];
    return cell ? String(cell.v||'').trim() : '';
  };
  // Scan rows 1..hdrRow looking for known labels in col B (index 1)
  const meta = {};
  for (let r = 1; r <= hdrRow; r++) {
    const b = cv(r, 2).toLowerCase();
    const d = cv(r, 5) || cv(r, 4) || cv(r, 3); // value is typically in col D or E
    if (b.includes('number:') || b.startsWith('number')) meta.docNo = cv(r,2).replace(/number[:\s]*/i,'').trim() || d;
    if (b.includes('project')) meta.project = cv(r,2);
    if (b.includes('shipment nr')) meta.shipmentNr = d || cv(r,3);
    if (b.includes('date:') || b.match(/^date$/)) meta.date = (d||cv(r,2)).replace(/date[:\s]*/i,'').trim();
    if (b.includes('vessel name')) meta.vessel = d;
    if (b.includes('delivery terms')) meta.delivery = d;
    if (b.includes('seawaybill')) meta.seawaybill = d;
    if (b.includes('consignee') && !b.includes('notify')) {
      // Next few rows are consignee address
      const lines = [];
      for (let rr = r+1; rr <= r+6 && rr <= hdrRow; rr++) {
        const l = cv(rr, 2);
        if (l && !l.toLowerCase().includes('notify') && !l.toLowerCase().includes('number of')) lines.push(l);
      }
      meta.consignee = lines.join(', ');
    }
  }
  return meta;
}

// ── Build rows compatible with getLegplanRows ─────────────────────────────
// Maps moeder Sheet2 columns to the same field names the legplan functions expect
function buildAllRows(data) {
  if (!data.length) return [];
  const headers = Object.keys(data[0]);
  const fC = names => headers.find(h => h && names.some(n => String(h).trim().toLowerCase().includes(n)));
  const colSupplier    = fC(['name of supplier','supplier name']);
  const colMaterial    = fC(['material']);
  const colCollo       = fC(['collo']);
  const colPackaging   = fC(['type of packaging']);
  const colLength      = fC(['length']);
  const colWidth       = fC(['width']);
  const colHeight      = fC(['heigth','height']);
  const colVolume      = fC(['volume']);
  const colGrossWeight = fC(['gross weight']);
  const colNettWeight  = fC(['nett weight','net weight']);
  const colMRID        = fC(['mr id','mrid']);
  const colAL          = fC(['bl #','bl#','bill of lading']);
  const colLocation    = fC(['location']);
  const colShipment    = fC(['shipment']);
  const colContainer   = fC(['container']);
  const colReceived    = fC(['received']);
  const colPO          = headers[2];
  const colItem        = headers[3];
  const g = (row, col) => col ? (row[col] == null ? '' : String(row[col]).trim()) : '';

  return data.map(row => ({
    noMatch:       true,            // all moeder rows = "not in expediting"
    combined:      g(row,colPO) + '-' + g(row,colItem),
    xlookup:       null,
    colSupplier:   g(row,colSupplier),
    colMaterial:   g(row,colMaterial),
    colCollo:      g(row,colCollo),
    colPackaging:  g(row,colPackaging),
    colLength:     g(row,colLength),
    colWidth:      g(row,colWidth),
    colHeight:     g(row,colHeight),
    colVolume:     g(row,colVolume),
    colGrossWeight:g(row,colGrossWeight),
    colNettWeight: g(row,colNettWeight),
    colMRID:       g(row,colMRID),
    colAL:         g(row,colAL),
    colLocation:   g(row,colLocation),
    colShipment:   g(row,colShipment),
    colContainer:  g(row,colContainer),
    colZ:          g(row,colReceived),
  }));
}

