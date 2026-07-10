/**
 * PATCH voor validator.js
 * ========================
 * Twee toevoegingen nodig:
 *
 *  1) Dynamisch laden van val-crossref.js  (identiek patroon als val-mailgen.js)
 *  2) runIfNeeded() aanroepen vóór renderValidationResults()
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WIJZIGING 1 — Zelf-laden van val-crossref.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zoek in validator.js de plek waar val-mailgen.js dynamisch geladen wordt,
 * bijv.:
 *
 *   if (!window.__valMailgenLoaded) {
 *     const s = document.createElement('script');
 *     s.src = '../Itemlijst-Validator/js/val-mailgen.js';
 *     document.head.appendChild(s);
 *   }
 *
 * Voeg DIRECT DAARNA toe:
 *
 *   if (!window.__valCrossrefLoaded) {
 *     const sc = document.createElement('script');
 *     sc.src = '../Itemlijst-Validator/js/val-crossref.js';   // pas pad aan indien nodig
 *     document.head.appendChild(sc);
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WIJZIGING 2 — runIfNeeded() vóór renderen
 * ─────────────────────────────────────────────────────────────────────────────
 * Zoek de functie die na het parsen van de itemlijst de validatieresultaten
 * toont. Waarschijnlijk zoiets als:
 *
 *   // VÓÓR de patch:
 *   function handleParsedRows(rows) {
 *     runValidation(rows);          // of: renderValidationResults(rows);
 *   }
 *
 * Vervang door:
 *
 *   function handleParsedRows(rows) {
 *     // Cross-referentie met Expediting lijst (vult C en D in indien leeg)
 *     if (window.ValCrossref) {
 *       ValCrossref.runIfNeeded(rows, function(enrichedRows) {
 *         runValidation(enrichedRows);   // of renderValidationResults
 *       });
 *     } else {
 *       // Fallback als het script nog niet geladen is
 *       runValidation(rows);
 *     }
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPMERKING — script-laadtiming
 * ─────────────────────────────────────────────────────────────────────────────
 * Omdat val-crossref.js dynamisch geladen wordt, is het mogelijk dat het script
 * nog niet beschikbaar is op het moment dat handleParsedRows() voor het eerst
 * wordt aangeroepen (als de gebruiker heel snel een bestand uploadt).
 *
 * Veiliger alternatief: wacht op het load-event van het script:
 *
 *   if (!window.__valCrossrefLoaded) {
 *     const sc = document.createElement('script');
 *     sc.src = '../Itemlijst-Validator/js/val-crossref.js';
 *     sc.onload = () => console.log('[ValCrossref] geladen');
 *     document.head.appendChild(sc);
 *   }
 *
 * En in handleParsedRows de fallback handhaven zoals hierboven beschreven.
 * In de praktijk laadt het script snel genoeg, maar de fallback is veiligheidsnet.
 */
