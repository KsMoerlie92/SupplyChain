// ── UI wiring: showTab, getLegplanRows, checkHSCodes, toggleHSMeasures ──────
// ── Tab switching ──────────────────────────────────────────────────────────
function showTab(tab, el) {
  document.querySelectorAll('.tab-chip').forEach(c => c.className = 'tab-chip');
  document.getElementById('legplan-wrap').classList.toggle('visible', tab === 'legplan');
  document.getElementById('cipl-wrap').classList.toggle('visible', tab === 'cipl');
  el.classList.add(tab === 'legplan' ? 'active-legplan' : 'active-cipl');
  if (tab === 'cipl') initCIPL();
}

// ── getLegplanRows: override from the shared JS (uses allRows) ─────────────
// Filter: BL# leeg · Kol Z niet "not received yet" (tenzij toggle aan)
function getLegplanRows() {
  const inclNRY = document.getElementById('toggle-nry')?.checked ?? false;
  return allRows.filter(r => {
    const alBlank = !r.colAL || r.colAL.trim() === '';
    if (!alBlank) return false;
    const zVal  = (r.colZ||'').trim().toLowerCase();
    const isNRY = zVal === 'not received yet' || zVal === '';
    if (isNRY && !inclNRY) return false;
    return true;
  });
}

// ── CIPL: override initCIPL to work with moederFile ───────────────────────
// ── HS-code check via lokale GN-nomenclatuur 2026 + tariffnumber.com ──────
// Zelfde methode als de Itemlijst-Validator:
//   1. Lokale check : GN_CODES (shared/gn_codes_2026.js — 22K geldige 10-cijferige codes, suffix 80)
//   2. Maatregelen  : tariffnumber.com/api/v1/cnDuties (gratis, geen CORS)
//   3. Paneel       : toont export-/dual-use-beperkingen + Vietnam/ERGA OMNES
//   4. Fallback     : deep-link naar tariffnumber.com
const TARIC_INVALID_MSG =
  'The goods code is not or no longer valid in the European Union. ' +
  'Please try entering the first 6 digits and browse the nomenclature ' +
  'until you find a proper description corresponding to your product.';

// Maatregeltypes relevant voor export (Royal IHC verscheept goederen VANUIT de EU).
// Brede herkenning: vangt o.a. "Export authorization (Dual use)", "Export control - Waste",
// "Export control on restricted goods and technologies", "Restriction on export", embargo's, sancties.
const EXPORT_RE = /(dual.?use|export|restrict|prohibit|embargo|sanction)/i;
function _isExportMeasure(d) { return EXPORT_RE.test(d.measure_type || ''); }

// "All third countries" / ERGA OMNES (codes 1008 & 1011) — altijd tonen
function _isAllThird(d) {
  return ['1008', '1011'].includes(String(d.origin_code || '')) ||
         /all third countries|erga omnes/i.test(d.origin || '');
}

const _hsCache = new Map(); // taric10 → { valid, desc, measures }

// Normaliseer naar 10-cijferige TARIC-code (8/10 cijfers → rechts aanvullen met nullen)
function _toTaric10(input) {
  const clean = String(input || '').replace(/\s|\./g, '');
  if (!/^\d{8,10}$/.test(clean)) return null;
  return clean.padEnd(10, '0').slice(0, 10);
}

function _tariffPageLink(t10) {
  return `https://www.tariffnumber.com/2026/${t10.replace(/0+$/, '')}`;
}

// Goederennomenclatuur raadplegen op douane.nl (gebruikt bij een niet-gevonden HS-code)
function _douaneNomenclatuurLink(rawDigits) {
  const sd = new Date().toISOString().slice(0, 10); // peildatum = vandaag
  return `https://tarief.douane.nl/ite-tariff-public/#/taric/nomenclature/sbn`
       + `?sd=${sd}&d=I&cc=${encodeURIComponent(rawDigits)}&l=nl&ql=nl`;
}

// Suggestieve opzoeklink voor een regulation/decision (EUR-Lex via Google)
function _regLookupLink(legalBase) {
  return `https://www.google.com/search?q=${encodeURIComponent('EUR-Lex ' + legalBase)}`;
}

// TARIC-datum (YYYY-MM-DD) → DD-MM-YYYY; leeg/placeholder → '—'
function _fmtTaricDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim());
  if (!m) return esc(String(d));
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Handelsmaatregelen ophalen van tariffnumber.com (gratis, geen CORS)
async function _fetchMeasures(t10) {
  const url = `https://www.tariffnumber.com/api/v1/cnDuties?term=${t10}&lang=en&year=2026`;
  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && Array.isArray(data.duties)) return data.duties;
  } catch { /* netwerk/timeout → toon alleen de link */ }
  return null;
}

// ── Maatregelen-paneel (slide-down onder de rij) ──────────────────────────
function toggleHSMeasures(hsCode, trEl) {
  if (!trEl) return;
  const t10 = _toTaric10(hsCode);
  const pageLink = t10
    ? _tariffPageLink(t10)
    : `https://www.tariffnumber.com/2026/${String(hsCode || '').replace(/\s|\./g, '')}`;

  // Toggle: bestaand paneel sluiten
  const next = trEl.nextElementSibling;
  if (next && next.classList.contains('hs-measures-row')) {
    const panel = next.querySelector('.hs-measures-panel');
    if (panel && panel.classList.contains('open')) {
      panel.classList.remove('open');
      setTimeout(() => { if (next.parentNode) next.remove(); }, 350);
    } else if (panel) {
      panel.classList.add('open');
    }
    return;
  }

  // Lokale geldigheid cachen indien nog niet bekend
  if (t10 && !_hsCache.has(t10)) {
    const valid = (typeof GN_CODES !== 'undefined') ? GN_CODES.has(t10) : null;
    _hsCache.set(t10, { valid, desc: '', measures: null });
  }
  const cached = t10 ? _hsCache.get(t10) : { valid: false, desc: '', measures: null };

  const expandRow = document.createElement('tr');
  expandRow.className = 'hs-measures-row';
  const expTd = document.createElement('td');
  expTd.colSpan = 99;

  const rawDigits = String(hsCode || '').replace(/\s|\./g, '');
  const douaneLink = _douaneNomenclatuurLink(rawDigits);

  const renderPanel = (c) => {
    if (!t10 || !c || !c.valid) {
      return `<div class="hs-measures-inner hs-restricted">
        <div style="color:#ef4444;font-weight:700;margin-bottom:.5rem">
          ✗ HS-code niet gevonden in EU CN 2026: <code>${esc(String(hsCode || ''))}</code>
        </div>
        <div style="font-size:.78rem;color:var(--muted);line-height:1.55">${esc(TARIC_INVALID_MSG)}</div>
        <div style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <a href="${esc(douaneLink)}" target="_blank" class="hs-taric-btn">🔍 Goederennomenclatuur raadplegen (douane.nl) ↗</a>
        </div>
      </div>`;
    }

    const duties  = c.measures;
    const pageBtn = `<a href="${esc(pageLink)}" target="_blank" class="hs-taric-btn">📋 tariffnumber.com ↗</a>`;

    if (duties === null) {
      return `<div class="hs-measures-inner hs-clean">
        <span style="font-weight:700">✓ <code>${esc(t10)}</code></span> — geldig in EU CN 2026
        <div style="margin-top:.5rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          ${pageBtn}
          <span style="color:var(--muted);font-size:.65rem">⏳ Maatregelen laden…</span>
        </div>
      </div>`;
    }

    if (duties.length === 0) {
      return `<div class="hs-measures-inner hs-clean">
        <span style="font-weight:700">✓ <code>${esc(t10)}</code></span> — geldig, geen maatregelen gevonden
        <div style="margin-top:.5rem">${pageBtn}</div>
      </div>`;
    }

    const exportMeasures   = duties.filter(_isExportMeasure);
    const vnMeasures       = duties.filter(d => d.origin_code === 'VN');
    const allThirdMeasures = duties.filter(_isAllThird);

    const hasDualUse  = exportMeasures.some(d => /dual.?use/i.test(d.measure_type));
    const hasRestrict = exportMeasures.some(d => /export|restrict|prohibit|embargo|sanction/i.test(d.measure_type));
    const dualReg     = exportMeasures.find(d => /dual.?use/i.test(d.measure_type))?.legal_base || '';
    const flagHtml = [
      hasDualUse  ? `<span class="hs-flag hs-flag-warn">⚠️ DUAL USE${dualReg ? ' — Reg. ' + esc(dualReg) : ''}</span>` : '',
      hasRestrict ? `<span class="hs-flag hs-flag-alert">⛔ EXPORT CONTROL</span>` : '',
    ].filter(Boolean).join(' ');

    // Eén maatregel als overzichtelijke kaart
    const renderCard = (d) => {
      const isExport = _isExportMeasure(d);
      const isVN     = d.origin_code === 'VN';
      const isThird  = _isAllThird(d);
      const cls = isExport ? 'export' : isVN ? 'vn' : isThird ? 'erga' : 'other';
      const originTxt = `${esc(d.origin || '—')}${d.origin_code ? ` (${esc(String(d.origin_code))})` : ''}`;
      const start = _fmtTaricDate(d.start_date);
      const end   = d.end_date ? _fmtTaricDate(d.end_date) : 'doorlopend';
      const dates = start ? `${start} → ${end}` : '';
      const reg   = d.legal_base
        ? `<span class="hs-m-reg">⚖ ${esc(d.legal_base)}
             <a href="${esc(_regLookupLink(d.legal_base))}" target="_blank" class="hs-m-reglink" title="Zoek deze regelgeving op">🔍 opzoeken ↗</a>
           </span>` : '';
      return `<div class="hs-m-card hs-m-${cls}">
        <div class="hs-m-row1">
          <span class="hs-m-type">${esc(d.measure_type || '—')}</span>
          ${d.duty && String(d.duty).trim() ? `<span class="hs-m-duty">${esc(String(d.duty).trim())}</span>` : ''}
        </div>
        <div class="hs-m-row2">
          <span class="hs-m-origin">🌍 ${originTxt}</span>
          ${dates ? `<span class="hs-m-dates">📅 ${dates}</span>` : ''}
        </div>
        ${reg ? `<div class="hs-m-row3">${reg}</div>` : ''}
      </div>`;
    };

    // Belangrijke maatregelen vooraan: export-controle → All third countries → Vietnam.
    // Dedup op type+regulation+oorsprong+recht zodat distincte maatregelen niet wegvallen.
    const key = d => [d.measure_type, d.legal_base, d.origin_code, d.duty].join('|');
    const importantRaw = [...exportMeasures, ...allThirdMeasures, ...vnMeasures];
    const seen = new Set();
    const shown = [];
    importantRaw.forEach(d => { const k = key(d); if (!seen.has(k)) { seen.add(k); shown.push(d); } });
    // Sorteer: export-controle eerst
    shown.sort((a, b) => (_isExportMeasure(b) ? 1 : 0) - (_isExportMeasure(a) ? 1 : 0));

    const others = duties.filter(d => !seen.has(key(d)));
    const shownHtml  = shown.length
      ? shown.map(renderCard).join('')
      : `<div style="color:var(--muted);font-size:.72rem;padding:.3rem 0">Geen export-/landgebonden maatregelen — alleen algemene tarieven.</div>`;
    const othersHtml = others.length
      ? `<details style="margin-top:.5rem">
          <summary style="cursor:pointer;font-size:.68rem;color:var(--muted);padding:.25rem 0">
            + ${others.length} overige maatregel(en) (tariefpreferenties per land)
          </summary>
          <div style="margin-top:.35rem">${others.map(renderCard).join('')}</div>
        </details>` : '';

    return `<div class="hs-measures-inner ${exportMeasures.length ? 'hs-restricted' : 'hs-clean'}">
      <div class="hs-m-head">
        <span style="font-weight:700">✓ <code>${esc(t10)}</code></span>
        <span style="color:var(--muted);font-size:.66rem">— ${duties.length} maatregel(en)</span>
        ${flagHtml}
        <span style="margin-left:auto">${pageBtn}</span>
      </div>
      ${shownHtml}
      ${othersHtml}
    </div>`;
  };

  expTd.innerHTML = `<div class="hs-measures-panel">${renderPanel(cached)}</div>`;
  expandRow.appendChild(expTd);
  trEl.insertAdjacentElement('afterend', expandRow);
  requestAnimationFrame(() => {
    const p = expTd.querySelector('.hs-measures-panel');
    if (p) p.classList.add('open');
  });

  // Maatregelen async ophalen indien geldig en nog niet geladen
  if (t10 && cached && cached.valid && cached.measures === null) {
    (async () => {
      const duties = await _fetchMeasures(t10);
      const newCached = { ...(_hsCache.get(t10) || cached), measures: duties || [] };
      _hsCache.set(t10, newCached);
      const panel = expTd.querySelector('.hs-measures-panel');
      if (panel) panel.innerHTML = renderPanel(newCached);
    })();
  }
}

// ── Bulk-controle van alle HS-codes via GN-nomenclatuur 2026 ──────────────
function checkHSCodes() {
  const btn   = document.getElementById('btn-hs-check');
  const cells = document.querySelectorAll('td.hs-cell');
  if (!cells.length) { alert('Laad eerst een CIPL shipment.'); return; }

  if (typeof GN_CODES === 'undefined') {
    alert('GN-nomenclatuur (gn_codes_2026.js) is niet geladen.');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Controleren…'; }

  let valid = 0, invalid = 0;

  cells.forEach(cell => {
    const raw = (cell.dataset.hs || cell.textContent || '').replace(/\s|\./g, '').trim();
    const row = cell.closest('tr');
    const sc  = row ? row.querySelector('td.hs-status') : null;
    const t10 = _toTaric10(raw);

    if (row) row.classList.remove('hs-valid', 'hs-invalid', 'hs-checking', 'hs-manual');

    if (!t10) {
      invalid++;
      if (row) row.classList.add('hs-invalid');
      if (sc) sc.innerHTML =
        `<a class="hs-link" href="${_douaneNomenclatuurLink(raw)}" target="_blank"
           style="color:#ef4444" title="Geen geldige 8/10-cijferige code — klik om de goederennomenclatuur te raadplegen (douane.nl)">✗</a>`;
      return;
    }

    const found   = GN_CODES.has(t10);
    _hsCache.set(t10, { valid: found, desc: '', measures: null });
    const pageUrl = _tariffPageLink(t10);

    if (found) {
      valid++;
      if (row) row.classList.add('hs-valid');
      if (sc) sc.innerHTML =
        `<a class="hs-link" href="${pageUrl}" target="_blank"
           style="color:#22c55e" title="Geldig in EU CN 2026 — klik voor tariffnumber.com">✓</a>`;
    } else {
      invalid++;
      if (row) row.classList.add('hs-invalid');
      if (sc) sc.innerHTML =
        `<a class="hs-link" href="${_douaneNomenclatuurLink(raw)}" target="_blank"
           style="color:#ef4444" title="NIET gevonden in EU CN 2026 — klik om de goederennomenclatuur te raadplegen (douane.nl)">✗</a>`;
    }
  });

  const statsEl = document.getElementById('cipl-stats');
  if (statsEl) {
    statsEl.innerHTML = statsEl.innerHTML.replace(/ · <span[^>]*>.*?<\/span>/g, '');
    let msg = '';
    if (invalid > 0) msg += ` · <span style="color:#ef4444"><strong>${invalid}</strong> HS code(s) NIET geldig ✗</span>`;
    if (valid   > 0) msg += ` · <span style="color:#22c55e"><strong>${valid}</strong> geldig ✓</span>`;
    msg += ` · <span style="color:var(--muted);font-size:.6rem">Bron: GN-nomenclatuur 2026 (EU 2025/1926) + tariffnumber.com</span>`;
    statsEl.innerHTML += msg;
  }

  if (btn) { btn.disabled = false; btn.textContent = '🔍 Controleer HS Codes'; }
}

function _runInitCIPL() { initCIPL(); } // compat shim — real initCIPL defined after js_block

function _initCIPLFromSheet2(mData) {
  const headers = mData.length ? Object.keys(mData[0]) : [];
  // Try 'Shipment ' (trailing space) or 'Shipment'
  const shipCol = headers.find(h => h && h.trim().toLowerCase() === 'shipment') ||
                  headers.find(h => h && h.trim().toLowerCase().startsWith('shipment'));
  if (!shipCol) {
    document.getElementById('cipl-stats').textContent =
      'Kolom "Shipment" niet gevonden in Sheet2.'; return;
  }
  const shipVals = [...new Set(
    mData.map(r => String(r[shipCol]||'').trim()).filter(Boolean)
  )].sort((a,b) => (parseFloat(a)||999)-(parseFloat(b)||999) || a.localeCompare(b));

  const sel = document.getElementById('cipl-shipment-sel');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— kies shipment —</option>' +
    shipVals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if (prev && shipVals.includes(prev)) sel.value = prev;
  sel.dataset.shipCol   = shipCol;
  sel.dataset.useSheet2 = '1';
  renderCIPL();
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────
document.querySelectorAll('.drop-zone').forEach(dz => {
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const input = dz.querySelector('input[type=file]');
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
});

