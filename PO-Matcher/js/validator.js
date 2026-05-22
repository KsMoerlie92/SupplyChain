// ── Itemlijst Validator ───────────────────────────────────────────────────
// Validates supplier-filled Itemlijst Excel against Royal IHC rules.
// Writes back IHC-fillable fields and exports corrected file.

// ── Master validation lists (from Itemlijst Master tab) ───────────────────
const VL_UOM  = new Set(['Piece(s)','Bucket(s)','Meter','Set(s)','Kilogram']);
const VL_PKG  = new Set(['Pallet','Case','Crate','Carton','Skid','Loose','Reel','Bundle','Bag']);
const VL_INSP = new Set(["Foto's en Steekproef","Foto's","Fysiek Controleren","TBD","Geen controle","Volledige controle"]);
// 250 ISO-2 country codes (abbreviated — full set checked at runtime from file)
const VL_COO_FALLBACK = new Set(['NL','DE','FR','GB','US','CN','JP','KR','IT','ES','VN','IN','SG','AE','BE','SE','FI','NO','DK','PL','CZ','HU','RO','PT','AT','CH','TR','RU','UA','BY']);

// ── Column index map (0-based, row 2 = headers) ───────────────────────────
const COL = {
  A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9,
  K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,
  U:20,V:21,W:22,X:23,Y:24,Z:25,AA:26
};

// State
let _valRows     = [];   // parsed data rows [{cells:[], errors:{}, warnings:{}}]
let _valHeaders  = [];   // header row (row index 1 in file)
let _valOwners   = [];   // owner row (row index 0 in file)
let _valCOO      = new Set(); // country codes from Master tab
let _usdRate     = null; // cached EUR/USD rate
let _valWb       = null; // original workbook for write-back

// ── parseHColumn: parse Mark/Label multi-value notation ────────────────────
function parseHColumn(value) {
  if (!value || !String(value).trim()) return [];
  const s = String(value).trim();

  // Rule 1: ÷ range  "23205-520V001 ÷ V007"
  if (s.includes('÷')) {
    const [left, right] = s.split('÷').map(p => p.trim());
    const m = right.match(/^([A-Za-z]+)(\d+)$/);
    if (m) {
      const letter = m[1], endNum = parseInt(m[2]), pad = m[2].length;
      const idx = left.lastIndexOf(letter);
      if (idx >= 0) {
        const prefix = left.slice(0, idx);
        const startNum = parseInt(left.slice(idx + letter.length));
        return Array.from({length: endNum - startNum + 1}, (_, i) =>
          `${prefix}${letter}${String(startNum + i).padStart(pad, '0')}`);
      }
    }
    return [left, right];
  }

  // Rules 2-5: split on , & /  then apply prefix-sharing for tokens starting with -
  const tokens = s.split(/\s*[,&/]\s*/);
  const results = [];
  let prevRoot = '';
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    if (t.startsWith('-')) {
      results.push(prevRoot + t);
    } else {
      results.push(t);
      const di = t.indexOf('-');
      prevRoot = di >= 0 ? t.slice(0, di) : t;
    }
  }
  return results;
}

// ── USD→EUR rate via Frankfurter API ─────────────────────────────────────
async function fetchUSDRate() {
  if (_usdRate) return _usdRate;
  try {
    const r = await fetch('https://api.frankfurter.dev/v2/rate/USD/EUR');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    _usdRate = d.rate;
    return _usdRate;
  } catch(e) {
    setStatus('Valutakoers ophalen mislukt — EUR/USD niet beschikbaar', true);
    return null;
  }
}

// ── Determine if column P is in USD ───────────────────────────────────────
function isUSD(header) {
  return /usd/i.test(String(header || ''));
}

// ── Validate a single data row ────────────────────────────────────────────
async function validateRow(cells, isUSDPrice, usdRate, coo, expeditingData) {
  const errors   = {};  // col letter → error message
  const warnings = {};  // col letter → warning message
  const computed = {};  // col letter → computed value to write back

  const v  = (col) => cells[COL[col]];
  const vs = (col) => String(v(col) ?? '').trim();
  const vn = (col) => { const n = parseFloat(String(v(col)||'').replace(',','.')); return isNaN(n) ? null : n; };

  // ── C: IHC PO — required, not empty ──────────────────────────────────────
  if (!vs('C')) errors['C'] = 'IHC PO is verplicht';

  // ── D: Item — must contain '-', else look up H in Expediting Kol M ───────
  const dVal = vs('D');
  if (dVal && !dVal.includes('-')) {
    warnings['D'] = `Geen '-' in Item — H-waarden worden opgezocht in Expediting`;
  } else if (!dVal) {
    // Check if H can serve as fallback
    const hVal = vs('H');
    if (!hVal) {
      errors['D'] = 'Item # ontbreekt en Mark/Label (H) is ook leeg';
    } else {
      const hCodes = parseHColumn(hVal);
      if (expeditingData && expeditingData.length) {
        const found = hCodes.filter(code =>
          expeditingData.some(row => {
            const mVal = String(Object.values(row)[12] || '').trim();
            return mVal === code;
          })
        );
        if (!found.length) {
          warnings['D'] = `Item leeg — H-waarden (${hCodes.join(', ')}) niet gevonden in Expediting Kol M`;
        } else {
          warnings['D'] = `Item leeg — gevonden via H: ${found.join(', ')}`;
        }
      } else {
        warnings['D'] = `Item leeg — H-waarden: ${hCodes.join(', ')} (Expediting niet geladen)`;
      }
    }
  }

  // ── E: Item description — required ───────────────────────────────────────
  if (!vs('E')) errors['E'] = 'Item description is verplicht';

  // ── F: Quantity — required, numeric > 0 ──────────────────────────────────
  const qty = vn('F');
  if (qty === null) errors['F'] = 'Quantity moet een getal zijn';
  else if (qty <= 0)  errors['F'] = 'Quantity moet groter zijn dan 0';

  // ── G: Unit of measure — required, must be in list ────────────────────────
  const uom = vs('G');
  if (!uom)                errors['G'] = 'Unit of measure is verplicht';
  else if (!VL_UOM.has(uom)) errors['G'] = `'${uom}' niet in toegestane lijst`;

  // ── H: Mark/Label — required ──────────────────────────────────────────────
  if (!vs('H')) errors['H'] = 'Component (Mark/Label) is verplicht';

  // ── K: Supplier — required ────────────────────────────────────────────────
  if (!vs('K')) errors['K'] = 'Supplier is verplicht';

  // ── L: Make — required ───────────────────────────────────────────────────
  if (!vs('L')) errors['L'] = 'Make is verplicht';

  // ── M: Material — required ────────────────────────────────────────────────
  if (!vs('M')) errors['M'] = 'Material is verplicht';

  // ── N: Country of origin — required, must be ISO-2 ────────────────────────
  const cooVal = vs('N');
  const cooSet = coo.size > 0 ? coo : VL_COO_FALLBACK;
  if (!cooVal)               errors['N'] = 'Country of origin is verplicht';
  else if (!cooSet.has(cooVal.toUpperCase())) errors['N'] = `'${cooVal}' is geen geldige landcode`;

  // ── O: HS-code — required, exact match in GN_CODES (from init.js) ─────────
  const hsVal = vs('O');
  if (!hsVal) {
    errors['O'] = 'HS-code is verplicht';
  } else {
    const hsClean = hsVal.replace(/\s+/g,'').trim();
    if (typeof GN_CODES !== 'undefined') {
      if (!GN_CODES.has(hsClean)) errors['O'] = `HS-code '${hsClean}' niet gevonden in GN-nomenclatuur`;
    }
  }

  // ── P: Value pc — required, numeric, USD→EUR conversion ──────────────────
  let pVal = vn('P');
  if (pVal === null) {
    errors['P'] = 'Value pc is verplicht en moet numeriek zijn';
  } else if (isUSDPrice && usdRate) {
    const pEur = +(pVal * usdRate).toFixed(2);
    computed['P_EUR'] = pEur;
    warnings['P'] = `USD ${pVal.toLocaleString('nl-NL')} = EUR ${pEur.toLocaleString('nl-NL')} (koers: ${usdRate})`;
    pVal = pEur; // use EUR value for Q cross-check
  }

  // ── Q: Value total — warn if >1% off from P×F ─────────────────────────────
  const qVal = vn('Q');
  if (qVal === null) {
    errors['Q'] = 'Value total is verplicht en moet numeriek zijn';
  } else if (pVal !== null && qty !== null) {
    const expected = pVal * qty;
    const diff = Math.abs(qVal - expected);
    const pct  = expected > 0 ? (diff / expected) * 100 : 0;
    if (pct > 1) {
      warnings['Q'] = `Value total (${qVal}) wijkt ${pct.toFixed(1)}% af van Value pc × Qty (${expected.toFixed(2)})`;
    }
  }

  // ── R/S/T/U/V/X/Y: at least one row must have these — checked at sheet level
  // Per-row: validate types
  const t = vn('T'), u = vn('U'), h2 = vn('V');
  if (v('T') !== null && v('T') !== '' && t === null) errors['T'] = 'Length moet numeriek zijn';
  if (v('U') !== null && v('U') !== '' && u === null) errors['U'] = 'Width moet numeriek zijn';
  if (v('V') !== null && v('V') !== '' && h2 === null) errors['V'] = 'Height moet numeriek zijn';

  // ── W: Volume — compute if T/U/V present ─────────────────────────────────
  if (t && u && h2) {
    const vol = +(t * u * h2 / 1000000).toFixed(4);
    computed['W'] = vol;
    const wVal = vn('W');
    if (wVal && Math.abs(wVal - vol) > 0.001) {
      warnings['W'] = `Volume ${wVal} klopt niet — berekend: ${vol} m³`;
    }
  }

  // ── X/Y: weight ───────────────────────────────────────────────────────────
  const xVal = vn('X'), yVal = vn('Y');
  if (v('X') !== null && v('X') !== '' && xVal === null) errors['X'] = 'Gross weight moet numeriek zijn';
  if (v('Y') !== null && v('Y') !== '' && yVal === null) errors['Y'] = 'Nett weight moet numeriek zijn';
  if (xVal !== null && yVal !== null && yVal > xVal)
    errors['Y'] = `Nett weight (${yVal}) mag niet groter zijn dan Gross weight (${xVal})`;

  // ── AA: Inspection Level — optional but must be valid if filled ───────────
  const aaVal = vs('AA');
  if (aaVal && !VL_INSP.has(aaVal)) errors['AA'] = `'${aaVal}' niet in toegestane lijst`;

  return { errors, warnings, computed };
}

// ── Sheet-level validation (min 1 row with R/S/T/U/V/X/Y) ────────────────
function validateSheet(rows) {
  const sheetWarnings = [];
  const checks = { R:false, S:false, T:false, U:false, V:false, X:false, Y:false };
  for (const row of rows) {
    for (const col of Object.keys(checks)) {
      const val = row.cells[COL[col]];
      if (val !== null && val !== undefined && String(val).trim()) checks[col] = true;
    }
  }
  for (const [col, ok] of Object.entries(checks)) {
    if (!ok) sheetWarnings.push(`Kolom ${col}: minimaal 1 rij met een waarde vereist`);
  }
  return sheetWarnings;
}

// ── Run full validation ────────────────────────────────────────────────────
async function runValidation() {
  const dzEl  = document.getElementById('val-dz');
  const tbEl  = document.getElementById('val-tbody');
  const sumEl = document.getElementById('val-summary');
  const shWEl = document.getElementById('val-sheet-warnings');

  if (!_valRows.length) {
    if (sumEl) sumEl.innerHTML = '<span style="color:var(--muted)">Upload eerst een Itemlijst.</span>';
    return;
  }

  const btn = document.getElementById('btn-val-run');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Valideren…'; }

  // Get USD rate if needed
  const pHeader  = _valHeaders[COL.P] || '';
  const usdPrice = isUSD(pHeader);
  const usdRate  = usdPrice ? await fetchUSDRate() : null;

  // Get country codes from file's Master tab (already loaded)
  const coo = _valCOO.size > 0 ? _valCOO : VL_COO_FALLBACK;

  // Get expediting data from fileData (loaded in PO Matcher)
  const expeditingData = (typeof fileData !== 'undefined' && fileData.expediting)
    ? fileData.expediting.data : null;

  // Validate each row
  let totalErrors = 0, totalWarnings = 0;
  for (const row of _valRows) {
    const result = await validateRow(row.cells, usdPrice, usdRate, coo, expeditingData);
    row.errors   = result.errors;
    row.warnings = result.warnings;
    row.computed = result.computed;
    totalErrors   += Object.keys(result.errors).length;
    totalWarnings += Object.keys(result.warnings).length;
  }

  // Sheet-level checks
  const sheetWarnings = validateSheet(_valRows);

  renderValidationTable(usdPrice, usdRate);

  // Summary
  if (sumEl) {
    const cls = totalErrors === 0 ? 'var(--green)' : 'var(--red)';
    sumEl.innerHTML =
      `<span style="color:${cls};font-weight:700">${totalErrors === 0 ? '✅' : '❌'} ${totalErrors} fout(en)</span>` +
      `<span style="color:var(--amber)">  ⚠️ ${totalWarnings} waarschuwing(en)</span>` +
      `<span style="color:var(--muted)">${_valRows.length} rijen gevalideerd</span>`;
  }

  // Sheet warnings
  if (shWEl) {
    shWEl.innerHTML = sheetWarnings.map(w =>
      `<div style="color:var(--amber);font-size:.72rem">⚠️ ${esc(w)}</div>`
    ).join('');
  }

  if (btn) { btn.disabled = false; btn.textContent = '▶ Valideer'; }

  document.getElementById('btn-val-export')?.removeAttribute('disabled');
}

// ── Render validation table ────────────────────────────────────────────────
function renderValidationTable(usdPrice, usdRate) {
  const tbEl = document.getElementById('val-tbody');
  if (!tbEl) return;

  const COLS_SHOW = ['C','D','E','F','G','H','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA'];
  const IHC_EDITABLE = new Set(['A','B','I','J','W','AA']);

  const html = _valRows.map((row, ri) => {
    const hasDG  = row.cells[COL.Z] === true || String(row.cells[COL.Z]||'').toLowerCase() === 'true';
    const rowCls = hasDG ? 'val-row-dg' : '';
    const anyErr = Object.keys(row.errors).length > 0;
    const anyWrn = Object.keys(row.warnings).length > 0;

    const cells = COLS_SHOW.map(col => {
      const ci  = COL[col];
      const val = row.cells[ci];
      const err = row.errors[col];
      const wrn = row.warnings[col];
      const cmp = row.computed?.[col] ?? row.computed?.[col+'_EUR'];
      const editable = IHC_EDITABLE.has(col);
      const disp = val !== null && val !== undefined ? String(val) : '';

      let cls = '';
      if (err) cls = 'val-cell-err';
      else if (wrn) cls = 'val-cell-warn';
      else if (disp) cls = 'val-cell-ok';

      const tooltip = err || wrn || (cmp ? `Berekend: ${cmp}` : '');
      const tAttr   = tooltip ? `title="${esc(tooltip)}"` : '';

      if (editable && !disp) {
        // IHC-fillable empty field — show input
        return `<td class="val-cell val-cell-ihc" ${tAttr}>
          <input class="val-input" data-row="${ri}" data-col="${ci}"
            placeholder="${esc(_valHeaders[ci]||col)}"
            value="" oninput="valCellEdit(${ri},${ci},this.value)">
        </td>`;
      }

      if (col === 'P' && usdPrice && cmp) {
        return `<td class="val-cell ${cls}" ${tAttr}>
          <div style="font-size:.7rem">${esc(disp)} USD</div>
          <div style="font-size:.62rem;color:var(--teal)">≈ ${Number(cmp).toLocaleString('nl-NL')} EUR</div>
        </td>`;
      }

      if (col === 'Z') {
        return `<td class="val-cell ${hasDG ? 'val-cell-dg' : 'val-cell-ok'}" ${tAttr}>
          ${hasDG ? '🔴 DG' : '—'}
        </td>`;
      }

      const errIcon = err ? '❌ ' : wrn ? '⚠️ ' : '';
      return `<td class="val-cell ${cls}" ${tAttr}>${errIcon}${esc(disp||'—')}</td>`;
    }).join('');

    const rowStatus = anyErr ? '❌' : anyWrn ? '⚠️' : '✅';
    return `<tr class="val-row ${rowCls}">
      <td class="val-cell val-cell-num">${ri+1}</td>
      <td class="val-cell" style="text-align:center">${rowStatus}</td>
      ${cells}
    </tr>`;
  }).join('');

  tbEl.innerHTML = html || '<tr><td colspan="30" style="text-align:center;color:var(--muted);padding:1.5rem">Geen data</td></tr>';
}

// ── Cell edit (IHC write-back) ─────────────────────────────────────────────
function valCellEdit(rowIdx, colIdx, value) {
  if (_valRows[rowIdx]) {
    _valRows[rowIdx].cells[colIdx] = value;
    _valRows[rowIdx]._edited = true;
  }
}

// ── Export corrected Itemlijst ─────────────────────────────────────────────
function exportValidatedItemlijst() {
  if (!_valWb) { alert('Laad eerst een Itemlijst.'); return; }
  const ws = _valWb.Sheets[_valWb.SheetNames[0]];

  // Write back edited/computed values (rows start at index 2 in the worksheet = row 3)
  _valRows.forEach((row, ri) => {
    if (!row._edited && !row.computed) return;
    const wsRow = ri + 3; // 1=owner, 2=header, 3+=data
    // Edited cells
    Object.entries(COL).forEach(([colLetter, colIdx]) => {
      const val = row.cells[colIdx];
      if (row._edited && val !== undefined) {
        const addr = XLSX.utils.encode_cell({ r: wsRow - 1, c: colIdx });
        if (!ws[addr]) ws[addr] = {};
        ws[addr].v = val;
        ws[addr].t = typeof val === 'number' ? 'n' : 's';
      }
    });
    // Computed volume W
    if (row.computed?.W !== undefined) {
      const addr = XLSX.utils.encode_cell({ r: wsRow - 1, c: COL.W });
      ws[addr] = { v: row.computed.W, t: 'n' };
    }
  });

  // Add validation summary to a new sheet
  const summaryData = [
    ['Rij', 'IHC PO', 'Item', 'Fouten', 'Waarschuwingen'],
    ..._valRows.map((row, i) => [
      i+1,
      row.cells[COL.C] || '',
      row.cells[COL.D] || '',
      Object.entries(row.errors).map(([k,v]) => `${k}: ${v}`).join(' | '),
      Object.entries(row.warnings).map(([k,v]) => `${k}: ${v}`).join(' | '),
    ])
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(_valWb, wsSummary, 'Validatie rapport');

  XLSX.writeFile(_valWb, 'Itemlijst_gevalideerd.xlsx');
}


// ── Build dynamic table header from loaded file ─────────────────────────
function buildValHeader() {
  const thEl = document.getElementById('val-thead');
  if (!thEl) return;
  const COLS_SHOW = ['C','D','E','F','G','H','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA'];
  const IHC_OWN   = new Set(['A','B','I','J','W','AA']);
  const ownerRow  = _valOwners;
  const headerRow = _valHeaders;

  const ownerMap  = {};
  COLS_SHOW.forEach(col => {
    ownerMap[col] = ownerRow[COL[col]] || '';
  });

  const th1 = `<tr>
    <th rowspan="2" style="width:30px">#</th>
    <th rowspan="2">Status</th>
    ${COLS_SHOW.map(col => {
      const owner = ownerMap[col];
      const cls   = /IHC/.test(owner) ? 'col-owner-ihc' : 'col-owner-sup';
      return `<th class="${cls}">${esc(owner||'')}</th>`;
    }).join('')}
  </tr>`;
  const th2 = `<tr>
    ${COLS_SHOW.map(col => {
      const hdr = headerRow[COL[col]] || col;
      const cls = IHC_OWN.has(col) ? 'col-owner-ihc' : '';
      return `<th class="${cls}" title="${esc(hdr)}">${esc(hdr)}</th>`;
    }).join('')}
  </tr>`;
  thEl.innerHTML = th1 + th2;
}

// ── Load Itemlijst file ────────────────────────────────────────────────────
function handleValFile(event) {
  const file = event.target.files[0] || event.dataTransfer?.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
    _valWb = wb;
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

    _valOwners  = raw[0] || [];
    _valHeaders = raw[1] || [];
    _valRows    = (raw.slice(2) || [])
      .filter(r => r.some(c => c !== null && c !== undefined && String(c).trim()))
      .map(r => ({ cells: r, errors: {}, warnings: {}, computed: {} }));

    // Load country codes from Master tab
    _valCOO = new Set();
    if (wb.Sheets['Master']) {
      const mRaw = XLSX.utils.sheet_to_json(wb.Sheets['Master'], { header: 1, defval: null });
      mRaw.forEach(r => {
        if (r[0] && /^[A-Z]{2}$/.test(String(r[0]).trim()))
          _valCOO.add(String(r[0]).trim().toUpperCase());
      });
    }

    const fn = document.getElementById('val-filename');
    const dz = document.getElementById('val-dz');
    if (fn) { fn.textContent = `${file.name} — ${_valRows.length} rijen`; fn.style.display = 'block'; }
    if (dz) dz.classList.add('loaded');

    buildValHeader();
    document.getElementById('btn-val-run')?.removeAttribute('disabled');
    document.getElementById('val-summary').innerHTML =
      `<span style="color:var(--muted)">${_valRows.length} rijen geladen — klik Valideer om te starten</span>`;
  };
  reader.readAsArrayBuffer(file);
}

// Drag & drop wiring
function valDragOver(e) { e.preventDefault(); document.getElementById('val-dz')?.classList.add('dz-hover'); }
function valDragLeave()  { document.getElementById('val-dz')?.classList.remove('dz-hover'); }
function valDrop(e) {
  e.preventDefault();
  document.getElementById('val-dz')?.classList.remove('dz-hover');
  handleValFile({ dataTransfer: e.dataTransfer });
}
