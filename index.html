// ============================================================
// UR E27 — Low-risk assessment for non-applicability
// Bron: "Low-risk assessments for non-applicability of UR E27"
// (template, UR E26 §6.4 Acceptance Criteria)
// ============================================================

function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// De 5 verplichte UR E26 §6.4-criteria — ALLE moeten JA zijn voor vrijstelling
var MANDATORY = [
  { id: 1, req: 'The CBS shall be isolated.',
    measure: 'The CBS shall not have any IP-network connection to other systems or networks.',
    hint: 'bv. naam van topologiediagram dat dit aantoont' },
  { id: 2, req: 'The CBS shall have no accessible physical interface ports.',
    measure: 'Unused interfaces shall be logically disabled. It shall not be possible to connect unauthorized devices to the CBS.',
    hint: 'bv. model van de port blocker' },
  { id: 3, req: 'The CBS must be located in areas to which physical access is controlled.',
    measure: 'The CBS is located in a physically access controlled area or inside a control box with door locks.',
    hint: 'bv. installatiehandleiding met locatie-aanbeveling' },
  { id: 4, req: 'The CBS shall not be an integrated control system serving multiple ship functions as specified in the scope of applicability of this UR.',
    measure: 'The system is not an integrated control system that provides multiple important functions.',
    hint: 'bv. productdocumentatie' },
  { id: 5, req: 'CBS should not serve ship functions of category III.',
    measure: 'The system is not classified as a cat. III safety system according to IACS UR E22.',
    hint: 'bv. productdocumentatie' },
];

// De 2 niet-verplichte aanvullende overwegingen
var OPTIONAL = [
  { id: 6, req: 'Known vulnerabilities, threats, potential impacts deriving from a cyber incident affecting the CBS have been duly considered in the risk assessment.',
    measure: 'Non mandatory',
    hint: 'bv. risicobeoordeling op kwetsbaarheden' },
  { id: 7, req: 'The attack surface for the CBS is minimized, having considered its complexity, connectivity, physical and logical access points, including wireless access points.',
    measure: 'Non mandatory',
    hint: 'bv. risicobeoordeling op kwetsbaarheden' },
];

var LS_KEY = 'e27Assessments';
var currentId = null;

function $(id){ return document.getElementById(id); }

function renderCriteria(list, containerId){
  var el = $(containerId);
  el.innerHTML = list.map(function(c){
    return '' +
      '<div class="crit-row" data-crit="' + c.id + '">' +
        '<div class="crit-req"><b>' + c.id + '.</b> ' + escapeHtml(c.req) + '</div>' +
        '<div class="crit-measure">' + escapeHtml(c.measure) + '</div>' +
        '<div class="crit-answer">' +
          '<label class="radio-yes"><input type="radio" name="crit-' + c.id + '" value="YES" onchange="onCriteriaChange()"> JA</label>' +
          '<label class="radio-no"><input type="radio" name="crit-' + c.id + '" value="NO" onchange="onCriteriaChange()"> NEE</label>' +
        '</div>' +
        '<textarea class="crit-just" id="just-' + c.id + '" placeholder="Onderbouwing — ' + escapeHtml(c.hint) + '" oninput="onCriteriaChange()"></textarea>' +
      '</div>';
  }).join('');
}

function getAnswers(){
  var answers = {};
  MANDATORY.concat(OPTIONAL).forEach(function(c){
    var checked = document.querySelector('input[name="crit-' + c.id + '"]:checked');
    answers[c.id] = { answer: checked ? checked.value : null, justification: $('just-' + c.id).value };
  });
  return answers;
}

function setAnswers(answers){
  MANDATORY.concat(OPTIONAL).forEach(function(c){
    var a = answers[c.id];
    if(!a) return;
    if(a.answer){
      var radio = document.querySelector('input[name="crit-' + c.id + '"][value="' + a.answer + '"]');
      if(radio) radio.checked = true;
    }
    $('just-' + c.id).value = a.justification || '';
  });
}

function onCriteriaChange(){
  var answers = getAnswers();
  var mandatoryAnswered = MANDATORY.every(function(c){ return answers[c.id].answer; });
  var allYes = MANDATORY.every(function(c){ return answers[c.id].answer === 'YES'; });
  var anyNo = MANDATORY.some(function(c){ return answers[c.id].answer === 'NO'; });

  var resultCard = $('result-card');
  var resultText = $('result-text');
  resultCard.classList.remove('result-ok','result-bad','result-pending');

  if(!mandatoryAnswered){
    resultCard.classList.add('result-pending');
    resultText.innerHTML = '⏳ Nog niet alle verplichte criteria (1–5) zijn beantwoord.';
  } else if(allYes){
    resultCard.classList.add('result-ok');
    resultText.innerHTML = '✅ <b>Vrijstelling van toepassing.</b> Alle 5 verplichte criteria zijn met JA beantwoord — ' +
      'dit CBS hoeft niet te voldoen aan de volledige cyberresilience-eisen van IACS UR E26. ' +
      'Documenteer deze beoordeling en bewaar als bewijs.';
  } else if(anyNo){
    resultCard.classList.add('result-bad');
    resultText.innerHTML = '❌ <b>Geen vrijstelling.</b> Minimaal één verplicht criterium is met NEE beantwoord — ' +
      'dit CBS moet volledig voldoen aan IACS UR E26 (cyberresilience-eisen voor het systeem).';
  }
  saveDraft();
}

function newAssessment(){
  currentId = 'e27-' + Date.now();
  $('f-desc').value = ''; $('f-po').value = ''; $('f-sp').value = ''; $('f-assessor').value = '';
  $('f-date').value = new Date().toISOString().slice(0,10);
  document.querySelectorAll('input[type=radio]').forEach(function(r){ r.checked = false; });
  document.querySelectorAll('textarea').forEach(function(t){ t.value = ''; });
  onCriteriaChange();
  renderSavedList();
}

function currentRecord(){
  return {
    id: currentId,
    desc: $('f-desc').value, po: $('f-po').value, sp: $('f-sp').value,
    assessor: $('f-assessor').value, date: $('f-date').value,
    answers: getAnswers(),
    saved: new Date().toISOString(),
  };
}

function loadAll(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(e){ return {}; }
}
function saveAll(all){
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch(e){}
}

function saveDraft(){
  if(!currentId) return;
  var all = loadAll();
  all[currentId] = currentRecord();
  saveAll(all);
  renderSavedList();
}

// ook opslaan bij wijzigingen aan de identificatievelden
['f-desc','f-po','f-sp','f-assessor','f-date'].forEach(function(id){
  document.addEventListener('DOMContentLoaded', function(){
    var el = $(id); if(el) el.addEventListener('input', saveDraft);
  });
});

function renderSavedList(){
  var all = loadAll();
  var ids = Object.keys(all).sort(function(a,b){ return (all[b].saved||'').localeCompare(all[a].saved||''); });
  var el = $('saved-list');
  if(!ids.length){ el.innerHTML = '<p class="muted">Nog geen opgeslagen beoordelingen.</p>'; return; }
  el.innerHTML = ids.map(function(id){
    var r = all[id];
    var answers = r.answers || {};
    var mandatoryAnswered = MANDATORY.every(function(c){ return answers[c.id] && answers[c.id].answer; });
    var allYes = MANDATORY.every(function(c){ return answers[c.id] && answers[c.id].answer === 'YES'; });
    var badge = !mandatoryAnswered ? '<span class="badge badge-pending">bezig</span>'
              : allYes ? '<span class="badge badge-ok">vrijgesteld</span>'
              : '<span class="badge badge-bad">niet vrijgesteld</span>';
    var active = id === currentId ? ' active' : '';
    return '<div class="saved-item' + active + '" onclick="openAssessment(\'' + id + '\')">' +
      '<div><b>' + escapeHtml(r.desc || '(geen omschrijving)') + '</b> ' + badge + '</div>' +
      '<div class="muted">' + escapeHtml(r.po || '') + (r.sp ? ' · ' + escapeHtml(r.sp) : '') +
      (r.date ? ' · ' + escapeHtml(r.date) : '') + '</div>' +
      '<button class="btn-del" onclick="event.stopPropagation();deleteAssessment(\'' + id + '\')" title="Verwijderen">🗑️</button>' +
      '</div>';
  }).join('');
}

function openAssessment(id){
  var all = loadAll();
  var r = all[id]; if(!r) return;
  currentId = id;
  $('f-desc').value = r.desc || ''; $('f-po').value = r.po || ''; $('f-sp').value = r.sp || '';
  $('f-assessor').value = r.assessor || ''; $('f-date').value = r.date || '';
  document.querySelectorAll('input[type=radio]').forEach(function(radio){ radio.checked = false; });
  document.querySelectorAll('textarea').forEach(function(t){ t.value = ''; });
  setAnswers(r.answers || {});
  onCriteriaChange();
  renderSavedList();
}

function deleteAssessment(id){
  if(!confirm('Deze beoordeling verwijderen?')) return;
  var all = loadAll();
  delete all[id];
  saveAll(all);
  if(id === currentId) newAssessment(); else renderSavedList();
}

function printAssessment(){
  saveDraft();
  window.print();
}

document.addEventListener('DOMContentLoaded', function(){
  renderCriteria(MANDATORY, 'criteria-mandatory');
  renderCriteria(OPTIONAL, 'criteria-optional');

  // Laad meest recente beoordeling, of begin een nieuwe
  var all = loadAll();
  var ids = Object.keys(all).sort(function(a,b){ return (all[b].saved||'').localeCompare(all[a].saved||''); });
  if(ids.length){ openAssessment(ids[0]); } else { newAssessment(); }
});
