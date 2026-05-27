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

  const isVal   = filter === 'validator';
  const isLate  = filter === 'lateitems';
  const rtw     = document.getElementById('result-table-wrap');
  const valWrap = document.getElementById('validator-wrap');
  const mrWrap  = document.getElementById('mr-toggle-wrap');
  const srch    = document.getElementById('search-box');
  const lateWrap= document.getElementById('late-sort-wrap');

  if (rtw)     rtw.style.display     = isVal ? 'none' : '';
  if (valWrap) valWrap.style.display  = isVal ? 'block' : 'none';
  if (srch)    srch.style.display    = (isVal || isLate) ? 'none' : '';
  if (mrWrap)  mrWrap.classList.toggle('visible', filter === 'match' && !isVal);
  if (lateWrap)lateWrap.style.display = isLate ? 'flex' : 'none';

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
// Reads Expediting list directly.
// Shows rows where Col U (delivery date) = past OR within next 30 days.
// Offset = Col T (index 19) − Col U (index 20).
// Col E (index 4) = "Released" → orange highlight (needs order confirmation).
// Visual separator between PAST and FUTURE groups.

let _lateSortDir = 'asc'; // 'asc' = laag→hoog (oudst/meest urgent eerst)

function setLateSort(dir) {
  _lateSortDir = dir;
  document.getElementById('late-sort-asc') .classList.toggle('active', dir === 'asc');
  document.getElementById('late-sort-desc').classList.toggle('active', dir === 'desc');
  renderLateItems();
}

// Convert Excel serial, date-string or number to a JS Date (or null)
function _toDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  if (!isNaN(n) && n > 1000) {
    // Excel serial: days since 1900-01-01 (with Lotus 1-2-3 leap-year bug)
    return new Date(Math.round((n - 25569) * 86400 * 1000));
  }
  // Try string parse
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// Format a Date as DD-MM-YYYY
function _fmtDate(d) {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function renderLateItems() {
  const rtw = document.getElementById('result-table-wrap');
  if (rtw) rtw.style.display = '';

  const expData = fileData?.expediting?.data;
  if (!expData || !expData.length) {
    document.getElementById('result-table').innerHTML =
      '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:1.5rem">Laad eerst de Expediting lijst.</td></tr>';
    return;
  }

  const headers = Object.keys(expData[0]);

  // Column indices (0-based positional)
  const iA = 0;   // Kol A — PO combined key
  const iE = 4;   // Kol E — Status (Released / Confirmed)
  const iH = 7;   // Kol H
  const iI = 8;   // Kol I
  const iJ = 9;   // Kol J
  const iW = 22;  // Kol W
  const iZ = 25;  // Kol Z
  const iT = 19;  // Kol T (planned/required)
  const iU = 20;  // Kol U (actual delivery date)

  const today    = new Date(); today.setHours(0,0,0,0);
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30);

  // Build rows — only include where Col U is past or within 30 days
  const rows = expData.map(row => {
    const vals   = Object.values(row);
    const colA   = String(vals[iA] || '').trim();
    if (!colA) return null;

    const uDate  = _toDate(vals[iU]);
    if (!uDate) return null;                           // no date → skip
    if (uDate > in30days) return null;                 // beyond window → skip

    const tDate  = _toDate(vals[iT]);
    const offset = (tDate && uDate) ? Math.round(
      (tDate.getTime() - uDate.getTime()) / 86400000
    ) : null;

    const colE   = String(vals[iE] || '').trim();
    const isPast = uDate < today;

    return {
      colA,
      colE,
      colH:    String(vals[iH] || '').trim(),
      colI:    String(vals[iI] || '').trim(),
      colJ:    String(vals[iJ] || '').trim(),
      colW:    String(vals[iW] || '').trim(),
      colZ:    String(vals[iZ] || '').trim(),
      uDate,
      offset,
      isPast,
      isReleased: /released/i.test(colE),
    };
  }).filter(Boolean);

  // Sort within each group by offset (or by uDate if offset null)
  const sortFn = (a, b) => {
    const aO = a.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    const bO = b.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    return _lateSortDir === 'asc' ? aO - bO : bO - aO;
  };

  const pastRows   = rows.filter(r =>  r.isPast).sort(sortFn);
  const futureRows = rows.filter(r => !r.isPast).sort(sortFn);

  // Header names
  const hA = headers[iA] || 'Kol A';
  const hE = headers[iE] || 'Status';
  const hH = headers[iH] || 'Kol H';
  const hI = headers[iI] || 'Kol I';
  const hJ = headers[iJ] || 'Kol J';
  const hW = headers[iW] || 'Kol W';
  const hZ = headers[iZ] || 'Kol Z';
  const hU = headers[iU] || 'Leverdatum (U)';
  const hT = headers[iT] || 'Kol T';

  const thead = `<thead><tr>
    <th style="width:26px">#</th>
    <th>${esc(hA)}</th>
    <th title="Released = orderbevestiging nodig">${esc(hE)}</th>
    <th>${esc(hH)}</th>
    <th>${esc(hI)}</th>
    <th>${esc(hJ)}</th>
    <th>${esc(hW)}</th>
    <th>${esc(hZ)}</th>
    <th>Leverdatum (U)</th>
    <th title="${esc(hT)} − ${esc(hU)}">Offset (T−U)</th>
  </tr></thead>`;

  function buildRow(r, i) {
    let offDisp = '—', offCls = '';
    if (r.offset !== null) {
      offDisp = (r.offset > 0 ? '+' : '') + r.offset;
      offCls  = r.offset < 0 ? 'late-neg' : r.offset === 0 ? 'late-zero' : 'late-pos';
    }
    const relCls    = r.isReleased ? 'late-released' : '';
    const pastCls   = r.isPast     ? 'late-past'     : 'late-future';
    const relBadge  = r.isReleased
      ? `<span class="released-badge">! OB ophalen</span>`
      : '';

    return `<tr class="late-row ${pastCls} ${offCls} ${relCls}">
      <td class="rc">${i + 1}</td>
      <td>${esc(r.colA)}</td>
      <td class="status-cell">${esc(r.colE)} ${relBadge}</td>
      <td>${esc(r.colH)}</td>
      <td>${esc(r.colI)}</td>
      <td>${esc(r.colJ)}</td>
      <td>${esc(r.colW)}</td>
      <td>${esc(r.colZ)}</td>
      <td class="date-cell ${r.isPast ? 'date-past' : 'date-future'}">${_fmtDate(r.uDate)}</td>
      <td class="offset-cell ${offCls}">${offDisp}</td>
    </tr>`;
  }

  const separatorRow = `<tr class="late-separator">
    <td colspan="10">
      <span class="sep-past">▲ Verleden</span>
      <span class="sep-line"></span>
      <span class="sep-future">▼ Komende 30 dagen</span>
    </td>
  </tr>`;

  let rowNum = 0;
  const pastHtml   = pastRows.map(r   => buildRow(r,   ++rowNum)).join('');
  const futureHtml = futureRows.map(r => buildRow(r,   ++rowNum)).join('');

  let tbody = '';
  if (pastRows.length)   tbody += pastHtml;
  if (pastRows.length && futureRows.length) tbody += separatorRow;
  if (futureRows.length) tbody += futureHtml;
  if (!tbody) tbody = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:1.5rem">Geen items in het venster (verleden + komende 30 dagen).</td></tr>';

  const tbl = document.getElementById('result-table');
  if (tbl) tbl.innerHTML = thead + '<tbody>' + tbody + '</tbody>';

  const relCount = rows.filter(r => r.isReleased).length;
  setStatus(
    `Late Items: ${pastRows.length} verstreken · ${futureRows.length} komende 30 dagen` +
    (relCount ? ` · ⚠ ${relCount} Released (OB ophalen)` : '')
  );
}
