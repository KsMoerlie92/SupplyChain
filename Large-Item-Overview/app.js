/* Large Item Overview — Royal IHC
 * Toont Large Items, Late Items en FAT Overview vanuit de BEDRIJFSBREDE
 * expediting-lijst. Geen moederlijst nodig.
 *
 * Kolommen worden op NAAM gezocht (robuust), met de kolomletter als terugval.
 * Bevestigde layout (Bedrijfsbreed Expediten, 43 kolommen):
 *   H  Technical Coordinator Name   V  Last Expedited     AO Net Weight
 *   O  Qty                          X  Delivery Address   AP Total Net Weight
 *   S  Delivery Status              Y  Delivery Terms     AQ Weight UoM
 *   T  Latest Wanted Receipt Date   AH FAT Location
 *   U  Planned Delivery Date        AI FAT Date Required
 */
(function () {
  'use strict';

  // naam(en) → kolomletter als terugval
  const MAP = {
    po:        [['Purchase Order No'], 'A'],
    orderNo:   [['Order No'], 'B'],
    status:    [['PO Line Status'], 'E'],
    sp:        [['Sub Project ID'], 'F'],
    spDesc:    [['Sub Project Description'], 'G'],
    engineer:  [['Technical Coordinator Name'], 'H'],
    supplier:  [['Supplier Name'], 'J'],
    part:      [['Part No'], 'K'],
    desc:      [['Description'], 'L'],
    qty:       [['Qty'], 'O'],
    delStatus: [['Delivery Status'], 'S'],
    wanted:    [['Latest Wanted Receipt Date'], 'T'],
    planned:   [['Planned Delivery Date'], 'U'],
    lastExp:   [['Last Expedited'], 'V'],
    address:   [['Delivery Address'], 'X'],
    terms:     [['Delivery Terms'], 'Y'],
    fatLoc:    [['FAT Location'], 'AH'],
    fatDate:   [['FAT Date Required'], 'AI'],
    protoDate: [['FAT Supplier Protocol Date'], 'AG'],
    sysNo:     [['Unified Reference Code'], 'M'],
    refDesc:   [['Unified Ref Code Description'], 'N'],
    netW:      [['Net Weight'], 'AO'],
    totW:      [['Total Net Weight'], 'AP'],
    wUoM:      [['Weight UoM'], 'AQ'],
  };
  // Kolommen zónder welke een tabblad zinloos is. Overige kolommen mogen
  // ontbreken: die blijven leeg, met een melding erboven.
  const NEEDED = {
    large: ['totW'],
    late:  ['delStatus'],
    fat:   ['fatDate'],
  };

  let HEADERS = [], ROWS = [], C = {}, MISSING = [];
  let TAB = 'large', SPSEL = new Set(), THRESHOLD = 1000;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trim = (v) => String(v == null ? '' : v).trim();
  const flat = (v) => trim(v).replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s{2,}/g, ' ');

  // Zoekt uitsluitend op kolomNAAM. De letter in MAP is documentatie: zodra de
  // Admin-upload kolommen wegfiltert kloppen posities niet meer, en een
  // letter-terugval koos dan stilzwijgend de verkeerde kolom.
  function resolveCols(headers) {
    const low = headers.map(h => trim(h).toLowerCase());
    const cols = {}; const missing = [];
    for (const key in MAP) {
      const names = MAP[key][0];
      let i = -1;
      for (const n of names) { i = low.indexOf(n.toLowerCase()); if (i >= 0) break; }
      if (i < 0) missing.push(names[0]);
      cols[key] = i;
    }
    return { cols, missing };
  }

  // ── waarden ──────────────────────────────────────────────────────────────
  const val = (r, key) => (C[key] >= 0 && r[C[key]] != null) ? r[C[key]] : '';
  // Robuuste datumconversie — overgenomen uit PO-Matcher/js/renderer.js zodat
  // Large Item Overview en de Late Items-tab in PO-Matcher altijd dezelfde
  // datum tonen voor hetzelfde item. Verankert Excel-seriegetallen op het
  // MIDDEN van de dag (UTC-noon) vóór lokale reconstructie, en reconstrueert
  // ISO-tijdstempels (met 'T') via lokale getters — anders kan een datum in
  // een tijdzone áchter UTC één dag terugvallen (bv. 12/05 wordt 11/05).
  function toDate(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const s = trim(v); if (!s) return null;
    if (typeof v === 'number' || /^\d+([.,]\d+)?$/.test(s)) {
      const n = parseFloat(s.replace(',', '.'));
      if (!isNaN(n) && n > 1000) {
        const d = new Date(Math.round((n - 25569 + 0.5) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
    }
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      if (s.indexOf('T') > -1) { const dt = new Date(s); if (!isNaN(dt.getTime())) return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
      return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    }
    const eu = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (eu) return new Date(+eu[3], +eu[2] - 1, +eu[1]);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const fmtDate = (v) => { const d = toDate(v); if (!d) return ''; 
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); };
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = trim(v).replace(/[^\d.,-]/g, '');          // eenheden/spaties weg
    if (!s) return null;
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c > -1 && d > -1) {
      // beide aanwezig → de laatste is het decimaalteken
      s = (c > d) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (c > -1) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (d > -1 && (s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, '');                        // 1.234.567 → duizendtallen
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  const fmtNum = (n) => n == null ? '' : n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
  const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

  // ── data laden ───────────────────────────────────────────────────────────
  async function boot() {
    wireTabs();
    $('lio-upload').addEventListener('click', () => $('lio-file').click());
    $('lio-file').addEventListener('change', onUpload);
    try {
      const raw = window.ExpeditingData && ExpeditingData.loadRaw
        ? await ExpeditingData.loadRaw() : null;
      const meta = window.ExpeditingData && ExpeditingData.meta ? await ExpeditingData.meta() : null;
      if (raw && raw.headers && raw.rows && raw.rows.length) {
        setData(raw.headers, raw.rows,
          (meta && meta.filename ? meta.filename : 'bedrijfsbrede lijst') +
          (meta && meta.uploaded ? ' · ' + fmtDate(meta.uploaded) : ''));
      } else {
        $('lio-src-txt').innerHTML = '⚠ Geen bedrijfsbrede lijst gevonden — laad er een via de knop hiernaast.';
      }
    } catch (e) {
      $('lio-src-txt').innerHTML = '⚠ Kon de bedrijfsbrede lijst niet laden: ' + esc(e.message);
    }
  }

  function onUpload(ev) {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    $('lio-src-txt').textContent = 'Bezig met inlezen…';
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(rd.result), { type: 'array', cellDates: true });
        const name = pickSheet(wb);
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        const t = window.ExpeditingCore && ExpeditingCore.rawTable ? null : null;
        const hIdx = detectHeader(aoa);
        setData(aoa[hIdx].map(x => trim(x)), aoa.slice(hIdx + 1), f.name);
      } catch (e) {
        $('lio-src-txt').innerHTML = '⚠ Fout bij inlezen: ' + esc(e.message);
      }
    };
    rd.readAsArrayBuffer(f);
  }
  function pickSheet(wb) {
    const rows = (n) => { const ws = wb.Sheets[n]; if (!ws || !ws['!ref']) return 0;
      const r = XLSX.utils.decode_range(ws['!ref']); return r.e.r - r.s.r + 1; };
    return wb.SheetNames.slice().sort((a, b) => rows(b) - rows(a))[0];
  }
  function detectHeader(aoa) {
    let best = 0, score = -1;
    for (let i = 0; i < Math.min(7, aoa.length); i++) {
      const n = (aoa[i] || []).filter(c => trim(c)).length;
      if (n > score) { score = n; best = i; }
    }
    return best;
  }

  function setData(headers, rows, srcLabel) {
    // ExpeditingData.loadRaw() geeft rijen als objecten (op kolomnaam),
    // een eigen upload geeft arrays. Alles hier gelijktrekken naar arrays.
    if (rows.length && !Array.isArray(rows[0])) {
      rows = rows.map(o => headers.map(h => (o[h] == null ? '' : o[h])));
    }
    HEADERS = headers; ROWS = rows;
    const r = resolveCols(headers); C = r.cols; MISSING = r.missing;
    $('lio-src-txt').innerHTML = '📊 Bron: <b>' + esc(srcLabel) + '</b> — ' +
      rows.length.toLocaleString('nl-NL') + ' regels, ' + headers.length + ' kolommen';
    renderWarnings(); buildSubProjectPanel(); render();
  }

  function renderWarnings() {
    const el = $('lio-warnings');
    if (!MISSING.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="lio-warn">⚠ Deze kolommen zitten niet in de geladen lijst: <b>' +
      esc(MISSING.join(', ')) + '</b> — die velden blijven leeg.<br>' +
      'Oorzaak: de Admin-upload filtert kolommen weg (KEEP_COLS in <code>shared/expediting-data.js</code>). ' +
      'Upload de bedrijfsbrede lijst opnieuw via <b>Admin</b> met de bijgewerkte <code>expediting-data.js</code>, ' +
      'download de nieuwe <code>expediting-data.json</code> en commit die.</div>';
  }

  // ── Sub Project ID selectie — zelfde opmaak als de Itemlijst-Validator ───
  function injectSPStyle() {
    if (document.getElementById('val-sp-style')) return;
    const s = document.createElement('style'); s.id = 'val-sp-style';
    s.textContent =
      '.val-sp-panel{margin:.6rem 0 0;padding:1rem 1.1rem;background:var(--navy-mid,#0F2040);border:1px solid var(--steel,#1e3a6e);border-radius:12px;font-family:var(--mono,monospace)}' +
      '.val-sp-head{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:.8rem;letter-spacing:.03em;color:var(--white,#F0F4FA)}' +
      '.val-sp-search{width:100%;box-sizing:border-box;padding:.55rem .8rem;border-radius:8px;border:1px solid var(--steel,#1e3a6e);background:var(--navy,#0A1628);color:var(--white,#F0F4FA);font-family:inherit;font-size:.8rem;outline:none;margin-top:.8rem}' +
      '.val-sp-search:focus{border-color:var(--teal,#00B4D8)}' +
      '.val-sp-actions{display:flex;align-items:center;gap:.5rem;margin:.7rem 0 .4rem}' +
      '.val-sp-btn{font-family:inherit;font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:.4rem .8rem;border-radius:6px;border:1px solid var(--steel,#1e3a6e);background:transparent;color:var(--white,#F0F4FA);cursor:pointer;transition:border-color .15s,background .15s}' +
      '.val-sp-btn:hover{border-color:var(--teal,#00B4D8);background:rgba(0,180,216,.1)}' +
      '.val-sp-count{margin-left:auto;font-size:.72rem;color:var(--teal,#00B4D8)}' +
      '.val-sp-list{max-height:210px;overflow-y:auto;border:1px solid var(--steel,#1e3a6e);border-radius:8px;background:rgba(10,22,40,.4)}' +
      '.val-sp-list::-webkit-scrollbar{width:10px}.val-sp-list::-webkit-scrollbar-thumb{background:var(--steel,#1e3a6e);border-radius:5px}' +
      '.val-sp-item{display:flex;align-items:center;gap:.6rem;padding:.4rem .8rem;cursor:pointer;font-size:.76rem;color:var(--white,#F0F4FA);border-bottom:1px solid rgba(30,58,110,.25)}' +
      '.val-sp-item:hover{background:rgba(0,180,216,.07)}' +
      '.val-sp-item input{accent-color:var(--teal,#00B4D8);width:14px;height:14px;cursor:pointer}' +
      '.val-sp-item .val-sp-n{margin-left:auto;color:var(--grey,#8FA3BF);font-size:.72rem}' +
      '.val-sp-item.hidden{display:none}';
    document.head.appendChild(s);
  }

  function buildSubProjectPanel() {
    const panel = $('lio-sp-panel');
    const counts = new Map();
    for (const r of ROWS) {
      const id = trim(val(r, 'sp')); if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const ids = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
    if (!ids.length) { panel.innerHTML = ''; return; }

    injectSPStyle();
    SPSEL = new Set();                       // standaard: niets geselecteerd (= alle projecten)
    panel.className = 'val-sp-panel';
    panel.innerHTML =
      '<div class="val-sp-head">📋 Bedrijfsbreed Expediten — selecteer Sub Project ID</div>' +
      '<input class="val-sp-search" id="val-sp-search" placeholder="🔍 Zoek Sub Project ID…" autocomplete="off">' +
      '<div class="val-sp-actions">' +
      '<button class="val-sp-btn" id="val-sp-all" type="button">Alles</button>' +
      '<button class="val-sp-btn" id="val-sp-none" type="button">Wis</button>' +
      '<span class="val-sp-count" id="val-sp-count">0 geselecteerd</span>' +
      '</div>' +
      '<div class="val-sp-list" id="val-sp-list">' +
      ids.map(id => '<label class="val-sp-item" data-id="' + esc(id) + '">' +
        '<input type="checkbox" value="' + esc(id) + '">' +
        '<span class="val-sp-id">' + esc(id) + '</span>' +
        '<span class="val-sp-n">' + counts.get(id) + '</span></label>').join('') +
      '</div>';

    const apply = () => {
      const c = $('val-sp-count');
      if (c) c.textContent = SPSEL.size + ' geselecteerd';
      render();
    };
    panel.querySelector('#val-sp-list').addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) SPSEL.add(e.target.value); else SPSEL.delete(e.target.value);
      apply();
    });
    panel.querySelector('#val-sp-search').addEventListener('input', function () {
      const q = this.value.trim().toLowerCase();
      panel.querySelectorAll('.val-sp-item').forEach(it =>
        it.classList.toggle('hidden', !!q && !it.dataset.id.toLowerCase().includes(q)));
    });
    panel.querySelector('#val-sp-all').addEventListener('click', () => {
      panel.querySelectorAll('.val-sp-item:not(.hidden) input').forEach(cb => { cb.checked = true; SPSEL.add(cb.value); });
      apply();
    });
    panel.querySelector('#val-sp-none').addEventListener('click', () => {
      panel.querySelectorAll('.val-sp-item input').forEach(cb => cb.checked = false);
      SPSEL.clear(); apply();
    });
  }

  // ── tabbladen ────────────────────────────────────────────────────────────
  function wireTabs() {
    document.querySelectorAll('.lio-tab').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.lio-tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); TAB = b.dataset.tab; render();
      }));
  }

  // ── filters per tabblad ──────────────────────────────────────────────────
  const inScope = (r) => !SPSEL.size || SPSEL.has(trim(val(r, 'sp')));

  function rowsFor(tab) {
    const base = ROWS.filter(inScope);
    if (tab === 'large') {
      return base.filter(r => { const w = num(val(r, 'totW')); return w != null && w >= THRESHOLD; });
    }
    if (tab === 'late') {
      return base.filter(r => trim(val(r, 'delStatus')).toLowerCase() === 'late');
    }
    return base.filter(r => trim(val(r, 'fatDate')) || trim(val(r, 'fatLoc')));
  }
  function delay(r) {
    const w = toDate(val(r, 'wanted')), p = toDate(val(r, 'planned'));
    return (w && p) ? Math.round((p - w) / 86400000) : null;
  }

  // ── kolomdefinities per tabblad ──────────────────────────────────────────
  const COMMON_TAIL = [
    { h: 'Delivery Address', k: 'addr', f: r => flat(val(r, 'address')) },
    { h: 'Incoterm',         k: 'inco', f: r => flat(val(r, 'terms')) },
    { h: 'Last Expedited',   k: 'lexp', f: r => fmtDate(val(r, 'lastExp')),
      d: r => toDate(val(r, 'lastExp')), cls: r => lastExpCls(r) },
  ];
  function lastExpCls(r) {
    const d = toDate(val(r, 'lastExp'));
    if (!d) return 'lio-bad';                                   // nooit opgevolgd
    const days = Math.round((startOfToday() - d) / 86400000);
    return days > 60 ? 'lio-warn-c' : '';
  }
  // ── FAT: leadtime-regels uit de oude FAT-Overview ────────────────────────
  const LEAD_MIN = 28, LEAD_MAX = 35, INVITE_DAYS = 14;
  const addDays = (d, n) => d ? new Date(d.getTime() + n * 86400000) : null;
  function calcLead(fat, delivery) {
    if (!fat || !delivery) return { key: 'missing', label: 'Data incompleet', gap: null };
    const gap = Math.round((delivery - fat) / 86400000);
    if (gap >= LEAD_MIN && gap <= LEAD_MAX) return { key: 'ok', label: 'OK (' + gap + ' dgn)', gap };
    if (gap < LEAD_MIN) return { key: 'short', label: 'Te kort (' + gap + ' dgn)', gap };
    return { key: 'long', label: 'Te vroeg (' + gap + ' dgn)', gap };
  }
  const leadOf = (r) => calcLead(toDate(val(r, 'fatDate')), toDate(val(r, 'planned')));
  // Protocol goedgekeurd = er staat een datum in AG
  const protoOk = (r) => toDate(val(r, 'protoDate')) ? 'Y' : '';

  const DEFS = {
    large: [
      { h: 'PO No',        k: 'po',   f: r => trim(val(r, 'po')) },
      { h: 'Sub Project',  k: 'sp',   f: r => trim(val(r, 'sp')) },
      { h: 'Supplier',     k: 'sup',  f: r => flat(val(r, 'supplier')) },
      { h: 'Part No',      k: 'part', f: r => trim(val(r, 'part')) },
      { h: 'Omschrijving', k: 'desc', f: r => flat(val(r, 'desc')) },
      { h: 'Qty',          k: 'qty',  f: r => fmtNum(num(val(r, 'qty'))), num: true, n: r => num(val(r, 'qty')) },
      { h: 'Net Weight',   k: 'netW', f: r => fmtNum(num(val(r, 'netW'))), num: true, n: r => num(val(r, 'netW')) },
      { h: 'Totaal gewicht', k: 'totW', f: r => fmtNum(num(val(r, 'totW'))), num: true,
        n: r => num(val(r, 'totW')), cls: () => 'lio-strong' },
      { h: 'UoM',          k: 'uom',  f: r => trim(val(r, 'wUoM')) },
      { h: 'Planned',      k: 'pdd',  f: r => fmtDate(val(r, 'planned')), d: r => toDate(val(r, 'planned')) },
      ...COMMON_TAIL,
    ],
    late: [
      { h: 'PO No',        k: 'po',   f: r => trim(val(r, 'po')) },
      { h: 'Sub Project',  k: 'sp',   f: r => trim(val(r, 'sp')) },
      { h: 'Supplier',     k: 'sup',  f: r => flat(val(r, 'supplier')) },
      { h: 'Part No',      k: 'part', f: r => trim(val(r, 'part')) },
      { h: 'Omschrijving', k: 'desc', f: r => flat(val(r, 'desc')) },
      { h: 'Wanted',       k: 'want', f: r => fmtDate(val(r, 'wanted')), d: r => toDate(val(r, 'wanted')) },
      { h: 'Planned',      k: 'pdd',  f: r => fmtDate(val(r, 'planned')), d: r => toDate(val(r, 'planned')) },
      { h: 'Dagen te laat', k: 'off', f: r => { const d = delay(r); return d == null ? '' : String(d); },
        num: true, n: r => delay(r),
        cls: r => { const d = delay(r); return d > 30 ? 'lio-bad' : d > 0 ? 'lio-warn-c' : ''; } },
      ...COMMON_TAIL,
    ],
    fat: [
      { h: 'System No',        k: 'sysNo',  f: r => flat(val(r, 'sysNo')) },
      { h: 'PO Number',        k: 'po',     f: r => flat(val(r, 'orderNo')) },
      { h: 'Name',             k: 'name',   f: r => flat(val(r, 'refDesc')) },
      { h: 'FAT',              k: 'fatT',   f: () => 'FAT' },
      { h: 'Leverancier',      k: 'sup',    f: r => flat(val(r, 'supplier')) },
      { h: 'FAT Location',     k: 'floc',   f: r => flat(val(r, 'fatLoc')) },
      { h: 'Client Required',  k: 'creq',   f: () => '', title: 'Nog geen bronkolom in de bedrijfsbrede lijst (Customer Attendance ID)' },
      { h: 'Expected FAT Date', k: 'fdate', f: r => fmtDate(val(r, 'fatDate')), d: r => toDate(val(r, 'fatDate')),
        cls: r => { const d = toDate(val(r, 'fatDate')); if (!d) return '';
          const x = Math.round((d - startOfToday()) / 86400000);
          return x < 0 ? 'lio-bad' : x <= 30 ? 'lio-warn-c' : ''; } },
      { h: 'Client invite before', k: 'inv', f: r => fmtDate(addDays(toDate(val(r, 'fatDate')), -INVITE_DAYS)),
        d: r => addDays(toDate(val(r, 'fatDate')), -INVITE_DAYS), cls: () => 'lio-dim',
        title: 'FAT-datum − 14 dagen. Zolang Customer Attendance ID ontbreekt, wordt dit voor élke regel getoond.' },
      { h: 'Protocol goedgekeurd', k: 'proto', f: protoOk,
        cls: r => protoOk(r) ? 'lio-ok' : '', title: 'Y zodra FAT Supplier Protocol Date (AG) een datum bevat' },
      { h: 'Responsible Name', k: 'resp',   f: r => flat(val(r, 'engineer')) },
      { h: 'Aanwezig klant',   k: 'cAtt',   f: () => '', title: 'Nog geen bronkolom in de bedrijfsbrede lijst (Customer Attendance ID)' },
      { h: 'Planned Delivery Date (exw)', k: 'pdd', f: r => fmtDate(val(r, 'planned')), d: r => toDate(val(r, 'planned')),
        cls: r => leadOf(r).key === 'short' || leadOf(r).key === 'long' ? 'lio-bad' : '' },
      { h: 'Remarks',          k: 'rem',    f: r => leadOf(r).label,
        cls: r => { const k = leadOf(r).key; return k === 'ok' ? 'lio-ok' : k === 'missing' ? 'lio-dim' : 'lio-warn-c'; } },
      { h: 'Sub Project',      k: 'sp',     f: r => flat(val(r, 'sp')) },
      { h: 'Last Expedited',   k: 'lexp',   f: r => fmtDate(val(r, 'lastExp')), d: r => toDate(val(r, 'lastExp')),
        cls: r => lastExpCls(r) },
    ],
  };

  // ── sorteren (zelfde gedrag als Late Items in de PO-Matcher) ─────────────
  const SORT = { large: { col: 'totW', dir: 'desc' }, late: { col: 'off', dir: 'desc' }, fat: { col: 'fdate', dir: 'asc' } };
  window.lioSort = function (key) {
    const s = SORT[TAB];
    if (s.col === key) s.dir = (s.dir === 'asc') ? 'desc' : 'asc';
    else { s.col = key; s.dir = 'asc'; }
    render();
  };
  function sortRows(rows, defs) {
    const s = SORT[TAB];
    const def = defs.find(d => d.k === s.col);
    if (!def) return rows;
    const keyOf = (r) => def.n ? def.n(r) : def.d ? (def.d(r) ? def.d(r).getTime() : null) : def.f(r);
    const dir = (s.dir === 'desc') ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const av = keyOf(a), bv = keyOf(b);
      const aB = (av === null || av === undefined || av === '');
      const bB = (bv === null || bv === undefined || bv === '');
      if (aB && bB) return 0;
      if (aB) return 1;                       // lege waarden altijd onderaan
      if (bB) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'nl', { numeric: true }) * dir;
    });
  }

  // ── zoekbalk: combineert vrij over ALLE kolommen van het huidige tabblad ──
  // Elk los woord moet ergens voorkomen (in willekeurig welke kolom) — zo
  // vind je bv. "Alfa Laval YN1320" ook als leverancier en project in
  // verschillende kolommen staan.
  let SEARCHTERM = '';
  window.lioSearch = function (v) { SEARCHTERM = v; render(); };
  function applySearch(rows, defs) {
    const terms = SEARCHTERM.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(r => {
      const hay = defs.map(d => String(d.f(r) ?? '')).join(' \u241F ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }

  // ── rendering ────────────────────────────────────────────────────────────
  function render() {
    if (!ROWS.length) return;
    renderTools();
    const miss = NEEDED[TAB].filter(k => C[k] < 0);
    const defs = DEFS[TAB];
    const rows = miss.length ? [] : sortRows(applySearch(rowsFor(TAB), defs), defs);

    const s = SORT[TAB];
    $('lio-thead').innerHTML = '<tr>' + defs.map(d => {
      const on = d.k === s.col;
      const arrow = on ? (s.dir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
      const cls = ['lio-sortable', d.num ? 'lio-num' : '', on ? 'lio-sort-active' : ''].filter(Boolean).join(' ');
      return '<th class="' + cls + '" onclick="lioSort(\'' + d.k + '\')"' +
        ' title="' + esc(d.title || ('Sorteer op ' + d.h)) + '">' + esc(d.h) + arrow + '</th>';
    }).join('') + '</tr>';

    if (miss.length) {
      $('lio-summary').innerHTML = '<span class="lio-bad-txt">Dit overzicht kan niet getoond worden: ' +
        'kolom(men) <b>' + esc(miss.map(k => MAP[k][0][0]).join(', ')) + '</b> ontbreken in de geladen lijst.</span>';
      $('lio-tbody').innerHTML = '';
      return;
    }
    $('lio-summary').innerHTML = summaryFor(TAB, rows);
    $('lio-tbody').innerHTML = rows.length
      ? rows.map(r => '<tr>' + defs.map(d => {
          const cls = [d.num ? 'lio-num' : '', d.cls ? d.cls(r) : ''].filter(Boolean).join(' ');
          const v = d.f(r);
          return '<td' + (cls ? ' class="' + cls + '"' : '') + (v ? ' title="' + esc(v) + '"' : '') +
                 '>' + esc(v) + '</td>';
        }).join('') + '</tr>').join('')
      : '<tr><td colspan="' + defs.length + '" class="lio-empty">Geen regels binnen deze selectie.</td></tr>';
  }

  function renderTools() {
    const el = $('lio-tools');
    el.innerHTML = TAB === 'large'
      ? '<label class="lio-thr">Vanaf <input type="number" id="lio-threshold" value="' + THRESHOLD +
        '" min="0" step="100"> kg totaalgewicht</label>' : '';
    const inp = $('lio-threshold');
    if (inp) inp.addEventListener('change', () => {
      const v = parseFloat(inp.value); THRESHOLD = isNaN(v) ? 0 : v; render();
    });
  }

  function summaryFor(tab, rows) {
    if (tab === 'large') {
      const tot = rows.reduce((s, r) => s + (num(val(r, 'totW')) || 0), 0);
      return '<b>' + rows.length + '</b> large items (≥ ' + fmtNum(THRESHOLD) + ' kg) · ' +
        'totaal <b>' + fmtNum(tot) + '</b> kg';
    }
    if (tab === 'late') {
      const d = rows.map(delay).filter(x => x != null && x > 0);
      const avg = d.length ? Math.round(d.reduce((s, x) => s + x, 0) / d.length) : 0;
      const crit = rows.filter(r => (delay(r) || 0) > 30).length;
      return '<b>' + rows.length + '</b> late items · gemiddeld <b>' + avg + '</b> dagen te laat · ' +
        '<b>' + crit + '</b> kritiek (> 30 dagen)';
    }
    const t = startOfToday();
    const over = rows.filter(r => { const d = toDate(val(r, 'fatDate')); return d && d < t; }).length;
    const soon = rows.filter(r => { const d = toDate(val(r, 'fatDate')); if (!d) return false;
      const x = Math.round((d - t) / 86400000); return x >= 0 && x <= 30; }).length;
    return '<b>' + rows.length + '</b> FAT-items · <b>' + over + '</b> datum verstreken · ' +
      '<b>' + soon + '</b> binnen 30 dagen';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
