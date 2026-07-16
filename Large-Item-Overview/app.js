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
  // kolommen die per tabblad noodzakelijk zijn
  const NEEDED = {
    large: ['totW', 'netW'],
    late:  ['delStatus'],
    fat:   ['fatDate', 'fatLoc'],
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
  function toDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return isNaN(d) ? null : d; }
    const s = trim(v); if (!s) return null;
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);      // DD-MM-JJJJ
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s); return isNaN(d) ? null : d;
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
    el.innerHTML = '<div class="lio-warn">⚠ Ontbrekende kolommen in deze lijst: <b>' +
      esc(MISSING.join(', ')) + '</b>.<br>Deze lijst is waarschijnlijk een smalle export. ' +
      'Exporteer de bedrijfsbrede lijst mét alle kolommen (o.a. Net Weight, Total Net Weight, ' +
      'FAT Location, Delivery Address) en upload die opnieuw via Admin.</div>';
  }

  // ── Sub Project ID selectie ──────────────────────────────────────────────
  function buildSubProjectPanel() {
    const panel = $('lio-sp-panel');
    const map = new Map();
    for (const r of ROWS) {
      const id = trim(val(r, 'sp')); if (!id) continue;
      if (!map.has(id)) map.set(id, { n: 0, desc: trim(val(r, 'spDesc')) });
      map.get(id).n++;
    }
    const ids = [...map.keys()].sort();
    if (!ids.length) { panel.innerHTML = ''; return; }
    SPSEL = new Set(ids);
    panel.innerHTML =
      '<div class="lio-sp-head">📋 Selecteer Sub Project ID <span class="lio-sp-count" id="lio-sp-count"></span></div>' +
      '<input class="lio-sp-search" id="lio-sp-search" placeholder="🔍 Zoek Sub Project ID…" autocomplete="off">' +
      '<div class="lio-sp-actions">' +
      '<button class="lio-sp-btn" id="lio-sp-all">Alles</button>' +
      '<button class="lio-sp-btn" id="lio-sp-none">Niets</button></div>' +
      '<div class="lio-sp-list" id="lio-sp-list">' +
      ids.map(id => '<label class="lio-sp-item" data-id="' + esc(id) + '">' +
        '<input type="checkbox" checked value="' + esc(id) + '"> ' +
        '<span class="lio-sp-id">' + esc(id) + '</span>' +
        '<span class="lio-sp-desc">' + esc(map.get(id).desc) + '</span>' +
        '<span class="lio-sp-n">' + map.get(id).n + '</span></label>').join('') +
      '</div>';
    panel.querySelectorAll('input[type=checkbox]').forEach(cb =>
      cb.addEventListener('change', () => {
        cb.checked ? SPSEL.add(cb.value) : SPSEL.delete(cb.value);
        updateSpCount(); render();
      }));
    $('lio-sp-all').addEventListener('click', () => toggleAll(true));
    $('lio-sp-none').addEventListener('click', () => toggleAll(false));
    $('lio-sp-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      panel.querySelectorAll('.lio-sp-item').forEach(it =>
        it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none');
    });
    updateSpCount();
  }
  function toggleAll(on) {
    SPSEL = new Set();
    document.querySelectorAll('#lio-sp-list input[type=checkbox]').forEach(cb => {
      if (cb.closest('.lio-sp-item').style.display === 'none') return;
      cb.checked = on; if (on) SPSEL.add(cb.value);
    });
    updateSpCount(); render();
  }
  function updateSpCount() {
    const el = $('lio-sp-count'); if (el) el.textContent = '(' + SPSEL.size + ' geselecteerd)';
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

  // ── rendering ────────────────────────────────────────────────────────────
  function render() {
    if (!ROWS.length) return;
    renderTools();
    const miss = NEEDED[TAB].filter(k => C[k] < 0);
    const defs = DEFS[TAB];
    const rows = miss.length ? [] : sortRows(rowsFor(TAB), defs);

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
