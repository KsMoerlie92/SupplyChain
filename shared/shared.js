// ── IHC Expedite 2.0 — Shared State + Navigation ─────────────────────────
// shared.js: IndexedDB file persistence + nav bar injection

// ── IndexedDB helpers ──────────────────────────────────────────────────────
const IHC_DB = 'ihc-expedite2-shared';
const IHC_STORE = 'files';

function _openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IHC_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IHC_STORE, { keyPath: 'role' });
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
async function sharedSaveFile(role, buf, name) {
  try {
    const db = await _openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IHC_STORE, 'readwrite');
      tx.objectStore(IHC_STORE).put({ role, buf, name, ts: Date.now() });
      tx.oncomplete = res; tx.onerror = rej;
    });
    updateNavStatus();
  } catch(e) { console.warn('sharedSaveFile', e); }
}
async function sharedLoadFile(role) {
  try {
    const db = await _openDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IHC_STORE, 'readonly');
      const req = tx.objectStore(IHC_STORE).get(role);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror   = rej;
    });
  } catch(e) { return null; }
}
async function sharedListFiles() {
  try {
    const db = await _openDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IHC_STORE, 'readonly');
      const req = tx.objectStore(IHC_STORE).getAll();
      req.onsuccess = e => res(e.target.result || []);
      req.onerror = rej;
    });
  } catch(e) { return []; }
}

// ── Nav bar ────────────────────────────────────────────────────────────────
const NAV_PAGES = [
  { href: '../PO-Matcher/',          icon: '🔍', label: 'PO Matcher',         badge: 'Expediting' },
  { href: '../Legplan/',             icon: '📦', label: 'Legplan & CIPL',      badge: 'Shipment'   },
  { href: '../Itemlijst-Validator/', icon: '📋', label: 'Itemlijst Validator', badge: 'Validatie'  },
  { href: '../DG-Overview/',         icon: '⚠️', label: 'DG Overview',         badge: 'Hazardous'  },
];

const NAV_FILES = [
  { role: 'moeder',     label: 'Moederlijst',     accept: '.xlsx,.xlsm,.xls' },
  { role: 'expediting', label: 'Expediting lijst', accept: '.xlsx,.xlsm,.xls' },
];

function injectNav() {
  // Detect active page from current URL
  const path = window.location.pathname.toLowerCase();
  function isActive(href) {
    const seg = href.replace('../','').replace('/','').toLowerCase();
    return path.includes(seg);
  }

  const linksHtml = NAV_PAGES.map(p => {
    const cls = isActive(p.href) ? 'active' : '';
    return `<a href="${p.href}" class="ihc-nav-link ${cls}">
      <span class="ihc-nav-icon">${p.icon}</span>
      <span class="ihc-nav-label">${p.label}</span>
      <span class="ihc-nav-badge">${p.badge}</span>
    </a>`;
  }).join('');

  const filesHtml = NAV_FILES.map(f =>
    `<div class="ihc-nav-file" id="nf-${f.role}" title="Klik om ${f.label} te uploaden" onclick="navUploadClick('${f.role}')">
      <span class="nf-dot" id="nf-dot-${f.role}">○</span>
      <span class="nf-lbl">${f.label.split(' ')[0]}</span>
      <span class="nf-name" id="nf-name-${f.role}">—</span>
      <input type="file" id="nf-inp-${f.role}" accept="${f.accept}" style="display:none" onchange="navHandleFile('${f.role}',this)">
    </div>`
  ).join('');

  const navHtml = `
  <nav class="ihc-nav" id="ihc-nav">
    <a class="ihc-nav-brand" href="../">
      <span class="ihc-nav-logo">IHC</span>
      <span class="ihc-nav-title">Expedite 2.0</span>
    </a>
    <div class="ihc-nav-links">${linksHtml}</div>
    <div class="ihc-nav-files">${filesHtml}</div>
  </nav>
  <div class="ihc-nav-spacer"></div>`;

  document.body.insertAdjacentHTML('afterbegin', navHtml);
  updateNavStatus();

  // Try to restore any previously loaded files into the current page
  _restoreFilesToPage();
}

function navUploadClick(role) {
  document.getElementById(`nf-inp-${role}`)?.click();
}

async function navHandleFile(role, input) {
  const file = input.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  // Save to IndexedDB
  await sharedSaveFile(role, buf, file.name);
  // Notify current page
  if (typeof onNavFileLoaded === 'function') onNavFileLoaded(role, buf, file.name);
  input.value = '';
}

async function updateNavStatus() {
  const files = await sharedListFiles();
  NAV_FILES.forEach(f => {
    const rec  = files.find(x => x.role === f.role);
    const dot  = document.getElementById(`nf-dot-${f.role}`);
    const name = document.getElementById(`nf-name-${f.role}`);
    const wrap = document.getElementById(`nf-${f.role}`);
    if (dot)  { dot.textContent = rec ? '●' : '○'; dot.style.color = rec ? '#22C55E' : ''; }
    if (name) { name.textContent = rec ? rec.name.split(/[\\/]/).pop().substring(0,20) : '—'; name.title = rec ? rec.name : ''; }
    if (wrap) { if (rec) wrap.classList.add('loaded'); else wrap.classList.remove('loaded'); }
  });
}

async function _restoreFilesToPage() {
  // Allow pages to define onNavFileLoaded to receive restored files
  if (typeof onNavFileLoaded !== 'function') return;
  for (const f of NAV_FILES) {
    const rec = await sharedLoadFile(f.role);
    if (rec && rec.buf) {
      onNavFileLoaded(f.role, rec.buf, rec.name);
    }
  }
}

// Auto-inject on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectNav);
} else {
  injectNav();
}
