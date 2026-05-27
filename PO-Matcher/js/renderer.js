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

  // Switching away from Late Items: restore result-tbody if it was overwritten
  const tbl = document.getElementById('result-table');
  if (tbl && !document.getElementById('result-tbody')) {
    tbl.innerHTML = '<tbody id="result-tbody"></tbody>';
  }

  if (!isVal) applyFilters();
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
// Reads Expediting list directly (headers from row 3 via file-loader).
// Window: Col U (delivery date) in past OR within next 30 days.
// Offset = Col T (index 19) − Col U (index 20).
// Status col (idx 3): "Released" = amber row, "Confirmed" = neutral.
// Detail panel per row: W, Z, __EMPTY_6/7 (real names after fix), AG, AH.

let _lateSortDir = 'asc';

function setLateSort(dir) {
  _lateSortDir = dir;
  document.getElementById('late-sort-asc') .classList.toggle('active', dir === 'asc');
  document.getElementById('late-sort-desc').classList.toggle('active', dir === 'desc');
  renderLateItems();
}

function _toDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  if (!isNaN(n) && n > 1000) return new Date(Math.round((n - 25569) * 86400 * 1000));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function _fmtDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

let _lateOpenRows = new Set(); // track which detail rows are open

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
  const rtw = document.getElementById('result-table-wrap');
  if (rtw) rtw.style.display = '';

  const expData = fileData?.expediting?.data;
  if (!expData || !expData.length) {
    document.getElementById('result-table').innerHTML =
      '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">Laad eerst de Expediting lijst.</td></tr>';
    return;
  }

  const headers = fileData.expediting.headers || Object.keys(expData[0]);

  // ── Column indices (0-based positional) ──────────────────────────────────
  const iA      = 0;   // Kol A
  const iStatus = 3;   // Kol D — Status (Released / Confirmed) — hidden, drives row color
  const iH      = 7;   // Kol H  — visible
  const iI      = 8;   // Kol I  — visible
  const iJ      = 9;   // Kol J  — visible
  const iE6     = 6;   // __EMPTY_6 → real name after header fix → detail
  const iE7     = 7;   // __EMPTY_7 → BUT wait, iH is also 7. We use named lookup below.
  const iW      = 22;  // Kol W  — detail
  const iZ      = 25;  // Kol Z  — detail
  const iT      = 19;  // Kol T
  const iU      = 20;  // Kol U  — delivery date
  const iAG     = 32;  // Kol AG — detail if filled
  const iAH     = 33;  // Kol AH — detail if filled

  // Resolve column name at a given index
  const hdr = (idx) => headers[idx] ? String(headers[idx]).trim() : `Kol ${idx+1}`;
  // Check if a header looks like a real name (not __COL_ or __EMPTY_)
  const realName = (idx) => {
    const h = hdr(idx);
    return (!h.startsWith('__')) ? h : `Kolom ${String.fromCharCode(65 + idx)}`;
  };

  // For EMPTY_6/EMPTY_7: they are the 2 columns after J (idx 9)
  // but we have iH=7 for the visible column. Let's use named lookup.
  // The "EMPTY_6" and "EMPTY_7" in the OLD (row-1) reading were at indices 6 and 7.
  // After row-3 reading they may overlap with H or have distinct names.
  // Use a safe approach: find cols 5 and 6 (F and G area) as the "extra" detail cols.
  // Specifically: EMPTY_6 = index 5, EMPTY_7 = index 6 based on user's description
  // (they are between E=4 and H=7, so indices 5 and 6 = F and G)
  const iExtraA = 5;   // was __EMPTY_6 → now has real name → detail
  const iExtraB = 6;   // was __EMPTY_7 → now has real name → detail

  const today    = new Date(); today.setHours(0,0,0,0);
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30);

  const rows = expData.map(row => {
    const vals  = Object.values(row);
    const colA  = String(vals[iA] || '').trim();
    if (!colA) return null;

    const uDate = _toDate(vals[iU]);
    if (!uDate) return null;
    if (uDate > in30days) return null;

    const tDate  = _toDate(vals[iT]);
    const offset = (tDate && uDate)
      ? Math.round((tDate.getTime() - uDate.getTime()) / 86400000) : null;

    const statusVal = String(vals[iStatus] || '').trim();
    const isPast    = uDate < today;
    const isReleased  = /released/i.test(statusVal);
    const isConfirmed = /confirmed/i.test(statusVal);

    return {
      colA,
      statusVal,
      isReleased, isConfirmed,
      colH:     String(vals[iH]      || '').trim(),
      colI:     String(vals[iI]      || '').trim(),
      colJ:     String(vals[iJ]      || '').trim(),
      colW:     String(vals[iW]      || '').trim(),
      colZ:     String(vals[iZ]      || '').trim(),
      colExA:   String(vals[iExtraA] || '').trim(),
      colExB:   String(vals[iExtraB] || '').trim(),
      colAG:    String(vals[iAG]     || '').trim(),
      colAH:    String(vals[iAH]     || '').trim(),
      uDate, offset, isPast,
    };
  }).filter(Boolean);

  const sortFn = (a, b) => {
    const aO = a.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    const bO = b.offset ?? (_lateSortDir === 'asc' ? Infinity : -Infinity);
    return _lateSortDir === 'asc' ? aO - bO : bO - aO;
  };

  const pastRows   = rows.filter(r =>  r.isPast).sort(sortFn);
  const futureRows = rows.filter(r => !r.isPast).sort(sortFn);

  const thead = `<thead><tr>
    <th style="width:22px"></th>
    <th style="width:26px">#</th>
    <th>${esc(realName(iA))}</th>
    <th>${esc(realName(iH))}</th>
    <th>${esc(realName(iI))}</th>
    <th>${esc(realName(iJ))}</th>
    <th>Leverdatum</th>
    <th>Offset (T−U)</th>
  </tr></thead>`;

  function buildRows(r, i) {
    let offDisp = '—', offCls = '';
    if (r.offset !== null) {
      offDisp = (r.offset > 0 ? '+' : '') + r.offset + 'd';
      offCls  = r.offset < 0 ? 'late-neg' : r.offset === 0 ? 'late-zero' : 'late-pos';
    }
    const relCls  = r.isReleased  ? 'late-released'  : '';
    const conCls  = r.isConfirmed ? 'late-confirmed'  : '';
    const pastCls = r.isPast      ? 'late-past' : 'late-future';
    const hasDetail = r.colW || r.colZ || r.colExA || r.colExB || r.colAG || r.colAH;

    // Detail fields
    const detFields = [];
    if (r.colW)   detFields.push([realName(iW),     r.colW]);
    if (r.colZ)   detFields.push([realName(iZ),     r.colZ]);
    if (r.colExA) detFields.push([realName(iExtraA),r.colExA]);
    if (r.colExB) detFields.push([realName(iExtraB),r.colExB]);
    if (r.colAG)  detFields.push([realName(iAG),    r.colAG]);
    if (r.colAH)  detFields.push([realName(iAH),    r.colAH]);

    const relBadge = r.isReleased
      ? `<span class="released-badge" title="Orderbevestiging ophalen / opvragen">OB ophalen</span>` : '';

    const mainRow = `<tr class="late-row ${pastCls} ${relCls} ${conCls} ${offCls}"
        onclick="toggleLateDetail(${i})" style="cursor:${hasDetail ? 'pointer' : 'default'}">
      <td class="late-tog-cell"><button class="late-tog-btn" id="late-tog-${i}" tabindex="-1">${hasDetail ? '▼' : ''}</button></td>
      <td class="rc">${i + 1}</td>
      <td>${esc(r.colA)}</td>
      <td>${esc(r.colH)}</td>
      <td>${esc(r.colI)}</td>
      <td>${esc(r.colJ)} ${relBadge}</td>
      <td class="date-cell ${r.isPast ? 'date-past' : 'date-future'}">${_fmtDate(r.uDate)}</td>
      <td class="offset-cell ${offCls}">${offDisp}</td>
    </tr>`;

    const detRow = !hasDetail ? '' : `<tr id="late-det-${i}" class="late-detail-row" style="display:none">
      <td colspan="8">
        <div class="late-detail-inner">
          ${detFields.map(([lbl, val]) => `<div class="late-det-field"><span class="late-det-lbl">${esc(lbl)}</span><span class="late-det-val">${esc(val)}</span></div>`).join('')}
        </div>
      </td>
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
  const pastHtml   = pastRows.map(r   => buildRows(r, rowNum++)).join('');
  const futureHtml = futureRows.map(r => buildRows(r, rowNum++)).join('');

  let tbody = '';
  if (pastRows.length)              tbody += pastHtml;
  if (pastRows.length && futureRows.length) tbody += separator;
  if (futureRows.length)            tbody += futureHtml;
  if (!tbody) tbody = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">Geen items in het venster (verleden + komende 30 dagen).</td></tr>';

  _lateOpenRows.clear();
  const tbl = document.getElementById('result-table');
  if (tbl) tbl.innerHTML = thead + '<tbody>' + tbody + '</tbody>';

  const relCount = rows.filter(r => r.isReleased).length;
  setStatus(
    `Late Items: ${pastRows.length} verstreken · ${futureRows.length} komende 30 dagen` +
    (relCount ? ` · ⚠ ${relCount} Released (OB ophalen)` : '')
  );
}
