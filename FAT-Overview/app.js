/* ═══════════════════════════════════════════
   FAT Overview — app.js — v2.1
   Sheet View + Timeline — IHC Expediting
   ═══════════════════════════════════════════ */

// ── SheetJS CDN fallback ──
function loadFallbackXLSX(){
  console.warn('[FAT] Primary CDN unavailable, loading fallback…');
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onerror = function(){ showLibraryError(); };
  document.head.appendChild(s);
}
function showLibraryError(){
  document.getElementById('libError').style.display = 'block';
  document.getElementById('dropZone').style.display = 'none';
}
window.addEventListener('load', function(){
  setTimeout(function(){ if(typeof XLSX === 'undefined') showLibraryError(); }, 2500);
});

// ── Configuration ──
const ICHECK_BASE_URL = ''; // vul hier zelf je I-CHECK basis URL in, bijv: 'https://icheck.royalihc.com/inspection?id='
const LEAD_MIN = 28; // minimaal 4 weken tussen FAT en levering
const LEAD_MAX = 35; // maximaal 5 weken tussen FAT en levering
const INVITE_DAYS = 14; // dagen vóór FAT dat klant moet worden uitgenodigd

// ── State ──
let dataset = [];
let currentTab = 'sheet';
let filters = { upcoming: true, attention: false, client: false };

// ══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════

function clean(v){ return (v === null || v === undefined) ? '' : String(v).trim(); }
function escHtml(s){
  return clean(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hasVal(v){ return clean(v) !== ''; }

/** Parse date from Excel serial number or various string formats */
function parseDate(value){
  if(value === null || value === undefined || value === '') return null;
  // Excel serial number (numeric)
  if(typeof value === 'number'){
    var d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  var s = String(value).trim();
  if(!s || s === '—' || s === '-') return null;
  // pure numeric string = Excel serial
  if(/^\d{5}$/.test(s)){
    var d2 = new Date((parseInt(s,10) - 25569) * 86400000);
    return isNaN(d2.getTime()) ? null : new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  }
  // ISO or standard date string
  var iso = new Date(s);
  if(!isNaN(iso.getTime())) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  // DD-MM-YYYY or DD/MM/YYYY
  var m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(m){
    var y = parseInt(m[3],10); if(y < 100) y += 2000;
    // try DD-MM-YYYY first (Dutch convention)
    var d3 = new Date(y, parseInt(m[2],10)-1, parseInt(m[1],10));
    if(!isNaN(d3.getTime())) return d3;
    // try MM-DD-YYYY
    var d4 = new Date(y, parseInt(m[1],10)-1, parseInt(m[2],10));
    if(!isNaN(d4.getTime())) return d4;
  }
  return null;
}

function formatDate(d){
  if(!d) return '';
  return String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
}

function addDays(d, n){
  if(!d) return null;
  var x = new Date(d); x.setDate(x.getDate() + n); return x;
}

function diffDays(a, b){
  if(!a || !b) return null;
  return Math.round((b - a) / (86400000));
}

function todayStart(){
  var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Dutch month-year string */
var MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
function monthYearKey(d){
  if(!d) return 'Datum onbekend';
  return MONTHS_NL[d.getMonth()] + ' ' + d.getFullYear();
}

/** Leadtime analysis */
function calcLead(fatDate, deliveryDate){
  if(!fatDate || !deliveryDate) return { key:'missing', label:'Data incompleet', gap:null };
  var gap = diffDays(fatDate, deliveryDate);
  if(gap >= LEAD_MIN && gap <= LEAD_MAX) return { key:'ok', label:'OK ('+gap+' dgn)', gap:gap };
  if(gap < LEAD_MIN) return { key:'short', label:'Te kort ('+gap+' dgn)', gap:gap };
  return { key:'long', label:'Te vroeg ('+gap+' dgn)', gap:gap };
}

/** Build I-CHECK URL */
function icheckUrl(id){
  if(!id || !ICHECK_BASE_URL) return '';
  return ICHECK_BASE_URL + encodeURIComponent(id);
}

// ══════════════════════════════════════════════════════════
// FORMAT DETECTION & ROW MAPPING
// ══════════════════════════════════════════════════════════

/** Detect if the uploaded file is "FAT CLIPPED" format or "direct FAT-list" format */
function detectFormat(headers){
  var h = headers.map(function(x){ return clean(x).toLowerCase(); });
  // FAT CLIPPED has "Order No", "Line No", "Release No", "Date Required", "Vendor Name"
  if(h.indexOf('order no') > -1 && h.indexOf('date required') > -1 && h.indexOf('vendor name') > -1){
    return 'clipped';
  }
  // Direct FAT-list has "System No.", "PO Number", "Name", "Leverancier"
  if(h.indexOf('system no.') > -1 || h.indexOf('po number') > -1 || h.indexOf('leverancier') > -1){
    return 'direct';
  }
  // fallback: try clipped first
  return 'clipped';
}

/** Protocol status derivation */
function deriveProtocol(row){
  var val = clean(row['Approved'] || row['IHC Acceptance Description'] || row['Protocol goedgekeurd'] || '');
  var u = val.toUpperCase();
  if(u === 'APPROVED' || u === 'APP' || u === 'Y' || u === 'YES') return 'Y';
  return '';
}

/** Map a FAT CLIPPED row to our unified display format */
function mapClippedRow(row, idx){
  var fatDate = parseDate(row['Date Required']);
  var deliveryDate = parseDate(row['Wanted Delivery Date']);
  var customerRequired = hasVal(row['Customer Attendance ID']) || hasVal(row['Customer Attendance Description']) || hasVal(row['Customer Acceptance ID']);
  var inviteBefore = customerRequired ? addDays(fatDate, -INVITE_DAYS) : null;
  var lead = calcLead(fatDate, deliveryDate);
  var fatNumber = [clean(row['Order No']), clean(row['Line No']), clean(row['Release No'])].filter(Boolean).join('-');

  // Build remarks
  var remarks = [];
  if(lead.key !== 'ok' && lead.key !== 'missing') remarks.push(lead.label);
  if(hasVal(row['Invitation ID'])) remarks.push('Invitation sent');
  if(hasVal(row['Additional Information'])) remarks.push(clean(row['Additional Information']));

  return {
    _idx: idx + 2,
    systemNo: clean(row['Design Object ID']),
    poNumber: clean(row['Order No']),
    fatNumber: fatNumber,
    name: clean(row['Part Description']),
    fatType: 'FAT',
    leverancier: clean(row['Vendor Name']),
    fatLocation: clean(row['Test Location']),
    clientRequired: customerRequired,
    fatDate: fatDate,
    inviteBefore: inviteBefore,
    protocol: deriveProtocol(row),
    aanwezigIHC: clean(row['Responsible Name']),
    aanwezigKlant: customerRequired,
    plannedDelivery: deliveryDate,
    remarks: remarks.join(' | '),
    lead: lead,
    // detail fields
    responsible: clean(row['Responsible Name']),
    testDuration: [clean(row['Test Duration']), clean(row['Test Duration Unit'])].filter(Boolean).join(' '),
    invitationId: clean(row['Invitation ID']),
    ihcAtt: clean(row['IHC Attendance ID']),
    classAtt: clean(row['Class Attendance ID']),
    customerAtt: clean(row['Customer Attendance ID']),
    additionalInfo: clean(row['Additional Information']),
    raw: row
  };
}

/** Map a direct FAT-list row (same column names as the display sheet) */
function mapDirectRow(row, idx){
  var fatDate = parseDate(row['Expected FAT Date (Yellow = confirmed by supplier)'] || row['Expected FAT Date']);
  var deliveryDate = parseDate(row['Planned Delivery Date (exw)'] || row['Planned Delivery Date']);
  var clientReq = clean(row['Client Required'] || '').toLowerCase();
  var isClientReq = (clientReq === 'x' || clientReq === 'yes' || clientReq === 'ja');
  var inviteBefore = parseDate(row['Client invite before']);
  if(!inviteBefore && isClientReq) inviteBefore = addDays(fatDate, -INVITE_DAYS);
  var lead = calcLead(fatDate, deliveryDate);

  var remarks = clean(row['Remarks'] || '');
  if(!remarks && lead.key !== 'ok' && lead.key !== 'missing') remarks = lead.label;

  return {
    _idx: idx + 2,
    systemNo: clean(row['System No.'] || row['System No']),
    poNumber: clean(row['PO Number']),
    fatNumber: clean(row['System No.'] || row['System No']),
    name: clean(row['Name']),
    fatType: clean(row['FAT'] || 'FAT'),
    leverancier: clean(row['Leverancier']),
    fatLocation: clean(row['FAT Location']),
    clientRequired: isClientReq,
    fatDate: fatDate,
    inviteBefore: inviteBefore,
    protocol: clean(row['Protocol goedgekeurd'] || ''),
    aanwezigIHC: clean(row['Aanwezig IHC']),
    aanwezigKlant: hasVal(row['Aanwezig klant']),
    plannedDelivery: deliveryDate,
    remarks: remarks,
    lead: lead,
    // detail fields (may be limited in direct format)
    responsible: clean(row['Aanwezig IHC']),
    testDuration: '',
    invitationId: '',
    ihcAtt: clean(row['Aanwezig IHC']),
    classAtt: '',
    customerAtt: clean(row['Aanwezig klant']),
    additionalInfo: remarks,
    raw: row
  };
}

// ══════════════════════════════════════════════════════════
// FILE HANDLING
// ══════════════════════════════════════════════════════════

var dropZone = document.getElementById('dropZone');
var fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', function(e){
  e.preventDefault(); dropZone.classList.remove('dragover');
  if(e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', function(e){
  if(e.target.files.length) processFile(e.target.files[0]);
});

function processFile(file){
  if(typeof XLSX === 'undefined'){ showLibraryError(); return; }
  document.getElementById('fileLabel').textContent = file.name;
  dropZone.classList.add('loading');
  dropZone.querySelector('.icon').textContent = '⏳';
  dropZone.querySelector('p strong').textContent = 'Bestand wordt verwerkt…';

  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, { type:'array', cellDates:false });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var jsonRows = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false });
      if(!jsonRows.length){ alert('Geen data gevonden in het bestand.'); resetUpload(); return; }

      // detect format
      var headers = Object.keys(jsonRows[0]);
      var fmt = detectFormat(headers);
      console.log('[FAT] Detected format:', fmt, '| Headers:', headers.slice(0,10));

      if(fmt === 'direct'){
        dataset = jsonRows.map(mapDirectRow);
      } else {
        dataset = jsonRows.map(mapClippedRow);
      }
      // filter out completely empty rows
      dataset = dataset.filter(function(r){ return r.poNumber || r.name || r.systemNo || r.leverancier; });

      // show UI
      document.getElementById('statsBar').style.display = 'grid';
      document.getElementById('controlsBar').style.display = 'flex';
      document.getElementById('tabBar').style.display = 'flex';
      document.getElementById('legend').style.display = 'flex';
      showTab(currentTab);
      updateStats();
      renderCurrentView();
    } catch(err){
      alert('Fout bij verwerken van bestand: ' + err.message);
      console.error('[FAT] Parse error:', err);
    } finally {
      resetUpload();
    }
  };
  reader.readAsArrayBuffer(file);
}

function resetUpload(){
  dropZone.classList.remove('loading');
  dropZone.querySelector('.icon').textContent = '📁';
  dropZone.querySelector('p strong').textContent = 'Sleep hier je FAT CLIPPED bestand heen';
}

// ══════════════════════════════════════════════════════════
// FILTERING & SORTING
// ══════════════════════════════════════════════════════════

function toggleFilter(key){
  filters[key] = !filters[key];
  document.getElementById('btn' + key.charAt(0).toUpperCase() + key.slice(1))
    .classList.toggle('active', filters[key]);
  updateStats();
  renderCurrentView();
}

function getFilteredData(){
  var today = todayStart();
  var q = clean(document.getElementById('searchBox').value).toLowerCase();
  return dataset.filter(function(r){
    if(filters.upcoming && (!r.fatDate || r.fatDate < today)) return false;
    if(filters.attention && r.lead.key === 'ok') return false;
    if(filters.client && !r.clientRequired) return false;
    if(q){
      var hay = [r.systemNo, r.poNumber, r.name, r.leverancier, r.remarks, r.fatNumber,
                 r.aanwezigIHC, r.fatLocation, r.invitationId, r.responsible].join(' ').toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function(a, b){
    if(a.fatDate && b.fatDate) return a.fatDate - b.fatDate;
    if(a.fatDate && !b.fatDate) return -1;
    if(!a.fatDate && b.fatDate) return 1;
    return a.poNumber.localeCompare(b.poNumber);
  });
}

function updateStats(){
  var today = todayStart();
  var visible = getFilteredData();
  var upcoming = dataset.filter(function(r){ return r.fatDate && r.fatDate >= today; });
  document.getElementById('statTotal').textContent = visible.length;
  document.getElementById('statUpcoming').textContent = upcoming.length;
  document.getElementById('statAttention').textContent = visible.filter(function(r){ return r.lead.key !== 'ok' && r.lead.key !== 'missing'; }).length;
  document.getElementById('statClient').textContent = visible.filter(function(r){ return r.clientRequired; }).length;
}

// ══════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════

function switchTab(tab){
  currentTab = tab;
  showTab(tab);
  renderCurrentView();
}

function showTab(tab){
  document.getElementById('tabSheet').classList.toggle('active', tab === 'sheet');
  document.getElementById('tabTimeline').classList.toggle('active', tab === 'timeline');
  document.getElementById('sheetView').style.display = (tab === 'sheet') ? 'block' : 'none';
  document.getElementById('timelineView').style.display = (tab === 'timeline') ? 'block' : 'none';
}

function renderCurrentView(){
  if(currentTab === 'sheet') renderSheet();
  else renderTimeline();
}

// ══════════════════════════════════════════════════════════
// SHEET VIEW RENDERING
// ══════════════════════════════════════════════════════════

function renderSheet(){
  var tbody = document.getElementById('tableBody');
  var rows = getFilteredData();
  tbody.innerHTML = '';

  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;color:#6b7280">Geen regels gevonden op basis van de huidige filters.</td></tr>';
    return;
  }

  rows.forEach(function(r, i){
    // ── Main data row ──
    var tr = document.createElement('tr');
    tr.className = 'row-data' + (r.lead.key !== 'ok' && r.lead.key !== 'missing' ? ' row-attention' : '');
    tr.setAttribute('data-idx', i);
    tr.onclick = function(){ toggleDetail(i); };

    var clientCls = r.clientRequired ? 'cell-client' : 'cell-client-empty';
    var protocolCls = r.protocol === 'Y' ? 'cell-protocol-y' : 'cell-protocol-empty';
    var deliveryCls = (r.lead.key === 'short' || r.lead.key === 'long') ? 'cell-delivery-bad' : 'cell-delivery-ok';
    var klantCls = r.aanwezigKlant ? 'cell-klant-yes' : 'cell-klant-empty';

    tr.innerHTML = '' +
      '<td class="t-left">' + escHtml(r.systemNo) + '</td>' +
      '<td class="t-center">' + escHtml(r.poNumber) + '</td>' +
      '<td class="t-left wrap" title="' + escHtml(r.name) + '">' + escHtml(r.name) + '</td>' +
      '<td class="t-center">' + escHtml(r.fatType) + '</td>' +
      '<td class="t-left wrap">' + escHtml(r.leverancier) + '</td>' +
      '<td class="t-left wrap">' + escHtml(r.fatLocation) + '</td>' +
      '<td class="' + clientCls + '">' + (r.clientRequired ? 'x' : '') + '</td>' +
      '<td class="cell-fatdate">' + escHtml(formatDate(r.fatDate)) + '</td>' +
      '<td class="cell-invite">' + escHtml(formatDate(r.inviteBefore)) + '</td>' +
      '<td class="' + protocolCls + '">' + escHtml(r.protocol) + '</td>' +
      '<td class="t-left wrap">' + escHtml(r.aanwezigIHC) + '</td>' +
      '<td class="' + klantCls + '">' + (r.aanwezigKlant ? 'x' : '') + '</td>' +
      '<td class="' + deliveryCls + '">' + escHtml(formatDate(r.plannedDelivery)) + '</td>' +
      '<td class="t-left wrap" title="' + escHtml(r.remarks) + '">' + escHtml(r.remarks) + '</td>';
    tbody.appendChild(tr);

    // ── Detail row (hidden by default) ──
    var dr = document.createElement('tr');
    dr.className = 'row-detail';
    dr.id = 'detail-' + i;

    var icheckLink = icheckUrl(r.invitationId);
    var icheckHtml = r.invitationId
      ? (icheckLink
          ? '<a href="' + escHtml(icheckLink) + '" target="_blank" rel="noopener">Open I-CHECK (' + escHtml(r.invitationId) + ')</a>'
          : '<p><strong>Invitation ID:</strong> ' + escHtml(r.invitationId) + '</p><p style="color:#6b7280;font-size:.82em">I-CHECK basis URL nog niet ingesteld in app.js</p>')
      : '<p style="color:#6b7280">Geen Invitation ID beschikbaar</p>';

    dr.innerHTML = '<td colspan="14"><div class="detail-grid">' +
      '<div class="detail-card">' +
        '<h4>📋 Identificatie</h4>' +
        '<p><strong>FAT nummer:</strong> ' + escHtml(r.fatNumber || '—') + '</p>' +
        '<p><strong>System No.:</strong> ' + escHtml(r.systemNo || '—') + '</p>' +
        '<p><strong>PO:</strong> ' + escHtml(r.poNumber || '—') + '</p>' +
      '</div>' +
      '<div class="detail-card">' +
        '<h4>📅 Planning & Leadtime</h4>' +
        '<p><strong>FAT datum:</strong> ' + escHtml(formatDate(r.fatDate)) + '</p>' +
        '<p><strong>Leverdatum (exw):</strong> ' + escHtml(formatDate(r.plannedDelivery)) + '</p>' +
        '<p><strong>Verschil:</strong> ' + (r.lead.gap !== null ? r.lead.gap + ' dagen' : 'onbekend') + '</p>' +
        '<p><strong>Status:</strong> ' + escHtml(r.lead.label) + '</p>' +
        (r.lead.key !== 'ok' && r.lead.key !== 'missing'
          ? '<p style="color:#dc2626;font-weight:600">⚠️ Actie Expediting: FAT- of leverdatum aanpassen in ERP</p>'
          : '') +
      '</div>' +
      '<div class="detail-card">' +
        '<h4>🏭 Testinformatie</h4>' +
        '<p><strong>Locatie:</strong> ' + escHtml(r.fatLocation || '—') + '</p>' +
        '<p><strong>Duur:</strong> ' + escHtml(r.testDuration || '—') + '</p>' +
        '<p><strong>Responsible:</strong> ' + escHtml(r.responsible || '—') + '</p>' +
      '</div>' +
      '<div class="detail-card">' +
        '<h4>👥 Aanwezigheid</h4>' +
        '<p><strong>IHC:</strong> ' + escHtml(r.ihcAtt || '—') + '</p>' +
        '<p><strong>Class:</strong> ' + escHtml(r.classAtt || '—') + '</p>' +
        '<p><strong>Customer:</strong> ' + escHtml(r.customerAtt || '—') + '</p>' +
      '</div>' +
      '<div class="detail-card">' +
        '<h4>🔗 I-CHECK / Invitation</h4>' +
        icheckHtml +
        '<p style="margin-top:6px;color:#6b7280;font-size:.82em"><strong>Benodigd voor Erika:</strong> ingevuld protocol + Inspection Invitation Request (.xlsx)</p>' +
      '</div>' +
      (r.additionalInfo ? '<div class="detail-card"><h4>📝 Extra informatie</h4><p>' + escHtml(r.additionalInfo) + '</p></div>' : '') +
    '</div></td>';
    tbody.appendChild(dr);
  });
}

function toggleDetail(idx){
  var el = document.getElementById('detail-' + idx);
  if(el) el.classList.toggle('visible');
}

// ══════════════════════════════════════════════════════════
// TIMELINE VIEW RENDERING
// ══════════════════════════════════════════════════════════

function renderTimeline(){
  var container = document.getElementById('timelineContainer');
  var rows = getFilteredData();
  container.innerHTML = '';

  if(!rows.length){
    container.innerHTML = '<div class="tl-empty">Geen FAT\'s zichtbaar op basis van de huidige filters.</div>';
    return;
  }

  // Group by month
  var groups = {};
  var order = [];
  rows.forEach(function(r){
    var key = monthYearKey(r.fatDate);
    if(!groups[key]){ groups[key] = []; order.push(key); }
    groups[key].push(r);
  });

  order.forEach(function(groupName){
    var monthDiv = document.createElement('div');
    monthDiv.className = 'timeline-month';

    var hdr = document.createElement('div');
    hdr.className = 'timeline-month-header';
    var count = groups[groupName].length;
    hdr.innerHTML = '📅 ' + escHtml(groupName.charAt(0).toUpperCase() + groupName.slice(1)) +
      ' <span class="timeline-count">' + count + ' item' + (count !== 1 ? 's' : '') + '</span>';
    monthDiv.appendChild(hdr);

    groups[groupName].forEach(function(r){
      monthDiv.appendChild(createTlItem(r));
    });

    container.appendChild(monthDiv);
  });
}

function createTlItem(r){
  var item = document.createElement('div');
  item.className = 'tl-item tl-' + r.lead.key;

  // attendance badges
  var attBadges = '';
  if(hasVal(r.ihcAtt)) attBadges += '<span class="badge badge-att">IHC</span>';
  if(hasVal(r.classAtt)) attBadges += '<span class="badge badge-att">Class</span>';
  if(hasVal(r.customerAtt) || r.clientRequired) attBadges += '<span class="badge badge-att">Customer</span>';

  var statusBadge = '<span class="badge badge-' + r.lead.key + '">' + escHtml(r.lead.label) + '</span>';

  var icheckLink = icheckUrl(r.invitationId);
  var icheckHtml = r.invitationId
    ? (icheckLink
        ? '<a href="' + escHtml(icheckLink) + '" target="_blank" rel="noopener">Open I-CHECK (' + escHtml(r.invitationId) + ')</a>'
        : '<p><strong>Invitation ID:</strong> ' + escHtml(r.invitationId) + '</p>')
    : '<p style="color:var(--text-dim)">Geen Invitation ID</p>';

  item.innerHTML = '' +
    '<div class="tl-head" onclick="this.parentElement.classList.toggle(\'open\')">' +
      '<div class="tl-col tl-col-date">' + escHtml(formatDate(r.fatDate)) + '</div>' +
      '<div class="tl-col tl-col-fat">' + escHtml(r.systemNo || r.fatNumber || '—') + '</div>' +
      '<div class="tl-col tl-col-name">' + escHtml(r.name || '—') + '</div>' +
      '<div class="tl-col tl-col-vendor">' + escHtml(r.leverancier || '—') + '</div>' +
      '<div class="tl-col tl-col-do">' + escHtml(r.fatLocation || '—') + '</div>' +
      '<div class="tl-col tl-col-status">' + statusBadge + attBadges + ' <span class="chevron">▼</span></div>' +
    '</div>' +
    '<div class="tl-body">' +
      '<div class="tl-detail">' +
        '<div class="tl-detail-card">' +
          '<h4>📋 Identificatie</h4>' +
          '<p><strong>FAT nr:</strong> ' + escHtml(r.fatNumber || '—') + '</p>' +
          '<p><strong>PO:</strong> ' + escHtml(r.poNumber || '—') + '</p>' +
          '<p><strong>System No.:</strong> ' + escHtml(r.systemNo || '—') + '</p>' +
        '</div>' +
        '<div class="tl-detail-card">' +
          '<h4>📅 Planning</h4>' +
          '<p><strong>FAT datum:</strong> ' + escHtml(formatDate(r.fatDate)) + '</p>' +
          '<p><strong>Leverdatum:</strong> ' + escHtml(formatDate(r.plannedDelivery)) + '</p>' +
          '<p><strong>Gap:</strong> ' + (r.lead.gap !== null ? r.lead.gap + ' dagen' : '—') + '</p>' +
          (r.lead.key !== 'ok' && r.lead.key !== 'missing'
            ? '<p style="color:#ff9ca5;font-weight:600">⚠️ Actie Expediting nodig</p>' : '') +
        '</div>' +
        '<div class="tl-detail-card">' +
          '<h4>🏭 Test</h4>' +
          '<p><strong>Locatie:</strong> ' + escHtml(r.fatLocation || '—') + '</p>' +
          '<p><strong>Duur:</strong> ' + escHtml(r.testDuration || '—') + '</p>' +
          '<p><strong>Responsible:</strong> ' + escHtml(r.responsible || '—') + '</p>' +
        '</div>' +
        '<div class="tl-detail-card">' +
          '<h4>👥 Aanwezigheid</h4>' +
          '<p class="' + (hasVal(r.ihcAtt)?'att-yes':'att-no') + '"><strong>IHC:</strong> ' + escHtml(r.ihcAtt || 'niet gemarkeerd') + '</p>' +
          '<p class="' + (hasVal(r.classAtt)?'att-yes':'att-no') + '"><strong>Class:</strong> ' + escHtml(r.classAtt || 'niet gemarkeerd') + '</p>' +
          '<p class="' + (hasVal(r.customerAtt)||r.clientRequired?'att-yes':'att-no') + '"><strong>Customer:</strong> ' + escHtml(r.customerAtt || (r.clientRequired ? 'required' : 'niet gemarkeerd')) + '</p>' +
        '</div>' +
        '<div class="tl-detail-card">' +
          '<h4>🔗 I-CHECK</h4>' +
          icheckHtml +
        '</div>' +
      '</div>' +
    '</div>';

  return item;
}

// ══════════════════════════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════════════════════════

function exportCSV(){
  if(!dataset.length){ alert('Geen data geladen.'); return; }
  var rows = getFilteredData();
  var headers = [
    'System No.','PO Number','Name','FAT','Leverancier','FAT Location',
    'Client Required','Expected FAT Date','Client invite before',
    'Protocol goedgekeurd','Aanwezig IHC','Aanwezig klant',
    'Planned Delivery Date (exw)','Remarks','FAT Number',
    'Leadtime Gap (dagen)','Leadtime Status','Invitation ID',
    'IHC Attendance','Class Attendance','Customer Attendance'
  ];
  var esc = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"'; };
  var csv = headers.join(';') + '\n';
  rows.forEach(function(r){
    csv += [
      r.systemNo, r.poNumber, r.name, r.fatType, r.leverancier, r.fatLocation,
      r.clientRequired ? 'x' : '', formatDate(r.fatDate), formatDate(r.inviteBefore),
      r.protocol, r.aanwezigIHC, r.aanwezigKlant ? 'x' : '',
      formatDate(r.plannedDelivery), r.remarks, r.fatNumber,
      r.lead.gap !== null ? r.lead.gap : '', r.lead.label,
      r.invitationId, r.ihcAtt, r.classAtt, r.customerAtt
    ].map(esc).join(';') + '\n';
  });
  var blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'FAT_Overview_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Init: set upcoming filter as active by default ──
document.getElementById('btnUpcoming').classList.add('active');
