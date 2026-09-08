/**
 * ifs-lparts-columns.js  –  IHC Expedite 2.0 · gedeeld
 *
 * ÉÉN canonieke koppeltabel tussen Itemlijst-kolommen en de IFS-velden
 * voor L-Parts (view CPartsWithoutPurchOrd / C_PARTS_WITHOUT_PURCH_ORD),
 * geverifieerd tegen een echte IFS-klembordexport ($0 t/m $21).
 *
 * Gebruikt door zowel Itemlijst-Validator (validator.js + val-lparts.js)
 * als IFS-Migration-Tool (app.js) — wijzigingen aan de koppeling hoeven
 * dus maar op één plek te gebeuren.
 *
 * Elke entry:
 *   pos     — het $n-positienummer in de IFS-klembordtekst
 *   tech    — de technische IFS-veldnaam (of custom field CF$_C_*)
 *   ilCol   — de Itemlijst-kolomletter waar de waarde vandaan komt,
 *             of null als het veld niet uit de itemlijst komt
 *             (bv. LINE_SEQ is een doorlopend batchnummer, LINE_NO/
 *             RELEASE_NO worden apart opgevraagd bij "Nieuw registreren")
 *   label   — leesbare naam, voor foutmeldingen/logging
 */
(function () {
  if (window.IFS_LPARTS_COLUMNS) return;

  window.IFS_LPARTS_COLUMNS = [
    { pos: 0,  tech: 'LINE_SEQ',                ilCol: null, label: 'Regel (doorlopend)' },
    { pos: 1,  tech: 'ORDER_NO',                ilCol: 'C',  label: 'IHC PO' },
    { pos: 2,  tech: 'LINE_NO',                 ilCol: null, label: 'Line' },
    { pos: 3,  tech: 'RELEASE_NO',              ilCol: null, label: 'Release' },
    // $4 (CONTRACT) bewust afwezig — komt niet voor in de geverifieerde export.
    { pos: 5,  tech: 'VENDOR_PART_NO',          ilCol: 'D',  label: 'Item' },
    { pos: 6,  tech: 'VENDOR_PART_DESC',        ilCol: 'E',  label: 'Item description' },
    { pos: 7,  tech: 'QTY',                     ilCol: 'F',  label: 'Quantity' },
    { pos: 8,  tech: 'BUY_UNIT_MEAS',           ilCol: 'G',  label: 'Unit of measure' },
    // $9 t/m $16: door IFS zelf gezette/berekende velden (CREATION,
    // EXECUTED_DATE, SEQ_NO en vier GET_*-API-velden) — geen itemlijst-
    // kolom, altijd leeg meegestuurd. Zie IFS_LPARTS_EMPTY_POS hieronder.
    { pos: 17, tech: 'CF$_C_COUNTRY_OF_ORIGIN', ilCol: 'N',  label: 'Country of origin' },
    { pos: 18, tech: 'CF$_C_HS_CODE',           ilCol: 'O',  label: 'Hs-code' },
    { pos: 19, tech: 'CF$_C_MATERIAL',          ilCol: 'M',  label: 'Material' },
    { pos: 20, tech: 'CF$_C_VALUE_PER_UNIT',    ilCol: 'P',  label: 'Value pc (EUR)' },
    { pos: 21, tech: 'CF$_C_VALUE_TOTAL',       ilCol: 'Q',  label: 'Value total' },
  ];

  // Door IFS zelf gezette/berekende $n-posities — altijd leeg meegestuurd,
  // nooit vanuit de itemlijst gevuld. Apart van IFS_LPARTS_COLUMNS omdat ze
  // geen kolomkoppeling hebben, maar wel in de klembordtekst moeten staan.
  window.IFS_LPARTS_EMPTY_POS = [
    { pos: 9,  tech: 'CREATION' },
    { pos: 10, tech: 'EXECUTED_DATE' },
    { pos: 11, tech: 'SEQ_NO' },
    { pos: 12, tech: 'C_PARTS_WITHOUT_PURCH_ORD_API.GET_PO_RELEASE_NO(SEQ_NO, ORDER_NO, LINE_NO, RELEASE_NO)' },
    { pos: 13, tech: 'C_PARTS_WITHOUT_PURCH_ORD_API.GET_PO_LINE_NO(SEQ_NO, ORDER_NO, LINE_NO, RELEASE_NO)' },
    { pos: 14, tech: 'C_PARTS_WITHOUT_PURCH_ORD_API.GET_PART_NO(SEQ_NO, ORDER_NO, LINE_NO, RELEASE_NO)' },
    { pos: 15, tech: 'C_PARTS_WITHOUT_PURCH_ORD_API.GET_PART_REV(SEQ_NO, ORDER_NO, LINE_NO, RELEASE_NO)' },
    { pos: 16, tech: 'C_PARTS_WITHOUT_PURCH_ORD_API.GET_DEMAND_CODE(ORDER_NO, LINE_NO, RELEASE_NO)' },
  ];

  /**
   * Leest, voor alle kolommen met een ilCol, de waarde uit een itemlijst-
   * cells-array (COL-object nodig om kolomletter -> index te vertalen) en
   * geeft een plat object terug met de TECHNISCHE naam als sleutel.
   * Gebruikt door validator.js (valOpenManualMatch).
   *
   * Sluit bewust de "kernvelden" uit (ORDER_NO, LINE_NO, RELEASE_NO,
   * VENDOR_PART_NO, VENDOR_PART_DESC, QTY, BUY_UNIT_MEAS, LINE_SEQ) — die
   * lopen al via aparte, met-naam-benoemde queue-velden (po/item/
   * description/qty/uom) die op het juiste moment gezet worden (bv.
   * VENDOR_PART_NO pas ná het automatisch genereren van het itemnummer).
   * Zou readFromCells die ook meenemen, dan wint straks een te vroeg
   * (nog leeg) ingelezen waarde het van de correcte, latere waarde.
   */
  const CORE_FIELDS = new Set(['LINE_SEQ', 'ORDER_NO', 'LINE_NO', 'RELEASE_NO', 'VENDOR_PART_NO', 'VENDOR_PART_DESC', 'QTY', 'BUY_UNIT_MEAS']);

  window.IFS_LPARTS_readFromCells = function (cells, COL) {
    const out = {};
    window.IFS_LPARTS_COLUMNS.forEach(c => {
      if (!c.ilCol || CORE_FIELDS.has(c.tech)) return;
      out[c.tech] = String(cells[COL[c.ilCol]] ?? '').trim();
    });
    return out;
  };
})();
