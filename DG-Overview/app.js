// ============================================================
// Hazardous Substance Analyzer — app.js — v2.1
// ============================================================

// -- CDN Fallback --
function loadFallbackXLSX(){
  console.warn('[HSA] Primary CDN failed, trying fallback...');
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onerror = function(){ showLibraryError(); };
  document.head.appendChild(s);
}
function showLibraryError(){
  console.error('[HSA] All SheetJS CDN sources failed!');
  document.getElementById('libError').style.display = 'block';
  document.getElementById('dropZone').style.display = 'none';
}
window.addEventListener('load', function(){
  setTimeout(function(){
    if(typeof XLSX === 'undefined') showLibraryError();
    else console.log('[HSA] SheetJS loaded:', XLSX.version || 'ok');
  }, 2000);
});

// -- HTML sanitization --
function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// DEFAULT CLASSIFICATION RULES
// ============================================================
const DEFAULT_RULES = {
  "🔴 1. Brandstof & Brandbare vloeistoffen": {
    "risk": "high",
    "keywords": [
      "Biofuel",
      "B100 -",
      "Fuel storage",
      "fuel gas funnel",
      "Emulsifiable Saw",
      "Cutting Oil",
      "Sludge oil mixing tank",
      "SLUDGE BUOY",
      "Deep fat fryer"
    ],
    "action": "SDS/MSDS opvragen bij leverancier. IMDG Klasse 3 controle.",
    "regulations": "IMDG Code Klasse 3, MARPOL Annex I"
  },
  "🔴 2. Koelmiddelen (F-gas)": {
    "risk": "high",
    "keywords": [
      "Refrigerant R407",
      "Refrigerant 513",
      "R407f",
      "R513a",
      "Condensing unit",
      "Chilled water unit",
      "Blast Chiller",
      "Ice cube maker",
      "Refrigerator",
      "Freezer MBF",
      "Cold cupboard",
      "Cold counter",
      "Drinkwater cooler",
      "Combi cabinet",
      "Cabin Refrigerator"
    ],
    "action": "Koelmiddeltype bevestigen. F-gas registratie vereist. SDS opvragen.",
    "regulations": "EU F-gas Regulation 517/2014, CLP H280"
  },
  "🔴 3. Batterijen & Energieopslag": {
    "risk": "high",
    "keywords": [
      "ESS battery",
      "UPS (3kVA)",
      "UPS 1000VA",
      "UPS 1500",
      "Uninterruptable Power Supply",
      "Uninterruptible Power Supply",
      "Li-Ion",
      "EPIRB radio beacon",
      "SART rescue",
      "ATEX UHF",
      "DECT Handset",
      "Motorola R7 NKP",
      "GMDSS emergency power",
      "UPS kits",
      "UPS kit"
    ],
    "action": "Batterijtype en State of Charge (SoC) bevestigen. IMDG Klasse 9 UN 3480/3481.",
    "regulations": "IMDG Code Klasse 9, UN 3480/3481/3536"
  },
  "🔴 4. Brandblusmiddelen & Gassen": {
    "risk": "high",
    "keywords": [
      "Fire extinguishing medium cylinder",
      "CO2 Manifold",
      "CO2 cylinders",
      "Fire extinguishing cabinet",
      "Gen. Service Air Receiver",
      "Watermist pump unit"
    ],
    "action": "SDS opvragen. Drukvatveiligheid controleren. CO2 = Klasse 2.2.",
    "regulations": "IMDG Code Klasse 2.2, UN 1013, PED Directive"
  },
  "🟠 5. SCR/Ureum (uitlaatgas)": {
    "risk": "medium",
    "keywords": [
      "SCR reactor",
      "Urea dosing unit",
      "Urea supply unit",
      "Urea supply pump",
      "Nozzle injector unit",
      "Injection pipe",
      "Soot blowing panel",
      "SCR Control Unit"
    ],
    "action": "Katalysator bevat mogelijk V2O5 (giftig). Ureum = ammoniakvorming bij verhitting.",
    "regulations": "CLP: V2O5 = Carc. 2 / Repr. 2, AFS-40 urea handling"
  },
  "🟠 6. Hydraulische systemen": {
    "risk": "medium",
    "keywords": [
      "Hydraulic power unit",
      "Hangar and Side Doors HPU",
      "Hydraulic hatches Forward",
      "Hydraulic Cylinder",
      "Hydraulic hand pump",
      "Hydraulic pipe bending",
      "HiPAP Gate Valve HPU"
    ],
    "action": "Hydraulische olie type bevestigen. Milieugevaarlijk. Lekpreventie controleren.",
    "regulations": "CLP H304/H411, MARPOL Annex I"
  },
  "🟠 7. Transformatoren": {
    "risk": "medium",
    "keywords": [
      "440V/110V jointing room transformer",
      "440V/110V cable hanger transformer",
      "Plough Surface Transformer",
      "Jetting Transformer",
      "AVR ABB Unitrol"
    ],
    "action": "Controleer op PCB’s (IHM Table A). Isolatieolie/hars type verifiëren.",
    "regulations": "IHM Appendix 1 (PCBs), EU SRR, Stockholm Convention"
  },
  "🟠 8. Motoren & Verbranding": {
    "risk": "medium",
    "keywords": [
      "Generator set - Engine - Himsen",
      "Exhaust gas silencer",
      "Incinerator - Atlas",
      "Spark Arrester",
      "prelubricating oil pump"
    ],
    "action": "Smeerolie, koelvloeistof, RCF isolatie controleren. IHM Table B check.",
    "regulations": "IHM Appendix 2 (RCF), MARPOL Annex VI"
  },
  "🟡 9. Lassen & Werkplaats": {
    "risk": "low",
    "keywords": [
      "Welding machine",
      "MIG Welding torch",
      "Grinding machine",
      "Metal saw blade",
      "Fuel oil injection nozzle test",
      "Welding screen"
    ],
    "action": "Lasdampen bevatten zware metalen. Persoonlijke beschermingsmiddelen vereist.",
    "regulations": "EU OEL Directive, CLP bijlage VI"
  },
  "🟡 10. Rubber & Isolatie (IHM)": {
    "risk": "low",
    "keywords": [
      "Rubber Design",
      "Insulation",
      "Steel Expansion Joint",
      "Thermal Insulation"
    ],
    "action": "IHM Material Declaration opvragen. Check op asbest, RCF, HBCDD, cadmium, zware metalen.",
    "regulations": "IHM Table A (asbest) & Table B (cadmium, HBCDD, RCF)"
  },
  "🟡 11. Overig gevaarlijk": {
    "risk": "low",
    "keywords": [
      "Searchlight xenon",
      "Gyro master compass",
      "CJC Marine Diesel Purifier",
      "Azimuth thruster",
      "Liquid immersion heater",
      "Crimpin tool"
    ],
    "action": "Individuele beoordeling nodig. Xenon = gas onder druk, Gyro = mogelijk kwik.",
    "regulations": "Diverse – per item beoordelen"
  }
};

let currentRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
let lastResults = null;
let lastData = null;
let activeCategoryFilters = {};

document.getElementById('rulesEditor').value = JSON.stringify(currentRules, null, 2);

// ============================================================
// DROP ZONE + FILE UPLOAD
// ============================================================
var dropZone = document.getElementById('dropZone');
var fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', function(e){
  e.preventDefault(); dropZone.classList.remove('dragover');
  if(e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', function(e){ if(e.target.files.length) processFile(e.target.files[0]); });

function processFile(file){
  if(typeof XLSX === 'undefined'){ showLibraryError(); return; }
  console.log('[HSA] Processing:', file.name, '(' + file.size + ' bytes)');
  document.getElementById('fileLabel').textContent = file.name;

  dropZone.classList.add('loading');
  dropZone.querySelector('.icon').textContent = '\u23f3';
  dropZone.querySelector('p strong').textContent = 'Bestand wordt geanalyseerd...';

  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, {type:'array'});
      console.log('[HSA] Sheets:', wb.SheetNames.join(', '));
      window._lastWb = wb;

      var sheetName = wb.SheetNames.find(function(n){ return n.toLowerCase().indexOf('deliver') !== -1; }) || wb.SheetNames[0];
      console.log('[HSA] Using sheet:', sheetName);

      var ws = wb.Sheets[sheetName];

      // Smart header-row detection: scan first 15 rows for "Description"
      var rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      var headerRowIdx = -1;
      for(var r = 0; r < Math.min(rawRows.length, 15); r++){
        if(rawRows[r] && rawRows[r].some(function(cell){ return String(cell).toLowerCase().trim() === 'description'; })){
          headerRowIdx = r; break;
        }
      }
      if(headerRowIdx === -1){
        for(var r2 = 0; r2 < Math.min(rawRows.length, 15); r2++){
          if(rawRows[r2] && rawRows[r2].some(function(cell){ return String(cell).toLowerCase().indexOf('description') !== -1; })){
            headerRowIdx = r2; break;
          }
        }
      }
      if(headerRowIdx === -1) headerRowIdx = 2;
      window._headerRowIdx = headerRowIdx;
      console.log('[HSA] Header row at index:', headerRowIdx, '(Excel row ' + (headerRowIdx+1) + ')');

      var json = XLSX.utils.sheet_to_json(ws, {range: headerRowIdx, defval:''});
      if(!json.length){ alert('Geen data gevonden in sheet "' + sheetName + '"'); resetDropZone(); return; }
      console.log('[HSA] Rows:', json.length, '| Columns:', Object.keys(json[0]).join(', '));

      lastData = json;
      analyzeData(json);
      resetDropZone();
    } catch(err){
      console.error('[HSA] Error:', err);
      alert('Fout bij lezen: ' + err.message);
      resetDropZone();
    }
  };
  reader.readAsArrayBuffer(file);
}

function resetDropZone(){
  dropZone.classList.remove('loading');
  dropZone.querySelector('.icon').textContent = '\uD83D\uDCC1';
  dropZone.querySelector('p strong').textContent = 'Sleep je Expediting lijst hierheen';
}

// ============================================================
// ANALYSIS ENGINE
// ============================================================
function analyzeData(rows){
  var sampleRow = rows[0];
  var keys = Object.keys(sampleRow);
  console.log('[HSA] Columns:', keys.join(', '));

  var descCol = keys.find(function(k){ return k.toLowerCase() === 'description'; })
             || keys.find(function(k){ return k.toLowerCase().indexOf('description') !== -1; })
             || keys.find(function(k){ return k.toLowerCase().indexOf('omschrijving') !== -1; });
  var poCol = keys.find(function(k){ return k === 'Purchase Order No'; })
           || keys.find(function(k){ return k.toLowerCase().indexOf('purchase order') !== -1; })
           || keys[0];
  var orderCol = keys.find(function(k){ return k === 'Order No'; })
              || keys.find(function(k){ return k.toLowerCase() === 'order no'; });

  // Date column: try header names, then fallback to Column U (index 20)
  var dateCol = keys.find(function(k){ var lk = k.toLowerCase(); return lk.indexOf('confirm') !== -1 && lk.indexOf('date') !== -1; })
             || keys.find(function(k){ var lk = k.toLowerCase(); return lk.indexOf('delivery') !== -1 || lk.indexOf('verwacht') !== -1 || lk === 'eta' || lk.indexOf('planned') !== -1; });
  if(!dateCol && keys.length > 20) dateCol = keys[20];

  console.log('[HSA] Mapped: desc=' + descCol + ' | po=' + poCol + ' | order=' + orderCol + ' | date=' + dateCol);

  if(!descCol){
    alert('Kolom "Description" niet gevonden.\nGevonden kolommen:\n' + keys.join(', '));
    return;
  }

  var results = {};
  for(var catName in currentRules){
    results[catName] = { poLines: [], basePOs: new Set(), descriptions: new Set(), items: [] };
  }

  var totalScanned = 0, totalFlagged = 0, allFlaggedPOs = new Set();

  rows.forEach(function(row){
    var desc = String(row[descCol] || '').trim();
    var poKey = String(row[poCol] || '').trim();
    var basePO = orderCol ? String(row[orderCol] || '').trim() : poKey.split('-')[0];
    if(!desc || !poKey) return;
    totalScanned++;

    for(var catName in currentRules){
      var cat = currentRules[catName];
      for(var i = 0; i < cat.keywords.length; i++){
        if(desc.toLowerCase().indexOf(cat.keywords[i].toLowerCase()) !== -1){
          var etaVal = dateCol ? String(row[dateCol] || '').trim() : '';
          results[catName].poLines.push(poKey);
          results[catName].basePOs.add(basePO);
          results[catName].descriptions.add(desc.substring(0,120));
          results[catName].items.push({ po: poKey, basePO: basePO, desc: desc.substring(0,120), eta: etaVal, category: catName, risk: cat.risk });
          totalFlagged++;
          allFlaggedPOs.add(basePO);
          break;
        }
      }
    }
  });

  lastResults = results;

  var catsWithHits = 0;
  for(var cn in results){ if(results[cn].poLines.length > 0) catsWithHits++; }

  document.getElementById('statTotal').textContent = totalScanned;
  document.getElementById('statFlagged').textContent = totalFlagged;
  document.getElementById('statCategories').textContent = catsWithHits;
  document.getElementById('statPOs').textContent = allFlaggedPOs.size;
  document.getElementById('statsBar').style.display = 'grid';
  document.getElementById('actionsBar').style.display = 'flex';
  document.getElementById('tabBar').style.display = 'flex';

  console.log('[HSA] Done: scanned=' + totalScanned + ' flagged=' + totalFlagged + ' cats=' + catsWithHits + ' POs=' + allFlaggedPOs.size);

  renderResults(results);
  renderTimeline(results);
}

// ============================================================
// RENDER CATEGORY VIEW
// ============================================================
function renderResults(results){
  var container = document.getElementById('resultsContainer');
  container.innerHTML = '';

  for(var catName in results){
    var data = results[catName];
    var rule = currentRules[catName];
    var count = data.poLines.length;
    var riskClass = rule.risk === 'high' ? 'risk-high' : rule.risk === 'medium' ? 'risk-medium' : 'risk-low';

    var card = document.createElement('div');
    card.className = 'cat-card ' + riskClass;
    card.dataset.search = (catName + ' ' + Array.from(data.descriptions).join(' ') + ' ' + Array.from(data.basePOs).join(' ')).toLowerCase();

    var uniqueDescs = Array.from(data.descriptions);
    var uniquePOs = Array.from(data.basePOs).sort();
    var poLines = Array.from(new Set(data.poLines)).sort();

    var headerDiv = document.createElement('div');
    headerDiv.className = 'cat-header';
    headerDiv.onclick = function(){ this.parentElement.classList.toggle('open'); };

    var titleDiv = document.createElement('div');
    titleDiv.className = 'cat-title';
    var badge = document.createElement('span');
    badge.className = 'cat-badge';
    badge.textContent = count;
    var nameSpan = document.createElement('span');
    nameSpan.textContent = catName;
    titleDiv.appendChild(badge);
    titleDiv.appendChild(nameSpan);

    var chevron = document.createElement('span');
    chevron.className = 'cat-chevron';
    chevron.textContent = '\u25BC';

    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(chevron);
    card.appendChild(headerDiv);

    var bodyDiv = document.createElement('div');
    bodyDiv.className = 'cat-body';
    var contentDiv = document.createElement('div');
    contentDiv.className = 'cat-content';

    if(count === 0){
      var p = document.createElement('p');
      p.style.cssText = 'color:var(--text-dim);font-size:.9em';
      p.textContent = '\u2705 Geen items gevonden in deze categorie';
      contentDiv.appendChild(p);
    } else {
      contentDiv.innerHTML =
        '<div class="cat-section"><h4>\uD83D\uDCCB Aanbevolen actie</h4>'
        + '<p style="font-size:.85em;color:var(--orange)">' + escapeHtml(rule.action) + '</p>'
        + '<p style="font-size:.8em;color:var(--text-dim);margin-top:4px">Regelgeving: ' + escapeHtml(rule.regulations) + '</p></div>'
        + '<div class="cat-section"><h4>\uD83C\uDFF7\uFE0F Purchase Orders (' + uniquePOs.length + ' uniek)</h4>'
        + '<div class="po-grid">' + uniquePOs.map(function(po){ return '<span class="po-tag">' + escapeHtml(po) + '</span>'; }).join('') + '</div></div>'
        + '<div class="cat-section"><h4>\uD83D\uDCC4 PO-regels (' + poLines.length + ')</h4>'
        + '<div class="po-grid">' + poLines.map(function(po){ return '<span class="po-tag">' + escapeHtml(po) + '</span>'; }).join('') + '</div></div>'
        + '<div class="cat-section"><h4>\uD83D\uDCDD Beschrijvingen (' + uniqueDescs.length + ' uniek)</h4>'
        + '<ul class="desc-list">' + uniqueDescs.map(function(d){ return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul></div>';
    }

    bodyDiv.appendChild(contentDiv);
    card.appendChild(bodyDiv);
    container.appendChild(card);
  }
}

// ============================================================
// TIMELINE VIEW + CATEGORY FILTERS
// ============================================================
var NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

function parseDate(str){
  if(!str) return null;
  var s = String(str).trim();
  if(/^\d{5}$/.test(s)){
    var d = new Date((parseInt(s) - 25569) * 86400000);
    if(!isNaN(d.getTime())) return d;
  }
  var d2 = new Date(s);
  if(!isNaN(d2.getTime())) return d2;
  var m = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if(m){
    var yr = parseInt(m[3]); if(yr < 100) yr += 2000;
    var d3 = new Date(yr, parseInt(m[2])-1, parseInt(m[1]));
    if(!isNaN(d3.getTime())) return d3;
  }
  return null;
}

function formatDate(d){
  if(!d) return '\u2014';
  return String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
}

function renderTimeline(results){
  var filterBox = document.getElementById('tlFilters');
  var container = document.getElementById('timelineContainer');
  filterBox.innerHTML = '';
  container.innerHTML = '';

  // Build list of categories that have hits
  var activeCats = [];
  for(var cn in results){
    if(results[cn].items.length > 0){
      activeCats.push({ name: cn, risk: currentRules[cn].risk, count: results[cn].items.length });
    }
  }

  // Init filter state: all active
  activeCategoryFilters = {};
  activeCats.forEach(function(c){ activeCategoryFilters[c.name] = true; });

  // Render filter chips
  if(activeCats.length > 0){
    var label = document.createElement('div');
    label.className = 'tl-filters-label';
    label.textContent = 'Filter op categorie:';
    filterBox.appendChild(label);

    activeCats.forEach(function(cat){
      var chip = document.createElement('span');
      chip.className = 'tl-chip active risk-' + cat.risk;
      chip.dataset.cat = cat.name;
      chip.textContent = cat.name.replace(/^[^\d]*/, '').substring(0,30) + ' (' + cat.count + ')';
      chip.onclick = function(){
        activeCategoryFilters[cat.name] = !activeCategoryFilters[cat.name];
        this.classList.toggle('active');
        this.classList.toggle('inactive', !activeCategoryFilters[cat.name]);
        applyTimelineFilters();
      };
      filterBox.appendChild(chip);
    });
  }

  // Collect + sort items
  var allItems = [];
  for(var catName in results){
    results[catName].items.forEach(function(item){
      allItems.push({
        eta: item.eta,
        etaParsed: parseDate(item.eta),
        po: item.po,
        desc: item.desc,
        category: item.category || catName,
        risk: item.risk || 'low'
      });
    });
  }

  if(allItems.length === 0){
    container.innerHTML = '<div class="tl-empty">Geen gemarkeerde items gevonden.</div>';
    return;
  }

  allItems.sort(function(a,b){
    if(a.etaParsed && b.etaParsed) return a.etaParsed - b.etaParsed;
    if(a.etaParsed && !b.etaParsed) return -1;
    if(!a.etaParsed && b.etaParsed) return 1;
    return 0;
  });

  // Group by month
  var groups = {};
  var groupOrder = [];
  allItems.forEach(function(item){
    var key = item.etaParsed ? NL_MONTHS[item.etaParsed.getMonth()] + ' ' + item.etaParsed.getFullYear() : 'Onbekende datum';
    if(!groups[key]){ groups[key] = []; groupOrder.push(key); }
    groups[key].push(item);
  });

  // Render month groups
  groupOrder.forEach(function(key){
    var items = groups[key];
    var groupDiv = document.createElement('div');
    groupDiv.className = 'tl-month';

    var header = document.createElement('div');
    header.className = 'tl-month-header';
    header.innerHTML = '\uD83D\uDCC5 ' + escapeHtml(key.charAt(0).toUpperCase() + key.slice(1)) + ' <span class="tl-count">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</span>';
    groupDiv.appendChild(header);

    items.forEach(function(item){
      var row = document.createElement('div');
      row.className = 'tl-item risk-' + item.risk;
      row.dataset.category = item.category;

      var dateSpan = document.createElement('span');
      dateSpan.className = 'tl-date';
      dateSpan.textContent = item.etaParsed ? formatDate(item.etaParsed) : (item.eta || '\u2014');

      var poSpan = document.createElement('span');
      poSpan.className = 'tl-po';
      poSpan.textContent = item.po;

      var descSpan = document.createElement('span');
      descSpan.className = 'tl-desc';
      descSpan.title = item.desc;
      descSpan.textContent = item.desc;

      var catSpan = document.createElement('span');
      catSpan.className = 'tl-cat ' + item.risk;
      catSpan.textContent = item.category.replace(/^[^\d]*/, '').substring(0,25);

      row.appendChild(dateSpan);
      row.appendChild(poSpan);
      row.appendChild(descSpan);
      row.appendChild(catSpan);
      groupDiv.appendChild(row);
    });

    container.appendChild(groupDiv);
  });

  console.log('[HSA] Timeline:', allItems.length, 'items in', groupOrder.length, 'groups');
}

function applyTimelineFilters(){
  document.querySelectorAll('.tl-item').forEach(function(row){
    var cat = row.dataset.category;
    row.classList.toggle('filtered-out', !activeCategoryFilters[cat]);
  });
  // Update month group counts
  document.querySelectorAll('.tl-month').forEach(function(group){
    var visible = group.querySelectorAll('.tl-item:not(.filtered-out)').length;
    var countEl = group.querySelector('.tl-count');
    if(countEl) countEl.textContent = visible + ' item' + (visible !== 1 ? 's' : '');
    group.style.display = visible === 0 ? 'none' : '';
  });
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchView(view){
  var tabs = document.querySelectorAll('.tab-btn');
  tabs[0].classList.toggle('active', view === 'categories');
  tabs[1].classList.toggle('active', view === 'timeline');
  document.getElementById('viewCategories').classList.toggle('active', view === 'categories');
  document.getElementById('viewTimeline').classList.toggle('active', view === 'timeline');
}

// ============================================================
// UTILITIES
// ============================================================
function expandAll(){ document.querySelectorAll('.cat-card').forEach(function(c){ c.classList.add('open'); }); }
function collapseAll(){ document.querySelectorAll('.cat-card').forEach(function(c){ c.classList.remove('open'); }); }

function filterCards(q){
  var query = q.toLowerCase();
  document.querySelectorAll('.cat-card').forEach(function(card){
    card.style.display = card.dataset.search.indexOf(query) !== -1 ? '' : 'none';
  });
}

function toggleConfig(){
  document.getElementById('configPanel').classList.toggle('open');
}

function applyRules(){
  try {
    currentRules = JSON.parse(document.getElementById('rulesEditor').value);
    if(lastData){ analyzeData(lastData); alert('\u2705 Regels bijgewerkt en analyse opnieuw uitgevoerd!'); }
    else { alert('\u2705 Regels bijgewerkt!'); }
  } catch(e){ alert('\u274C Ongeldige JSON: ' + e.message); }
}

function resetRules(){
  currentRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  document.getElementById('rulesEditor').value = JSON.stringify(currentRules, null, 2);
  if(lastData){ analyzeData(lastData); alert('\uD83D\uDD04 Regels gereset en heranalyseerd!'); }
  else { alert('\uD83D\uDD04 Regels gereset.'); }
}

function exportCSV(){
  if(!lastResults){ alert('Geen resultaten.'); return; }
  var csv = 'Categorie;Risico;PO Regel;Base PO;Beschrijving;Verwachte Levering;Aanbevolen Actie;Regelgeving\n';
  for(var catName in lastResults){
    var data = lastResults[catName];
    var rule = currentRules[catName];
    var esc = function(s){ return '"' + String(s).replace(/"/g,'""') + '"'; };
    data.items.forEach(function(item){
      csv += esc(catName)+';'+esc(rule.risk)+';'+esc(item.po)+';'+esc(item.basePO)+';'+esc(item.desc)+';'+esc(item.eta||'')+';'+esc(rule.action)+';'+esc(rule.regulations)+'\n';
    });
  }
  var blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'Hazardous_Substance_Analysis_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
  console.log('[HSA] CSV exported');
}
