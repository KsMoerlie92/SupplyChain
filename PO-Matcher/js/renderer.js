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
// Column map for YN1320 expediting file (headers in row 3):
//  A(0)  Purchase Order No       → main key
//  E(4)  PO Line Status          → Released/Confirmed coloring
//  F(5)  Sub Project ID          → detail
//  G(6)  Sub Project Description → detail
//  H(7)  Technical Coordinator   → detail
//  I(8)  Buyer Name              → detail
//  J(9)  Supplier Name           → visible
//  K(10) Part No                 → detail
//  L(11) Description             → detail
//  M(12) Unified Reference Code  → visible (status column per user request)
//  T(19) Latest Wanted Receipt Date → offset numerator
//  U(20) Planned Delivery Date   → delivery date display + filter
//  W(22) Last Expedited          → detail
//  X(23) PO Header Note          → detail if filled
//  Y(24) PO Line Note            → detail if filled
//  Z(25) Logistieke Instructie   → detail
//  AG(32) FAT                    → detail if filled
//  AH(33) FAT Datum              → detail if filled

let _lateSortDir = 'asc';  // 'asc' | 'desc' | 'date'

function setLateSort(dir) {
  _lateSortDir = dir;
  document.getElementById('late-sort-asc') .classList.toggle('active', dir === 'asc');
  document.getElementById('late-sort-desc').classList.toggle('active', dir === 'desc');
  document.getElementById('late-sort-date')?.classList.toggle('active', dir === 'date');
  renderLateItems();
}

// Robust date converter: handles JS Date objects, Excel serials, ISO strings,
// European DD-MM-YYYY, and MM/DD/YYYY. Returns local-midnight Date or null.
function _toDate(v) {
  if (v === null || v === undefined) return null;
  // Already a JS Date object (from SheetJS raw:true + cellDates:true)
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v).trim();
  if (!s) return null;
  // Excel serial number
  const n = parseFloat(s.replace(',', '.'));
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569 + 0.5) * 86400 * 1000));
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  // European DD-MM-YYYY or DD/MM/YYYY
  const eu = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (eu) return new Date(+eu[3], +eu[2]-1, +eu[1]);
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // American MM/DD/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return new Date(+us[3], +us[1]-1, +us[2]);
  // JS Date string fallback (e.g. "Fri Nov 22 2024 …")
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _fmtDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// Short format: "23 May" — day + abbreviated month name, no year/time/timezone
const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function _fmtShort(v) {
  const d = (v instanceof Date) ? v : _toDate(v);
  if (!d) return v ? String(v).split(' ')[0].split('T')[0] : '—';
  return `${d.getDate()} ${_MONTHS[d.getMonth()]}`;
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
  const empty = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">
    Laad eerst de Expediting lijst.</td></tr>`;
  if (!expData || !expData.length) {
    const lt = document.getElementById('late-items-table');
    if (lt) lt.innerHTML = empty;
    return;
  }

  const headers = fileData.expediting.headers || Object.keys(expData[0]);
  const g  = (vals, idx) => idx >= 0 && idx < vals.length
    ? (vals[idx] !== null && vals[idx] !== undefined ? vals[idx] : '') : '';
  const gs = (vals, idx) => String(g(vals, idx)).trim();
  const hn = (idx) => idx >= 0 && headers[idx] ? String(headers[idx]).trim() : `Kol ${idx+1}`;

  // ── Exact column indices from the actual file ─────────────────────────────
  const iA  = 0;   // Purchase Order No
  const iE  = 4;   // PO Line Status (Released/Confirmed) — drives row coloring
  const iF  = 5;   // Sub Project ID
  const iG  = 6;   // Sub Project Description
  const iH  = 7;   // Technical Coordinator Name
  const iI  = 8;   // Buyer Name
  const iJ  = 9;   // Supplier Name
  const iK  = 10;  // Part No
  const iL  = 11;  // Description
  const iM  = 12;  // Unified Reference Code → visible status column
  const iT  = 19;  // Latest Wanted Receipt Date
  const iU  = 20;  // Planned Delivery Date
  const iW  = 22;  // Last Expedited
  const iX  = 23;  // PO Header Note
  const iY  = 24;  // PO Line Note
  const iZ  = 25;  // Logistieke Instructie
  const iAG = 32;  // FAT
  const iAH = 33;  // FAT Datum

  const today    = new Date(); today.setHours(0,0,0,0);
  const maxDate  = new Date(today); maxDate.setMonth(today.getMonth() + 1); // 1 month ahead

  const rows = expData.map((row, ri) => {
    const vals = Object.values(row);
    const colA = gs(vals, iA);
    if (!colA) return null;

    const uDate = _toDate(g(vals, iU));
    if (!uDate) return null;                  // no delivery date → skip
    if (uDate > maxDate) return null;         // beyond 1-month window → skip

    const tDate  = _toDate(g(vals, iT));
    const offset = (tDate && uDate)
      ? Math.round((tDate.getTime() - uDate.getTime()) / 86400000) : null;

    const statusVal   = gs(vals, iE);
    const isReleased  = /released/i.test(statusVal);
    const isConfirmed = /confirmed/i.test(statusVal);

    // Only show items that are still open (Released or Confirmed).
    // Items with any other status (Received, Closed, Complete, etc.) are excluded.
    if (!isReleased && !isConfirmed) return null;

    const isPast = uDate < today;

    return {
      colA, statusVal, isReleased, isConfirmed, isPast,
      colM:  gs(vals, iM),   // Unified Reference Code
      colJ:  gs(vals, iJ),   // Supplier Name
      colH:  gs(vals, iH),   colI:  gs(vals, iI),

      colW:  gs(vals, iW),
      colX:  gs(vals, iX),   colY:  gs(vals, iY),
      colZ:  gs(vals, iZ),
      colAG: vals.length > iAG ? gs(vals, iAG) : '',
      colAH: vals.length > iAH ? gs(vals, iAH) : '',
      uDate, tDate, offset,
    };
  }).filter(Boolean);

  const sortFn = (a, b) => {
    if (_lateSortDir === 'date') {
      // Sort by Confirmed date (col U) ascending — chronological
      const at = a.uDate?.getTime() ?? Infinity;
      const bt = b.uDate?.getTime() ?? Infinity;
      return at - bt;
    }
    const aO = a.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    const bO = b.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    return _lateSortDir === 'asc' ? aO - bO : bO - aO;
  };

  const pastRows   = rows.filter(r =>  r.isPast).sort(sortFn);
  const futureRows = rows.filter(r => !r.isPast).sort(sortFn);

  const thead = `<thead><tr>
    <th style="width:22px"></th>
    <th style="width:26px">#</th>
    <th>${esc(hn(iA))}</th>
    <th>${esc(hn(iM))}</th>
    <th>${esc(hn(iJ))}</th>
    <th>Wanted</th>
    <th>Confirmed</th>
    <th>Offset (T−U)</th>
  </tr></thead>`;

  function buildRow(r, i) {
    let offDisp = '—', offCls = '';
    if (r.offset !== null) {
      offDisp = (r.offset > 0 ? '+' : '') + r.offset + 'd';
      offCls  = r.offset < 0 ? 'late-neg' : r.offset === 0 ? 'late-zero' : 'late-pos';
    }
    // Row class: released takes priority, then past/future
    const rowCls = r.isReleased
      ? `late-released ${r.isPast ? 'late-past' : 'late-future'}`
      : `${r.isPast ? 'late-past' : 'late-future'} ${r.isConfirmed ? 'late-confirmed' : ''}`;

    const relBadge = r.isReleased
      ? `<span class="released-badge" title="Orderbevestiging ophalen/opvragen">OB ophalen</span>` : '';

    // Detail: H and I always; others if filled
    const detFields = [
      [hn(iH), r.colH],
      [hn(iI), r.colI],
    ];

    if (r.colW)  detFields.push([hn(iW),  _fmtDate(_toDate(r.colW))]);
    if (r.colX)  detFields.push([hn(iX),  r.colX]);
    if (r.colY)  detFields.push([hn(iY),  r.colY]);
    if (r.colZ)  detFields.push([hn(iZ),  r.colZ]);
    if (r.colAG) detFields.push([hn(iAG), r.colAG]);
    if (r.colAH) {
      const d = _toDate(r.colAH);
      detFields.push([hn(iAH), d ? _fmtDate(d) : r.colAH]);
    }

    const mainRow = `<tr class="late-row ${rowCls} ${offCls}" onclick="toggleLateDetail(${i})" style="cursor:pointer">
      <td class="late-tog-cell"><button class="late-tog-btn" id="late-tog-${i}" tabindex="-1">▼</button></td>
      <td class="rc">${i + 1}</td>
      <td>${esc(r.colA)}</td>
      <td class="status-cell">${esc(r.colM)}</td>
      <td>${esc(r.colJ)} ${relBadge}</td>
      <td class="date-cell">${_fmtDate(r.tDate)}</td>
      <td class="date-cell ${r.isPast ? 'date-past' : 'date-future'}">${_fmtDate(r.uDate)}</td>
      <td class="offset-cell ${offCls}">${offDisp}</td>
    </tr>`;

    const detRow = `<tr id="late-det-${i}" class="late-detail-row" style="display:none">
      <td colspan="8"><div class="late-detail-inner">
        ${detFields.map(([lbl, val]) =>
          `<div class="late-det-field">
            <span class="late-det-lbl">${esc(String(lbl))}</span>
            <span class="late-det-val">${esc(String(val||'—'))}</span>
          </div>`).join('')}
      </div></td>
    </tr>`;

    return mainRow + detRow;
  }

  const separator = `<tr class="late-separator">
    <td colspan="8">
      <span class="sep-past">▲ Verstreken</span>
      <span class="sep-line"></span>
      <span class="sep-future">▼ Komende 30 dagen</span>
    </td>
  </tr>`;

  let rowNum = 0;
  const pastHtml   = pastRows.map(r   => buildRow(r, rowNum++)).join('');
  const futureHtml = futureRows.map(r => buildRow(r, rowNum++)).join('');

  let tbody = '';
  if (pastRows.length)                      tbody += pastHtml;
  if (pastRows.length && futureRows.length) tbody += separator;
  if (futureRows.length)                    tbody += futureHtml;
  if (!tbody) tbody = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">
    Geen items in het venster (verleden + komende 30 dagen).</td></tr>`;

  _lateOpenRows.clear();
  const ltTable = document.getElementById('late-items-table');
  if (ltTable) ltTable.innerHTML = thead + '<tbody>' + tbody + '</tbody>';

  const relCount  = rows.filter(r => r.isReleased).length;
  const pastCount = pastRows.length;
  const futCount  = futureRows.length;
  setStatus(`Late Items: ${pastCount} verstreken · ${futCount} komende 30 dagen${relCount ? ` · ⚠ ${relCount} Released` : ''}`);
}
