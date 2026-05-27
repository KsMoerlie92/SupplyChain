// ── Rendering & filters: renderTable(), updateStats(), applyFilters() ───────
// ── Render ────────────────────────────────────────────────────────────────
let visibleRows = [];

function renderTable(rows) {
  const tbody = document.getElementById('result-tbody');
  tbody.innerHTML = '';

  document.getElementById('result-table-wrap').classList.add('visible');
  document.getElementById('filter-row').classList.add('visible');
  document.getElementById('stats-bar').classList.add('visible');
  document.getElementById('empty-state').classList.remove('visible');

  if (!rows.length) {
    document.getElementById('empty-state').classList.add('visible');
    document.getElementById('row-count').textContent = '0 rijen';
    return;
  }

  const frag = document.createDocumentFragment();

  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.classList.add('expandable');
    if (!r.noMatch) tr.classList.add('match-row');
    const rowId = 'dr' + idx;
    tr.setAttribute('onclick', `toggleDetail('${rowId}',this)`);

    const badge = r.noMatch
      ? '<span class="badge-warn">✗ ALLEEN MOEDER</span>'
      : '<span class="badge-ok">✓ IN BEIDE LIJSTEN</span>';

    tr.innerHTML = `
      <td class="${r.xlookup ? 'match' : 'no-match'}" style="font-weight:700">
        <span class="expand-arrow">▶</span><span class="col-indicator" style="background:${r.xlookup ? '#70AD47' : '#C0392B'};"></span>${
          r.xlookup ? esc(r.xlookup) : esc(r.combined)
        }</td>
      <td class="cell-supplier">${esc(r.colSupplier || '—')}</td>
      <td class="cell-qty">${
        r.colF || r.expColO
          ? (esc(r.colF || '—') + (r.expColO ? ' / ' + esc(r.expColO) : ''))
          : '—'
      }</td>
      <td class="cell-location" title="${esc(r.colE || '')}">${esc((r.colE || '—').length > 15 ? r.colE.slice(0, 15) + '…' : (r.colE || '—'))}</td>
      <td>${badge}</td>`;

    // Detail dropdown row
    const dv = v => (v && v.trim() && v !== '—')
      ? `<span class="detail-value">${esc(v)}</span>`
      : `<span class="detail-value empty">—</span>`;
    const dtRow = document.createElement('tr');
    dtRow.className = 'detail-row hidden';
    dtRow.id = rowId;
    const dtCell = document.createElement('td');
    dtCell.colSpan = 6;
    dtCell.innerHTML = `<div class="detail-inner">
      <div class="detail-field"><span class="detail-label">MR ID</span>${dv(r.colMRID)}</div>
      <div class="detail-field"><span class="detail-label">Location (Kol AA)</span>${dv(r.colLocation)}</div>
      <div class="detail-field"><span class="detail-label">Received (Kol AB)</span>${dv(r.colZ)}</div>
      <div class="detail-field"><span class="detail-label">Checked</span>${dv(r.colChecked)}</div>
      <div class="detail-field"><span class="detail-label">Logistic inspection</span>${dv(r.colLogisticInsp)}</div>
      <div class="detail-field"><span class="detail-label">Inspection result</span>${dv(r.colInspResult)}</div>
      <div class="detail-field"><span class="detail-label">Shipment</span>${dv(r.colShipment)}</div>
    </div>`;
    dtRow.appendChild(dtCell);
    frag.appendChild(tr);
    frag.appendChild(dtRow);
  });

  tbody.appendChild(frag);
  visibleRows = rows;
  document.getElementById('row-count').textContent = rows.length + ' rijen';
}

function updateStats(rows, expColASize) {
  document.getElementById('st-match').textContent   = rows.filter(r => !r.noMatch).length;
  document.getElementById('st-nomatch').textContent = rows.filter(r =>  r.noMatch).length;
  document.getElementById('st-exp').textContent     = rows.length;
  if (expColASize !== undefined) {
    document.getElementById('st-explist').textContent = expColASize;
  }
}

// ── Filters ───────────────────────────────────────────────────────────────
function toggleDetail(rowId, tr) {
  const detail = document.getElementById(rowId);
  if (!detail) return;
  const open = detail.classList.contains('hidden');
  detail.classList.toggle('hidden', !open);
  tr.classList.toggle('expanded', open);
}

function setFilter(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const isVal  = filter === 'validator';
  const isLate = filter === 'lateitems';

  // result-table-wrap uses CSS .visible class — don't fight it with inline style
  const rtw = document.getElementById('result-table-wrap');
  if (rtw) {
    if (isLate || isVal) {
      rtw.classList.remove('visible');   // hide via CSS class
    } else if (allRows.length) {
      rtw.classList.add('visible');      // restore if data exists
    }
  }

  // late-items-wrap is controlled purely by inline style (no .visible dependency)
  const liw = document.getElementById('late-items-wrap');
  if (liw) liw.style.display = isLate ? 'block' : 'none';

  // validator-wrap
  const valWrap = document.getElementById('validator-wrap');
  if (valWrap) valWrap.style.display = isVal ? 'block' : 'none';

  // Controls
  const srch     = document.getElementById('search-box');
  const mrWrap   = document.getElementById('mr-toggle-wrap');
  const lateWrap = document.getElementById('late-sort-wrap');
  if (srch)     srch.style.display     = (isVal || isLate) ? 'none' : '';
  if (mrWrap)   mrWrap.classList.toggle('visible', filter === 'match');
  if (lateWrap) lateWrap.style.display = isLate ? 'flex' : 'none';

  if (isLate) { renderLateItems(); return; }
  if (!isVal)  applyFilters();
}

function applyFilters() {
  const q       = document.getElementById('search-box').value.toLowerCase();
  const hideNRY = document.getElementById('toggle-mr-nry')?.checked ?? false;
  let rows = allRows;

  if      (currentFilter === 'match')   rows = rows.filter(r => !r.noMatch);
  else if (currentFilter === 'nomatch') rows = rows.filter(r =>  r.noMatch);

  // MR ID "Not Received Yet" toggle — only active on "In beide lijsten" tab
  if (hideNRY && currentFilter === 'match') {
    rows = rows.filter(r => {
      const mrVal = String(r.colMRID || '').trim().toLowerCase();
      return mrVal !== 'not received yet' && mrVal !== '';
    });
  }

  if (q) {
    rows = rows.filter(r =>
      r.po.toLowerCase().includes(q)       ||
      r.item.toLowerCase().includes(q)     ||
      r.combined.toLowerCase().includes(q) ||
      (r.xlookup || '').toLowerCase().includes(q) ||
      (r.colE        || '').toLowerCase().includes(q) ||
      (r.colSupplier || '').toLowerCase().includes(q) ||
      (r.colF    || '').toLowerCase().includes(q) ||
      (r.expColO || '').toLowerCase().includes(q)
    );
  }

  if (!rows.length) {
    document.getElementById('result-tbody').innerHTML = '';
    document.getElementById('empty-state').classList.add('visible');
    document.getElementById('row-count').textContent = '0 rijen';
  } else {
    document.getElementById('empty-state').classList.remove('visible');
    renderTable(rows);
    updateStats(allRows); // stats altijd totaal
  }
}

// ── Export naar Excel ─────────────────────────────────────────────────────

// ── Late Items tab ─────────────────────────────────────────────────────────
let _lateSortDir = 'asc';

function setLateSort(dir) {
  _lateSortDir = dir;
  document.getElementById('late-sort-asc') .classList.toggle('active', dir === 'asc');
  document.getElementById('late-sort-desc').classList.toggle('active', dir === 'desc');
  renderLateItems();
}

// Excel serial or date-string → JS Date (Europe/Amsterdam UTC+1/+2)
function _toDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  // Excel date serial
  const n = parseFloat(s.replace(',', '.'));
  if (!isNaN(n) && n > 1000) {
    // Add 0.5 days before rounding to avoid UTC midnight timezone issues
    const ms = Math.round((n - 25569 + 0.5) * 86400000);
    const d  = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()); // local midnight
  }
  // Try string "DD-MM-YYYY" or "DD/MM/YYYY" (European)
  const euMatch = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (euMatch) return new Date(+euMatch[3], +euMatch[2]-1, +euMatch[1]);
  // Try string "YYYY-MM-DD" (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2]-1, +isoMatch[3]);
  // Fallback
  const d = new Date(v);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _fmtDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

let _lateOpenRows = new Set();

function toggleLateDetail(idx) {
  const det = document.getElementById(`late-det-${idx}`);
  if (!det) return;
  const open = _lateOpenRows.has(idx);
  if (open) { _lateOpenRows.delete(idx); det.style.display = 'none'; }
  else       { _lateOpenRows.add(idx);    det.style.display = ''; }
  const btn = document.getElementById(`late-tog-${idx}`);
  if (btn) btn.textContent = _lateOpenRows.has(idx) ? '▲' : '▼';
}

function renderLateItems() {
  const expData = fileData?.expediting?.data;
  const noData = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">Laad eerst de Expediting lijst.</td></tr>';
  if (!expData || !expData.length) {
    const lt = document.getElementById('late-items-table');
    if (lt) lt.innerHTML = noData;
    return;
  }

  // ── Find columns by header name (case-insensitive partial match) ──────────
  const headers = fileData.expediting.headers || Object.keys(expData[0]);
  const findCol = (...names) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h && names.some(n =>
        String(h).toLowerCase().includes(n.toLowerCase())));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const findExact = (letter) => {
    // Match by exact Excel column letter position
    const idx = letter.toUpperCase().charCodeAt(0) - 65;
    return idx;
  };

  // Key columns — find by name first, fallback to letter-position
  const iA  = 0;  // always col A
  const iT  = findCol('required date','required','planned','planned date') >= 0
                ? findCol('required date','required','planned','planned date')
                : findExact('T');  // Kol T = index 19
  const iU  = findCol('delivery date','confirm','confirmdate','leverdatum','actual') >= 0
                ? findCol('delivery date','confirm','confirmdate','leverdatum','actual')
                : findExact('U');  // Kol U = index 20
  const iM  = findExact('M');   // Kol M = index 12 — Status for display
  const iH  = findExact('H');   // Kol H = index 7
  const iI  = findExact('I');   // Kol I = index 8
  const iJ  = findExact('J');   // Kol J = index 9
  const iW  = findExact('W');   // Kol W = index 22  → detail
  const iZ  = findExact('Z');   // Kol Z = index 25  → detail
  const iAG = findExact('AG') >= 0 ? headers.length > 32 ? 32 : -1 : -1;  // AG = 32
  const iAH = findExact('AH') >= 0 ? headers.length > 33 ? 33 : -1 : -1;  // AH = 33

  // Helper: get value by index safely
  const g = (vals, idx) => idx >= 0 && idx < vals.length ? String(vals[idx] ?? '').trim() : '';

  const hdr = (idx) => idx >= 0 && headers[idx] ? String(headers[idx]).trim() : `Kol ${idx+1}`;

  const today    = new Date(); today.setHours(0,0,0,0);
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30);

  // Build rows — include past AND next 30 days
  const rows = expData.map((row, ri) => {
    const vals = Object.values(row);
    const colA = g(vals, iA);
    if (!colA) return null;

    const uDate = _toDate(vals[iU]);
    if (!uDate) return null;
    if (uDate > in30days) return null;   // beyond 30-day window → skip

    const tDate  = _toDate(vals[iT]);
    const offset = (tDate && uDate)
      ? Math.round((tDate.getTime() - uDate.getTime()) / 86400000) : null;

    const statusVal   = g(vals, iM);
    const isPast      = uDate < today;
    const isReleased  = /released/i.test(statusVal);
    const isConfirmed = /confirmed/i.test(statusVal);

    return {
      colA, statusVal, isReleased, isConfirmed,
      colH:  g(vals, iH),
      colI:  g(vals, iI),
      colJ:  g(vals, iJ),
      colW:  g(vals, iW),
      colZ:  g(vals, iZ),
      colAG: iAG >= 0 ? g(vals, iAG) : '',
      colAH: iAH >= 0 ? g(vals, iAH) : '',
      uDate, tDate, offset, isPast,
    };
  }).filter(Boolean);

  const sortFn = (a, b) => {
    const aO = a.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    const bO = b.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    return _lateSortDir === 'asc' ? aO - bO : bO - aO;
  };

  const pastRows   = rows.filter(r =>  r.isPast).sort(sortFn);
  const futureRows = rows.filter(r => !r.isPast).sort(sortFn);

  // ── Build thead ───────────────────────────────────────────────────────────
  const thead = `<thead><tr>
    <th style="width:22px"></th>
    <th style="width:26px">#</th>
    <th>${esc(hdr(iA))}</th>
    <th>${esc(hdr(iM))}</th>
    <th>${esc(hdr(iJ))}</th>
    <th>Leverdatum</th>
    <th>Offset (T−U)</th>
  </tr></thead>`;

  // ── Build row HTML ─────────────────────────────────────────────────────────
  function buildRows(r, i) {
    let offDisp = '—', offCls = '';
    if (r.offset !== null) {
      offDisp = (r.offset > 0 ? '+' : '') + r.offset + 'd';
      offCls  = r.offset < 0 ? 'late-neg' : r.offset === 0 ? 'late-zero' : 'late-pos';
    }
    const relCls  = r.isReleased  ? 'late-released'  : '';
    const conCls  = r.isConfirmed ? 'late-confirmed'  : '';
    const pastCls = r.isPast      ? 'late-past'       : 'late-future';

    // Detail fields — H, I always shown; W, Z, AG, AH if filled
    const detFields = [
      [hdr(iH), r.colH],
      [hdr(iI), r.colI],
    ];
    if (r.colW)   detFields.push([hdr(iW),  r.colW]);
    if (r.colZ)   detFields.push([hdr(iZ),  r.colZ]);
    if (r.colAG)  detFields.push([hdr(iAG), r.colAG]);
    if (r.colAH)  detFields.push([hdr(iAH), r.colAH]);

    const relBadge = r.isReleased
      ? `<span class="released-badge" title="Orderbevestiging ophalen/opvragen">OB ophalen</span>` : '';

    const mainRow = `<tr class="late-row ${pastCls} ${relCls} ${conCls} ${offCls}"
        onclick="toggleLateDetail(${i})" style="cursor:pointer">
      <td class="late-tog-cell"><button class="late-tog-btn" id="late-tog-${i}" tabindex="-1">▼</button></td>
      <td class="rc">${i + 1}</td>
      <td>${esc(r.colA)}</td>
      <td class="status-cell">${esc(r.statusVal)} ${relBadge}</td>
      <td>${esc(r.colJ)}</td>
      <td class="date-cell ${r.isPast ? 'date-past' : 'date-future'}">${_fmtDate(r.uDate)}</td>
      <td class="offset-cell ${offCls}">${offDisp}</td>
    </tr>`;

    const detRow = `<tr id="late-det-${i}" class="late-detail-row" style="display:none">
      <td colspan="7">
        <div class="late-detail-inner">
          ${detFields.map(([lbl, val]) =>
            `<div class="late-det-field">
              <span class="late-det-lbl">${esc(String(lbl))}</span>
              <span class="late-det-val">${esc(String(val||'—'))}</span>
            </div>`
          ).join('')}
        </div>
      </td>
    </tr>`;

    return mainRow + detRow;
  }

  const separator = `<tr class="late-separator">
    <td colspan="7">
      <span class="sep-past">▲ Verstreken</span>
      <span class="sep-line"></span>
      <span class="sep-future">▼ Komende 30 dagen</span>
    </td>
  </tr>`;

  let rowNum = 0;
  const pastHtml   = pastRows.map(r   => buildRows(r, rowNum++)).join('');
  const futureHtml = futureRows.map(r => buildRows(r, rowNum++)).join('');

  let tbody = '';
  if (pastRows.length)                        tbody += pastHtml;
  if (pastRows.length && futureRows.length)   tbody += separator;
  if (futureRows.length)                      tbody += futureHtml;
  if (!tbody) tbody = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem">
    Geen items in het venster (verleden + komende 30 dagen). Controleer kolom U (leverdatum) in de Expediting lijst.</td></tr>`;

  _lateOpenRows.clear();
  const ltTable = document.getElementById('late-items-table');
  if (ltTable) ltTable.innerHTML = thead + '<tbody>' + tbody + '</tbody>';

  const relCount = rows.filter(r => r.isReleased).length;
  setStatus(
    `Late Items: ${pastRows.length} verstreken · ${futureRows.length} komende 30 dagen` +
    (relCount ? ` · ⚠ ${relCount} Released (OB ophalen)` : '')
  );
}
