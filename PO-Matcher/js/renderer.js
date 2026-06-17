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
      : '<span class="badge-ok">✓ NOG TE VERWERKEN</span>';

    tr.innerHTML = `
      <td class="${r.xlookup ? 'match' : 'no-match'}" style="font-weight:700">
        <span class="expand-arrow">▶</span><span class="col-indicator" style="background:${r.xlookup ? '#70AD47' : '#C0392B'};"></span>${
          r.xlookup ? esc(r.xlookup) : esc(r.combined)
        }</td>
      <td class="cell-supplier" title="${esc(r.colSupplier || '')}">${esc(_capStr(r.colSupplier || '—', 18))}</td>
      <td class="cell-qty">${
        r.colF || r.expColO
          ? (esc(r.colF || '—') + (r.expColO ? ' / ' + esc(r.expColO) : ''))
          : '—'
      }</td>
      <td class="cell-location" title="${esc(r.colE || '')}">${esc(r.colE || '—')}</td>
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

// ── Kolomsorteerder hoofdtabel ("In beide lijsten" / "Alleen moeder") ───────
let _resSortCol = null;     // null = originele volgorde
let _resSortDir = 'asc';    // 'asc' | 'desc'

function setResSort(key) {
  if (_resSortCol === key) _resSortDir = (_resSortDir === 'asc') ? 'desc' : 'asc';
  else { _resSortCol = key; _resSortDir = 'asc'; }
  _updateResArrows();
  applyFilters();
}

function _resKey(r) {
  switch (_resSortCol) {
    case 'ref':      return ((r.xlookup || r.combined) || '').toLowerCase();
    case 'supplier': return (r.colSupplier || '').toLowerCase();
    case 'qty': {
      const v = String(r.colF || r.expColO || '').replace(',', '.').trim();
      const n = parseFloat(v);
      return (v !== '' && !isNaN(n) && /^[\d.\s]+$/.test(v)) ? n : v.toLowerCase();
    }
    case 'colE':     return (r.colE || '').toLowerCase();
    case 'status':   return r.noMatch ? 1 : 0;   // matches eerst bij oplopend
    default:         return null;
  }
}

function _resSortRows(rows) {
  if (!_resSortCol) return rows;
  const dir = (_resSortDir === 'desc') ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const av = _resKey(a), bv = _resKey(b);
    const ab = (av === null || av === undefined || av === '');
    const bb = (bv === null || bv === undefined || bv === '');
    if (ab && bb) return 0;
    if (ab) return 1;            // lege waarden onderaan
    if (bb) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'nl', { numeric: true }) * dir;
  });
}

function _updateResArrows() {
  document.querySelectorAll('#result-table thead th.res-sortable').forEach(th => {
    const k = th.dataset.sort;
    const sp = th.querySelector('.res-arrow');
    if (sp) sp.textContent = (_resSortCol === k) ? (_resSortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  });
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
    renderTable(_resSortRows(rows));
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

// Kolomsorteerder Late Items — klik op een kolomkop sorteert beide secties (verstreken + komende)
let _lateSortCol = 'offset';   // 'colA' | 'colM' | 'colJ' | 'wanted' | 'confirmed' | 'offset'
let _lateSortDir = 'asc';      // 'asc' | 'desc'

function setLateSortCol(key) {
  if (_lateSortCol === key) _lateSortDir = (_lateSortDir === 'asc') ? 'desc' : 'asc';
  else { _lateSortCol = key; _lateSortDir = 'asc'; }
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
  // Excel serial number — ALLEEN bij een puur numerieke waarde.
  // (Niet bij ISO-strings als "2026-07-18": parseFloat zou daar 2026 van maken!)
  if (typeof v === 'number' || /^\d+([.,]\d+)?$/.test(s)) {
    const n = parseFloat(s.replace(',', '.'));
    if (!isNaN(n) && n > 1000) {
      const d = new Date(Math.round((n - 25569 + 0.5) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  // ISO YYYY-MM-DD (ook volledige ISO-tijdstempels, bv. centrale JSON-data)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // European DD-MM-YYYY or DD/MM/YYYY
  const eu = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (eu) return new Date(+eu[3], +eu[2]-1, +eu[1]);
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
    Selecteer links één of meer Sub Projecten uit de centrale Expediting-lijst.<br>
    Geen centrale lijst geladen? Upload de bedrijfsbrede Expediten op de <a href="../Admin/" style="color:var(--teal)">Admin-pagina</a>.</td></tr>`;
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

  // ── Kolommen op NAAM opzoeken (robuust; posities als fallback) ────────────
  // Voorkomt dat een verschoven kolomvolgorde de verkeerde data oplevert.
  const _hmap = {};
  headers.forEach((h, i) => { const k = String(h == null ? '' : h).trim(); if (k && !(k in _hmap)) _hmap[k] = i; });
  const col  = (name, fb) => (name in _hmap) ? _hmap[name] : fb;   // met positionele fallback
  const colN = (name)     => (name in _hmap) ? _hmap[name] : -1;   // alleen op naam (−1 = afwezig)

  const iA  = col('Purchase Order No', 0);
  const iE  = col('PO Line Status', 4);
  const iF  = col('Sub Project ID', 5);
  const iG  = col('Sub Project Description', 6);
  const iH  = col('Technical Coordinator Name', 7);
  const iI  = col('Buyer Name', 8);
  const iJ  = col('Supplier Name', 9);
  const iK  = col('Part No', 10);
  const iL  = col('Description', 11);
  const iM  = col('Unified Reference Code', 12);
  const iLwr     = col('Latest Wanted Receipt Date', 19);  // Wanted
  const iPlanned = col('Planned Delivery Date', 20);        // tijdlijn-anker (verleden/toekomst)
  const iConf    = colN('Last Confirmed');                  // Confirmed (echte bevestigde datum)
  // optionele detailvelden — alleen tonen als de kolom écht bestaat
  const iLastExp = colN('Last Expedited');
  const iHdrNote = colN('PO Header Note');
  const iLineNote= colN('PO Line Note');
  const iFatProt = colN('FAT Supplier Protocol Date');
  const iFatReq  = colN('FAT Date Required');

  const today    = new Date(); today.setHours(0,0,0,0);
  const maxDate  = new Date(today); maxDate.setMonth(today.getMonth() + 1); // 1 month ahead

  const rows = expData.map((row, ri) => {
    const vals = Object.values(row);
    const colA = gs(vals, iA);
    if (!colA) return null;

    const wantedDate  = _toDate(g(vals, iLwr));                 // Latest Wanted Receipt Date
    const confDate    = iConf >= 0 ? _toDate(g(vals, iConf)) : null; // Last Confirmed
    const plannedDate = _toDate(g(vals, iPlanned));             // Planned Delivery Date

    // Tijdlijn-anker = geplande leverdatum (valt terug op confirmed/wanted als planned ontbreekt)
    const delivDate = plannedDate || confDate || wantedDate;
    if (!delivDate) return null;                  // geen datum → overslaan
    if (delivDate > maxDate) return null;         // buiten venster (komende maand) → overslaan

    // Offset = Wanted − Confirmed (negatief = bevestigd ná gewenst = te laat); leeg zonder confirmed
    const offset = (wantedDate && confDate)
      ? Math.round((wantedDate.getTime() - confDate.getTime()) / 86400000) : null;

    const statusVal   = gs(vals, iE);
    const isReleased  = /released/i.test(statusVal);
    const isConfirmed = /confirmed/i.test(statusVal);

    // Alleen nog-open items (Released of Confirmed); overige statussen overslaan.
    if (!isReleased && !isConfirmed) return null;

    const isPast = delivDate < today;

    return {
      colA, statusVal, isReleased, isConfirmed, isPast,
      colM:  gs(vals, iM),   // Unified Reference Code
      colJ:  gs(vals, iJ),   // Supplier Name
      colL:  gs(vals, iL),   // Description
      colH:  gs(vals, iH),   colI:  gs(vals, iI),
      lastExp:  iLastExp  >= 0 ? gs(vals, iLastExp)  : '',
      hdrNote:  iHdrNote  >= 0 ? gs(vals, iHdrNote)  : '',
      lineNote: iLineNote >= 0 ? gs(vals, iLineNote) : '',
      fatProt:  iFatProt  >= 0 ? gs(vals, iFatProt)  : '',
      fatReq:   iFatReq   >= 0 ? gs(vals, iFatReq)   : '',
      wantedDate, confDate, plannedDate, delivDate, offset,
    };
  }).filter(Boolean);

  const _lateKey = (r) => {
    switch (_lateSortCol) {
      case 'colA':      return (r.colA || '').toLowerCase();
      case 'colM':      return (r.colM || '').toLowerCase();
      case 'colJ':      return (r.colJ || '').toLowerCase();
      case 'colL':      return (r.colL || '').toLowerCase();
      case 'wanted':    return r.wantedDate ? r.wantedDate.getTime() : null;
      case 'confirmed': return r.confDate   ? r.confDate.getTime()   : null;
      case 'offset':    return (r.offset === null || r.offset === undefined) ? null : r.offset;
      default:          return null;
    }
  };
  const sortFn = (a, b) => {
    const dir = (_lateSortDir === 'desc') ? -1 : 1;
    const av = _lateKey(a), bv = _lateKey(b);
    const aBlank = (av === null || av === undefined || av === '');
    const bBlank = (bv === null || bv === undefined || bv === '');
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;            // lege/ontbrekende waarden altijd onderaan
    if (bBlank) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'nl', { numeric: true }) * dir;
  };

  const pastRows   = rows.filter(r =>  r.isPast).sort(sortFn);
  const futureRows = rows.filter(r => !r.isPast).sort(sortFn);

  const _sortTh = (key, label) => {
    const active = _lateSortCol === key;
    const arrow  = active ? (_lateSortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
    return `<th class="late-sortable${active ? ' late-sort-active' : ''}" onclick="setLateSortCol('${key}')" style="cursor:pointer;user-select:none" title="Sorteer op ${esc(String(label))}">${esc(String(label))}${arrow}</th>`;
  };
  const thead = `<thead><tr>
    <th style="width:22px"></th>
    ${_sortTh('colA', hn(iA))}
    ${_sortTh('colM', hn(iM))}
    ${_sortTh('colJ', hn(iJ))}
    ${_sortTh('colL', 'Description')}
    ${_sortTh('wanted', 'Wanted')}
    ${_sortTh('confirmed', 'Confirmed')}
    ${_sortTh('offset', 'Offset (W\u2212C)')}
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

    if (r.lastExp)  detFields.push(['Last Expedited', (() => { const d = _toDate(r.lastExp); return d ? _fmtDate(d) : r.lastExp; })()]);
    if (r.hdrNote)  detFields.push(['PO Header Note', r.hdrNote]);
    if (r.lineNote) detFields.push(['PO Line Note',   r.lineNote]);
    if (r.fatProt)  detFields.push(['FAT Supplier Protocol Date', (() => { const d = _toDate(r.fatProt); return d ? _fmtDate(d) : r.fatProt; })()]);
    if (r.fatReq)   detFields.push(['FAT Date Required',          (() => { const d = _toDate(r.fatReq);  return d ? _fmtDate(d) : r.fatReq;  })()]);
    if (r.plannedDate) detFields.push(['Planned Delivery Date', _fmtDate(r.plannedDate)]);

    const mainRow = `<tr class="late-row ${rowCls} ${offCls}" onclick="toggleLateDetail(${i})" style="cursor:pointer">
      <td class="late-tog-cell"><button class="late-tog-btn" id="late-tog-${i}" tabindex="-1">▼</button></td>
      <td>${esc(r.colA)}</td>
      <td class="status-cell">${esc(r.colM)}</td>
      <td title="${esc(r.colJ || '')}">${esc(_capStr(r.colJ, 18))} ${relBadge}</td>
      <td class="late-desc-cell" title="${esc(r.colL || '')}">${esc(r.colL || '—')}</td>
      <td class="date-cell">${_fmtDate(r.wantedDate)}</td>
      <td class="date-cell ${r.isPast ? 'date-past' : 'date-future'}">${_fmtDate(r.confDate)}</td>
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
  setStatus(`Expediting list: ${pastCount} verstreken · ${futCount} komende 30 dagen${relCount ? ` · ⚠ ${relCount} Released` : ''}`);
}
// Helper: kort tekst af op n tekens met ellipsis (hoisted, overal bruikbaar)
function _capStr(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\u2026' : s; }
