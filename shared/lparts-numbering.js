/**
 * lparts-numbering.js  –  IHC Expedite 2.0 · gedeeld
 *
 * ÉÉN registry voor het automatisch opvolgende L-Parts-systeemnummer
 * (basisnummer + doorlopend volgnummer per Order+Line+Release), zodat
 * elke plek die L-Parts registreert — Itemlijst-Validator
 * (val-manual-match.js) én de Itemlijst Template Generator — gegarandeerd
 * hetzelfde register gebruikt, in plaats van elk hun eigen kopie.
 *
 * Voorbeeld: PO 3156018519, Line 1/Release 1, basisnummer "2253-000"
 *   → eerste L-Part daarop: 2253-000.01
 *   → tweede L-Part daarop: 2253-000.02
 *   → een andere Line/Release begint zijn EIGEN reeks.
 *
 * LET OP — bekende beperking (met Kris besproken): dit register staat in
 * de lokale browseropslag (localStorage), niet centraal. Gebruiken
 * meerdere mensen tegelijk dit proces voor dezelfde Order-regel, dan kan
 * elke gebruiker een ander basisnummer te zien krijgen. Zolang er één
 * "L-Parts-eigenaar" per PO/project is, is dat geen probleem. Verplaatsen
 * naar centrale opslag kan later door alléén dít bestand aan te passen.
 *
 * Zelflaadpatroon, identiek aan de andere gedeelde/val-*-scripts.
 */
(function () {
  if (window.LPartsNumbering) return;

  const KEY = 'ihcLPartsBaseRegistry';
  const trim = v => String(v ?? '').trim();

  function loadRegistry() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveRegistry(reg) { localStorage.setItem(KEY, JSON.stringify(reg)); }

  /**
   * @param {string} po        IHC PO-nummer
   * @param {string} lineNo    Line-nummer van de bestaande order-regel
   * @param {string} releaseNo Release-nummer van de bestaande order-regel
   * @param {function(string): (string|null)} askBase
   *   Callback die het basisnummer aan de gebruiker vraagt (bv. window.prompt),
   *   alleen aangeroepen als dit de EERSTE keer is voor deze Order+Line+Release.
   *   Moet de ingevoerde tekst teruggeven, of null bij annuleren.
   * @returns {string|null} het volledige systeemnummer, of null bij annuleren.
   */
  function getNext(po, lineNo, releaseNo, askBase) {
    const key = `${trim(po)}|${trim(lineNo)}|${trim(releaseNo)}`;
    const reg = loadRegistry();
    if (!reg[key]) {
      const base = askBase(key);
      if (base === null || !trim(base)) return null;
      reg[key] = { base: trim(base), count: 0 };
    }
    reg[key].count++;
    const itemNo = `${reg[key].base}.${String(reg[key].count).padStart(2, '0')}`;
    saveRegistry(reg);
    return itemNo;
  }

  /** Bekijk (zonder te verhogen) welk basisnummer al bekend is voor deze Order-regel. */
  function peek(po, lineNo, releaseNo) {
    const key = `${trim(po)}|${trim(lineNo)}|${trim(releaseNo)}`;
    const reg = loadRegistry();
    return reg[key] || null;
  }

  window.LPartsNumbering = { getNext, peek, loadRegistry, saveRegistry, KEY };
})();
