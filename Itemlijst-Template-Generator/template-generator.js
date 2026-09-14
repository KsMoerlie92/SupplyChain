/**
 * template-generator.js  –  IHC Expedite 2.0 · Itemlijst Template Generator
 *
 * Fase 1 (intern gebruik door het Expediting-team):
 *   1. PO-nummer opzoeken in de bedrijfsbrede Expediting-lijst
 *   2. Regels selecteren die in de itemlijst-template moeten komen
 *   3. Optioneel: onderdelen toevoegen die nog niet op de PO staan
 *      (worden op de achtergrond L-Parts, met een automatisch systeem-
 *      nummer via shared/lparts-numbering.js — zelfde register als de
 *      Itemlijst Validator)
 *   4. Template genereren (.xlsx) en/of mailen naar de leverancier
 *   5. Unieke link genereren (per PO-nummer) — zie LET OP hieronder
 *
 * LET OP — geen echte toegangsbeveiliging: dit is een statische website
 * zonder server/backend. De "unieke link" codeert het PO-nummer alleen
 * lichtjes (niet cryptografisch) zodat het niet een kaal, direct
 * herkenbaar PO-nummer in de adresbalk is — het voorkomt geen opzettelijk
 * misbruik. Zolang dit intern blijft (fase 1) is dat geen probleem; bij
 * extern delen met leveranciers (fase 2) moet dit samen met IT opnieuw
 * bekeken worden.
 */
(function () {
  if (window.__templateGenLoaded) return;
  window.__templateGenLoaded = true;

  const trim = v => String(v ?? '').trim();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Volledige Itemlijst-kolomvolgorde (A t/m AA) — zelfde als val-export-mail.js.
  const IL_COLS = [
    'Delivery ref.', 'Project', 'IHC PO', 'Item', 'Item description',
    'Quantity', 'Unit of measure', 'Component (Mark/Label)', 'Code supplier',
    'Serial number', 'Supplier', 'Make', 'Material', 'Country of origin',
    'Hs-code', 'Value pc (EUR)', 'Value total', 'Collo', 'Type of packaging',
    'Length cm', 'Width cm', 'Height cm', 'Volume m3',
    'Weight gross (collo)', 'Weight nett (collo)', 'Dangerous Goods?',
    'Inspection Level',
  ];

  // ── State ────────────────────────────────────────────────────────────
  let expRows = [];          // alle Expediting-regels voor de opgezochte PO
  let selected = new Set();  // indices in expRows die geselecteerd zijn
  let extraItems = [];       // handmatig toegevoegde L-Part-regels

  /* ─── PO opzoeken ────────────────────────────────────────────────────── */

  async function searchPO(po) {
    po = trim(po);
    if (!po) return { rows: [], error: 'Voer een PO-nummer in.' };
    if (!window.ExpeditingData) return { rows: [], error: 'Expediting-datalaag niet geladen.' };

    const raw = await ExpeditingData.loadRaw();
    if (!raw || !Array.isArray(raw.rows)) return { rows: [], error: 'Bedrijfsbrede Expediting-lijst kon niet geladen worden.' };

    const POCOL = ExpeditingCore && ExpeditingCore.COLS ? ExpeditingCore.COLS.po : 'Purchase Order No';
    const ORDERCOL = ExpeditingCore && ExpeditingCore.COLS ? ExpeditingCore.COLS.orderNo : 'Order No';

    const matches = raw.rows.filter(r => trim(r[POCOL]) === po || trim(r[ORDERCOL]) === po);
    if (!matches.length) return { rows: [], error: `Geen regels gevonden voor PO ${esc(po)} in de Expediting-lijst.` };
    return { rows: matches, error: null };
  }

  /* ─── Rij-opbouw (Expediting-regel of L-Part) → Itemlijst-rij ─────────── */

  function expRowToItemlijstRow(r) {
    const C = ExpeditingCore.COLS;
    const lineNo = trim(r['Line No']);
    const releaseNo = trim(r['Release No']);
    const item = (lineNo && releaseNo) ? `'${lineNo}-${releaseNo}` : lineNo;
    const po = trim(r[C.po]) || trim(r[C.orderNo]);
    const uref = trim(r[C.uref]);
    const out = {};
    IL_COLS.forEach(h => { out[h] = ''; });
    out['Project'] = trim(r[C.sub]);
    out['IHC PO'] = po;
    out['Item'] = item;
    out['Item description'] = trim(r[C.desc]);
    out['Quantity'] = trim(r[C.qty]);
    out['Unit of measure'] = trim(r[C.uom] || r['Purch UoM']);
    out['Supplier'] = trim(r[C.supplier]);
    // Mark/Label alleen vooraf invullen als het al bekend is (Unified Reference
    // Code) — anders is dit juist het veld dat de leverancier/het merkproces
    // nog moet invullen (zie "Merken van colli"-proces).
    out['Component (Mark/Label)'] = uref || '';
    return out;
  }

  function extraItemToItemlijstRow(it) {
    const out = {};
    IL_COLS.forEach(h => { out[h] = ''; });
    out['IHC PO'] = it.po;
    out['Item'] = it.itemNo;
    out['Item description'] = it.description;
    out['Quantity'] = it.qty || '1';
    out['Unit of measure'] = it.uom || 'pcs';
    // Nieuw onderdeel: het systeemnummer IS meteen ook het Mark/Label
    // (consistent met hoe deze nummers elders al in kolom H verschijnen).
    out['Component (Mark/Label)'] = it.itemNo;
    return out;
  }

  function buildTemplateRows(po) {
    const rows = [];
    expRows.forEach((r, i) => { if (selected.has(i)) rows.push(expRowToItemlijstRow(r)); });
    extraItems.forEach(it => rows.push(extraItemToItemlijstRow(it)));
    return rows;
  }

  /* ─── Unieke link (fase 1: eenvoudige, niet-cryptografische codering) ──── */

  function encodePO(po) {
    try { return btoa(unescape(encodeURIComponent(trim(po)))).replace(/=+$/, ''); }
    catch (e) { return trim(po); }
  }
  function decodePO(code) {
    try {
      let s = code.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return decodeURIComponent(escape(atob(s)));
    } catch (e) { return ''; }
  }
  function buildShareLink(po) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('po', encodePO(po));
    return url.toString();
  }

  /* ─── Publieke API ───────────────────────────────────────────────────── */

  window.TemplateGenerator = {
    IL_COLS,
    searchPO,
    buildTemplateRows,
    buildShareLink,
    encodePO, decodePO,
    // state-toegang voor de UI-laag (template-generator-ui.js)
    getState: () => ({ expRows, selected, extraItems }),
    setExpRows: (rows) => { expRows = rows; selected = new Set(); },
    toggleSelected: (i) => { if (selected.has(i)) selected.delete(i); else selected.add(i); },
    selectAll: () => { expRows.forEach((_, i) => selected.add(i)); },
    selectNone: () => { selected.clear(); },
    addExtraItem: (it) => { extraItems.push(it); },
    removeExtraItem: (idx) => { extraItems.splice(idx, 1); },
    clearExtraItems: () => { extraItems = []; },
  };
})();
