/* ============================================================
   shared/inspection-rules.js
   Projectgebonden regels voor kolom AA (Inspection Level) in de
   Itemlijst Validator — "welk component/welke leverancier krijgt
   welke mate van controle, binnen welk project".

   Zelfde patroon als shared/expediting-data.js:
   - IndexedDB = lokale kladversie/preview op de Admin-pagina
   - shared/inspection-rules.json = de bedrijfsbrede, gecommitte
     versie die alle andere pagina's uitlezen (fetch, geen upload
     nodig door de gewone gebruiker)

   Eén regel = { subProjectId, type: 'component'|'supplier', match,
                 inspectionLevel, reden?, datum? }
   - type 'component': match wordt vergeleken met kolom H
     (Component/Mark/Label) van de itemlijst — exacte match, of een
     prefix gevolgd door "*" (bv. "2253-*" matcht alles dat met
     "2253-" begint).
   - type 'supplier': match wordt vergeleken met kolom K (Supplier),
     hoofdletterongevoelig.
   - subProjectId: exact, of "*" voor "geldt voor alle projecten".

   Specificiteit bij een match (hoogste voorrang eerst):
     1. component-regel met exact dit Sub Project ID
     2. component-regel met subProjectId "*"
     3. supplier-regel met exact dit Sub Project ID
     4. supplier-regel met subProjectId "*"
   Bij meerdere regels binnen dezelfde specificiteit: de LAATST
   toegevoegde/geüploade regel wint (zo kan een verslechterende
   leverancier bewust met een nieuwe regel worden "overruled").
   ============================================================ */
(function (global) {
  'use strict';
  const DB = 'ihc_inspection_rules', STORE = 'kv', VER = 1;

  function open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), st = t.objectStore(STORE); let out;
      Promise.resolve(fn(st)).then(v => { out = v; });
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const get = k => tx('readonly', st => new Promise(r => { const q = st.get(k); q.onsuccess = () => r(q.result); }));
  const put = (k, v) => tx('readwrite', st => { st.put(v, k); });

  // ── Lokaal (Admin-pagina, vóór committen) ──────────────────────────────
  async function loadLocal() { return (await get('rules')) || []; }
  async function saveLocal(rules) { await put('rules', rules); await put('meta', { uploaded: new Date().toISOString(), rows: rules.length }); return true; }
  async function metaLocal() { return (await get('meta')) || null; }
  async function clearLocal() { await put('rules', []); await put('meta', null); }

  // ── Bedrijfsbreed, gecommit bestand ─────────────────────────────────────
  const _SELF = (document.currentScript && document.currentScript.src) || '';
  const _JSON_URL = _SELF ? _SELF.replace(/[^/]+$/, 'inspection-rules.json') : '../shared/inspection-rules.json';
  let _committed;

  async function _fetchCommitted() {
    try {
      const res = await fetch(_JSON_URL, { cache: 'no-cache' });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || !Array.isArray(j.rules)) return null;
      return j.rules;
    } catch (e) { return null; }
  }
  async function _ensureCommitted() {
    if (_committed !== undefined) return _committed;
    _committed = await _fetchCommitted();
    return _committed;
  }

  /** Regels om mee te werken op een consumerende pagina (Validator e.d.):
   *  eerst het gecommitte bestand, anders (fallback) de lokale kladversie. */
  async function loadRules() {
    const c = await _ensureCommitted();
    return c || (await loadLocal());
  }

  function buildCommitJSON(rules, metaObj) {
    return JSON.stringify({ meta: Object.assign({ uploaded: new Date().toISOString(), rows: rules.length }, metaObj || {}), rules });
  }

  /**
   * Zoekt de van toepassing zijnde Inspection Level voor deze itemlijst-regel.
   * @param {string[]} rules       array van regelobjecten (zie bovenaan)
   * @param {string} subProjectId  Sub Project ID van de huidige lijst, of ''
   * @param {string} markOrLabel   waarde van kolom H (Component/Mark/Label)
   * @param {string} supplier      waarde van kolom K (Supplier)
   * @returns {{level:string, rule:object}|null}
   */
  function lookup(rules, subProjectId, markOrLabel, supplier) {
    if (!rules || !rules.length) return null;
    const spid = String(subProjectId || '').trim();
    const mark = String(markOrLabel || '').trim();
    const sup = String(supplier || '').trim().toLowerCase();

    const matchesComponent = r => {
      if (r.type !== 'component' || !mark) return false;
      const m = String(r.match || '').trim();
      if (m.endsWith('*')) return mark.toUpperCase().startsWith(m.slice(0, -1).toUpperCase());
      return mark.toUpperCase() === m.toUpperCase();
    };
    const matchesSupplier = r => r.type === 'supplier' && sup && String(r.match || '').trim().toLowerCase() === sup;
    const matchesProject = r => !r.subProjectId || r.subProjectId === '*' || r.subProjectId === spid;

    // 4 lagen van specificiteit, elk: laatst toegevoegde regel binnen die laag wint.
    const layers = [
      rules.filter(r => matchesComponent(r) && r.subProjectId && r.subProjectId !== '*' && r.subProjectId === spid),
      rules.filter(r => matchesComponent(r) && (!r.subProjectId || r.subProjectId === '*')),
      rules.filter(r => matchesSupplier(r) && r.subProjectId && r.subProjectId !== '*' && r.subProjectId === spid),
      rules.filter(r => matchesSupplier(r) && (!r.subProjectId || r.subProjectId === '*')),
    ];
    for (const layer of layers) {
      if (layer.length) { const r = layer[layer.length - 1]; return { level: r.inspectionLevel, rule: r }; }
    }
    return null;
  }

  global.InspectionRules = { loadLocal, saveLocal, metaLocal, clearLocal, loadRules, buildCommitJSON, lookup };
})(window);
